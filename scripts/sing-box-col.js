// ===========================================
// 参数与初始化
// 支持组合订阅，订阅中包含多个机场的节点
// 节点名称格式：🇸🇬 airportName Singapore 01 ---------- originProxyNodes 、 proxyNodes
// ===========================================

// 从外部参数中解构获取 type 和 name
const { type, name } = $arguments;

// 测速间隔，同时作用于 <机场> AUTO、地区组和 ALL AUTO。
// 不传就不写这个字段，用 sing-box 自己的默认值（C.DefaultURLTestInterval = 3 分钟）。
//
// 它决定的是「节点挂了多久能被换走」的上限 —— 拨号失败时 sing-box 不会换节点
// 重试，只删掉失败节点的测速记录，要等下一轮定时测速才会重选。
//
// 别设太小：失败的节点每个要等满 C.TCPTimeout = 15 秒，而一轮没跑完时
// 下一个 tick 会被 g.checking.Swap(true) 直接丢弃。地区组 ~19 个节点、
// 并发 10，全挂时一轮就要 2×15=30 秒 —— 设 5 秒和设 30 秒没有区别，
// 只是在正常时把测速频率抬高了 6 倍，容易撞机场的限流。
const AUTO_INTERVAL = $arguments.autointerval;

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
  if (!col) throw new Error(`找不到组合订阅「${name}」`);
  for (const subName of col.subscriptions || []) {
    // 取不到就让它抛出去。这一步失败意味着后面分不清节点归属，硬撑下去只会
    // 产出一份看着正常、实际分组错乱的配置
    const subNodes = await produceArtifact({
      name: subName,
      type: "subscription",
      platform: "sing-box",
      produceType: "internal",
    });
    subNodes.forEach((node) => {
      // 两个订阅出现同名节点说明前缀撞了（都手写了同一个 name=）。
      // sing-box 对重复的 outbound tag 不报错，后面的会静默覆盖前面的，
      // 等于悄悄少节点 —— 在这里拦住
      const owner = airportOfTag.get(node.tag);
      if (owner && owner !== subName) {
        throw new Error(
          `订阅「${owner}」和「${subName}」都有节点「${node.tag}」，` +
            `给它们的 rename.js 设置不同的 name= 前缀`
        );
      }
      airportOfTag.set(node.tag, subName);
    });
  }
} else {
  // 单订阅：机场就是它自己，不用问
  originProxyNodes.forEach((node) => airportOfTag.set(node.tag, name));
}

// 查不到就报错。会走到这里只有一种情况：组合订阅自己的【节点操作】改了节点名，
// 于是这里的名字和逐订阅取回时的名字对不上。
// 不猜、不退回旧的词序解析 —— 猜错的结果是一份看着正常、分组却是错的配置，
// 而那种错误你可能几天都发现不了
function airportOf(tag) {
  const known = airportOfTag.get(tag);
  if (!known) {
    throw new Error(
      `节点「${tag}」对不上任何订阅。` +
        `组合订阅「${name}」自己的【节点操作】里如果有会改节点名的，去掉它 —— ` +
        `改名只该发生在各个订阅上`
    );
  }
  return known;
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
  // 切换节点时掐断已有连接。
  //
  // 不掐的代价是实的：组已经切到活节点了，你手上的连接还挂在死节点上，直到
  // 自己超时。手动切换同理 —— 点了新节点，正在跑的连接还走着老的。
  //
  // 官方文档：「Only inbound connections are affected by this setting,
  // internal connections will always be interrupted.」受影响的是从入站进来
  // 的连接，也就是你实际上网的那些；sing-box 自己发起的内部连接本来就一律掐。
  this.interrupt_exist_connections = true;
}

// ===========================================
// 策略组初始化
// ===========================================

let proxyPolicies = new Policy("proxy", "selector"); // 用户手动选择代理的分组

// AUTO 装【地区组】，不是节点。
//
// 曾经改成过扁平（直接装该机场所有节点），理由是少一道 tolerance 门槛、
// 延迟判断更准。后来读 sing-box 源码发现那个理由站不住，而代价很实在：
//
// ① tolerance 根本不参与故障切换。protocol/group/urltest.go 的 Select 里：
//        history := g.history.LoadURLTestHistory(RealTag(...));
//        if history == nil { continue }                        // 死节点在这里就被跳过
//        if minDelay == 0 || minDelay > history.Delay+g.tolerance { ... }
//    死节点的测速记录在拨号失败时已被 DeleteURLTestHistory 删掉，走不到
//    tolerance 那一行。所以扁平化换来的只是「两个都活着时换不换」的灵敏度。
//
// ② 扁平让一轮测速慢 3 倍多。嵌套时每层各建自己的 batch，并发各算各的：
//        b, _ := batch.New(ctx, batch.WithConcurrencyNum[any](10))
//    69 个节点扁平 = 1 个 batch 跑 7 波；装 5 个地区组 = 5 个内层 batch 并行，
//    每个 ~14 个节点跑 2 波。而失败的节点每个要等满 C.TCPTimeout = 15 秒，
//    波数直接决定一轮要多久 —— 也就决定 interval 能设多短才真正生效。
//
// ③ 嵌套多一个逃生口：某个地区组冻在死节点上（它的 RealTag 没有 history），
//    AUTO 会跳过它换到别的地区组。扁平就没有这一层。
//
// 机场稳定时两者差别不大，机场抖动时扁平是最坏的结构。
let autoPolicies = Array.from(airports, (airport) => {
  let policy = new Policy(`${airport} AUTO`, "urltest");
  if (AUTO_INTERVAL) policy.interval = AUTO_INTERVAL;

  policy.outbounds.push(...Array.from(countriesOfAirport.get(airport) || []));

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
// ── 实验组：<机场> FAST ──────────────────────────────────────────────
// 装该机场所有节点（扁平），测速间隔写死 30 秒。
//
// 注意它和 <机场> AUTO 已经不是同一个结构了 —— AUTO 装地区组，这个装节点。
// 所以现在它是「扁平 + 30 秒」对「嵌套 + autointerval」的对照，两个变量都变了。
// 想做单变量对照，用 autointerval 参数调 AUTO 自己的间隔就行，这个组可以不要。
//
// 为什么故障切换只能靠 interval：拨号失败时 sing-box【不会】自动换个节点重试，
// 它只把失败节点的测速记录删掉，然后把错误抛给应用。要等下一次定时测速才会把
// 它踢出候选、换成活的。所以「节点挂了多久能切走」的上限就是 interval。
//
// 不传 fast= 就不生成，产出与不加这段时逐字节相同。
const fastAirport = $arguments.fast;
let fastPolicy = null;
if (fastAirport) {
  if (!airports.has(fastAirport)) {
    throw new Error(
      `fast=${fastAirport} 不是这个订阅里的机场，当前有：${[...airports].join("、")}`
    );
  }
  fastPolicy = new Policy(`${fastAirport} FAST`, "urltest");
  fastPolicy.interval = "30s";
  fastPolicy.outbounds.push(
    ...proxyNodes
      .filter((node) => airportOf(node.tag) === fastAirport)
      .map((node) => node.tag)
  );
}

// 这样和平铺所有节点是等价的：sing-box 比较组的延迟时会一路往下钻到真正的
// 节点（RealTag），所以「各机场最快里的最快」就是全局最快。但成员只有机场数
// 那么几项，面板里比铺开一两百个节点干净得多。
//
// 只有一个机场时不建 —— 那时它和 <机场> AUTO 内容完全一样，纯冗余。
let allAutoPolicy = airports.size > 1 ? new Policy("ALL AUTO", "urltest") : null;
if (allAutoPolicy) {
  if (AUTO_INTERVAL) allAutoPolicy.interval = AUTO_INTERVAL;
  allAutoPolicy.outbounds.push(...autoPolicies.map((p) => p.tag));
}

// ALL AUTO 排第一 —— selector 默认选中第一项，装完开箱即用就是全局最快。
// FAST 紧跟在它镜像的那个 AUTO 后面，面板上两个挨着，方便来回切着对比
let autoTags = [];
autoPolicies.forEach((policy) => {
  autoTags.push(policy.tag);
  if (fastPolicy && policy.tag === `${fastAirport} AUTO`) {
    autoTags.push(fastPolicy.tag);
  }
});

proxyPolicies.outbounds.push(
  ...(allAutoPolicy ? [allAutoPolicy.tag] : []),
  ...autoTags,
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
  if (AUTO_INTERVAL) countryPolicy.interval = AUTO_INTERVAL;

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
  ...(fastPolicy ? [fastPolicy] : []),
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
