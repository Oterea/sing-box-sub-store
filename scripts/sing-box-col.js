// ===========================================
// 参数与初始化
// 支持组合订阅，订阅中包含多个机场的节点
// 节点名称格式：🇸🇬 airportName Singapore 01 ---------- originProxyNodes 、 proxyNodes
// ===========================================

// 从外部参数中解构获取 type 和 name
const { type, name } = $arguments;

// 根据 type 值匹配，转换为内部使用的类型
let internalType = /^1$|col/i.test(type) ? "collection" : "subscription";

// 定义一个兼容兜底的直连策略
const compatible_outbound = {
  tag: "COMPATIBLE",
  type: "direct",
};

let compatible; // 标记是否已添加 compatible_outbound
let config = JSON.parse($files[0]); // 读取初始配置文件



// 生成原始代理节点列表
let originProxyNodes = await produceArtifact({
  name,
  type: internalType,
  platform: "sing-box",
  produceType: "internal",
});

// ===========================================
// tag -> 机场 索引
// ===========================================
//
// 机场名原本是从节点名里数出来的（第 2 个词），这有三个隐含前提：第 0 个词是
// 国旗、机场名正好一个词、最后一段是编号。任何一条不成立都会静默出错 ——
// 不报错，只是分组悄悄错乱。订阅名带空格是最容易踩的（rename.js 现在默认
// 拿订阅名当前缀）。
//
// 这里改成：挨个订阅单独取一遍，取到什么就记什么是谁的。机场身份从「猜」
// 变成「已知」。
//
// 节点来源仍然是组合订阅那一次取回，没有改 —— 只按订阅取的话，会跳过组合
// 订阅自己那层的节点操作。这里的逐订阅取回只用来建索引，不参与产出。
const airportOfTag = new Map();
if (internalType === "collection") {
  const col = ($substore.read("collections") || []).find((c) => c.name === name);
  for (const subName of (col && col.subscriptions) || []) {
    let subNodes = [];
    try {
      subNodes = await produceArtifact({
        name: subName,
        type: "subscription",
        platform: "sing-box",
        produceType: "internal",
      });
    } catch (e) {
      // 单个订阅取不到不该拖垮整份配置：它的节点本来也不会出现在组合订阅里，
      // 索引里少它一份即可，剩下的机场照常
      console.log(`[col] 订阅 ${subName} 取回失败，跳过建索引: ${e.message ?? e}`);
    }
    subNodes.forEach((node) => {
      // 先到先得。两个订阅出现同名 tag 说明前缀撞了（都手写了同一个 name=），
      // sing-box 那边也会因为 outbound tag 重复而静默覆盖，属于配置错误
      if (!airportOfTag.has(node.tag)) airportOfTag.set(node.tag, subName);
    });
  }
} else {
  // 单订阅：机场就是它自己，不用问
  originProxyNodes.forEach((node) => airportOfTag.set(node.tag, name));
}

// 索引里没有的（组合订阅那层的操作改过名、或订阅取回失败）退回老办法：数第 2 个词
function airportOf(tag) {
  const known = airportOfTag.get(tag);
  if (known) return known;
  const parts = tag.split(" ");
  return parts.length > 1 ? parts[1] : "";
}

// ===========================================
// 预处理节点
// ===========================================

let proxyNodes = originProxyNodes;
// 通过节点 tag 提取国家/地区名集合（去掉节点编号部分）
// 例如: 🇸🇬 Singapore 01 → 🇸🇬 Singapore
let countries = new Set();
// 地区键按机场分桶，省得 manualPolicies 再去地区名里数第 2 个词
const countriesOfAirport = new Map();
proxyNodes.forEach((obj) => {
  // 去掉末尾编号得到地区名。节点名里没有空格时切出来是空串（rename.js 的 nm
  // 参数会原样保留没匹配上的节点，这类名字可能就没有空格）—— 空串会造出一个
  // tag 为 "" 的策略组，而 new RegExp("") 匹配一切，等于把所有节点又收一遍
  const country = obj.tag.split(" ").slice(0, -1).join(" ");
  if (!country) return;
  countries.add(country);
  const ap = airportOf(obj.tag);
  if (!countriesOfAirport.has(ap)) countriesOfAirport.set(ap, new Set());
  countriesOfAirport.get(ap).add(country);
});

// 机场清单：从索引来，不再从节点名解析。
// 只收真的有节点的 —— 订阅拉到 0 个节点时不该建一个空的 <机场> AUTO
let airports = new Set(proxyNodes.map((node) => airportOf(node.tag)).filter(Boolean));

// ===========================================
// 策略组构造函数
// ===========================================
function Policy(tag, type) {
  this.tag = tag;
  this.type = type;
  this.outbounds = []; // 子节点或分组
  this.interrupt_exist_connections = false; // 是否中断已有连接
}

// ===========================================
// 策略组初始化
// ===========================================

let proxyPolicies = new Policy("proxy", "selector"); // 用户手动选择代理的分组

// AUTO 装的是【节点】，不是地区组 —— 和下面的 MANUAL 刻意不一样。
//
// 两者用途不同，结构就不该一样：
//   AUTO   机器按延迟自动挑 → 要准 → 扁平
//   MANUAL 人手动浏览着选   → 要好找 → 按地区分层
//
// 为什么扁平更准：urltest 换节点有个 tolerance 门槛（默认 50ms），新节点要快
// 过这个数才会被换上。套一层地区组就多一道门槛，而且上层只看得到下层当前选中
// 的那个 —— 下层因为门槛没换掉的更快节点，上层根本看不见。两层叠起来，最坏
// 会比该机场真正最快的慢 100ms 左右。直接装节点只有一道门槛。
//
// 地区组仍然会生成，只是不再被 AUTO 引用，只挂在 MANUAL 下面。MANUAL 是
// selector 不测速，没有这个问题。
let autoPolicies = Array.from(airports, (airport) => {
  let policy = new Policy(`${airport} AUTO`, "urltest");

  policy.outbounds.push(
    ...proxyNodes
      .filter((node) => airportOf(node.tag) === airport)
      .map((node) => node.tag)
  );

  return policy;
});

let manualPolicies = Array.from(airports, (airport) => {
  // 拼接策略组名字，比如加上 "Manual-"
  let policyName = `${airport} MANUAL`;
  let policy = new Policy(policyName, "selector");

  // 该机场有哪些地区组，建索引时已经分好桶了
  policy.outbounds.push(...Array.from(countriesOfAirport.get(airport) || []));

  return policy;
});

// openai 分组，专门收集非香港的节点
let aiPolicies = new Policy("AI", "selector");


// ===========================================
// 构建策略组的节点引用关系
// ===========================================

// ai 分组包含除 "hong kong" 节点以外的所有节点
aiPolicies.outbounds.push(...extractProxyTagsExcluding(proxyNodes, /(hong kong)/i));


// 跨机场自动测速：装的是各机场的 AUTO 组，不是节点。
//
// 这样和平铺所有节点是等价的：sing-box 比较组的延迟时会一路往下钻到真正的
// 节点（RealTag），所以「各机场最快里的最快」就是全局最快。但成员只有机场数
// 那么几项，面板里比铺开一两百个节点干净得多。
//
// 只有一个机场时不建 —— 那时它和 <机场> AUTO 内容完全一样，纯冗余。
let allAutoPolicy = airports.size > 1 ? new Policy("ALL AUTO", "urltest") : null;
if (allAutoPolicy) {
  allAutoPolicy.outbounds.push(...autoPolicies.map((p) => p.tag));
}

// ALL AUTO 排第一 —— selector 默认选中第一项，装完开箱即用就是全局最快
proxyPolicies.outbounds.push(
  ...(allAutoPolicy ? [allAutoPolicy.tag] : []),
  ...autoPolicies.map(p => p.tag),
  ...manualPolicies.map(p => p.tag)
);



/**
// ===========================================
// 国家策略组：urltest 类型
// {
//   "tag": "🇨🇳 B Taiwan",
//   "type": "urltest",
//   "outbounds": [
//     "🇨🇳 B Taiwan 01",
//     "🇨🇳 B Taiwan 02",
//     "🇨🇳 B Taiwan 03",
//     "🇨🇳 B Taiwan 04",
//     "🇨🇳 B Taiwan 05"
//   ],
//   "interrupt_exist_connections": false
// }
*/
let countryPolicies = Array.from(countries, (countryName) => {
  // 创建策略组
  let countryPolicy = new Policy(countryName, "urltest");

  // 将匹配该国家名的所有节点 tag 添加到策略组的 outbounds
  let regex = new RegExp(escapeRegExp(countryName), "i");
  countryPolicy.outbounds.push(...extractProxyTagsMatching(proxyNodes, regex));

  return countryPolicy;
});

/**
 * 添加策略组到配置
 */
config.outbounds.push(
  proxyPolicies,
  aiPolicies,
  ...(allAutoPolicy ? [allAutoPolicy] : []),
  ...autoPolicies,
  ...manualPolicies,
  ...countryPolicies,
  ...proxyNodes
);

/**
 * 兜底处理：空策略组补一个 COMPATIBLE(direct)
 *
 * 必须放在 push 之后。放在前面时 config.outbounds 里只有模板自带的 direct，
 * 而 direct 根本没有 outbounds 字段 —— 要保护的那些组还没建出来，这段等于没跑。
 *
 * 空的 selector / urltest 会让 sing-box 直接拒绝启动（missing tags）。触发场景
 * 是实打实的：订阅拉到 0 个节点（机场跑路、续费忘了、拉订阅时断网），或者订阅
 * 里全是香港节点导致 AI 组（定义为「所有非香港节点」）为空。
 */
config.outbounds.forEach((outbound) => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound);
      compatible = true;
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});

/**
 * 输出配置
 */

$content = JSON.stringify(config, null, 2);

// ===========================================
// 工具函数
// ===========================================

/**
 * 转义正则元字符，把字符串当字面量匹配
 *
 * 地区名是从节点名切出来的，会直接进 new RegExp。rename.js 的中文地区表里有
 * 「刚果(布)」「刚果(金)」，上游最新版还有 Myanmar(Burma) —— 括号不转义会被
 * 当成捕获组，new RegExp("刚果(布)") 实际匹配的是「刚果布」，于是该地区组必然
 * 为空，而空组会让 sing-box 拒绝启动。
 *
 * 示例:
 * escapeRegExp("刚果(布)")  // => "刚果\\(布\\)"
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 获取排除指定正则的节点 tag
 * @param {Array} proxies - 节点数组
 * @param {RegExp} regex - 匹配规则
 * @returns {Array} - 节点 tag 数组
 * 
 * 示例:
 * extractProxyTagsExcluding([{tag:"🇸🇬 SG 01"}, {tag:"🇭🇰 HK 02"}], /HK/)
 * // => ["🇸🇬 SG 01"]
 */
function extractProxyTagsExcluding(proxies, regex) {
  return (regex ? proxies.filter((p) => !regex.test(p.tag)) : proxies).map(
    (p) => p.tag,
  );
}

/**
 * 获取符合指定正则的节点 tag
 * @param {Array} proxies - 节点数组
 * @param {RegExp} regex - 匹配规则
 * @returns {Array} - 节点 tag 数组
 * 
 * 示例:
 * extractProxyTagsMatching([{tag:"🇸🇬 SG 01"}, {tag:"🇭🇰 HK 02"}], /HK/)
 * // => ["🇭🇰 HK 02"]
 */
function extractProxyTagsMatching(proxies, regex) {
  return (regex ? proxies.filter((p) => regex.test(p.tag)) : proxies).map(
    (p) => p.tag,
  );
}
