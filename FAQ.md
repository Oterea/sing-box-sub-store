# FAQ

## 不传 `name` 会怎样？

`rename.js` 会自动使用当前 Sub-Store 订阅名称作为机场前缀。只有需要自定义前缀时，才添加 `name=xxx`。

## `type=col` 什么时候使用？

只有组合多个已经处理过的机场订阅时使用。单机场订阅不要添加 `type=col`。

## `smart=on` 是做什么的？

它会生成 `<机场> SMART` 节点策略组，供 [sing-box-smart](https://github.com/Oterea/sing-box-smart) 监测和切换。默认不生成。

## `strip-ech=on` 什么时候使用？

当节点包含 ECH，但当前 DNS 规则无法取得 HTTPS/SVCB 记录，导致节点连接异常时使用。它会删除节点中的 `tls.ech`，默认保留。

## 应该选择哪个 1.14 模板？

- `universal-tmpl.json`：iPhone、macOS 等 sing-box 客户端。
- `linux-tmpl.json`：Linux 独立运行 sing-box。
- `momo-tmpl.json`：Momo 普通代理模式。
- `momo-kernel-only-tmpl.json`：Momo 仅核心模式，由 sing-box 负责 TUN 和自动重定向。

## 模板是否使用 FakeIP？

不使用。模板使用真实 IP，并按 DNS、域名和 IP 规则进行分流。

## TUN 的 `stack` 是什么？

模板没有显式设置 TUN `stack`，使用 sing-box 默认值。sing-tun 通常比用户态协议栈开销更低、性能更好。

## Momo 仅核心模式为什么需要额外内核包？

该模式的 `bypass` 依赖 Linux NFQUEUE 预匹配。OpenWrt/ImmortalWrt 需要安装与当前内核匹配的：

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

如果日志出现 `pre-match disabled`，说明 bypass 预匹配未启用，但普通代理仍可能正常工作。

## 生成配置后如何检查？

先生成完整配置，再执行：

```sh
sing-box check -c config.json
```

