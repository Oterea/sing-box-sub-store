# sing-box-sub-store

用 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 将机场订阅转换为 sing-box 配置，并自动生成按机场、地区和节点组织的策略组。

## 解决的问题

- 统一不同机场的节点名称和地区名称；
- 自动生成 sing-box 节点和策略组；
- 支持单机场和多机场组合订阅；
- 提供 universal、Linux、Momo 等运行环境模板；
- 可选接入 sing-box-smart 面板进行节点检测和选择。

## 工作流程

```text
机场订阅
  ↓
rename.js：统一节点名称
  ↓
Sub-Store：生成处理后的订阅
  ↓
sing-box-col.js：写入模板并生成策略组
  ↓
最终 sing-box 配置
```

`rename.js` 负责节点名称，`sing-box-col.js` 负责读取订阅、写入模板和生成策略组。两个脚本不直接调用，通过订阅名称关联。

## 快速使用

### 1. 在 Sub-Store 中添加订阅

在订阅的节点操作中按顺序添加：

1. `rename.js`；
2. Sub-Store 自带的旗帜操作，或给 `rename.js` 添加 `flag` 参数。

`rename.js` 一般不需要参数。需要自定义机场前缀时再传入 `name=xxx`。

不要把 `rename.js` 同时挂到组合订阅上。组合订阅只负责组合已经处理过的子订阅。

### 2. 创建配置文件

在 Sub-Store 的“文件”中：

1. 选择 `templates/sing-box-1.14/` 下的模板；
2. 添加脚本 `scripts/sing-box-col.js`；
3. 根据需要填写参数。

脚本参数：

| 参数 | 是否必需 | 作用 |
| --- | --- | --- |
| `name=xxx` | 是 | Sub-Store 中的订阅名称 |
| `type=col` | 组合订阅时需要 | 按组合订阅生成多机场策略组 |
| `autointerval=30s` | 可选 | 设置 AUTO、地区组和 ALL AUTO 的测速间隔 |
| `smart=on` | 可选 | 生成 `<机场> SMART` 节点选择组，默认不生成 |
| `strip-ech=on` | 可选 | 删除节点中的 `tls.ech`，默认保留 |

使用 sing-box-smart 时传入：

```text
smart=on
```

如果节点带 ECH，且当前 DNS 规则不允许获取 HTTPS/SVCB 记录，可按需传入：

```text
strip-ech=on
```

## 生成的策略组

脚本会根据订阅内容生成：

- `<机场> AUTO`：机场内节点自动测速；
- `<机场> MANUAL`：按地区选择；
- `<机场> SMART`：仅在传入 `smart=on` 时生成，供 sing-box-smart 使用；
- `ALL AUTO`：多个机场时生成，自动选择最快机场；
- `proxy`：主代理选择组；
- `AI`：非香港节点组成的 AI 专用组；
- 地区自动测速组。

没有节点的策略组会自动加入 `COMPATIBLE` 直连出站，避免 sing-box 因空策略组无法启动。

## 模板选择

| 模板 | 使用场景 | 接管方式 |
| --- | --- | --- |
| `sing-box-1.14/universal-tmpl.json` | iPhone、macOS 等 sing-box 客户端 | TUN，并提供本机 `mixed-in:7890` |
| `sing-box-1.14/linux-tmpl.json` | Linux 独立运行 sing-box | `auto_route`、`auto_redirect` 和 `bypass` |
| `sing-box-1.14/momo-tmpl.json` | Momo 普通代理模式 | 由 Momo 管理透明代理接管 |
| `sing-box-1.14/momo-kernel-only-tmpl.json` | Momo 仅核心模式 | 由 sing-box 管理 TUN 和自动重定向 |
| `sing-box-1.14/annotated.json` | 阅读配置说明 | JSONC 注释版，不能直接运行 |

旧版本模板位于 `templates/sing-box-1.11/`、`1.12/` 和 `1.13/`。新配置建议使用 1.14 模板。

1.14 模板的详细说明见：[templates/sing-box-1.14/README.md](templates/sing-box-1.14/README.md)。

## 脚本

| 文件 | 作用 |
| --- | --- |
| [rename.js](scripts/rename.js) | 统一节点名称和地区名称 |
| [sing-box-col.js](scripts/sing-box-col.js) | 生成节点、策略组和最终配置 |
| [push-info.js](scripts/push-info.js) | 查询机场流量并推送到 Bark |
| [node_info.js](scripts/node_info.js) | 旧的流量信息节点方案，不建议新配置使用 |

详细说明见：[scripts/README.md](scripts/README.md)。

## 1.14 模板的共同特性

- 国内 DNS 使用 `dns-ali` 和 `dns-pub` 竞速；
- 境外及未命中域名使用 `dns-google`；
- DNS 使用真实 IP，不使用 FakeIP；
- DNS 策略为 `ipv4_only`，启用缓存和反向映射；
- HTTPS/SVCB 查询默认返回空的 `NOERROR` 响应，因此启用 ECH 的节点可能需要使用真实 HTTPS 记录或传入 `strip-ech=on`；
- 路由包含私有地址、国内域名和国内 IP 的直连规则；
- DoT、UDP 443、STUN 和 QUIC 默认拒绝；
- 模板没有显式设置 TUN `stack`，使用 sing-box 默认值。

## Momo 仅核心模式

使用 `momo-kernel-only-tmpl.json` 时：

- 在 Momo 中开启“仅核心”；
- 网络接管由 sing-box 配置负责；
- sing-box TUN 使用 `172.31.0.1/30`；
- mixed 入站监听 `0.0.0.0:7890`；
- 不会自动修改宿主机系统代理；
- `bypass` 需要 OpenWrt 内核支持 NFQUEUE。

需要安装与当前内核匹配的：

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

安装后重启 Momo。若日志出现 `pre-match disabled`，说明 bypass 的内核预匹配没有启用，普通代理仍可能正常工作。

## 相关文档

- [1.14 模板说明](templates/sing-box-1.14/README.md)
- [DNS、TUN、mixed-in 分流流程](templates/sing-box-1.14/dns-routing-flow.md)
- [sing-box TUN 文档](https://sing-box.sagernet.org/configuration/inbound/tun/)
- [sing-box bypass 文档](https://sing-box.sagernet.org/configuration/route/rule_action/#bypass)
- [Momo](https://github.com/nikkinikki-org/OpenWrt-momo)
