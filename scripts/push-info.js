// 把各机场的流量 / 到期信息推送到手机（Bark）
//
// 用法：Sub-Store → 文件 → 新建 → 源选「本地」内容留空，加一个脚本操作，
// 地址填本文件，参数 #bark=<key 或完整 URL>
// 定时：给 Sub-Store 容器加环境变量，格式 cron,类型,名字，多条用 ; 分隔
//   SUB_STORE_PRODUCE_CRON="0 14 * * *,file,push-info;0 20 * * *,file,push-info"
//   cron 表达式里不能带逗号 —— 源码是按逗号切三段的，写成
//   "0 14,20 * * *,file,push-info" 会被切成五段直接废掉，只能用 ; 分成两条
//
// 数据直接调 Sub-Store 自己的查流量接口，跟面板用的是同一个：
//   GET http://127.0.0.1:<后端端口>/api/sub/flow/<订阅名>
// 所以 flowUserAgent 解析、resetDay 计算、subUserinfo 合并全都复用它的实现，
// 一行都不用抄。不依赖 rename.js，也不读任何缓存。
//
// 可选参数：
//   subs=a,b    只推这几个订阅，默认全部
//   group=      Bark 分组，默认 SubStore
//   title=      通知标题，默认「机场流量」

const { bark, group, subs, title } = $arguments;
if (!bark) throw new Error("缺少参数 bark=<key 或完整 URL>");

// 后端 API 端口，取值跟 Sub-Store 源码同一行逻辑：
//   port = process.env.SUB_STORE_BACKEND_API_PORT || 3000
// 读环境变量而不是让用户传参，是因为参数会跟配置脱节，环境变量就是配置本身。
// 3000 是不带安全路径的裸 API，只在容器内监听 —— 本脚本正好跑在容器里。
let PORT = 3000;
try {
  PORT = process.env.SUB_STORE_BACKEND_API_PORT || 3000;
} catch (e) {
  // 非 Node 环境（Sub-Store 跑在 Loon/QX 里当脚本）没有 process，退回默认值
}
const BASE = `http://127.0.0.1:${PORT}`;

// 定时产出时 $options 是 undefined，网页访问时它带着请求信息。
// 用这个区分「上次」和「上次定时」两个基准该不该更新。
const isScheduled = $options === undefined;

const MAX_TRIES = 3;
// 这些错误重试没有意义：订阅名不存在，试一百次也还是不存在。
// NO_FLOW_INFO 不在里面 —— 限流、网络抖动有可能自愈，值得再试。
const NO_RETRY = ["RESOURCE_NOT_FOUND"];
const BASELINE_TTL = 30 * 24 * 3600 * 1000;

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
  if (missing.length)
    console.log(`[push-info] subs= 里这些订阅不存在：${missing.join(", ")}`);
}

// ── 格式化 ────────────────────────────────────────────────
// 字节换算直接用 Sub-Store 自己的函数，输出跟面板逐字一致
// （100 GB 而不是 100.00 GB，单位自动进位到 TB）
const size = (b) => {
  const r = flowUtils.flowTransfer(b);
  return `${r.value} ${r.unit}`;
};
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 用本地时间，不用 toISOString —— 后者取的是 UTC 日期，东八区会差一天
// （mitch 到期 UTC 2026-10-12 16:00，本地是 2026-10-13）
const ymdhm = (d) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
// 按自然日算差，跟 Sub-Store 的 remainingDays 同一套口径（它也是比日期不比小时），
// 这样「重置 N 天后」和「到期 N 天后」在同一天时数字一致，不会一个 18 一个 19
const daysUntil = (d) => {
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
};
const ago = (ms) => {
  const h = ms / 3600000;
  return h < 48 ? `${h.toFixed(1)} 小时前` : `${(h / 24).toFixed(1)} 天前`;
};

// ── 取流量 ────────────────────────────────────────────────
async function fetchFlow(name) {
  const url = `${BASE}/api/sub/flow/${encodeURIComponent(name)}`;
  let res;
  try {
    res = await $substore.http.get({ url, timeout: 20000 });
  } catch (e) {
    // 有的实现对 4xx/5xx 直接 reject，错误对象里仍可能带响应
    res = e?.response || e;
    if (!res || res.statusCode == null) return { ok: false, code: `${e?.message ?? e}` };
  }
  let j;
  try {
    j = JSON.parse(res.body);
  } catch (e) {
    return { ok: false, code: `HTTP ${res.statusCode} 返回的不是 JSON` };
  }
  if (res.statusCode === 200 && j?.status === "success") return { ok: true, data: j.data };
  // 带上错误码：NO_FLOW_INFO 是机场那边的问题（没给 / 限流 / UA 不对），
  // RESOURCE_NOT_FOUND 是订阅名对不上，两种处理方式完全不同
  return { ok: false, code: j?.error?.code || `HTTP ${res.statusCode}` };
}

// ── 与上次的差值 ──────────────────────────────────────────
// 两个基准：last 每次跑都更新，cron 只有定时跑才更新。
// 这样白天随手点几下不会冲掉「距离上次定时消耗了多少」这个信息。
// 定时那次两个一起更新，所以紧接着的第一次手动点，两行会显示成一样的。
function delta(label, key, used) {
  const prev = scriptResourceCache.get(key);
  if (!prev || typeof prev.used !== "number") return null; // 第一次跑，没得比
  const gap = ago(Date.now() - prev.ts);
  const diff = used - prev.used;
  // 已用变少 = 套餐重置了，不是「消耗了负数」
  return diff < 0
    ? `${label} 已重置（用量归零，${gap}）`
    : `${label} 消耗 ${size(diff)}（${gap}）`;
}

// 记下这次的读数当基准。跟 render 分开 —— render 只拼字符串，
// 混在一起的话谁要是为别的目的再调一次 render，基准就被多写一次，差值直接错乱。
// 必须在 render 之后调：差值是拿新读数跟旧基准比的。
function record(name, used) {
  const now = Date.now();
  scriptResourceCache.set(`push-info:last:${name}`, { used, ts: now }, BASELINE_TTL);
  if (isScheduled)
    scriptResourceCache.set(`push-info:cron:${name}`, { used, ts: now }, BASELINE_TTL);
}

// ── 拼成一条机场的内容（纯函数，不碰缓存）────────────────
function render(name, d) {
  const used = (d.usage?.upload || 0) + (d.usage?.download || 0);
  const lines = [];

  // total 为 0 表示不限流量或机场没配，这时候百分比没有意义
  lines.push(
    d.total > 0
      ? `已用 ${size(used)} / ${size(d.total)}（${((used / d.total) * 100).toFixed(1)}%）`
      : `已用 ${size(used)}`
  );

  const a = delta("较上次", `push-info:last:${name}`, used);
  const b = delta("较上次定时", `push-info:cron:${name}`, used);
  if (a) lines.push(a);
  if (b) lines.push(b);

  // remainingDays 是「距离下次重置还有几天」，不是到期倒计时。
  // 接口已经用订阅链接上的 #resetDay 算好了，这里只负责显示。
  // 它按自然日算，所以只有日期没有时刻。
  if (Number.isFinite(d.remainingDays)) {
    const r = new Date();
    r.setDate(r.getDate() + d.remainingDays);
    lines.push(`重置 ${ymd(r)}（${d.remainingDays} 天后）`);
  }
  // expires 是秒级时间戳，时分是真实信息（pei 的到期是 16:44），不截掉
  if (d.expires > 0) {
    const e = new Date(d.expires * 1000);
    const n = daysUntil(e);
    const tail = n > 0 ? `（${n} 天后）` : n === 0 ? "（今天）" : `（已过期 ${-n} 天）`;
    lines.push(`到期 ${ymdhm(e)}${tail}`);
  }

  return { lines, used };
}

// ── 推送 ──────────────────────────────────────────────────
const endpoint = /^https?:\/\//.test(bark)
  ? bark.replace(/\/+$/, "")
  : `https://api.day.app/${bark}`;
const GROUP = group ? decodeURI(group) : "SubStore";
const TITLE = title ? decodeURI(title) : "机场流量";

// 返回 Bark 的状态码，0 表示请求根本没发出去。调用处必须接住 ——
// 不接的话 Bark 挂了你也看不出来，页面还是会写「已推送」。
// 参数不叫 title：那会遮蔽外层从 $arguments 解构出来的同名变量。
async function push(text) {
  try {
    const res = await $substore.http.post({
      url: endpoint,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ title: TITLE, body: text, group: GROUP }),
      timeout: 10000,
    });
    return res.statusCode;
  } catch (e) {
    console.log(`[push-info] 推送失败：${e.message ?? e}`);
    return 0;
  }
}

// ── 主流程 ────────────────────────────────────────────────
// 并行取数据，全部拿到之后合成一条推送。
//
// 以前是一个机场一条通知 —— 那时每家要 0.8~4 秒（得下载整个节点列表），
// 先回来的先推能省下等待。换成 flow API 之后三家总共不到 2 秒，
// 拆成三条只是让手机连响三下，没有收益。
//
// 代价是某家卡住时整条通知等它。但网页本来就要等全部跑完（$content 是
// return 时一次性给出去的），所以手动点时通知晚到不影响；定时跑更没人等。
const settled = await Promise.all(
  targets.map(async (name) => {
    const t = Date.now();
    let last;
    let tries = 0;
    while (tries < MAX_TRIES) {
      tries++;
      last = await fetchFlow(name);
      if (last.ok) {
        const { lines, used } = render(name, last.data);
        record(name, used);
        return { name, ok: true, ms: Date.now() - t, tries, lines };
      }
      console.log(`[push-info] ${name} 第 ${tries} 次拉取失败：${last.code}`);
      if (NO_RETRY.includes(last.code)) break;
    }
    return { name, ok: false, ms: Date.now() - t, tries, code: last.code };
  })
);

// 顺序按订阅列表固定。告警排最前 —— iOS 通知不展开时只显示前几行。
const blocks = [];
const failed = [];
for (const r of settled) {
  if (!r.ok) {
    const t = r.tries > 1 ? `试了 ${r.tries} 次，` : "";
    failed.push(`⚠️ ${r.name} ${r.code}（${t}${sec(r.ms)}）`);
  } else {
    const retry = r.tries > 1 ? ` 重试 ${r.tries - 1} 次` : "";
    blocks.push(`# ${r.name} # ${sec(r.ms)}${retry}\n${r.lines.join("\n")}`);
  }
}
const body = [failed.join("\n"), ...blocks].filter(Boolean).join("\n\n");

let result;
if (!body) {
  result = "没有任何可推送的信息";
  console.log(`[push-info] ${result}，跳过`);
} else {
  const code = await push(body);
  result = code === 200 ? "已推送" : `推送失败，Bark 返回 ${code || "无响应"}`;
  console.log(`[push-info] ${result}`);
}

// 产出内容 = 一行结果 + 完整信息。浏览器里点开这个地址（或加到手机主屏幕
// 当按钮）就能直接看到数据，不用切到 Bark 去确认。
$content = [
  `${result} · ${new Date().toLocaleString("zh-CN")}`,
  "",
  body,
  "",
].join("\n");
