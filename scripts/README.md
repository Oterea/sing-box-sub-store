# scripts

这些脚本用于 Sub-Store 的节点操作或文件生成。

## 使用顺序

普通订阅：

```text
订阅
  ↓ rename.js
  ↓ 旗帜操作（可选）
  ↓ sing-box-col.js
  ↓ sing-box 配置
```

组合订阅只在子订阅上使用 `rename.js`，组合订阅本身使用 `sing-box-col.js` 并传入 `type=col`。

## rename.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js
```

统一节点名称和地区名称，生成类似：

```text
🇭🇰 naixi Hong Kong 01
🇯🇵 naixi Japan 02
```

常用参数：

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `name` | 订阅名称 | 节点名称中的机场前缀 |
| `out` | `quan` | 地区名称格式，可改为 `cn`、`en` 等 |
| `flag` | 关闭 | 由脚本添加国旗 |

## sing-box-col.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js
```

读取模板和处理后的订阅，生成节点、机场策略组、地区策略组和最终配置。

| 参数 | 作用 |
| --- | --- |
| `name=xxx` | 读取指定订阅 |
| `type=col` | 处理组合订阅 |
| `autointerval=30s` | 设置自动测速间隔 |
| `smart=on` | 生成 `<机场> SMART` 节点选择组 |
| `strip-ech=on` | 删除节点的 `tls.ech` |

`smart` 和 `strip-ech` 默认关闭。

## push-info.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/push-info.js
```

调用 Sub-Store 的流量接口，将机场流量、重置时间和到期时间推送到 Bark。

常用参数：

```text
bark=<key>
subs=机场A,机场B
group=SubStore
title=机场流量
```

## node_info.js

旧的流量信息节点方案。新配置建议使用 `push-info.js`，该脚本保留用于兼容或参考。
