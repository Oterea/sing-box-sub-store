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

## 机场流量信息（INFO 组）

给 `rename.js` 和 `sing-box-col.js` 都传上同一个 `infotag`，面板里会多出一个
`INFO` 组，把各机场的剩余流量和到期时间摆在一起：

```
INFO (selector)
    tolink 剩余流量：78.29 GB
    tolink 下次重置：25 天后
    tolink 套餐到期：2026-10-17
    pei 已用流量：2.87G / 100.00G
    pei 套餐到期：2026-10-05
    pei 剩余天数：13 天
```

```
rename.js        …&infotag=___INFO___
sing-box-col.js  …&infotag=___INFO___
```

两边的值必须一致。**不传就完全没有这个功能**，两个脚本的产出和不带它时逐字节相同。

### 信息从哪来

机场给流量信息有两种方式，这里都支持：

| 方式 | 谁给的 | 怎么取 |
|---|---|---|
| **订阅响应头** | 多数机场。`subscription-userinfo: upload=…; download=…; total=…; expire=…` | `sing-box-col.js` 直接读 |
| **假节点** | 少数机场。往节点列表里塞几个名字是公告的节点 | `rename.js` 收集，见下 |

顺序是**假节点优先、响应头兜底**。因为有的机场两样都给，但响应头里全是 0
（`upload=0; download=0; total=0`）—— 先读头会显示成 0。代码里用 `total > 0` 挡住这种。

### 假节点为什么要绕一圈

那些公告节点（`剩余流量：78.29 GB`）认不出地区，`rename.js` 会当垃圾丢掉。
想让它们活着传到 `sing-box-col.js`，得依次骗过四道关卡：

```
Useless Filter → rename.js → Flag Operator → Region Filter
```

其中 **Region Filter 按地区白名单保留**，而公告节点的 `getFlag` 返回的是
🏳️‍🌈 或 🏴‍☠️，不在任何地区里，**必被剔除且没有放行选项**。这条路走不通。

所以改成：`rename.js` 在丢弃它们之前，把**原始名字**写进 Sub-Store 的脚本缓存
（键是 `<infotag>:<订阅名>`），`sing-box-col.js` 直接从缓存取。信息根本不进节点流，
四道关卡一道都碰不到。

`INFO` 组的成员是现造的 `direct` 类型出站——信息节点不是用来连的，万一误选也只是
直连。而且这个组**不放进 `proxy`**，日常切节点碰不到它。

### 为什么还要二次筛选

`rename.js` 丢弃节点的理由是「地区表里没有」，而它那张表只有 180 来个国家。
冷门地区的**真节点**（🇦🇬 安提瓜和巴布达、🇸🇧 所罗门群岛…）也认不出，一样被丢，
于是跟着混进 INFO 组。

注意这不是 INFO 引入的问题——那些节点一直在被静默丢弃，只是以前看不见，
现在 INFO 组把它们暴露出来了。（对 `proxy` 没有损失：区域过滤本来也只保留
你勾选的那几个地区。）

`sing-box-col.js` 用 `ProxyUtils.getISO` 再筛一道：Sub-Store 自己的地区表有
254 个国家，认得出地区的就是真节点，踢出去。`EXP` 例外——那是彩虹旗 🏳️‍🌈
对应的 ISO 码，Sub-Store 专门用它标记名字里带「流量/时间/过期」的条目。

### 要改的订阅配置

**必须关掉 Quick Setting 里的 `useless`**。它排在 `rename.js` 前面，会先把
「剩余流量」这类节点删掉（它的判据是名字里有没有 `网址|流量|时间|应急|过期|Bandwidth|expire`），
rename 就收集不到了。

其余操作（Flag Operator、Region Filter）一个字都不用改。

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
| `rename.js` | 节点重命名 | 来自 [Keywos/rule](https://github.com/Keywos/rule)，有两处改动：`name` 不填时自动取订阅名、`out` 默认改成 `quan` |
| `sing-box-col.js` | 把节点装进模板，生成策略组 | 本仓库 |
| `node_info.js` | 把订阅流量/到期信息做成一个节点 | 来自 [xream/scripts](https://github.com/xream/scripts) 的 `sub-info/node.js` |

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
