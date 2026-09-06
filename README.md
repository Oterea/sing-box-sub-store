# sing-box-sub-store

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

| 参数 | 值 | 说明 |
|---|---|---|
| `name` | `naixi` | 加在节点名里的**机场前缀**，改成你自己认得出的名字 |
| `out` | `quan` | 输出英文全称（`Hong Kong` 而不是 `香港` 或 `HK`） |

产物：`naixi Hong Kong 01`、`naixi United States 02`

其余参数见脚本开头的注释。**但不要加 `one` / `blgd` / `bl` / `blkey` / `sn=`** —— 它们会改变节点名的结构，而下一步的分组依赖这个结构。

### ② 旗帜操作

Sub-Store 自带的节点操作，不是脚本。它会从节点名里认出国家，在最前面加上国旗：

```
naixi Hong Kong 01  →  🇭🇰 naixi Hong Kong 01
```

> ⚠️ **顺序不能反。** `rename.js` 匹配成功后是把名字**整个重造**的，原有国旗不会保留。旗帜操作排在它前面的话，加的国旗会被 rename 抹掉。
>
> 也可以不用旗帜操作，改成给 `rename.js` 传 `flag` 参数，效果一样。二选一即可。

### 为什么必须有国旗

下一步的 `sing-box-col.js` 靠**数第几个词**来拆解节点名：

```
🇭🇰   naixi   Hong  Kong   01
 ↑      ↑     └──┬──┘      ↑
国旗   机场名    国家名     编号
      第 2 个词         最后一段
```

它取**第 2 个词**当机场名。没有国旗的话第 2 个词就是国家名，策略组会变成 `Hong AUTO`、`United AUTO` 这种。

## 第二步：配置文件

在 Sub-Store 的【文件】里新建一个，内容用 `templates/` 里对应的模板，然后挂上脚本 `sing-box-col.js`。

参数：

| 参数 | 值 | 说明 |
|---|---|---|
| `name` | `naixi` | **Sub-Store 里那个订阅的名字**，用来找订阅 |
| `type` | `col` | 只有组合订阅才需要填。单订阅不填 |

> ⚠️ 两个脚本都有 `name=`，但**含义完全不同**：
> - `rename.js` 的 `name=` → 写进节点名里的前缀
> - `sing-box-col.js` 的 `name=` → 拿来找订阅的名字
>
> 建议填成同一个值：这样面板里的策略组（`naixi AUTO`）和订阅名对得上，好认。功能上它们互相独立。

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

## 组合订阅

多个机场合成一个订阅时，`sing-box-col.js` 加 `type=col`。

**每个子订阅的 `rename.js` 必须用不同的 `name=` 前缀。** 都填 `naixi` 的话，两个机场会被当成同一个机场合并，而且节点名会撞车 —— sing-box 对重复的 outbound tag 不报错，后面的会静默覆盖前面的，等于悄悄少了节点。

## scripts

| 脚本 | 作用 | 来源 |
|---|---|---|
| `rename.js` | 节点重命名 | 来自 [Keywos/rule](https://github.com/Keywos/rule)，未修改 |
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
