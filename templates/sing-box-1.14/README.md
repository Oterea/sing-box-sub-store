# sing-box 1.14 模板

这些模板需要配合 [`scripts/sing-box-col.js`](../../scripts/sing-box-col.js) 使用。模板只提供基础配置，订阅节点和策略组由脚本生成。

## 目录

- [模板选择](#模板选择)
- [脚本参数](#脚本参数)
- [DNS 和路由](#dns-和路由)
- [Momo 普通模式](#momo-普通模式)
- [Momo 仅核心模式](#momo-仅核心模式)
- [运行前检查](#运行前检查)

## 模板选择

| 文件 | 使用场景 | 主要特点 |
| --- | --- | --- |
| `universal-tmpl.json` | iPhone、macOS 等 sing-box 客户端 | TUN、系统 HTTP 代理、`mixed-in:7890` |
| `linux-tmpl.json` | Linux 独立运行 sing-box | TUN、`auto_route`、`auto_redirect`、`bypass` |
| `momo-tmpl.json` | Momo 普通代理模式 | 由 Momo 管理透明代理接管 |
| `momo-old-tmpl.json` | 旧版 Momo 模板回退或对比 | 保留历史配置，不建议新部署使用 |
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

模板的共同特点：

- 使用真实 IP，不使用 FakeIP；
- 具体 DNS、路由、TUN、ECH 和性能说明见根目录 README 的 FAQ；
- 完整的请求流程见下方文档。

完整流程见：[dns-routing-flow.md](docs/dns-routing-flow.md)。

mixed 入站收到域名后走 `direct` 的详细流程见：[mixed-in-direct-flow.md](docs/mixed-in-direct-flow.md)。

## Momo 普通模式

使用 `momo-tmpl.json` 时：

- 不要开启 Momo 的“仅核心”；
- 透明代理接管由 Momo 管理；
- 模板保留 Momo 使用的 DNS、Redirect、TProxy 和 TUN 入站。

## Momo 仅核心模式

使用 `momo-kernel-only-tmpl.json`，并在 Momo 中开启“仅核心”。网络接管由 sing-box 负责：

- TUN 地址：`172.31.0.1/30`；
- TUN 接口名：`momo`；
- `auto_route: true`；
- `auto_redirect: true`；
- mixed 入站：`0.0.0.0:7890`；
- 不设置 `platform.http_proxy`，不会自动修改宿主机系统代理。

`bypass` 和 Momo 仅核心模式的内核要求见根目录 README 的 FAQ。

## 运行前检查

生成最终配置后再运行，不要直接运行未填充节点的模板。建议先执行：

```sh
sing-box check -c config.json
```

旧版本模板仍保留在 `templates/sing-box-1.11/`、`1.12/` 和 `1.13/`，新配置建议使用本目录的 1.14 模板。
