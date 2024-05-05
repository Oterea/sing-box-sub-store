const {
  type,
  name
} = $arguments
const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: '🍬 direct',
}

let compatible
let config = JSON.parse($files[0])
let proxies = await produceArtifact({
  name,
  type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
  platform: 'sing-box',
  produceType: 'internal',
})


// proxy 节点 tag 命令规则 🇸🇬 Singapore 01，执行操作后对应策略组tag命名规则 🇸🇬 Singapore

let countries = new Set();

proxies.map(obj => {
  // 除去节点标号作为对应策略组的tag, eg:🇸🇬 Singapore
  countries.add(obj.tag.split(' ').slice(0, -1).join(' '));
});

policyTagList = ["🍀 all", "🛍️ proxy", "🍬 direct", "🧬 auto",  "🇨🇳 Taiwan"];
function Policy(tag, type) {
  this.tag = tag;
  this.type = type;
  this.outbounds = [];
}

let proxy = new Policy("🛍️ proxy", "selector");
let auto = new Policy("🧬 auto", "urltest");
let all = new Policy("🍀 all", "selector");

config.outbounds.push(proxy, auto, all);
countries.forEach(j => {
  let countryPolicy = new Object();
  countryPolicy.tag = j;
  countryPolicy.type = 'urltest';
  countryPolicy.outbounds = [];
  //
  config.outbounds.push(countryPolicy);
  //
  config.outbounds.map(i => {
    if (j == i.tag) {
      let regexPattern = i.tag;
      let regex = new RegExp(regexPattern, 'i');
      i.outbounds.push(...getTags(proxies, regex));
    }
  })
});

proxy.outbounds.push("🧬 auto", "🍬 direct");
auto.outbounds.push(...countries);
all.outbounds.push(...proxies);



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

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
