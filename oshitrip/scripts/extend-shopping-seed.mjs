import { readFileSync, writeFileSync } from "node:fs";
// Editorial snapshot checked against the linked first-party pages on 2026-10-28.
const path = "src/data/releases.json";
const products = JSON.parse(readFileSync(path, "utf8"));
const unknown = {
  opens_on: null,
  opens_at: null,
  closes_at: null,
  note: "官方商品页未列明起止时间；请向具体店铺确认预约、初回附券批次和特典剩余情况。",
};
const specs = [
  [
    "ras-i-am-who-i-am",
    "RAISE A SUILEN 16th Single「I AM WHO I AM」",
    "2026-11-04",
    "4215",
    [9900, 1650],
    ["BRMM-11101", "BRMM-11102"],
    "2027年 RAISE A SUILEN 单独 Live 最速先行",
    ["56mm徽章＋L判照片（LOCK）", "L判照片（LOCK）"],
    ["亚克力立牌＋56mm徽章＋L判照片（CHU²）", "L判照片（CHU²）"],
  ],
  [
    "yumemita-its-our-choice",
    "夢限大みゅーたいぷ 2nd Album「It’s our choice」",
    "2027-01-27",
    "4259",
    [10450, 3300],
    ["BRMM-11114", "BRMM-11115"],
    "2027年 夢限大みゅーたいぷ 单独 Live 最速先行",
    ["56mm徽章＋方形照片（仲町あられ）", "方形照片（仲町あられ）"],
    ["56mm徽章＋方形照片（千石ユノ）", "方形照片（千石ユノ）"],
  ],
  [
    "yumemita-seizon-no-arasuji",
    "夢限大みゅーたいぷ 5th Single「これはぼくたちの生存のあらすじ」",
    "2026-09-30",
    "4210",
    [9900, 1870],
    ["BRMM-11060", "BRMM-11061"],
    "夢限大みゅーたいぷ 2027 巡演 最速先行",
    ["56mm徽章＋L判照片（仲町あられ）", "L判照片（仲町あられ）"],
    ["56mm徽章＋L判照片（千石ユノ）", "L判照片（千石ユノ）"],
  ],
  [
    "roselia-lehre-der-rose",
    "Roselia 10th Anniversary Best Album「Lehre der Rose」",
    "2026-08-26",
    "4181",
    [9900, 2750],
    ["BRMM-11068", "BRMM-11069"],
    "Roselia 10th Anniversary LIVE TOUR 最速先行",
    [
      "亚克力立牌＋徽章＋L判照片（湊友希那）；规格请核对官方完整清单",
      "L判照片（湊友希那）",
    ],
    ["亚克力立牌＋56mm徽章＋L判照片（今井リサ）", "L判照片（今井リサ）"],
  ],
];
for (const [
  id,
  title,
  release_on,
  officialId,
  prices,
  skus,
  live,
  animate,
  gamers,
] of specs) {
  if (products.some((p) => p.id === id)) continue;
  const url = `https://bang-dream.com/discographies/${officialId}/`;
  const editions = ["bd", "cd"].map((id, i) => ({
    id,
    label: i ? "通常盘（初回生产分）" : "Blu-ray付生产限定盘",
    sku: skus[i],
    price_yen: prices[i],
    eligibility:
      "初回生产分封入最速先行抽选申込券。购买前确认是否仍为附券批次；库存与特典不作保证。",
  }));
  const p = {
    id,
    slug: id,
    title,
    franchise_ids: ["bang-dream"],
    release_on,
    summary:
      "官网明确公布初回生产分附 Live 抽选申込券。这里先整理 Animate、Gamers 与武士道官网渠道，其他法人特典可查官方完整清单。",
    status: "published",
    updated_at: "2026-10-28T12:00:00+09:00",
    editions,
    lotteries: [
      {
        id: "fastest",
        title: live,
        edition_ids: ["bd", "cd"],
        event_slug: null,
        live_dates: [],
        venue: null,
        window: {
          ...unknown,
          note: "官方已确认附券；具体抽选开始、截止与场次以后续 Live 公告为准。",
        },
        conditions: [
          "仅适用于初回生产分附券商品。",
          "购买商品不等于获得门票，申请规则请核对官方公告。",
        ],
        source_url: url,
      },
    ],
    offers: [],
    campaigns: [],
    sources: [
      {
        label: "BanG Dream! 官方商品资料与完整店铺特典",
        url,
        checked_on: "2026-10-28",
      },
    ],
  };
  for (const [retailer, retailer_id, bonuses, shop_url] of [
    [
      "アニメイト(通販含む)",
      "animate",
      animate,
      "https://www.animate-onlineshop.jp/",
    ],
    ["ゲーマーズ", "gamers", gamers, "https://www.gamers.co.jp/"],
    [
      "ブシロード オンラインストア",
      null,
      [id.startsWith("roselia") ? "57mm徽章＋L判照片" : "L判照片", "L判照片"],
      "https://bushiroad-store.com/",
    ],
  ]) {
    for (const [i, e] of editions.entries())
      p.offers.push({
        id: `${retailer_id || "bushiroad"}-${e.id}`,
        retailer,
        retailer_id,
        edition_ids: [e.id],
        bonus: bonuses[i],
        preorder: unknown,
        source_url: url,
        shop_url,
        note: "链接为官网搜索入口，请用商品名／货号查找。品牌渠道记录不代表任一分店已到货；网店库存不等于门店库存。",
      });
  }
  if (id.startsWith("roselia")) {
    p.editions.push({
      id: "special",
      label: "5,000枚限定生产特装盘",
      sku: "BRMM-11067",
      price_yen: 33000,
      eligibility:
        "初回封入抽选券；特装盘销售渠道请核对官网，本目录未建立其线下门店关联。",
    });
    p.lotteries[0].edition_ids.push("special");
    p.lotteries[0].source_url =
      "https://bang-dream.com/events/roselia-10th-anniversary-live-tour/";
    p.sources.push({
      label: "Roselia 10周年巡演官方公告",
      url: p.lotteries[0].source_url,
      checked_on: "2026-10-28",
    });
  }
  if (id === "yumemita-seizon-no-arasuji") {
    const event = "https://bang-dream.com/events/ymmt-tour2027/";
    p.sources.push({
      label: "夢限大みゅーたいぷ 2027 巡演：分地区抽选期限",
      url: event,
      checked_on: "2026-10-28",
    });
    p.lotteries = [
      [
        "fukuoka-miyagi",
        "福岡・宮城",
        "2026-11-09",
        ["2027-01-31", "2027-02-07"],
        "Zepp Fukuoka / 仙台PIT",
      ],
      [
        "hokkaido-osaka",
        "北海道・大阪",
        "2026-11-23",
        ["2027-02-20", "2027-03-04", "2027-03-05"],
        "Zepp Sapporo / Zepp Osaka Bayside",
      ],
      [
        "tokyo-aichi",
        "東京・愛知",
        "2026-12-14",
        ["2027-03-25", "2027-03-26"],
        "Zepp DiverCity / Zepp Nagoya",
      ],
    ].map(([key, area, close, dates, venue]) => ({
      id: key,
      title: `夢限大みゅーたいぷ 2027 巡演 ${area} 最速先行`,
      edition_ids: ["bd", "cd"],
      event_slug: null,
      live_dates: dates,
      venue,
      window: {
        opens_on: null,
        opens_at: "2026-10-11T21:00:00+09:00",
        closes_at: `${close}T23:59:00+09:00`,
        note: "各地区的截止日期不同。此轮使用5th Single附券，不是2027年2nd Album。",
      },
      conditions: [
        "使用5th Single初回生产分申込券。",
        "官网各地区轮次说明：一个序列号限申请一次，各票种最多2张；具体可申请场次以报名页面为准。",
      ],
      source_url: event,
    }));
  }
  products.push(p);
}
for (const p of products)
  for (const o of p.offers) {
    // Book online-only channel names deliberately do not imply branch availability.
    if (["アニメイト", "アニメイト(通販含む)", "アニメイト（含通販）"].includes(o.retailer))
      o.retailer_id = "animate";
    else if (o.retailer === "ゲーマーズ") o.retailer_id = "gamers";
    else o.retailer_id ??= null;
  }
writeFileSync(path, JSON.stringify(products, null, 2) + "\n");
const branches = [
  [
    "animate-osaka-nipponbashi",
    "animate",
    "アニメイト大阪日本橋",
    "大阪",
    "大阪府大阪市浪速区日本橋西1丁目1-3 池田ビル２号館 1階・2階",
    "06-6636-0628",
    "https://www.animate.co.jp/shop/nipponbashi/",
  ],
  [
    "animate-umeda",
    "animate",
    "アニメイト梅田",
    "大阪",
    "大阪府大阪市北区茶屋町10-12 NU茶屋町3階",
    "0570-004601",
    "https://www.animate.co.jp/shop/umeda/",
  ],
  [
    "animate-sannomiya",
    "animate",
    "アニメイト三宮",
    "神户",
    "兵庫県神戸市中央区三宮町1-9-1-309 センタープラザビル3F",
    "0570-028-155",
    "https://www.animate.co.jp/shop/sannomiya/",
  ],
  [
    "animate-nagoya",
    "animate",
    "アニメイト名古屋",
    "名古屋",
    "愛知県名古屋市中村区椿町18-4 椿太閤ビル",
    "052-453-1322",
    "https://www.animate.co.jp/shop/nagoya/",
  ],
  [
    "animate-kyoto",
    "animate",
    "アニメイト京都",
    "京都",
    "京都府京都市中京区新京極蛸薬師下ル東側町525-1 パッサージオ（吉本ビル）2F",
    "075-252-1460",
    "https://www.animate.co.jp/shop/kyoto/",
  ],
  [
    "animate-akihabara",
    "animate",
    "アニメイト秋葉原",
    "东京",
    "東京都千代田区外神田4-3-1",
    "03-5209-3330",
    "https://www.animate.co.jp/shop/akihabara/",
  ],
  [
    "animate-yokohama",
    "animate",
    "アニメイト横浜ビブレ",
    "横滨",
    "神奈川県横浜市西区南幸2丁目15-13 横浜ビブレ8F",
    "0570-076-614",
    "https://www.animate.co.jp/shop/yokohama/",
  ],
  [
    "gamers-namba",
    "gamers",
    "ゲーマーズなんば店",
    "大阪",
    "大阪府大阪市浪速区日本橋3-8-16 B1F",
    "06-6586-9139",
    "https://www.gamers.co.jp/shop/detail.php?id=13",
  ],
  [
    "gamers-nagoya",
    "gamers",
    "ゲーマーズ名古屋店",
    "名古屋",
    "愛知県名古屋市中区大須3-30-40 万松寺ビル1階",
    "052-269-0211",
    "https://www.gamers.co.jp/shop/",
  ],
  [
    "gamers-akihabara",
    "gamers",
    "AKIHABARAゲーマーズ本店",
    "东京",
    "東京都千代田区外神田1-14-7 外神田一丁目ビル",
    "03-5298-8720",
    "https://www.gamers.co.jp/shop/",
  ],
].map(([id, retailer_id, name, city, address, phone, official_url]) => ({
  id,
  retailer_id,
  name,
  city,
  address,
  phone,
  official_url,
  stock_url:
    retailer_id === "animate" ? "https://www.animate-onlineshop.jp/" : null,
  stock_note:
    retailer_id === "animate"
      ? "按商品名称／货号搜索；若商品页提供门店库存入口请选择对应分店，再确认附券批次与特典。"
      : "官方说明邮件不回答各店库存；请直接联系分店确认商品、初回附券批次与特典。",
  stock_source_url:
    retailer_id === "gamers"
      ? "https://www.gamers.co.jp/contact/index.php"
      : null,
  checked_on: "2026-10-28",
  status: "published",
  updated_at: "2026-10-28T12:00:00+09:00",
}));
writeFileSync("src/data/stores.json", JSON.stringify(branches, null, 2) + "\n");
