# sing-box-sub-store

![sing-box-sub-store 预览](https://github.com/user-attachments/assets/d4c3a550-d0e0-4554-a8a0-9df7828723ed)

用 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 将机场订阅转换为 sing-box 配置，并自动生成按机场、地区和节点组织的策略组。

## 目录

- [解决的问题](#解决的问题)
- [免责声明与使用限制](#免责声明与使用限制)
- [工作流程](#工作流程)
- [快速使用](#快速使用)
- [生成的策略组](#生成的策略组)
- [模板选择](#模板选择)
- [脚本](#脚本)
- [FAQ](#faq)
- [相关文档](#相关文档)

## 解决的问题

- 统一不同机场的节点名称和地区名称；
- 自动生成 sing-box 节点和策略组；
- 支持单机场和多机场组合订阅；
- 提供 universal、Linux、Momo 等运行环境模板；
- 可选接入 [sing-box-smart](https://github.com/Oterea/sing-box-smart) 面板进行节点检测和选择。

## 免责声明与使用限制

本仓库及其全部内容仅用于技术研究、学习交流和视频演示。

未经仓库维护者书面许可，禁止以任何形式复制、转载、镜像、改编、发布或分享本仓库内容至中国大陆境内的任何平台，包括但不限于：

- 网站、论坛和博客；
- 社交媒体和视频平台；
- 网盘、群组和其他公开或半公开渠道。

任何个人或组织使用、传播或改编本仓库内容时，必须遵守适用的法律法规及相关服务条款。因未经许可的复制、传播、改编、商业使用或其他行为产生的法律责任、平台处罚或损失，由实施相关行为的个人或组织依法独立承担。

本仓库不提供任何服务承诺，也不保证相关配置适用于所有网络环境。使用者应自行评估风险并对自己的使用行为负责。仓库维护者保留追究未经授权传播、改编和商业使用行为责任的权利。

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

1. 添加下面的脚本操作：

   ```text
   https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js
   ```

2. 添加 Sub-Store 自带的旗帜操作，或在脚本 URL 后添加 `#flag`。

不传 `name` 时，脚本会自动使用当前 Sub-Store 订阅名称作为机场前缀。需要自定义机场前缀时，在脚本 URL 后添加参数，例如：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js#name=naixi
```

不要把 `rename.js` 同时挂到组合订阅上。组合订阅只负责组合已经处理过的子订阅。

### 2. 创建配置文件

在 Sub-Store 的“文件”中选择“本地”内容，然后复制下面任意一个模板地址：

| 使用场景 | 模板地址 |
| --- | --- |
| iPhone、macOS 等官方客户端 | `https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/templates/sing-box-1.14/universal-tmpl.json` |
| Linux 独立运行 | `https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/templates/sing-box-1.14/linux-tmpl.json` |
| Momo 普通模式 | `https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/templates/sing-box-1.14/momo-tmpl.json` |
| Momo 仅核心模式 | `https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/templates/sing-box-1.14/momo-kernel-only-tmpl.json` |

然后给这个文件添加脚本操作：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=你的订阅名称
```

组合订阅使用：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=你的组合订阅名称&type=col
```

脚本参数：

| 参数 | 是否必需 | 作用 |
| --- | --- | --- |
| `name=xxx` | 是 | Sub-Store 中的订阅名称 |
| `type=col` | 组合订阅时需要 | 按组合订阅生成多机场策略组 |
| `autointerval=30s` | 可选 | 设置 AUTO、地区组和 ALL AUTO 的测速间隔 |
| `smart=on` | 可选 | 生成 `<机场> SMART` 节点选择组，默认不生成 |
| `strip-ech=on` | 可选 | 删除节点中的 `tls.ech`，默认保留 |

使用 [sing-box-smart](https://github.com/Oterea/sing-box-smart) 时，将脚本参数改为：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=你的订阅名称&smart=on
```

如果节点带 ECH，且当前 DNS 规则不允许获取 HTTPS/SVCB 记录，可使用：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=你的订阅名称&strip-ech=on
```

## 生成的策略组

脚本会根据订阅内容生成：

- `<机场> AUTO`：机场内节点自动测速；
- `<机场> MANUAL`：按地区选择；
- `<机场> SMART`：仅在传入 `smart=on` 时生成，供 [sing-box-smart](https://github.com/Oterea/sing-box-smart) 使用；
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

## FAQ

### 不传 `name` 会怎样？

`rename.js` 会自动使用当前 Sub-Store 订阅名称作为机场前缀。只有需要自定义前缀时，才添加 `name=xxx`。

### `type=col` 什么时候使用？

只有组合多个已经处理过的机场订阅时使用。单机场订阅不要添加 `type=col`。

### `smart=on` 是做什么的？

它会生成 `<机场> SMART` 节点策略组，供 [sing-box-smart](https://github.com/Oterea/sing-box-smart) 监测和切换。默认不生成。

### `strip-ech=on` 什么时候使用？

当节点包含 ECH，但当前 DNS 规则无法取得 HTTPS/SVCB 记录，导致节点连接异常时使用。它会删除节点中的 `tls.ech`，默认保留。

### 应该选择哪个 1.14 模板？

- `universal-tmpl.json`：iPhone、macOS 等 sing-box 客户端。
- `linux-tmpl.json`：Linux 独立运行 sing-box。
- `momo-tmpl.json`：Momo 普通代理模式。
- `momo-kernel-only-tmpl.json`：Momo 仅核心模式，由 sing-box 负责 TUN 和自动重定向。

### 模板是否使用 FakeIP？

不使用。模板使用真实 IP，并按 DNS、域名和 IP 规则进行分流。

### TUN 的 `stack` 是什么？

模板没有显式设置 TUN `stack`，使用 sing-box 默认值。sing-tun 通常比用户态协议栈开销更低、性能更好。

### Momo 仅核心模式为什么需要额外内核包？

该模式的 `bypass` 依赖 Linux NFQUEUE 预匹配。OpenWrt/ImmortalWrt 需要安装与当前内核匹配的：

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

如果日志出现 `pre-match disabled`，说明 bypass 预匹配未启用，但普通代理仍可能正常工作。

### 生成配置后如何检查？

先生成完整配置，再执行：

```sh
sing-box check -c config.json
```

## 相关文档

- [1.14 模板说明](templates/sing-box-1.14/README.md)
- [DNS、TUN、mixed-in 分流流程](templates/sing-box-1.14/dns-routing-flow.md)
- [sing-box TUN 文档](https://sing-box.sagernet.org/configuration/inbound/tun/)
- [sing-box bypass 文档](https://sing-box.sagernet.org/configuration/route/rule_action/#bypass)
- [Momo](https://github.com/nikkinikki-org/OpenWrt-momo)
