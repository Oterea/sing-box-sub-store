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


config.outbounds.push(...proxies)


let countries = new Set();

proxies.map(obj => {
  list = obj.tag.split(' ');
  flag = list[0];
  name = list[1];
  let country = flag + " " + name;
  countries.add(country);
});
console.log(countries)

countries.forEach(country => {
  let a = {
    "tag": country,
    "type": "urltest",
    "outbounds": []
  };
  config.outbounds.push(a)

  config.outbounds.map(i => {
    if (country == i.tag) {
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

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
