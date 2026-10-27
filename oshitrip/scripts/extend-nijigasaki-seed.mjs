// Editorial snapshot, 2026-10-28. Extraction creates evidence only; these facts
// were checked against the listed official articles before publication.
// Requires local HTML snapshots under var/crawler/nijigasaki/.
import fs from "node:fs";
import { extractObservation, extractImageCandidates } from "./crawler/core.mjs";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const catalog = read("src/data/catalog.json");
const stores = read("src/data/stores.json");
const stamp = "2026-10-28T12:00:00+09:00",
  day = stamp.slice(0, 10);
const url = (id) =>
  `https://www.lovelive-anime.jp/nijigasaki/detail.php?p=${id}`;
const evidence = (name, id) =>
  extractObservation(
    fs.readFileSync(`var/crawler/nijigasaki/${name}.html`, "utf8"),
    url(id),
    "event-source",
  );
const source = (id, u, label = "虹咲官网公告") => ({
  id,
  url: u,
  label,
  checked_at: stamp,
});
const image = (o, n, alt) => ({
  url: o.images[n].url,
  alt,
  source_url: o.source_url,
  checked_on: day,
});
const rule = (id, u, note, patch = {}) => ({
  id,
  label: "入场与预约说明",
  method: "尚未公布",
  kind: "unknown",
  opens_at: null,
  closes_at: null,
  days_before: null,
  open_time: null,
  cutoff_days_before: null,
  cutoff_time: null,
  url: u,
  note,
  ...patch,
});
const venue = (id, city, name, start, end, u, address = null, patch = {}) => ({
  id,
  city,
  name,
  start_date: start,
  end_date: end,
  address,
  official_url: u,
  rounds: [
    rule(id + "-rule", u, "入场安排、营业时间与售罄情况请查看官方公告。"),
  ],
  ...patch,
});
const event = (id, title, category, o, venues, summary, conditions = []) => ({
  id,
  slug: id,
  title_ja: o.title,
  title_zh: title,
  category,
  summary,
  image: image(o, 0, title + " · 官方公告图"),
  fees: null,
  conditions,
  status: "published",
  verified_at: stamp,
  updated_at: stamp,
  franchise_ids: ["lovelive", "nijigasaki"],
  venues,
  sources: [source(id + "-source", o.source_url)],
  benefits: [],
  gallery: [],
});
const benefit = (e, id, title, rule, patch = {}) => ({
  id,
  title,
  rule,
  threshold_yen: null,
  threshold_quantity: null,
  channel: "门店",
  scope: "活动会场内的指定商品",
  venue_ids: [],
  starts_on: null,
  ends_on: null,
  selection: "未说明",
  receipt_combination: "未说明",
  while_supplies_last: null,
  image: null,
  source_url: e.sources[0].url,
  checked_on: day,
  ...patch,
});
const upsert = (e) => {
  const i = catalog.events.findIndex((x) => x.id === e.id);
  if (i < 0) catalog.events.push(e);
  else catalog.events[i] = e;
};

const loftO = evidence("loft-official", "01_6703"),
  loftUrl = "https://www.cocollabo.net/pages/nijigasaki";
const loft = event(
  "nijigasaki-loft-2026",
  "虹咲学园 × Loft 幼稚园老师主题快闪",
  "快闪店",
  loftO,
  [
    venue(
      "niji-loft-kichijoji",
      "东京",
      "吉祥寺ロフト 2F バラエティ雑貨売場",
      "2026-11-18",
      "2026-12-08",
      "https://www.loft.co.jp/shop_list/detail.php?shop_id=219",
    ),
    venue(
      "niji-loft-namba-dec",
      "大阪",
      "なんばロフト 5F（年前场）",
      "2026-12-23",
      "2026-12-30",
      "https://www.loft.co.jp/shop_list/detail.php?shop_id=47",
      "なんばパークス5階 なんばロフト",
    ),
    venue(
      "niji-loft-namba-jan",
      "大阪",
      "なんばロフト 5F（年后场）",
      "2027-01-02",
      "2027-01-05",
      "https://www.loft.co.jp/shop_list/detail.php?shop_id=47",
      "なんばパークス5階 なんばロフト",
    ),
  ],
  "东京、大阪两店先行销售幼稚园老师主题新绘商品，附会场限定满赠。大阪场按休店日前后分段，避免旅行匹配到休店日。",
  [
    "大阪 12/31、1/1 休业。",
    "吉祥寺 10:30–20:00；难波 11:00–21:00，各场最后一天 17:00 结束。",
    "拥挤时可能限流或发整理券。普通商品每款每次结账限 3 件；随机商品限 3 盒或同等散件数量。",
    "通販不附本次会场满赠。实时商品和赠品库存未知。",
  ],
);
loft.sources.push(
  source("niji-loft-organizer", loftUrl, "举办方：门店时间、休店日与满赠细则"),
);
loft.benefits = [
  benefit(
    loft,
    "niji-loft-sticker",
    "每满 ¥3,000：随机迷你贴纸（13 款）",
    "同次结账每满 3,000 日元含税送 1 张；不可合并小票，不能选款，通販不附赠。",
    {
      threshold_yen: 3000,
      starts_on: "2026-11-18",
      ends_on: "2027-01-05",
      scope: "仅各 Loft 会场营业期间的活动商品",
      selection: "随机",
      receipt_combination: "不可合并",
      while_supplies_last: true,
      source_url: loftUrl,
      image: {
        url: "https://www.cocollabo.net/cdn/shop/files/LLniji_26_1_nobelty.jpg?v=14687192447261585651",
        alt: "Loft 会场限定迷你贴纸（13 款）",
        source_url: loftUrl,
        checked_on: day,
      },
    },
  ),
];
loft.gallery = [image(loftO, 1, "Loft 先行销售商品一览")];
upsert(loft);

const kitchenO = evidence("kitchen", "01_6690");
const kitchen = event(
  "nijigasaki-kitchen-7th-2026",
  "虹咲学园餐车 7 周年纪念饮品",
  "联动咖啡厅",
  kitchenO,
  [
    venue(
      "niji-kitchen-7th",
      "东京",
      "虹ヶ咲学園キッチンカー（停靠位置请查当日公告）",
      "2026-10-30",
      "2026-11-23",
      "https://twitter.com/all_odaiba",
    ),
  ],
  "周年饮品与通常饮品联动赠送餐车纸模型立牌。餐车当天营业位置和时间需查看运营方公告。",
  [
    "当前公告未列出完整街道地址；不要把常设咖啡厅地址当作餐车位置。",
    "赠品剩余数量未公开；是否仍可领取请现场确认。",
  ],
);
kitchen.benefits = [
  benefit(
    kitchen,
    "niji-kitchen-paper",
    "同次买 3 杯：餐车纸模型立牌",
    "同次购买 3 杯，必须至少含 1 杯 7 周年纪念饮品。其余可为通常饮品；不能按单纯消费金额计算。",
    {
      threshold_quantity: 3,
      scope: "虹咲餐车：周年纪念饮品与通常饮品",
      starts_on: "2026-10-30",
      ends_on: "2026-11-23",
      receipt_combination: "不可合并",
      image: image(kitchenO, 0, "餐车 7 周年饮品与纸模型立牌公告"),
    },
  ),
];
upsert(kitchen);

const hepO = evidence("hep-cafe", "01_6692");
const hep = event(
  "lovelive-hep-navio-2026",
  "LoveLive! 系列 × THEキャラCAFE HEP NAVIO",
  "联动咖啡厅",
  hepO,
  [
    venue(
      "niji-hep-reserved",
      "大阪",
      "THEキャラCAFE HEPナビオ 7F（预约场）",
      "2026-11-05",
      "2026-11-08",
      "https://x.com/thechara_c_OSA",
      "大阪 HEPナビオ7F",
      {
        rounds: [
          rule(
            "niji-hep-firstcome",
            hepO.source_url,
            "官网 10/20 更正：10/27 20:00 JST 开放，至各到店日前一天 23:59。仅适用 11/5–11/8。",
            {
              method: "先着预约",
              kind: "fixed",
              opens_at: "2026-10-27T20:00:00+09:00",
              cutoff_days_before: 1,
              cutoff_time: "23:59",
            },
          ),
        ],
      },
    ),
    venue(
      "niji-hep-later",
      "大阪",
      "THEキャラCAFE HEPナビオ 7F（后续场）",
      "2026-11-09",
      "2026-11-29",
      "https://x.com/thechara_c_OSA",
      "大阪 HEPナビオ7F",
      {
        rounds: [
          rule(
            "niji-hep-later-rule",
            hepO.source_url,
            "11/9 起未公告同一预约规则；拥挤时可能发整理券并限流。",
            { method: "当日整理券" },
          ),
        ],
      },
    ),
  ],
  "LoveLive! 系列联动餐饮与新商品预告。已核实举办日期与首四天预约；商品明细、价格及特典条件尚待后续公告。",
  [
    "这是系列共同联动；不能将未公布菜单都标作虹咲专属。",
    "采用官网更正后的 10/27 20:00 开放时间，旧版 10/19 时间无效。",
    "本公告未公布满赠门槛，不推定有消费特典。",
  ],
);
upsert(hep);

const sweetO = evidence("sweet", "01_6700");
const sweetStores = stores.filter((s) => s.id !== "animate-sannomiya");
const sweet = event(
  "nijigasaki-sweet-collection-2027",
  "虹咲完结篇 Sweet Collection 新绘商品与特典",
  "其他联动",
  sweetO,
  sweetStores.map((s) =>
    venue(
      "niji-sweet-" + s.id,
      s.city,
      s.name,
      "2027-01-30",
      "2027-02-28",
      s.official_url,
      s.address,
    ),
  ),
  "配合电影最终章的 Sweet Collection 主题商品活动。这里列出已有地址资料的部分参加门店，完整店铺名单及通販请查官方公告。",
  [
    "参加商品购买或预约可获 13 款生写真特典；金额、随机方式和适用预约付款条件须按各店规则确认。",
    "已公告商品：立牌、文件夹、桌垫、方形徽章、极光艺术卡和糖果造型钥匙扣。单品精确发售日与价格尚未逐一核实。",
    "仅列官网明确参加范围内的已知分店，非全国完整目录；不含 Animate 三宫。",
    "活动期间并不代表现在已开放所有商品预约，也不代表现场有货。",
  ],
);
sweet.benefits = [
  benefit(
    sweet,
    "niji-sweet-bromide",
    "购买 / 预约特典：生写真（13 款）",
    "指定商品购买或预约可获生写真；此公告未列各店金额门槛、选款及合票规则，需到对应店铺详情核实。",
    {
      channel: "门店及通販",
      scope:
        "公告所列 Animate 门店及通販、Gamers 门店及通販、Movic 通販；各渠道条件单独确认",
      starts_on: "2027-01-30",
      ends_on: "2027-02-28",
      image: image(sweetO, 0, "Sweet Collection 商品与特典公告"),
    },
  ),
];
sweet.sources.push(
  source(
    "niji-sweet-animate",
    "https://www.animate-onlineshop.jp/contents/fair_event/detail.php?id=116568",
    "Animate 活动详情（访问受限，细则待核实）",
  ),
  source(
    "niji-sweet-gamers",
    "https://www.gamers.co.jp/contents/event_fair/detail.php?id=8027",
    "Gamers 活动详情（访问受限，细则待核实）",
  ),
);
sweet.sources.slice(-2).forEach((s) => (s.checked_at = null));
upsert(sweet);

const volksUrl = "https://www.team-e.co.jp/popup/lovelive/";
const volksImages = extractImageCandidates(
  fs.readFileSync("var/crawler/nijigasaki/volks.html", "utf8"),
  volksUrl,
);
const volksO = {
  source_url: volksUrl,
  title:
    "ラブライブ！虹ヶ咲学園スクールアイドル同好会 POP UP STORE in ボークス",
  images: volksImages,
};
const volks = event(
  "nijigasaki-volks-2026",
  "虹咲学园「花之女神」Volks 快闪（已结束）",
  "快闪店",
  volksO,
  [
    venue(
      "niji-volks-tokyo",
      "东京",
      "ボークス秋葉原ホビー天国2 6F",
      "2026-09-18",
      "2026-10-04",
      volksUrl,
      "東京都千代田区外神田4丁目2-10",
    ),
    venue(
      "niji-volks-osaka",
      "大阪",
      "ボークス大阪ショールーム 6F",
      "2026-10-10",
      "2026-10-25",
      volksUrl,
      "大阪府大阪市浪速区日本橋4-9-18",
    ),
  ],
  "花之女神主题新绘商品快闪，两个会场均已结束，仅供历史查询。",
  [
    "活动已结束，不作为近期可参加活动展示。",
    "拥挤时可能限制入场或商品购买数量。",
  ],
);
volks.benefits = [
  benefit(
    volks,
    "niji-volks-postcard",
    "每满 ¥3,000：随机明信片（13 款）",
    "会场内指定商品每满 3,000 日元含税送 1 张，随机发放、不可选款、不可合并小票；赠完即止。",
    {
      threshold_yen: 3000,
      starts_on: "2026-09-18",
      ends_on: "2026-10-25",
      selection: "随机",
      receipt_combination: "不可合并",
      while_supplies_last: true,
      image: image(volksO, 2, "花之女神满赠明信片"),
    },
  ),
];
volks.gallery = [image(volksO, 1, "花之女神商品与含税价格一览")];
upsert(volks);

const gigoO = evidence("gigo-card", "01_6557"),
  gigoUrl = "https://campaign.gendagigo.jp/2607/lovelive-cardgame-cafe/";
const gigo = event(
  "lovelive-gigo-card-phase6-2026",
  "LoveLive! 卡牌 × GiGO 第 6 弹（含步梦）",
  "联动咖啡厅",
  gigoO,
  [
    venue(
      "niji-gigo-aki3",
      "东京",
      "GiGOコラボカフェ 秋葉原3号館",
      "2026-10-24",
      "2026-11-08",
      gigoUrl,
      null,
      {
        rounds: [
          rule(
            "niji-gigo-aki3-book",
            gigoUrl,
            "咖啡厅须事前预约；具体报名方式、开放与截止时间请到专页确认。",
          ),
        ],
      },
    ),
    ...[
      ["aki2", "东京", "秋葉原2号館"],
      ["sendai", "仙台", "仙台"],
      ["sasashima", "名古屋", "マーケットスクエアささしま"],
      ["kyoto", "京都", "河原町オーパ"],
      ["osaka", "大阪", "大阪道頓堀"],
    ].map(([id, city, name]) =>
      venue(
        "niji-gigo-" + id,
        city,
        "GiGOコラボカフェスタンド " + name,
        "2026-10-24",
        "2026-11-08",
        gigoUrl,
        null,
        {
          rounds: [
            rule(
              "niji-gigo-" + id + "-entry",
              gigoUrl,
              "Stand 不需预约，拥挤时可能发整理券。",
              { method: "无需预约", kind: "none" },
            ),
          ],
        },
      ),
    ),
  ],
  "当前第 6 弹为五个系列的卡包插画联动，包含上原步梦。虹咲专属第 2 弹已结束；不要把旧阶段商品或特典当成本期内容。",
  [
    "Stand 仅提供饮品与部分物贩，无餐食、甜点，也无物贩消费赠品；秋叶原2号馆不售商品。",
    "冈山 Stand 已于 9/30 结束，未列入本期门店。这里是部分店铺目录。",
    "本期物贩满赠是 Liella! 图案，不是虹咲图案；到店前请确认接受的特典。",
    "所有商品及赠品余量未知，不能用活动未结束推断有货。",
  ],
);
gigo.image = image(gigoO, 3, "第 6 弹卡包插画饮品公告（含步梦）");
gigo.fees = "联动饮品每杯 700 日元含税；餐食价格与可点项目以会场菜单为准。";
gigo.benefits = [
  benefit(
    gigo,
    "niji-gigo-coaster",
    "点单特典：随机杯垫（第 6 弹 5 款）",
    "每份餐食 / 甜点盘赠 2 张，每杯饮品 / 每份芭菲赠 1 张。Stand 仅适用其实际提供的饮品，不能在那里领取餐食双份特典。",
    {
      scope: "秋叶原3号馆咖啡厅及本期各 Stand 的实际提供菜单",
      starts_on: "2026-10-24",
      ends_on: "2026-11-08",
      selection: "随机",
      while_supplies_last: true,
    },
  ),
];
// Article has adjacent coaster graphics spanning several phases. Keep an
gigo.benefits.push(
  benefit(
    gigo,
    "gigo-phase6-shop-bonus",
    "咖啡厅物贩每满 ¥2,000：Liella! 透明生写真",
    "仅秋叶原3号馆咖啡厅物贩结账每满 2,000 日元含税赠 1 张；第 6 弹采用 Liella! 图案，不是虹咲图案。所有 Stand 均无此物贩满赠。",
    {
      threshold_yen: 2000,
      scope: "仅咖啡厅物贩；Stand 不适用",
      venue_ids: ["niji-gigo-aki3"],
      starts_on: "2026-10-24",
      ends_on: "2026-11-08",
      selection: "固定",
      while_supplies_last: true,
    },
  ),
);
// explicitly captioned menu gallery; do not guess which graphic is phase 6.
gigo.gallery = [
  image(gigoO, 3, "第 6 弹联动饮品图"),
  image(gigoO, 4, "第 6 弹联动饮品图（续）"),
];
upsert(gigo);

const police = catalog.events.find(
  (e) => e.id === "nijigasaki-police-fair-2026",
);
const policeUrl = police.sources[0].url;
const policeImages = extractImageCandidates(
  fs.readFileSync("var/crawler/manual-niji-police.html", "utf8"),
  policeUrl,
);
police.benefits = [
  benefit(
    police,
    "niji-police-bookmark",
    "每满 ¥2,200：随机透明书签（13 款）",
    "Gamers 门店或通販购买虹咲相关角色周边，每满 2,200 日元含税送 1 枚随机书签；门店和通販使用同款特典，赠完即止。",
    {
      threshold_yen: 2200,
      channel: "门店及通販",
      scope: "Gamers 各店及通販的虹咲相关角色周边",
      starts_on: "2026-10-31",
      ends_on: "2026-11-20",
      selection: "随机",
      while_supplies_last: true,
      image: {
        url: policeImages.find((i) => i.url.includes("tokuten_shiori")).url,
        alt: "虹咲 Police Fair 透明书签特典（13 款）",
        source_url: policeUrl,
        checked_on: day,
      },
    },
  ),
];
police.updated_at = stamp;
police.verified_at = stamp;
for (const v of police.venues) {
  const s = stores.find((s) => v.id.endsWith(s.id));
  if (s) v.official_url = s.official_url;
}
fs.writeFileSync(
  "src/data/catalog.json",
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    events: catalog.events.length,
    venues: catalog.events.flatMap((e) => e.venues).length,
    benefits: catalog.events.flatMap((e) => e.benefits || []).length,
  }),
);
