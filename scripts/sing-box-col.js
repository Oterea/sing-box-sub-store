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
// 预处理节点
// ===========================================

let proxyNodes = originProxyNodes;
// 通过节点 tag 提取国家/地区名集合（去掉节点编号部分）
// 例如: 🇸🇬 Singapore 01 → 🇸🇬 Singapore
let countries = new Set();
proxyNodes.forEach((obj) => {
  // 去掉末尾编号得到地区名。节点名里没有空格时切出来是空串（rename.js 的 nm
  // 参数会原样保留没匹配上的节点，这类名字可能就没有空格）—— 空串会造出一个
  // tag 为 "" 的策略组，而 new RegExp("") 匹配一切，等于把所有节点又收一遍
  const country = obj.tag.split(" ").slice(0, -1).join(" ");
  if (country) countries.add(country);
});

// 获取所有机场名字
let airports = extractAirportNames(proxyNodes);

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
      .filter((node) => node.tag.split(" ")[1] === airport)
      .map((node) => node.tag)
  );

  return policy;
});

let manualPolicies = Array.from(airports, (airport) => {
  // 拼接策略组名字，比如加上 "Manual-"
  let policyName = `${airport} MANUAL`;
  let policy = new Policy(policyName, "selector");

  // 遍历 countries，找到和机场匹配的策略组
  policy.outbounds.push(
    ...Array.from(countries).filter((countryName) => {
      let parts = countryName.split(" ");
      let countryAirport = parts[1]; // 第二个部分是机场名
      return countryAirport === airport;
    })
  );

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
 * 提取所有机场名字（假设机场名字在 tag 的第二个部分）
 * @param {Array} proxies - 节点数组
 * @returns {Set} - 机场名字集合
 *
 * 示例:
 * extractAirportNames([{tag:"🇸🇬 B Singapore 01"}, {tag:"🇭🇰 A HongKong 02"}])
 * // => Set { "B", "A" }
 */
function extractAirportNames(proxies) {
  let airports = new Set();
  proxies.forEach((obj) => {
    let parts = obj.tag.split(" ");
    if (parts.length > 1) {
      airports.add(parts[1]);
    }
  });
  return airports;
}

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
