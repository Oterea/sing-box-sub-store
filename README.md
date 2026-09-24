# sing-box-sub-store

## 预览
<img width="3814" height="1902" alt="CleanShot 2026-09-22 at 13 31 52@2x" src="https://github.com/user-attachments/assets/d4c3a550-d0e0-4554-a8a0-9df7828723ed" />


用 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 把机场订阅加工成 sing-box 配置。

- `scripts/` —— 挂在 Sub-Store 上的脚本
- `templates/` —— sing-box 配置模板

感谢相关开源大佬提供原始配置，有使用问题请提 Issue。
Sub-Store 本身怎么搭建不在这里讲，[参考教程](https://www.youtube.com/watch?v=nEw1iadtPvs)。

## 整体流程

两个脚本挂在 Sub-Store 的不同位置，**没有直接调用关系**，靠"按订阅名去取"连起来：

```
机场的订阅 URL
      │  Sub-Store 拉取
      ▼
   原始节点   香港 01 / 深港专线 / HK-2 …    ← 每个机场的命名都不一样
      │
      │  在【订阅】上挂节点操作，按顺序跑
      ├─ ① rename.js    → naixi Hong Kong 01     规整成统一格式
      └─ ② 旗帜操作      → 🇭🇰 naixi Hong Kong 01  加国旗
      ▼
   订阅「naixi」
      ┊
      ┊  ← sing-box-col.js 按订阅名「naixi」主动来取
      ┊
      ▼
   【文件】
      ├─ templates/ 里的模板
      └─ sing-box-col.js  → 把节点装进模板的 outbounds
      ▼
   最终 config.json          ← 你的 sing-box 订阅这个地址
```

**分工**：`rename.js` 负责认识地理，把各家机场五花八门的写法（`深港`、`HK`、`香港`、`Hong Kong`）统一成一种；`sing-box-col.js` 不认识地理，它只是按名字把节点分堆。所以两者是绑死的 —— 名字没规整好，分组就是乱的。

## 第一步：配置订阅

在 Sub-Store 里添加订阅，在【节点操作】里按这个顺序加两项：

### ① 脚本操作 → `rename.js`

参数：

**通常什么参数都不用填**，脚本地址直接写 `…/scripts/rename.js` 即可：

| 参数 | 默认 | 说明 |
|---|---|---|
| `name` | **自动取 Sub-Store 里这条订阅的名字** | 加在节点名里的机场前缀。想用别的名字就手写 `name=xxx` 覆盖 |
| `out` | `quan`（英文全称） | 输出 `Hong Kong` 而不是 `香港` 或 `HK`。想要中文写 `out=cn` |

产物：订阅名叫 `naixi` 就得到 `naixi Hong Kong 01`、`naixi United States 02`

> ⚠️ **订阅名不要带空格。** 下一步的 `sing-box-col.js` 是按第几个词来拆节点名的（见下），前缀占掉一个词的位置。订阅名叫 `naixi cloud` 的话，整个解析会错位一格。

其余参数见脚本开头的注释。**但不要加 `one` / `blgd` / `bl` / `blkey` / `sn=`** —— 它们会改变节点名的结构，而下一步的分组依赖这个结构。

### ② 旗帜操作

Sub-Store 自带的节点操作，不是脚本。它会从节点名里认出国家，在最前面加上国旗：

```
naixi Hong Kong 01  →  🇭🇰 naixi Hong Kong 01
```

> ⚠️ **顺序不能反。** `rename.js` 匹配成功后是把名字**整个重造**的，原有国旗不会保留。旗帜操作排在它前面的话，加的国旗会被 rename 抹掉。
>
> 也可以不用旗帜操作，改成给 `rename.js` 传 `flag` 参数，效果一样。二选一即可。

### 国旗的作用

国旗会进到地区组的名字里（`🇭🇰 naixi Hong Kong`），面板上好认。

**它不再影响分组是否正确。** 以前 `sing-box-col.js` 靠数第几个词来认机场名，
国旗占着第 0 位，少了它整体就错位一格（策略组会变成 `Hong AUTO`）。现在机场
身份是直接问 Sub-Store 要的，跟节点名的词序无关 —— 不加国旗只是名字里少个
图标，`<机场> AUTO` 照样正确。

## 第二步：配置文件

在 Sub-Store 的【文件】里新建一个，内容用 `templates/` 里对应的模板，然后挂上脚本 `sing-box-col.js`。

参数：

| 参数 | 值 | 说明 |
|---|---|---|
| `name` | `naixi` | **Sub-Store 里那个订阅的名字**，用来找订阅 |
| `type` | `col` | 只有组合订阅才需要填。单订阅不填 |
| `fast` | 机场名 | 可选。额外生成一个 `<机场> FAST` 实验组，见下文 |

> 两个脚本都有 `name=`，含义**完全不同**：
> - `rename.js` 的 `name=` → 写进节点名里的前缀（现在默认自动取订阅名）
> - `sing-box-col.js` 的 `name=` → 拿来找订阅的名字
>
> 以前要手动把两边填成同一个值，否则策略组名和订阅名对不上。现在 `rename.js`
> 不填就自动取订阅名，和这里的 `name` 天然一致，不用再操心。

## 产出的策略组

以两个机场、6 个节点为例：

```
proxy (selector)                          ← 面板里手动选这一层
    ALL AUTO (urltest)                    ← 跨机场，全局挑最快（默认选中）
        naixi AUTO
        bpjc AUTO
    naixi AUTO (urltest)                  ← 该机场全部节点，扁平
        🇭🇰 naixi Hong Kong 01
        🇭🇰 naixi Hong Kong 02
        🇯🇵 naixi Japan 01
    bpjc AUTO (urltest)
        🇺🇸 bpjc United States 01
        🇸🇬 bpjc Singapore 01
    naixi MANUAL (selector)               ← 按地区分层，方便手动浏览
        🇭🇰 naixi Hong Kong (urltest)
            🇭🇰 naixi Hong Kong 01
            🇭🇰 naixi Hong Kong 02
        🇯🇵 naixi Japan (urltest)
    bpjc MANUAL (selector)
        …

AI (selector)                             ← 平铺，直接是节点
    🇯🇵 naixi Japan 01
    🇺🇸 bpjc United States 01
    …
```

- **`<机场> AUTO`**（urltest）：该机场的**所有节点**，自动挑最快。刻意做成扁平的 —— 见下方说明
- **`<机场> MANUAL`**（selector）：该机场的**地区组**，让你手动挑地区
- **地区组**（`🇭🇰 naixi Hong Kong`）：砍掉编号后名字相同的节点归一组。只挂在 MANUAL 下面
- **`ALL AUTO`**（urltest）：所有机场的 AUTO 组。**只有多个机场时才生成**（单订阅时它和 `<机场> AUTO` 完全一样）
- **`proxy`**：`ALL AUTO` + 所有 AUTO + 所有 MANUAL。默认选中第一项，也就是 `ALL AUTO`
- **`AI`**（selector）：所有名字里不含 `hong kong` 的节点（港区 IP 在 OpenAI 那儿不好用）。selector 不自动切换，出口 IP 稳定 —— AI 服务频繁换 IP 容易触发人机验证

### 为什么 AUTO 扁平、MANUAL 分层

两者用途不同，结构就不该一样：AUTO 是机器按延迟自动挑，要**准**；MANUAL 是人手动浏览着选，要**好找**。

urltest 换节点有个 `tolerance` 门槛（默认 50ms），新节点要快过这个数才会被换上。每套一层就多一道门槛，而且上层只看得到下层当前选中的那个 —— 下层因为门槛没换掉的更快节点，上层根本看不见。所以 AUTO 直接装节点，只有一道门槛。

MANUAL 是 selector，不测速，没有这个问题，保留地区分层反而好用。

哪个策略组为空时，会自动塞一个 `COMPATIBLE`（直连）进去 —— 空的策略组会让 sing-box 拒绝启动。订阅拉到 0 个节点、或者订阅里全是港区节点导致 `AI` 组为空，都会走到这个兜底。

## 快速故障切换

节点挂掉之后，sing-box **不会自动换个节点重试** —— 它把错误抛给应用，只是悄悄把
这个节点的测速记录删掉，要等下一次定时测速才把它踢出候选、换成活的。所以
「节点挂了多久能切走」的上限就是测速间隔 `interval`，默认 **3 分钟**。

3 分钟里你的每个新连接都还在往死节点上撞。机场不稳定时这个体感很差。

调快的代价是测速流量：测速是**经过节点**去请求测试地址的，算机场额度。实测单次
https 测速约 18.5 KB（两次 TLS 握手：一次到机场服务器，一次到测试站点）。间隔
减半，流量翻倍。

所以不建议直接改全局，先用实验组对照：

```
fast=tolink
```

会额外生成一个 `tolink FAST`，成员和 `tolink AUTO` 完全一样，**唯一的区别是
`interval` 从 3 分钟改成 30 秒**，并排放在 `tolink AUTO` 后面：

```
proxy (selector)
    ALL AUTO
    tolink AUTO           ← 默认参数
    tolink FAST           ← interval 30s
    pei AUTO
    ...
```

在面板上来回切，对比两件事：节点挂掉后多久切走，以及机场后台的流量增量。
觉得值就把 `interval` 挪到主组，不值就去掉 `fast=` 参数。

不传 `fast=` 时产出与不带这个功能时完全相同。

## 切换节点会掐断已有连接

所有策略组都设了 `interrupt_exist_connections: true`。切换节点（手动点，或
urltest 自动切）时，已经建立的连接会被掐掉，应用重连后走新节点。

不掐的话，组已经切到活节点了，你手上的连接还挂在老节点上直到自己超时 —— 节点
真挂了的时候这就是最糟的情况。

> 官方文档：*Only inbound connections are affected by this setting, internal
> connections will always be interrupted.*
>
> 受这个开关影响的是**从入站进来的连接**，也就是你实际上网的那些。sing-box 自己
> 发起的内部连接（规则集下载、测速）本来就一律掐断，不受这个开关保护。

## 机场流量信息

**流量信息不再放进 sing-box 的策略组。** 看流量有两个地方：

- **Sub-Store 面板** —— 实时，打开就是当前值
- **Bark 推送** —— 每天定时 + 随时点一下，见下一节

### 为什么把 INFO 组删了

它曾经是 `proxy` 之外的一个 `selector`，成员是各机场的流量文字。问题在于
**它是快照，却长得像实时数据**：

```
配置生成的那一刻    →  数字定格
客户端每天拉一次    →  之后一整天都是那个数字
面板上             →  没有任何迹象表明它是旧的
```

流量一天能变几十 G。中午看到「剩余 72 GB」，实际可能已经是 60。
看起来可信、实际不可信，比没有更坏。

而它唯一的差异化（不开 Sub-Store 面板也能在 sing-box 客户端里看）
正好建立在「数据新鲜」这个它保证不了的前提上。

### `rename.js` 的 `infotag` 还在

采集那部分没删 —— 加上 `infotag` 参数，`rename.js` 仍然会把机场塞在节点列表里
的公告文字写进脚本缓存（键 `<infotag>:<订阅名>`）。只是**目前没有消费方**。

留着是因为它便宜（不传参数就完全不生效，产出与上游逐字节相同），
而且哪天遇到一个连 `subscription-userinfo` 都不发的机场，这是唯一的路子。

> 它不能当推送的兜底 —— 缓存是上次**成功产出**时写的，年龄不明。
> 推送查不到流量时，说明机场那边不通，那时候这个缓存里的值多半也是旧的。
> 拿一个年龄不明的旧值去填「当前流量」，比留空更坏。


## 推送到手机（push-info.js）

想让流量信息主动推到手机上，用 `scripts/push-info.js`。

### 数据从哪来

**直接调 Sub-Store 自己的查流量接口，跟面板用的是同一个：**

```
GET http://127.0.0.1:<后端 API 端口>/api/sub/flow/<订阅名>
→ {"status":"success","data":{
     "expires": 1791820800,
     "total": 107374182400,
     "usage": {"upload": 69005692, "download": 3926585248},
     "remainingDays": 19
   }}
```

所以 `flowUserAgent` 解析、`resetDay` 计算、`subUserinfo` 合并全都复用 Sub-Store
的实现，一行都不用抄。**不依赖 `rename.js`，也不读任何缓存** —— 那两个脚本
照常工作，互不影响。

端口读环境变量，跟 Sub-Store 源码同一行逻辑：

```js
port = process.env.SUB_STORE_BACKEND_API_PORT || 3000
```

**3000 是不带安全路径的裸 API，只在容器内监听。** 本脚本正好跑在容器里，
所以不需要后端路径、不需要任何参数。代价是这个脚本不能挪到容器外面跑。

> 字节换算用 `flowUtils.flowTransfer` —— 也是 Sub-Store 自己的函数，
> 所以输出跟面板逐字一致（`100 GB` 而不是 `100.00 GB`，自动进位到 TB）。

### 推送长什么样

**所有机场合成一条通知**，标题 `机场流量`：

```
⚠️ gone NO_FLOW_INFO（试了 3 次，0.4s）

# mitch # 1.2s
已用 3.72 GB / 100 GB（3.7%）
较上次 消耗 122.88 MB（0.5 小时前）
较上次定时 消耗 1.28 GB（6.0 小时前）
重置 2026-10-13（19 天后）
到期 2026-10-13 00:00（19 天后）

# pei # 1.7s
已用 27.83 GB / 100 GB（27.8%）
重置 2026-10-05（11 天后）
到期 2026-10-05 16:44（11 天后）
```

每个机场名后面是这次查询用了多久。失败的排最前面并**带上错误码** ——
iOS 通知不展开时只显示前几行，出问题的要第一眼看见。

> 曾经是一个机场一条通知。那时每家要 0.8~4 秒（得下载整个节点列表），
> 先回来的先推能省下等待。换成 flow API 之后三家总共不到 2 秒
> （实测 `1.7s` / `2.0s`），拆成三条只是让手机连响三下。
>
> 代价是某家卡住时整条通知等它。但网页本来就要等全部跑完（`$content`
> 是 return 时一次性给出去的），所以手动点时通知晚到不影响；定时跑更没人等。

| 错误码 | 意思 | 该查什么 |
|---|---|---|
| `NO_FLOW_INFO` | 机场没给流量信息 | UA 不对、机场限流、或它压根不报 |
| `RESOURCE_NOT_FOUND` | 订阅名不存在 | 订阅改过名，`subs=` 参数或 Sub-Store 里对不上 |

只写「失败」的话这两种分不出来。

### 与上次的差值

两个基准，各存各的：

| 键 | 什么时候更新 |
|---|---|
| `push-info:last:<订阅名>` | **每次跑都更新**（手动或定时） |
| `push-info:cron:<订阅名>` | **只有定时跑才更新** |

定时那次两个一起更新。所以白天随手点几下不会冲掉「距离上次定时消耗了多少」，
但紧接着定时的第一次手动点，两行会显示成一样的 —— 那时「上次」就是「上次定时」。

区分办法：定时产出时 `$options` 是 `undefined`，网页访问时它带着请求信息。

用量是接口给的精确字节数，**直接相减，不碰任何文字**。机场改文案也不影响。

```
第一次跑          不显示这两行，不硬凑
已用变少          较上次 已重置（用量归零，6.0 小时前）
这次查询失败      两个基准都不更新，下次的间隔会显示得更长，看得出来
```

写「6.0 小时前」而不是「上次」—— 定时漏跑一次就成 12 小时，写死会骗人。

### 日期用本地时间

```js
// 不能用 toISOString().slice(0,10) —— 那取的是 UTC 日期
// mitch 到期 UTC 2026-10-12 16:00，东八区是 2026-10-13，会差一天
```

`expires` 是秒级时间戳，时分是真实信息（pei 的到期是 `16:44`），不截掉。

`remainingDays` 是**距离下次重置还有几天**，不是到期倒计时。接口用订阅链接上的
`#resetDay=` 算好了，按自然日，所以只有日期没有时刻。

到期后面的天数是脚本自己算的，**也按自然日比**（比日期不比小时），跟
`remainingDays` 同一套口径 —— 不然月付套餐里重置和到期是同一天，
却可能一个显示 18 天一个显示 19 天。边界：`（今天）`、`（已过期 N 天）`。

### 失败会重试

拉不到就重试，**最多 3 次**。中间那几次失败不推送，否则一个抖动的机场
能连刷三条通知。只在最终成功或最终失败时推一条：

```
mitch · 0.3s                      ← 一次就成功，不提重试
flaky · 0.9s · 重试 2 次           ← 第 3 次才成功
⚠️ gone · 0.6s                    ← 3 次都失败
   RESOURCE_NOT_FOUND（试了 3 次）
```

现在重试很便宜 —— 一个几百字节的本机请求，不再是下载整个节点列表。

### 配置

**1. 建文件**：Sub-Store → 文件 → 新建，源选「本地」内容留空，加一个脚本操作：

```
https://raw.githubusercontent.com/Oterea/sing-box-sub-store/main/scripts/push-info.js#bark=<你的 Bark key>
```

假设这个文件叫 `push-info`。

**2. 触发**：任何一次「产出这个文件」都会跑一遍脚本、推一次：

| 办法 | 要重启容器 | 怎么做 |
|---|---|---|
| 面板里点「预览」 | 否 | 手动推一次，先用这个验证通不通 |
| 手机上点一个图标 | 否 | 见下面「做成手机上的按钮」 |
| `SUB_STORE_PRODUCE_CRON` | **是** | Sub-Store 自带，不用碰系统 crontab |

用环境变量的话（每天 14 点和 20 点）：

```
SUB_STORE_PRODUCE_CRON="0 14 * * *,file,push-info;0 20 * * *,file,push-info"
```

格式是 `cron表达式,类型,名字`，多条用 `;` 分隔。

> **cron 表达式里不能带逗号。** 源码是 `t.split(/\s*,\s*/)` 按逗号切三段，
> 写成 `0 14,20 * * *,file,push-info` 会被切成五段直接废掉，只能用 `;` 分成两条。

### 做成手机上的按钮

**访问这个文件的产出地址 = 推一次。** 如果你的 Sub-Store 后端有域名：

```
https://<你的域名>/<后端路径>/api/file/push-info
```

Safari 打开 → 分享 → 「添加到主屏幕」，就是一个点一下就推送的图标。
用 iOS 快捷指令做一个「获取 URL 内容」动作也行，可以放进桌面小组件、
控制中心、操作按钮或轻点背面。

页面上直接显示完整信息，不用切到 Bark 去确认：

```
已推送 · 2026/9/24 21:23:00

⚠️ gone RESOURCE_NOT_FOUND（试了 3 次，0.6s）

# mitch # 1.2s
已用 3.72 GB / 100 GB（3.7%）
重置 2026-10-13（19 天后）
到期 2026-10-13 00:00（19 天后）
```

第一行是这次的结果。推送没发出去时会写清楚，不会假装成功：

```
已推送 · 2026/9/24 21:23:00
推送失败，Bark 返回 500 · 2026/9/24 21:23:27
推送失败，Bark 返回 无响应 · …              ← 连不上 Bark
```

> 这个地址带着后端路径，等于你的 Sub-Store 管理入口，**别往外发**。
>
> 网页（和快捷指令）要等全部机场跑完才返回 —— HTTP 响应没法流式返回，
> `$content` 是脚本 return 时一次性给出去的。

### 可选参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `bark=` | 必填 | Bark 的 key，或完整推送 URL（自建时用） |
| `subs=a,b` | 全部订阅 | 只推指定的几条。名字打错会在日志里报出来 |
| `group=` | `SubStore` | Bark 分组 |
| `title=` | `机场流量` | 通知标题 |


## 组合订阅

多个机场合成一个订阅时，`sing-box-col.js` 加 `type=col`。

每个子订阅必须有**不同的**机场前缀。`rename.js` 默认取各自的订阅名，而订阅名在
Sub-Store 里本来就不能重复，所以这一条现在自动成立 —— 除非你手写了 `name=`，
那就得自己保证别撞。

撞了会怎样：两个机场被当成同一个合并，节点名也会重复 —— sing-box 对重复的
outbound tag 不报错，后面的会静默覆盖前面的，等于悄悄少了节点。

**另外：`rename.js` 只挂在【订阅】上，不要也挂到【组合订阅】上。** 它是把名字
整个重造的，在组合订阅那层再跑一遍会重新识别、重新编号，而那一层拿不到单个
机场的名字，前缀会被洗掉。

## scripts

| 脚本 | 作用 | 来源 |
|---|---|---|
| `rename.js` | 节点重命名（`infotag` 可选采集机场公告，目前无消费方） | 来自 [Keywos/rule](https://github.com/Keywos/rule)，改动：`name` 不填时自动取订阅名、`out` 默认改成 `quan`、地区表补到 249 国、`infotag` 采集 |
| `sing-box-col.js` | 把节点装进模板，生成策略组 | 本仓库 |
| `push-info.js` | 把机场流量/到期推送到 Bark。调 Sub-Store 的查流量接口，**不依赖前两个脚本** | 本仓库 |
| `node_info.js` | 把订阅流量/到期信息做成一个节点 | 来自 [xream/scripts](https://github.com/xream/scripts) 的 `sub-info/node.js`。**已被 push-info.js 取代**，留着备查 |

## templates

| 模板 | 用途 |
|---|---|
| `sing-box-1.xx-tmpl.json` | sing-box 官方客户端 |
| `sing-box-1.xx-linux-tmpl.json` | Linux。监听全部收回 `127.0.0.1`，tun 用 `auto_redirect` |
| `sing-box-1.xx-momo-tmpl.json` | OpenWrt 代理插件 [momo](https://github.com/nikkinikki-org/OpenWrt-momo) |
| `sing-box-1.14-annotated.json` | 1.14 模板的逐行注释版，**JSONC 格式，不能直接使用** |

模板的 `outbounds` 里只有 `direct`，其余全部由脚本生成。路由规则引用 `direct`、`proxy`、`AI` 三个出站，前两个和 `AI` 都由 `sing-box-col.js` 生成。

> ⚠️ `sing-box-1.11-tmpl.json` 和 `sing-box-1.12-linux-tmpl.json` 是早期版本，路由规则引用的是 `openai` 而不是 `AI`。当前脚本不生成 `openai`，用这两份会报 `outbound not found` 起不来。要用的话把模板里的 `openai` 改成 `AI`。

## sing-box 版本注意事项

### 1.12

`domain_resolver` 可以为 outbound 中的每个节点设置 DNS 解析的 server，也可以直接在 `route` 中设置 `default_domain_resolver`。
`dns` 的 server 不能写 `detour`，默认是 direct。

### 1.14

三处旧写法被标记废弃，都会在 1.16 移除，模板已经改用新写法：

| 旧写法 | 新写法 |
|---|---|
| `cache_file.store_rdrc` | `cache_file.store_dns` |
| 每个 `rule_set` 各写一个 `download_detour` | 顶层声明 `http_clients`，`rule_set` 的 `tag` 改成数组 + URL 里用 `{tag}` 占位 |
| 不声明 `http_clients`（规则集默认走默认出站） | 显式声明 `http_clients` + `route.default_http_client` |

另外 1.14 用 `clash_api` 的 `external_ui` 托管面板有个坑：它要把面板文件**下载完**才开始监听端口。面板动辄几 MB，网络不好就一直下不完，表现为 API 端口始终不通、客户端显示"未启动"，但隧道其实是正常的。模板改用 `services` 里的 api 服务托管面板绕开它 —— 那条路是先开端口、再后台下载。
