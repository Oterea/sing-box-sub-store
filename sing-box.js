const {
  type,
  name
} = $arguments
const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
}
let compatible
let config = JSON.parse($files[0])
let originProxies = await produceArtifact({
  name,
  type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
  platform: 'sing-box',
  produceType: 'internal',
})
// 提取和去除包含流量信息的节点
let nodeInfoTag = getTags(originProxies,/GB/i)[0];
let proxies = removeProxiesByRegex(originProxies,/GB/i)
// proxy 节点 tag 命令规则 🇸🇬 Singapore 01，执行操作后对应策略组tag命名规则 🇸🇬 Singapore
let countries = new Set();
proxies.map(obj => {
  // 除去节点标号作为对应策略组的tag, eg:🇸🇬 Singapore
  countries.add(obj.tag.split(' ').slice(0, -1).join(' '));
});
policyTagList = ["🍀 all", "🛍️ proxy", "🍬 direct", "🧬 auto", "🇨🇳 Taiwan"];

function Policy(tag, type) {
  this.tag = tag;
  this.type = type;
  this.outbounds = [];
}
//===========================================
let proxy = new Policy("proxy", "selector");
let auto = new Policy("auto", "urltest");
let openai = new Policy("openai", "urltest");

//===========================================
proxy.outbounds.push("auto", ...countries);
auto.outbounds.push(...getTags(proxies));
// 默认日本节点
openai.outbounds.push(...getTags(proxies, /?!.*taiwan/i));
openai.outbounds.push(...getTags(proxies, /?!.*hong kong/i));
//===========================================
config.outbounds.push(proxy, auto, openai);
countries.forEach(j => {
  let country = new Policy(j, "urltest")
  //
  config.outbounds.push(country);
  //
  config.outbounds.map(i => {
    if (j == i.tag) {
      let regexPattern = i.tag;
      let regex = new RegExp(regexPattern, 'i');
      i.outbounds.push(...getTags(proxies, regex));
    }
  })
});
//===========================================
config.outbounds.forEach(outbound => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound)
      compatible = true
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});
config.outbounds.push(...proxies)

$content = JSON.stringify(config, null, 2)

function removeProxiesByRegex(proxies, regex) {
    return proxies.filter(proxy => !regex.test(proxy.tag));
}




function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
