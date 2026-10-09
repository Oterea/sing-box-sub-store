# mixed-in 收到域名后走 direct 的流程

本文记录无 FakeIP 配置下，浏览器通过 `mixed-in` 访问 Bilibili 时，域名规则、`direct` 和 `domain_resolver` 的关系。

outbound 可以配置拨号字段，其中 `domain_resolver` 用于解析该 outbound 需要连接的域名。没有显式配置时，普通出站可以使用 `route.default_domain_resolver`。`detour` 表示把底层连接交给指定的 outbound；它不会把两个 outbound 的拨号字段合并。如果当前 outbound 明确配置了 `domain_resolver`，sing-box 仍会先用它解析当前目标域名，再把解析后的连接交给 detour。

## 示例配置

```json
{
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen_port": 7890
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct",
      "domain_resolver": "dns-ali"
    }
  ],
  "route": {
    "rules": [
      {
        "rule_set": "geosite/cn",
        "action": "route",
        "outbound": "direct"
      }
    ],
    "default_domain_resolver": "dns-ali"
  }
}
```

## Bilibili 的实际流程

浏览器使用 HTTP 代理时，可以向 `mixed-in` 发送：

```http
CONNECT www.bilibili.com:443
```

流程如下：

```text
浏览器连接 mixed-in
    ↓
mixed-in 收到 www.bilibili.com:443
    ↓
路由规则匹配 geosite/cn
    ↓
选择 direct
    ↓
direct 收到的目标仍然是 www.bilibili.com:443
    ↓
direct 使用 domain_resolver=dns-ali 查询域名
    ↓
得到 Bilibili 的 IP 地址
    ↓
direct 直接连接该 IP:443
```

这里不会因为命中了 `geosite/cn` 就自动执行：

```json
{
  "action": "resolve"
}
```

`route → direct` 和 `action: resolve` 是两件事：

- `route → direct`：选择由哪个出站建立连接；
- `action: resolve`：在路由阶段提前把域名解析为 IP，通常是为了让后续 `geoip/cn` 规则能够匹配。

如果前面已经命中 Bilibili 的域名规则，就可以直接进入 `direct`。真正建立连接时，direct 的拨号器才解析域名。

## direct 写与不写 `domain_resolver`

### 显式写入

```json
{
  "type": "direct",
  "tag": "direct",
  "domain_resolver": "dns-ali"
}
```

流程是：

```text
direct 收到域名
    ↓
优先使用 dns-ali
    ↓
解析并连接
```

### 不写入

```json
{
  "type": "direct",
  "tag": "direct"
}
```

普通 `route → direct` 连接会按照 sing-box 的拨号器默认选择逻辑寻找解析器：

```text
direct 自己的 domain_resolver
    ↓ 没有
route.default_domain_resolver
    ↓ 没有
只有一个 DNS transport 时使用它
```

当前模板中虽然已有 `route.default_domain_resolver`，但现在仍给 direct 显式写入 `dns-ali`，这样 direct 的行为更明确，也不会与 `detour` 场景混淆。

## `detour` 与 `domain_resolver` 的关系

```json
{
  "tag": "default",
  "detour": "direct"
}
```

`detour` 表示把底层拨号交给指定的出站。它不是普通的 `route → direct` 选择过程：

```text
HTTP Client
    ↓
detour=direct
    ↓
交给 direct 作为底层拨号器
```

如果 HTTP Client 自己配置了 `domain_resolver`：

```json
{
  "tag": "default",
  "detour": "direct",
  "domain_resolver": "dns-ali"
}
```

流程是：

```text
HTTP Client 收到规则集或面板下载地址
    ↓
使用自己的 domain_resolver=dns-ali 解析目标域名
    ↓
将解析后的连接交给 detour=direct
```

如果 HTTP Client 没有配置 `domain_resolver`，它不会自动把 `route.default_domain_resolver` 包到 `detour` 外面，而是把域名目标交给 `direct`。此时由 `direct` 自己的 `domain_resolver` 或默认解析器处理。

HTTP Client 自己的拨号字段不会与 direct 的拨号字段合并。`detour` 目标仍然必须是有效的 outbound；如果目标是空 direct，可能被 sing-box 判定为无意义并报：

```text
detour to an empty direct outbound makes no sense
```

因此，当前模板中保留：

```json
{
  "tag": "default",
  "detour": "direct"
}
```

并让 `direct` 使用 `domain_resolver: "dns-ali"`，就可以由 direct 负责解析下载地址。如果希望 HTTP Client 自己负责解析，也可以给 HTTP Client 显式加上 `domain_resolver: "dns-ali"`。

## HTTP Client 与 direct 的默认解析器

以下结论对应 sing-box `v1.14.0` 源码，并假设目标是域名：

| 配置 | 谁负责解析 |
| --- | --- |
| HTTP Client 没有 `detour`，没有 `domain_resolver` | HTTP Client 使用 `route.default_domain_resolver` |
| HTTP Client 没有 `detour`，有 `domain_resolver` | HTTP Client 使用自己的解析器 |
| HTTP Client 有 `detour`，有 `domain_resolver` | HTTP Client 先解析目标，再把连接交给 detour |
| HTTP Client 有 `detour`，没有 `domain_resolver` | HTTP Client 不在外层创建解析器，由 detour 目标处理域名 |
| `direct` 没有 `domain_resolver` | direct 使用 `route.default_domain_resolver` |

例如：

```json
{
  "tag": "default",
  "detour": "direct"
}
```

如果 `direct` 没有自己的解析器，目标域名会交给 `direct`，再由 `direct` 使用默认解析器：

```text
HTTP Client
    ↓ detour=direct
direct
    ↓ 没有自己的 domain_resolver
route.default_domain_resolver
    ↓
dns-ali
```

但是，`detour` 目标仍然必须是有效的 outbound。下面这个 `direct` 会被判定为空：

```json
{
  "tag": "direct",
  "type": "direct"
}
```

即使 `route.default_domain_resolver` 已配置，它仍可能触发：

```text
detour to an empty direct outbound makes no sense
```

这是因为“是否为空”的检查和“使用哪个默认解析器”是两套独立逻辑。当前模板给 `direct` 显式配置 `domain_resolver: "dns-ali"`，既让它成为有效的 detour 目标，也明确指定了直连解析器。

## 代理节点中的两个不同域名

以代理节点为例，需要区分：

```text
代理节点的 server 域名
    ↓
由代理节点自己的 domain_resolver 或默认解析器解析

网站目标域名
    ↓
交给代理协议处理；是否在本地解析取决于 HTTP Client、路由和代理协议配置
```

因此，代理节点的 `domain_resolver` 主要解决“如何找到代理服务器”，不能简单理解为“负责解析所有经过代理的网站域名”。

## 对应源码位置

以下说明核对自 sing-box `v1.14.0` 源码，链接固定到该版本：

- [mixed 入站定义](https://github.com/SagerNet/sing-box/blob/v1.14.0/protocol/mixed/inbound.go)：mixed 入站提供 HTTP CONNECT、SOCKS4、SOCKS4a 和 SOCKS5 服务。
- [路由选择出站](https://github.com/SagerNet/sing-box/blob/v1.14.0/route/route.go)：命中 `action: route` 后选择目标 outbound；`action: resolve` 则单独调用 DNS 查询。
- [连接交给出站拨号](https://github.com/SagerNet/sing-box/blob/v1.14.0/route/conn.go)：将 `metadata.Destination` 交给选中的 outbound。
- [direct 创建拨号器](https://github.com/SagerNet/sing-box/blob/v1.14.0/protocol/direct/outbound.go)：direct 使用通用拨号器，并允许目标是域名。
- [默认解析器和显式解析器的选择](https://github.com/SagerNet/sing-box/blob/v1.14.0/common/dialer/dialer.go)：没有 detour 时可使用默认解析器；有 detour 时，显式配置 `domain_resolver` 才会在当前拨号器外层执行解析，否则由 detour 目标处理域名。
- [域名拨号时执行解析](https://github.com/SagerNet/sing-box/blob/v1.14.0/common/dialer/resolve.go)：目标是域名时查询 DNS，再使用得到的地址建立连接。
- [HTTP Client 创建拨号器](https://github.com/SagerNet/sing-box/blob/v1.14.0/common/httpclient/client.go#L17-L27)：将客户端的拨号字段传给通用拨号器，并设置 `RemoteIsDomain: true`。
- [detour 和空 direct 检查](https://github.com/SagerNet/sing-box/blob/v1.14.0/common/dialer/detour.go)：`detour` 使用目标 outbound，并检查目标是否为空 direct。
