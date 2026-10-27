import fs from "node:fs";
import { extractImageCandidates } from "./crawler/core.mjs";
// One-time editorial import, using the official pages manually checked on this date.
const path = "src/data/catalog.json",
  c = JSON.parse(fs.readFileSync(path));
const stores = JSON.parse(fs.readFileSync("src/data/stores.json"));
const checked = "2026-10-28T09:00:00+09:00";
for (const [id, name] of [
  ["poppin-party", "Poppin'Party"],
  ["afterglow", "Afterglow"],
  ["pastel-palettes", "Pastel＊Palettes"],
  ["roselia", "Roselia"],
  ["hello-happy-world", "ハロー、ハッピーワールド！"],
  ["morfonica", "Morfonica"],
  ["raise-a-suilen", "RAISE A SUILEN"],
  ["yumemita", "夢限大みゅーたいぷ"],
  ["millsage", "millsage"],
  ["ikka-dumb-rock", "一家Dumb Rock!"],
])
  if (!c.franchises.some((f) => f.id === id))
    c.franchises.push({ id, name, parent_id: "bang-dream" });
const notes = [
  "bang-dream",
  "our-notes",
  "mygo",
  "ave-mujica",
  "yumemita",
  "millsage",
  "ikka-dumb-rock",
];
c.events.find((e) => e.id === "ournotes-sweets-2026").franchise_ids = notes;
const round = (id, url, extra = {}) => ({
  id,
  label: "参加方式请核对官方公告",
  method: "尚未公布",
  kind: "unknown",
  opens_at: null,
  closes_at: null,
  days_before: null,
  open_time: null,
  cutoff_days_before: null,
  cutoff_time: null,
  url,
  note: "公告未明确完整入场预约规则；不能据此保证无需预约或有库存。",
  ...extra,
});
const venue = (id, city, name, start_date, end_date, address = null) => ({
  id,
  city,
  name,
  start_date,
  end_date,
  address,
  rounds: [],
});
function add({
  id,
  title,
  zh,
  category,
  url,
  summary,
  venues,
  ips,
  file,
  fees = null,
  conditions = [],
  registration = {},
}) {
  if (c.events.some((e) => e.id === id)) return;
  const images = file
    ? extractImageCandidates(
        fs.readFileSync(`var/crawler/manual-${file}.html`, "utf8"),
        url,
      )
    : [];
  const img =
    file === "display"
      ? null
      : images.find((i) => !/bnr_|logo|icon|banner_sns/i.test(i.url));
  c.events.push({
    id,
    slug: id,
    title_ja: title,
    title_zh: zh,
    category,
    summary,
    fees,
    conditions: ["商品、赠品与名额可能用尽，请查官方最新公告。", ...conditions],
    status: "published",
    verified_at: checked,
    updated_at: checked,
    franchise_ids: ips,
    venues: venues.map((v) => ({
      ...v,
      rounds: [round(`${v.id}-entry`, url, registration)],
    })),
    image: img
      ? {
          url: img.url,
          alt: title + " · 官方活动图",
          source_url: url,
          checked_on: "2026-10-28",
        }
      : null,
    sources: [
      { id: `${id}-source`, label: "举办方官方公告", url, checked_at: checked },
    ],
  });
}
add({
  id: "ave-ournotes-animate-display-2026",
  title: "映画ムジカ、アワーノーツ アニメイト池袋本店北館 特別展示",
  zh: "电影 Ave Mujica / Our Notes 池袋 Animate 特别展示",
  category: "主题展览",
  url: "https://bang-dream.com/news/2441/",
  file: "display",
  summary:
    "池袋本店北馆1F入口广场展开影像播放、Ave Mujica角色立牌和墙面装饰。官网本条没有可确认的独立活动图，保留文字卡片。",
  ips: notes,
  venues: [
    venue(
      "display-ikebukuro",
      "东京",
      "アニメイト池袋本店北館1Fエントランス広場",
      "2026-10-23",
      "2026-11-05",
    ),
  ],
});
add({
  id: "ave-virtus-store-2026",
  title:
    "Ave Mujica 7th LIVE「Virtus」開催記念 BanG Dream! STORE 連動キャンペーン",
  zh: "Ave Mujica「Virtus」池袋 STORE 联动与周边先行销售",
  category: "其他联动",
  url: "https://bushiroad-creative.com/topics/106228/",
  file: "virtus-store",
  summary:
    "10月20日起先行销售部分Live周边。购买收据有效期为10月20日～11月1日，纪念贴纸兑换期为10月24日～11月1日；图内会场展位名称曾更正，请以公告文字为准。",
  ips: ["bang-dream", "ave-mujica"],
  venues: [
    venue(
      "virtus-store-ikebukuro",
      "东京",
      "BanG Dream! STORE（池袋PARCO本館6F）",
      "2026-10-20",
      "2026-11-01",
      "東京都豊島区南池袋1-28-2 池袋PARCO本館6階",
    ),
  ],
  conditions: [
    "本条仅收录池袋实体店；演唱会会场展位不视作全期间营业门店。",
    "购买限制为每次结账各种最多3件；可能临时变更。",
  ],
});
add({
  id: "mygo-9th-kobe-2026",
  title: "MyGO!!!!! 9th LIVE「つなぎ目の向こうに」- 神戸再景編 -",
  zh: "MyGO!!!!! 第9次 Live「つなぎ目の向こうに」神户再景篇",
  category: "音乐和声优活动",
  url: "https://bang-dream.com/events/mygo_9th_hyogo/",
  file: "mygo-kobe",
  summary:
    "神户两日公演：DAY1预计18:00开演，DAY2预计17:00开演。一般销售从10月17日日本时间12:00开始，按先到先得、售完即止。",
  ips: ["bang-dream", "mygo"],
  venues: [
    venue(
      "mygo-kobe-day1",
      "神户",
      "ワールド記念ホール DAY1",
      "2026-11-14",
      "2026-11-14",
    ),
    venue(
      "mygo-kobe-day2",
      "神户",
      "ワールド記念ホール DAY2",
      "2026-11-15",
      "2026-11-15",
    ),
  ],
  fees: "一般指定席8,800日元；附周边一般指定席13,200日元，A席17,600日元，S席25,300日元（含税）。",
  registration: {
    label: "一般销售（先着）",
    method: "先着预约",
    kind: "fixed",
    opens_at: "2026-10-17T12:00:00+09:00",
    note: "没有核实固定销售截止。官方写明先到先得、售完即止；当前余票未知。",
  },
  conditions: ["需要正式公演门票，购买CD并不直接获得本场门票。"],
});
add({
  id: "millsage-ikka-special-2027",
  title: "millsage×一家Dumb Rock! SPECIAL LIVE",
  zh: "millsage × 一家Dumb Rock! 联合特别 Live",
  category: "音乐和声优活动",
  url: "https://bang-dream.com/events/millsage_ikka-dumb-rock/",
  file: "special-live",
  summary:
    "2027年1月11日于Kanadevia Hall举办，预计17:00开场、18:00开演。当前公告为票务平台先行，不是CD附券抽选。",
  ips: ["bang-dream", "millsage", "ikka-dumb-rock"],
  venues: [
    venue(
      "millsage-ikka-tokyo",
      "东京",
      "Kanadevia Hall",
      "2027-01-11",
      "2027-01-11",
    ),
  ],
  fees: "站立区附周边16,500日元；看台指定席附周边12,100日元；看台指定席8,800日元，另收饮料费。",
  registration: {
    label: "票务平台先行",
    method: "抽选报名",
    kind: "fixed",
    opens_at: "2026-10-09T19:00:00+09:00",
    closes_at: "2026-11-16T23:59:00+09:00",
    url: "https://eplus.jp/millsage_ikka-dumb-rock/",
    note: "每人最多申请2张。完整票种及报名条件请查官方票务入口。",
  },
  conditions: ["除门票附赠的特制手环灯外，禁止携带使用其他发光应援物。"],
});
const fairVenues = (prefix, start, end, selected) =>
  selected.map((s) =>
    venue(`${prefix}-${s.id}`, s.city, s.name, start, end, s.address),
  );
add({
  id: "nijigasaki-police-fair-2026",
  title:
    "ラブライブ！虹ヶ咲学園スクールアイドル同好会 ニジガク☆ポリスフェア in ゲーマーズ",
  zh: "虹咲学园 ニジガク☆ポリス Gamers 主题商品活动",
  category: "其他联动",
  url: "https://bushiroad-creative.com/topics/104688/",
  file: "niji-police",
  summary:
    "警察主题新绘商品和购买特典活动。官网宣布Gamers全店与通販参加；这里先列出已核实地址的3家分店，更多分店请查官方目录。",
  ips: ["lovelive", "nijigasaki"],
  venues: fairVenues(
    "niji-police",
    "2026-10-31",
    "2026-11-20",
    stores.filter((s) => s.retailer_id === "gamers"),
  ),
  conditions: [
    "官网事前预约期与线下活动期不同；本条使用10月31日起的门店活动日期。",
  ],
});
const animateIds = [
  "animate-akihabara",
  "animate-yokohama",
  "animate-nagoya",
  "animate-umeda",
  "animate-osaka-nipponbashi",
];
add({
  id: "starlight-9th-fair-2026",
  title:
    "少女☆歌劇 レヴュースタァライト 9周年記念フェア ～L’Étoile innocente～",
  zh: "少女☆歌剧9周年纪念主题商品活动",
  category: "其他联动",
  url: "https://bushiroad-creative.com/topics/104208/",
  file: "starlight9",
  summary:
    "Animate指定店和Gamers举办9周年商品活动；这里收录已核实地址的8家参与分店。秋叶原另有纪念展示，详细展区楼层请核对官网。",
  ips: ["starlight"],
  venues: fairVenues(
    "starlight9",
    "2026-11-06",
    "2026-11-23",
    stores.filter(
      (s) => s.retailer_id === "gamers" || animateIds.includes(s.id),
    ),
  ),
  conditions: [
    "相关商品单次结账每满2,200日元获赠随机特典1张，赠完即止。",
    "各品牌特典不同，通販和海外配布条件可能不同。",
  ],
});
// Band participation has an explicit source; do not infer every band attends every project event.
const cafe = c.events.find((e) => e.id === "ournotes-sweets-2026");
if (!cafe.sources.some((s) => s.url === "https://bang-dream.com/news/2427/"))
  cafe.sources.push({
    id: "ournotes-band-announcement",
    label: "BanG Dream!官方联动公告与参与乐队",
    url: "https://bang-dream.com/news/2427/",
    checked_at: checked,
  });
c.franchises = c.franchises
  .filter((f) => !f.parent_id)
  .flatMap((f) => [
    f,
    ...c.franchises.filter((child) => child.parent_id === f.id),
  ]);
fs.writeFileSync(path, JSON.stringify(c, null, 2) + "\n");
const rp = "src/data/releases.json",
  ps = JSON.parse(fs.readFileSync(rp));
for (const p of ps) {
  if (p.id.startsWith("ras-"))
    p.franchise_ids = ["bang-dream", "raise-a-suilen"];
  if (p.id.startsWith("yumemita-"))
    p.franchise_ids = ["bang-dream", "yumemita"];
  if (p.id.startsWith("roselia-")) p.franchise_ids = ["bang-dream", "roselia"];
}
fs.writeFileSync(rp, JSON.stringify(ps, null, 2) + "\n");
