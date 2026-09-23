// 把各机场的流量 / 到期信息推送到手机（Bark）
//
// 用法：Sub-Store → 文件 → 新建 → 类型「本地文件」，脚本填本文件的 raw 地址，
// 参数：#bark=<key 或完整 URL>&infotag=___INFO___
// 定时：给 Sub-Store 容器加环境变量，格式 cron,类型,名字，多条用 ; 分隔
//   SUB_STORE_PRODUCE_CRON="0 14 * * *,file,push-info;0 20 * * *,file,push-info"
//   cron 表达式里不能带逗号 —— 源码是按逗号切三段的，写成
//   "0 14,20 * * *,file,push-info" 会被切成五段直接废掉，只能用 ; 分成两条
//
// 数据来自 rename.js 写的缓存，键是 <infotag>:<订阅名>。
// 本脚本先产出一遍订阅触发 rename 重跑刷新缓存，再读。
// 不依赖 sing-box-col.js，也不要求 INFO 组存在 —— 采集只有一处（rename.js），
// 这里和 col 都只是消费方。
//
// 可选参数：
//   subs=a,b    只推这几个订阅，默认全部
//   group=      Bark 分组，默认 SubStore（一条机场一条通知，靠它折叠在一起）

const { bark, infotag, group, subs } = $arguments;
if (!bark) throw new Error("缺少参数 bark=<key 或完整 URL>");
if (!infotag) throw new Error("缺少参数 infotag=<要和 rename.js 里填的一致>");

const TAG = decodeURI(infotag);
const known = ($substore.read("subs") || []).map((s) => s.name);
const want = subs
  ? decodeURI(subs)
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  : null;
const targets = want ? want.filter((n) => known.includes(n)) : known;
if (want) {
  const missing = want.filter((n) => !known.includes(n));
  if (missing.length) console.log(`[push-info] subs= 里这些订阅不存在：${missing.join(", ")}`);
}

const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;

const endpoint = /^https?:\/\//.test(bark)
  ? bark.replace(/\/+$/, "")
  : `https://api.day.app/${bark}`;
const GROUP = group ? decodeURI(group) : "SubStore";

// 一条机场信息发一条 Bark。Bark 的 group 参数会把它们收在同一个分组里，
// 通知中心是折叠的。机场名当标题，扫一眼就知道是谁。
// 返回 Bark 的状态码，0 表示请求根本没发出去。调用处必须接住 ——
// 不接的话 Bark 挂了你也看不出来，页面还是会写「已推送 N 个机场」。
async function push(title, text) {
  try {
    const res = await $substore.http.post({
      url: endpoint,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ title, body: text, group: GROUP }),
      timeout: 10000,
    });
    if (res.statusCode !== 200) {
      console.log(`[push-info] 推送 ${title} 失败：Bark 返回 ${res.statusCode}`);
    }
    return res.statusCode;
  } catch (e) {
    console.log(`[push-info] 推送 ${title} 失败：${e.message ?? e}`);
    return 0;
  }
}

// 并行拉，而且**谁先回来谁先推**，不等最慢的那一家。
// 代价是通知条数等于机场数、到达顺序不固定 —— 换来的是第一条几乎立刻就到。
// 注意网页（和快捷指令）仍然要等全部跑完：HTTP 响应没法流式返回，
// $content 是脚本 return 时一次性给出去的。
const t0 = Date.now();
const settled = await Promise.all(
  targets.map(async (name) => {
    const t = Date.now();
    try {
      // 触发该订阅的操作链，rename.js 跑完会把信息写进缓存。
      // noCache 必须给：订阅要是开着缓存，这里直接吃缓存、根本不发请求，
      // 那「拉取失败」告警就永远不会响，读到的数据也是旧的。
      await produceArtifact({ type: "subscription", name, noCache: true });
    } catch (e) {
      // 拉不动比流量数字重要得多：机场跑路、换域名、被墙都长这样。
      // 耗时一起带上：20 秒那种是超时（Sub-Store 单条订阅超时就是 20 秒），
      // 零点几秒那种是连不上或被拒，两者的排查方向完全不同。
      const ms = Date.now() - t;
      const sent = await push(`⚠️ ${name} · ${sec(ms)}`, "订阅拉取失败");
      return { name, ok: false, ms, sent };
    }
    const ms = Date.now() - t;
    // 各机场的文案是它自己写的公告原文，格式各不相同（「剩余流量」
    // 「距离下次重置剩余」「上次更新」…），不去解析统一成表格 ——
    // 机场改一个字就会解析错或漏掉。
    const lines = scriptResourceCache.get(`${TAG}:${name}`) || [];
    const sent = lines.length
      ? await push(`${name} · ${sec(ms)}`, lines.join("\n"))
      : undefined;
    return { name, ok: true, ms, lines, sent };
  })
);
const totalMs = Date.now() - t0;

// 网页上仍然给一份完整的，顺序按订阅列表固定，跟通知的到达顺序无关
const blocks = [];
const failed = [];
for (const r of settled) {
  if (!r.ok) {
    failed.push(`⚠️ ${r.name} 订阅拉取失败（${sec(r.ms)}）`);
  } else if (r.lines.length) {
    blocks.push(`【${r.name}】 ${sec(r.ms)}\n${r.lines.join("\n")}`);
  }
}
const body = [failed.join("\n"), ...blocks].filter(Boolean).join("\n\n");

// sent 为 undefined = 这条压根没推（该机场没信息），不算失败
const bad = settled.filter((r) => r.sent !== undefined && r.sent !== 200);

const attempted = settled.filter((r) => r.sent !== undefined).length;

let result;
if (!body) {
  result = "没有任何可推送的信息";
} else if (!bad.length) {
  result =
    `已推送 ${blocks.length} 个机场` +
    (failed.length ? ` + ${failed.length} 条告警` : "");
} else {
  const codes = [...new Set(bad.map((r) => r.sent || "无响应"))].join(" / ");
  result = `${attempted - bad.length}/${attempted} 条推送成功（失败的 Bark 返回 ${codes}）`;
}
console.log(`[push-info] ${result}，共 ${sec(totalMs)}`);

// 产出内容 = 一行结果 + 完整信息。浏览器里点开这个地址（或加到手机主屏幕
// 当按钮）就能直接看到数据，不用切到 Bark 去确认。
$content = [
  `${result} · 共 ${sec(totalMs)} · ${new Date().toLocaleString("zh-CN")}`,
  "",
  body,
  "",
].join("\n");
