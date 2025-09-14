// ===========================================
// 参数与初始化
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
let originProxies = await produceArtifact({
  name,
  type: internalType,
  platform: "sing-box",
  produceType: "internal",
});

// ===========================================
// 预处理节点
// ===========================================

// 提取并去除带有流量信息（如 "GB"）的节点
let nodeInfoTag = extractProxyTagsMatching(originProxies, /GB/i)[0];
let proxies = filterOutProxiesByRegex(originProxies, /GB/i);

// 通过节点 tag 提取国家/地区名集合（去掉节点编号部分）
// 例如: 🇸🇬 Singapore 01 → 🇸🇬 Singapore
let countries = new Set();
proxies.map((obj) => {
  countries.add(obj.tag.split(" ").slice(0, -1).join(" "));
});

// 获取所有机场名字
let airports = extractAirportNames(proxies);

// 定义预设的策略组标签 nouse
policyTagList = ["🍀 all", "🛍️ proxy", "🍬 direct", "🧬 auto", "🇨🇳 Taiwan"];

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

let proxyPolicy = new Policy("proxy", "selector"); // 用户手动选择代理的分组

let autoPolicies = Array.from(airports, (airport) => {
  // 拼接策略组名字，比如加上 "Auto-"
  let policyName = `Auto-${airport}`;
  let policy = new Policy(policyName, "urltest");

  // 遍历 countries，找到和机场匹配的策略组
  countries.forEach((country) => {
    if (country.includes(airport)) {
      policy.outbounds.push(country);
    }
  });

  return policy;
});

let manualPolicies = Array.from(airports, (airport) => {
  // 拼接策略组名字，比如加上 "Manual-"
  let policyName = `Manual-${airport}`;
  let policy = new Policy(policyName, "selector");

  // 遍历 countries，找到和机场匹配的策略组
  countries.forEach((country) => {
    if (country.includes(airport)) {
      policy.outbounds.push(country);
    }
  });

  return policy;
});

// openai 分组，专门收集非香港的节点
let aiPolicy = new Policy("ai", "selector");

// ===========================================
// 构建策略组的节点引用关系
// ===========================================

// proxy 分组包含 auto 和 manual 策略组
proxyPolicy.outbounds.push(...autoPolicies, ...manualPolicies);

// openai 分组包含除 "hong kong" 节点以外的所有节点
aiPolicy.outbounds.push(...extractProxyTagsExcluding(proxies, /(hong kong)/i));

// ===========================================
// 添加策略组到配置
// ===========================================
config.outbounds.push(proxyPolicy, ...autoPolicies, ...manualPolicies, aiPolicy);

// 为每个国家创建对应的 urltest 策略组，并添加到配置中
countries.forEach((countryName) => {
  let country = new Policy(countryName, "urltest");
  config.outbounds.push(country);

  config.outbounds.map((i) => {
    if (countryName === i.tag) {
      let regex = new RegExp(i.tag, "i");
      i.outbounds.push(...extractProxyTagsMatching(proxies, regex));
    }
  });
});

// ===========================================
// 兜底处理：如果某个分组没有子节点，则加入 COMPATIBLE
// ===========================================
config.outbounds.forEach((outbound) => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound);
      compatible = true;
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});

// 添加所有单个节点到配置中
config.outbounds.push(...proxies);

// ===========================================
// 输出配置
// ===========================================
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
 * 过滤掉符合正则匹配的节点
 * @param {Array} proxies - 节点数组
 * @param {RegExp} regex - 匹配规则
 * @returns {Array} - 过滤后的节点数组
 * 
 * 示例:
 * filterOutProxiesByRegex([{tag:"🇸🇬 SG 01"}, {tag:"🇭🇰 HK 02"}], /HK/)
 * // => [{tag:"🇸🇬 SG 01"}]
 */
function filterOutProxiesByRegex(proxies, regex) {
  return proxies.filter((proxy) => !regex.test(proxy.tag));
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
