# sing-box 1.14 模板

这些模板需要配合 [`scripts/sing-box-col.js`](../../scripts/sing-box-col.js) 使用。模板只提供基础配置，订阅节点和策略组由脚本生成。

## 模板选择

| 文件 | 使用场景 | 主要特点 |
| --- | --- | --- |
| `universal-tmpl.json` | iPhone、macOS 等 sing-box 客户端 | TUN、系统 HTTP 代理、`mixed-in:7890` |
| `linux-tmpl.json` | Linux 独立运行 sing-box | TUN、`auto_route`、`auto_redirect`、`bypass` |
| `momo-tmpl.json` | Momo 普通代理模式 | 由 Momo 管理透明代理接管 |
| `momo-kernel-only-tmpl.json` | Momo 仅核心模式 | 由 sing-box 管理 TUN 和自动重定向 |
| `annotated.json` | 阅读配置机制 | JSONC 注释版，不能直接运行 |

## 脚本参数

在 `sing-box-col.js` 中按需设置：

| 参数 | 作用 |
| --- | --- |
| `name=xxx` | Sub-Store 中的订阅名称 |
| `type=col` | 处理组合订阅 |
| `autointerval=30s` | 设置自动测速间隔 |
| `smart=on` | 生成 `<机场> SMART` 节点选择组，默认不生成 |
| `strip-ech=on` | 删除节点的 `tls.ech`，默认保留 |

## DNS 和路由

- 国内域名使用 `dns-ali` 和 `dns-pub` 竞速；
- 境外及未命中域名使用 `dns-google`；
- 使用真实 IP，不使用 FakeIP；
- 未显式设置 TUN `stack`，使用 sing-box 默认的 `sing-tun` 实现；相比用户态协议栈通常开销更低、性能更好；
- DNS 使用 `ipv4_only`、缓存和反向映射；
- HTTPS/SVCB 查询默认返回空的 `NOERROR` 响应；
- DoT、UDP 443、STUN 和 QUIC 默认拒绝；
- 普通国内流量直连，其他流量按域名、IP 和最终代理规则处理。

启用 ECH 的节点需要读取 HTTPS DNS 记录。如果模板规则使节点无法获得 ECH 配置，可以传入 `strip-ech=on` 删除节点 ECH，改用普通 TLS。

完整流程见：[dns-routing-flow.md](dns-routing-flow.md)。

## Momo 普通模式

使用 `momo-tmpl.json`，不要开启 Momo 的“仅核心”。透明代理接管由 Momo 管理，模板保留 Momo 使用的 DNS、Redirect、TProxy 和 TUN 入站。

## Momo 仅核心模式

使用 `momo-kernel-only-tmpl.json`，并在 Momo 中开启“仅核心”。网络接管由 sing-box 负责：

- TUN 地址：`172.31.0.1/30`；
- TUN 接口名：`momo`；
- `auto_route: true`；
- `auto_redirect: true`；
- mixed 入站：`0.0.0.0:7890`；
- 不设置 `platform.http_proxy`，不会自动修改宿主机系统代理。

`bypass` 只在 Linux 的 `auto_redirect` 预匹配阶段生效。当前规则对私有地址和中国 IP 尝试内核直连，但排除端口 `853`，并且 Clash 为 Global 时不执行 bypass。命中 bypass 后不会继续执行后面的嗅探和路由规则。

`bypass` 需要与当前固件内核匹配的：

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

OpenWrt/ImmortalWrt 可使用：

```sh
opkg update
opkg install kmod-nfnetlink-queue kmod-nft-queue
```

如果日志出现 `pre-match disabled`，说明 NFQUEUE 预匹配没有启用，普通代理仍可能正常，但 bypass 不会生效。

## 运行前检查

生成最终配置后再运行，不要直接运行未填充节点的模板。建议先执行：

```sh
sing-box check -c config.json
```

旧版本模板仍保留在 `templates/sing-box-1.11/`、`1.12/` 和 `1.13/`，新配置建议使用本目录的 1.14 模板。
