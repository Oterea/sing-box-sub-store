# sing-box 1.14 配置模板

本目录按运行环境提供模板。模板需要在 Sub-Store 中配合 [`sing-box-col.js`](../../scripts/sing-box-col.js) 使用：脚本将订阅节点和策略组写入模板，生成最终配置。不要把尚未生成节点和策略组的模板直接作为运行配置。

## 如何选择

| 文件 | 使用场景 | 流量接管方式 |
| --- | --- | --- |
| [universal-tmpl.json](universal-tmpl.json) | sing-box 官方客户端，例如 iPhone、macOS、Android | TUN；包含监听 `127.0.0.1:7890` 的 HTTP/SOCKS mixed 入站和平台 HTTP 代理设置 |
| [linux-tmpl.json](linux-tmpl.json) | 独立运行 sing-box 的 Linux 环境 | sing-box 自己通过 `auto_route`、`auto_redirect` 和 `bypass` 管理 TUN、路由和流量重定向；包含手动使用的 `mixed-in:7890` |
| [momo-tmpl.json](momo-tmpl.json) | OpenWrt Momo 的普通代理模式 | Momo 管理透明代理防火墙和策略路由；模板提供 DNS、Redirect、TProxy 和 TUN 入站，TUN 的 `auto_route`、`auto_redirect` 均关闭 |
| [momo-kernel-only-tmpl.json](momo-kernel-only-tmpl.json) | OpenWrt Momo 开启“仅核心”模式 | Momo 管理核心进程和配置；sing-box 自己管理 TUN、路由、自动重定向和 `bypass` |
| [annotated.json](annotated.json) | 阅读配置机制和参数说明 | 通用模板的注释版，含额外机制说明；这是 JSONC，不作为普通 JSON 模板直接使用 |

## 共同配置

- 已收录的国内域名由 `dns-ali`（阿里 DoH）和 `dns-pub`（腾讯 DoH）竞速查询，覆盖 A、AAAA、TXT、MX、CNAME 等查询类型；境外域名及未命中的域名通过 `dns-google`（Google DoH，经过 `proxy`）查询。
- Direct 模式直接使用 `dns-ali`；普通规则下的国内域名使用阿里和腾讯竞速。未收录域名只有 A 查询会进入 IP 地理位置判断，TXT、MX 等其他查询使用默认的 `dns-google`。国外 DNS 不参与国内竞速。
- `dns-hosts` 只保存几个 DoH 服务器自身的固定地址，用于建立 DoH 连接，不负责解析普通网站。
- DNS 策略为 `ipv4_only`，启用乐观缓存；HTTPS/SVCB 查询返回 `NOERROR` 空响应。
- 路由包含局域网直连、国内直连、指定服务分流和默认代理；包含 DoT、UDP 443、STUN、QUIC 拒绝规则，实际执行取决于规则顺序及匹配结果。
- 策略组和订阅节点由脚本生成。`autointerval` 可设置自动测速间隔，不传则使用 sing-box 默认值；脚本不设置 URLTest 的 `idle_timeout`。
- 模板未指定 TUN `stack`，使用核心默认实现。

## Momo 普通模式

使用 `momo-tmpl.json`，不要开启 Momo 的“仅核心”。

模板保留 Momo 使用的入站标签：`dns-in`、`redirect-in`、`tproxy-in`、`tun-in`。DNS 入站监听 1053，Redirect 监听 7890，TProxy 监听 7891。Momo 根据其面板中的代理模式创建接管规则。

## Momo 仅核心模式

使用 `momo-kernel-only-tmpl.json`，并在 Momo 中开启“仅核心”。Momo 的普通透明代理接管和配置混入不参与此模式，网络接管由最终 sing-box 配置负责。

模板包含由 sing-box 管理的 TUN，以及监听 `0.0.0.0:7890` 的 mixed 入站。它不设置 `platform.http_proxy`，因此不会修改宿主机系统代理；需要使用 mixed 入站时，由客户端或局域网设备手动设置代理地址。

```json
[
  {
    "tag": "tun-in",
    "type": "tun",
    "interface_name": "momo",
    "address": ["172.31.0.1/30"],
    "auto_route": true,
    "auto_redirect": true
  },
  {
    "tag": "mixed-in",
    "type": "mixed",
    "listen": "0.0.0.0",
    "listen_port": 7890
  }
]
```

没有显式填写 `dns_mode` 和 `dns_address`：使用默认 `hijack` 模式和自动推导的 DNS 接收地址 `172.31.0.2`。被自动接管的 53 端口请求交给 sing-box DNS 模块。Linux 下发往本机接口地址（例如路由器 LAN IP）的 DNS 不会被这套自动机制劫持，需要结合 dnsmasq 的实际转发配置判断。

### bypass 的行为

模板在 `sniff` 前加入 `bypass`：目标为私有地址或 `geoip/cn`，目标端口不是 53/853，且 Clash 模式不是 Global 时，尝试在 `auto_redirect` 预匹配阶段由内核直接转发。

命中后不再执行后面的嗅探、拒绝和域名分流规则。因此，它按目标 IP 提前决定直连，不能保证保留后续域名规则的优先级，也不能保证对这些连接执行后面的 STUN/QUIC 拒绝。未命中的流量继续使用原有路由规则。

### 必需的 NFQUEUE 内核包

`bypass` 的预匹配需要 NFQUEUE 支持。OpenWrt/ImmortalWrt 上需要与当前固件内核匹配的两个包：

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

使用 opkg 的系统可执行：

```sh
opkg update
opkg install kmod-nfnetlink-queue kmod-nft-queue
```

安装完成后重启 Momo，让 sing-box 重新初始化预匹配。内核包必须匹配正在运行的内核，不要强制安装不匹配的版本。

缺少支持时可能出现我们实际遇到的日志：

```text
nfqueue start failed, pre-match disabled (missing nfnetlink_queue and nft_queue kernel module?): register nfqueue: could not unbind existing handlers (if any): netlink receive: invalid argument
```

这表示 NFQUEUE 预匹配被关闭，不代表整个代理停止工作。普通代理和分流仍可能正常，但这份模板的 `bypass` 内核绕过不会生效。

验证命令：

```sh
lsmod | grep -E 'nfnetlink_queue|nft_queue'
nft list table inet sing-box
```

应看到两个模块已加载，以及 `prerouting_prematch`、`output_prematch` 链和发往 NFQUEUE 的 `queue` 规则。链存在说明预匹配已部署；某个连接是否实际命中 `bypass`，还需结合连接标记、计数或日志验证。

实际验证环境：ImmortalWrt，Linux 6.6.93，sing-box 1.14.0。安装 `6.6.93-r1` 的上述两个包并重新启动核心后，模块加载成功，预匹配链创建成功。

## 参考

- [sing-box TUN 配置](https://sing-box.sagernet.org/configuration/inbound/tun/)
- [sing-box 预匹配](https://sing-box.sagernet.org/configuration/shared/pre-match/)
- [sing-box bypass 动作](https://sing-box.sagernet.org/configuration/route/rule_action/#bypass)
- [Momo 官方 Wiki](https://github.com/nikkinikki-org/OpenWrt-momo/wiki)
