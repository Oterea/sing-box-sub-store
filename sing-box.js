const { type, name } = $arguments
const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
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

config.outbounds.map(i => {
  if (['auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies))
  }
  if (['Australia'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Australia/i))
  }
  if (['Canada'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Canada/i))
  }
    if (['French'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /France/i))
  }
  if (['German'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /German/i))
  }
  if (['HongKong'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Hong Kong/i))
  }
    if (['TaiWan'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Taiwan/i))
  }
    if (['Japan'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Japan/i))
  }
    if (['Russia'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Russia/i))
  }
    if (['Singapore'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /Singapore/i))
  }
  if (['SouthKorea'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /South Korea/i))
  }
      if (['UnitedKingdom'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /United Kingdom/i))
  }
      if (['America'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /United States/i))
  }
})

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
