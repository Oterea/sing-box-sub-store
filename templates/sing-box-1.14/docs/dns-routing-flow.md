# TUN、mixed-in 与 DNS、路由分流流程

本文记录无 FakeIP、使用真实 IP 的配置下，TUN 入站、mixed-in 入站、DNS 模块、域名规则、`resolve` 和 `geoip` 规则之间的完整关系。

## 一、完整分流流程

### 1. TUN 流量

浏览器访问 `example.com` 时，典型流程如下：

```text
浏览器发起访问 example.com
    ↓
浏览器发起 DNS 请求
    ↓
TUN / dns_mode=hijack 接管 DNS
    ↓
进入 sing-box DNS 模块
    ↓
DNS 模块按照 DNS 规则选择 dns-ali、dns-pub 或 dns-google
    ↓
DNS 模块返回真实 IP
    ↓
浏览器向这个 IP 建立连接
    ↓
TUN 收到发往该 IP 的连接
    ↓
sing-box 嗅探 TLS SNI、HTTP Host、QUIC 等信息
    ↓
恢复出 example.com
    ↓
命中域名名单 → 直接分流
    ↓
未命中域名名单 → 按 geoip/cn 分流
```

这里要区分两件事：

- DNS 模块负责先把域名解析成真实 IP；
- route 层仍然可以通过嗅探得到域名，再使用 `geosite` 或其他域名规则；
- 如果嗅探得到域名并命中名单，就按照域名规则分流；
- 如果没有命中域名名单，就使用已有的目标 IP 匹配 `geoip/cn`；
- 如果连接中没有可识别的域名信息，route 层只能使用 IP 规则。

因此，TUN 的核心顺序是：

```text
DNS 解析 → 得到 IP → TUN 接收连接 → 嗅探域名 → 域名规则或 IP 规则
```

### 2. mixed-in 流量

浏览器把系统 HTTP 代理指向 `mixed-in` 后，可以直接发送：

```http
CONNECT example.com:443
```

这时浏览器不一定先解析 `example.com`。它先连接本地的 mixed-in，再把目标域名交给 sing-box。

典型流程如下：

```text
浏览器连接本地 mixed-in
    ↓
发送 CONNECT example.com:443
    ↓
mixed-in 直接收到域名
    ↓
命中域名名单 → 直接分流
    ↓
未命中域名名单
    ↓
执行 inbound=mixed-in 限定的 resolve
    ↓
进入 sing-box DNS 模块
    ↓
按 DNS 规则选择 DNS 服务器
    ↓
解析出真实 IP
    ↓
按 geoip/cn 分流
```

因此，`resolve` 的主要用途是为 mixed-in 中仍然是域名的请求准备 IP，让后面的 `geoip/cn` 规则能够参与判断。

### 3. 两种入站的规则顺序

适合当前配置的逻辑顺序是：

```text
特殊规则
    ↓
geosite / domain 规则
    ↓
inbound=mixed-in + resolve
    ↓
geoip/cn
    ↓
final
```

如果 mixed-in 请求命中了域名名单，就会在 `resolve` 之前结束，不会继续执行 `resolve`。

TUN 请求虽然已经由 DNS 模块获得了真实 IP，但连接建立后仍可以通过嗅探恢复域名。因此，TUN 也可以使用域名规则；只有在没有可用域名信息时，才退回到 `geoip/cn`。

## 二、浏览器或应用自己发送独立 DNS 请求时

“浏览器或应用发送过 DNS 请求”与“后续交给 mixed-in 的目标是域名还是 IP”是两件不同的事情。

### 情况一：DNS 查询后，应用使用 IP 连接

```text
应用发起 DNS 请求
    ↓
DNS 请求被 sing-box 接管
    ↓
DNS 模块返回 IP
    ↓
应用使用这个 IP 发起连接
    ↓
连接进入 mixed-in
    ↓
目标已经是 IP
    ↓
resolve 没有需要解析的域名
    ↓
geoip/cn → direct
final → proxy
```

这种情况下，虽然请求经过了 `resolve` 规则的位置，但 `resolve` 不会再次解析一个已经是 IP 的目标。

### 情况二：应用查询过 DNS，但仍把域名交给 mixed-in

有些应用会先自己查询 DNS，但建立代理连接时仍发送：

```http
CONNECT example.com:443
```

流程是：

```text
应用发起 DNS 请求
    ↓
DNS 请求被 sing-box 接管并返回 IP
    ↓
应用仍向 mixed-in 发送 CONNECT example.com:443
    ↓
前面的域名名单没有命中
    ↓
执行 inbound=mixed-in + resolve
    ↓
使用 DNS 缓存时直接取得结果
    ↓
没有可用缓存时才重新查询 DNS
    ↓
得到 IP
    ↓
geoip/cn → direct
final → proxy
```

因此，这种情况下会执行 `resolve` 这个路由动作，但不一定真的再次向上游 DNS 服务器发送查询。默认情况下没有禁用 DNS 缓存时，已有的有效缓存可以被复用。

### 情况三：应用使用自己的加密 DNS

如果应用自己使用 DoH、DoT 等加密 DNS，sing-box 看到的可能是普通的 HTTPS 或 TLS 连接，而不是明文 DNS 数据包。是否能够接管这类请求，要看该连接是否经过 TUN、是否命中对应的域名和路由规则，以及应用的连接方式。

这与 mixed-in 收到 `CONNECT example.com:443` 是不同的路径。

## 三、`resolve` 的边界

当前配置建议使用入站限定：

```json
{
  "inbound": "mixed-in",
  "action": "resolve",
  "strategy": "ipv4_only"
}
```

这样做的原因是：

- `mixed-in` 可能直接收到域名，需要解析后才能匹配 `geoip/cn`；
- `tun-in` 的连接通常已经由 DNS 模块解析并携带真实 IP；
- 将 `resolve` 限定到 `mixed-in`，可以避免对 TUN 流量扩大作用范围；
- 已经是 IP 的 mixed-in 请求也不会因为这条规则而重复解析。

最终可以概括为：

```text
TUN：
DNS 解析 → 得到 IP → TUN → 嗅探域名 → 域名规则或 geoip 规则

mixed-in：
收到域名 → 域名规则 → 未命中时 resolve → geoip 规则
```
