// 把各机场的流量 / 到期信息推送到手机（Bark）
//
// 用法：Sub-Store → 文件 → 新建 → 类型「本地文件」，脚本填本文件的 raw 地址，
// 参数：#bark=<key 或完整 URL>&infotag=___INFO___
// 定时：给 Sub-Store 容器加环境变量（8 小时一次）
//   SUB_STORE_PRODUCE_CRON="0 */8 * * *,file,<这个文件的名字>"
//
// 数据来自 rename.js 写的缓存，键是 <infotag>:<订阅名>。
// 本脚本先产出一遍订阅触发 rename 重跑刷新缓存，再读。
// 不依赖 sing-box-col.js，也不要求 INFO 组存在 —— 采集只有一处（rename.js），
// 这里和 col 都只是消费方。
//
// 可选参数：
//   subs=a,b    只推这几个订阅，默认全部
//   title=      通知标题，默认「机场流量」
//   group=      Bark 分组，默认 SubStore

const { bark, infotag, title, group, subs } = $arguments;
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

const blocks = [];
const failed = [];

for (const name of targets) {
  try {
    // 触发该订阅的操作链，rename.js 跑完会把信息写进缓存。
    // noCache 必须给：订阅要是开着缓存，这里直接吃缓存、根本不发请求，
    // 那下面那条「拉取失败」告警就永远不会响，读到的数据也是旧的。
    await produceArtifact({ type: "subscription", name, noCache: true });
  } catch (e) {
    // 拉不动比流量数字重要得多：机场跑路、换域名、被墙都长这样
    failed.push(name);
    continue;
  }
  const got = scriptResourceCache.get(`${TAG}:${name}`) || [];
  // 机场名单独提一行，省掉每行都重复一遍。各机场的文案是它自己写的公告原文，
  // 格式各不相同（「剩余流量」「距离下次重置剩余」「上次更新」…），
  // 不去解析统一成表格 —— 机场改一个字就会解析错或漏掉。
  if (got.length) blocks.push(`【${name}】\n${got.join("\n")}`);
}

const alerts = failed.map((name) => `⚠️ ${name} 订阅拉取失败`);
const body = [alerts.join("\n"), ...blocks].filter(Boolean).join("\n\n");

if (!body) {
  console.log("[push-info] 没有任何可推送的信息，跳过");
} else {
  const endpoint = /^https?:\/\//.test(bark)
    ? bark.replace(/\/+$/, "")
    : `https://api.day.app/${bark}`;
  const res = await $substore.http.post({
    url: endpoint,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      title: title ? decodeURI(title) : "机场流量",
      subtitle: [
        `${blocks.length} 个机场`,
        failed.length ? `${failed.length} 个失败` : "",
        new Date().toTimeString().slice(0, 5), // 跟随容器时区
      ]
        .filter(Boolean)
        .join(" · "),
      body,
      group: group ? decodeURI(group) : "SubStore",
    }),
    timeout: 10000,
  });
  console.log(
    `[push-info] 已推送 ${failed.length} 条告警 + ${blocks.length} 个机场，Bark 返回 ${res.statusCode}`
  );
}

$content = "";
