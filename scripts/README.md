# Sub-Store 脚本

这里的脚本分为两类：处理订阅节点的脚本，以及生成或推送结果的文件脚本。

## 推荐流程

单机场：

```text
Sub-Store 订阅
  ↓ 节点操作：rename.js
  ↓ 节点操作：旗帜操作（可选）
Sub-Store 已处理订阅
  ↓ 文件内容 + sing-box-col.js
最终 sing-box 配置
```

多机场组合：每个子订阅分别执行 `rename.js` 和旗帜操作，组合订阅本身只使用 `sing-box-col.js`，并传入 `type=col`。

## rename.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js
```

在 Sub-Store 的“订阅 → 节点操作”中添加。它会统一节点的机场前缀、地区名称和编号，使后续脚本能够生成地区策略组。

例如：

```text
原始名称：深港专线 01
处理结果：naixi Hong Kong 01
加旗帜后：🇭🇰 naixi Hong Kong 01
```

### 常用参数

参数写在脚本 URL 的 `#` 后面，多个参数使用 `&` 连接。

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `name=xxx` | 当前订阅名称 | 设置节点中的机场前缀 |
| `in=zh` / `in=flag` / `in=quan` / `in=en` | 自动识别 | 指定原节点名称使用的地区格式 |
| `out=quan` | `quan` | 输出英文全称，例如 `Hong Kong`；也可使用 `cn`、`en`、`flag` |
| `flag` | 关闭 | 由脚本在节点名称前添加国旗 |
| `fgf=xxx` | 空格 | 设置机场前缀或国旗后的分隔符 |
| `sn=xxx` | 空格 | 设置地区与编号之间的分隔符 |
| `one` | 关闭 | 只有一个节点的地区不显示末尾 `01` |
| `nf` | 关闭 | 将 `name` 前缀放到节点名称最前面 |
| `nm` | 关闭 | 保留无法识别地区的节点 |
| `clear` | 关闭 | 清理常见的套餐、流量、到期等无效名称 |
| `blkey=关键词` | 无 | 保留指定关键词；多个关键词用 `+` 连接，可用 `>` 改名 |
| `blgd` | 关闭 | 保留家宽、IPLC、IEPL 等特殊标识 |
| `bl` | 关闭 | 保留倍率等特殊标识 |
| `nx` | 关闭 | 保留普通倍率和无倍率节点 |
| `blnx` | 关闭 | 只保留高倍率节点 |
| `blpx` | 关闭 | 按保留标识排序 |
| `blockquic=on` | 不处理 | 将节点的 QUIC 相关传输参数改为阻止状态 |

通常只需要使用默认值，或添加 `name=xxx`。脚本默认会自动使用当前 Sub-Store 订阅名称作为机场前缀。

### 示例

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js#name=naixi
```

使用脚本添加国旗：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/rename.js#name=naixi&flag
```

不要把 `rename.js` 同时添加到组合订阅上，也不要在 `rename.js` 前面先执行旗帜操作，否则脚本可能无法正确识别原始地区。

## sing-box-col.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js
```

在 Sub-Store 的“文件”中创建本地配置文件，把 1.14 模板内容作为文件内容，再添加这个脚本操作。脚本会读取处理后的订阅，把节点写入模板，并生成机场、地区和节点策略组。

### 参数

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `name=xxx` | 无 | 读取指定的 Sub-Store 订阅或组合订阅 |
| `type=col` | 单订阅 | 按组合订阅生成多机场策略组 |
| `autointerval=30s` | 不写入 | 覆盖 sing-box AUTO、地区组和 ALL AUTO 的测速间隔 |
| `smart=on` | 关闭 | 生成 `<机场> SMART` 节点选择组，供 sing-box-smart 使用 |
| `strip-ech=on` | 关闭 | 删除节点中的 `tls.ech` |

`autointerval` 不传时不会向生成的策略组写入 `interval`，由 sing-box 使用自己的默认值。`smart` 和 `strip-ech` 都必须显式传入 `on` 才会生效。

单机场示例：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=naixi
```

组合订阅示例：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=all&type=col
```

接入 sing-box-smart：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/sing-box-col.js#name=naixi&smart=on
```

### 两个 `name` 的区别

- `rename.js` 的 `name`：写入节点名称，作为机场前缀；不传时自动使用当前订阅名称。
- `sing-box-col.js` 的 `name`：告诉脚本从 Sub-Store 读取哪一个订阅；必须与订阅名称一致。

## push-info.js

脚本地址：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/push-info.js
```

这是文件脚本，不参与节点改名和 sing-box 配置生成。它调用 Sub-Store 的流量接口，把机场流量、重置时间和到期时间推送到 Bark。

常用参数：

```text
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/push-info.js#bark=你的BarkKey&subs=机场A,机场B&group=SubStore&title=机场流量
```

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `bark` | 无 | Bark Key 或完整推送 URL，必填 |
| `subs` | 全部订阅 | 只推送指定订阅，多个名称用逗号分隔 |
| `group` | `SubStore` | Bark 分组 |
| `title` | 机场流量 | 通知标题 |

## 脚本 FAQ

### 为什么 `rename.js` 和 `sing-box-col.js` 都有 `name`？

它们作用不同。前者负责节点名称中的机场前缀，后者负责从 Sub-Store 查找订阅。单机场时通常把两者写成同一个名字；`rename.js` 不传时会自动使用订阅名称。

### 为什么不能把 `rename.js` 放到组合订阅上？

组合订阅的节点已经由各子订阅处理。再次执行改名会破坏机场前缀和地区结构，导致机场策略组或地区策略组生成错误。

### 为什么先执行 rename，再执行旗帜操作？

`rename.js` 会重新生成节点名称。旗帜操作放在前面时，后续改名可能清掉国旗；放在后面才能稳定保留国旗。

### 没有生成 SMART 组怎么办？

检查 `sing-box-col.js` URL 是否包含 `smart=on`。该功能默认关闭，避免在不使用 sing-box-smart 时增加节点级策略组。

### ECH 节点连接失败怎么办？

优先确认 DNS 是否允许获取 HTTPS/SVCB 记录。只有在当前配置确实无法获得 ECH 信息时，才给 `sing-box-col.js` 添加 `strip-ech=on`。

### 生成配置后如何检查？

先在 Sub-Store 生成完整配置，再执行：

```sh
sing-box check -c config.json
```

## 其他脚本

`node_info.js` 是旧的流量信息节点方案，仅保留用于兼容或参考；新配置使用 `push-info.js`。
