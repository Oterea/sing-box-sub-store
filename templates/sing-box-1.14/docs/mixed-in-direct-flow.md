# mixed-in 收到域名后走 direct 的流程

本文记录无 FakeIP 配置下，浏览器通过 `mixed-in` 访问 Bilibili 时，域名规则、`direct` 和 `domain_resolver` 的关系。

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

## 为什么 `detour: direct` 不能按同样方式理解

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

HTTP Client 自己的拨号字段不会合并到 direct。目标 direct 需要有自己的有效拨号配置；否则可能被 sing-box 判定为空 direct，并报：

```text
detour to an empty direct outbound makes no sense
```

因此保留 `detour: direct` 时，direct 显式写入 `domain_resolver` 更稳妥。

## 对应源码位置

当前 sing-box `testing` 分支中的关键代码：

- [mixed 入站定义](https://github.com/SagerNet/sing-box/blob/testing/protocol/mixed/inbound.go)：mixed 入站提供 HTTP CONNECT、SOCKS4、SOCKS4a 和 SOCKS5 服务。
- [路由选择出站](https://github.com/SagerNet/sing-box/blob/testing/route/route.go)：命中 `action: route` 后选择目标 outbound；`action: resolve` 则单独调用 DNS 查询。
- [连接交给出站拨号](https://github.com/SagerNet/sing-box/blob/testing/route/conn.go)：将 `metadata.Destination` 交给选中的 outbound。
- [direct 创建拨号器](https://github.com/SagerNet/sing-box/blob/testing/protocol/direct/outbound.go)：direct 使用通用拨号器，并允许目标是域名。
- [默认解析器和显式解析器的选择](https://github.com/SagerNet/sing-box/blob/testing/common/dialer/dialer.go)：优先使用自身 `domain_resolver`，没有时使用默认解析器。
- [域名拨号时执行解析](https://github.com/SagerNet/sing-box/blob/testing/common/dialer/resolve.go)：目标是域名时查询 DNS，再使用得到的地址建立连接。
- [detour 和空 direct 检查](https://github.com/SagerNet/sing-box/blob/testing/common/dialer/detour.go)：`detour` 使用目标 outbound，并检查目标是否为空 direct。

