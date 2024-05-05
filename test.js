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





let countries = new Set();

proxies.map(obj => {
  let list = obj.tag.split(' ');
  let flag = list[0];
  let name = list[1];
  let country = flag + " " + name;
  countries.add(country);
});
console.log(countries)

countries.forEach(j => {
  let a = new Object();
  a.tag = j;
  a.type = 'urltest'
  a.outbounds=[]
  config.outbounds.push(a)

  config.outbounds.map(i => {
    if (j == i.tag) {
      let regexPattern = i.tag;
      let regex = new RegExp(regexPattern, 'i');
      i.outbounds.push(...getTags(proxies, regex));
    }
  })
});



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
