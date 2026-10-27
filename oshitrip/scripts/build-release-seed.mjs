// Editorial snapshot, manually checked against the listed official sources on 2026-10-28.
// Run only when intentionally rebuilding this snapshot; it is NOT an automatic scraper.
import { readFileSync, writeFileSync } from "node:fs";
const checked = "2026-10-28";
const unknown = (
  note = "未核实各店商品预约开始及截止时间；请向店铺确认，不能用特典活动期限代替。",
) => ({ opens_on: null, opens_at: null, closes_at: null, note });
const source = (url, label) => ({ url, label, checked_on: checked });
const edition = (
  id,
  label,
  sku,
  price_yen,
  eligibility = "仅初回生产分附带抽选券；下单时确认所购商品实际含券。",
) => ({ id, label, sku, price_yen, eligibility });
const myUrl = "https://bushiroad-music.com/musics/brmm-11098/";
const myCampaign = "https://bushiroad-music.com/topics/22586/";
const aveUrl = "https://bang-dream.com/discographies/4238/";
const bookUrl = "https://bushiroad-works.com/bushiroad20thbook/";
const liveUrl = "https://live.bushiroad-music.com/bushiroad_20thlive/";
const kadUrl = "https://store.kadokawa.co.jp/shop/g/gca1920076016004/";
function base(id, title, franchise_ids, release_on, summary) {
  return {
    id,
    slug: id,
    title,
    franchise_ids,
    release_on,
    summary,
    status: "published",
    updated_at: "2026-10-28T00:00:00+09:00",
    editions: [],
    lotteries: [],
    offers: [],
    campaigns: [],
    sources: [],
  };
}
const my = base(
  "mygo-setensai",
  "MyGO!!!!! 9th Single「世点彩」",
  ["bang-dream", "mygo"],
  "2026-11-11",
  "两种版本的首批均附 2027 年 MyGO!!!!! 单独 Live 最速先行抽选券。店铺特典按版本分别列出。",
);
my.editions = [
  edition("bd", "Blu-ray付生産限定盤", "BRMM-11098", 13200),
  edition("cd", "通常盤", "BRMM-11099", 1650),
];
my.lotteries = [
  {
    id: "mygo-2027",
    title: "2027年開催予定 MyGO!!!!!単独ライブイベント 最速先行",
    edition_ids: ["bd", "cd"],
    event_slug: null,
    live_dates: [],
    venue: null,
    window: unknown(
      "商品页仅确认附券；抽选起止时间、申请平台及具体场次尚未核实。",
    ),
    conditions: [
      "首批生产分限定封入。",
      "本券对应 2027 年单独 Live，不能据此报名 2026 年神户公演。",
      "购买商品不保证获得门票；申请次数与张数请以申込券及后续官方公告为准。",
    ],
    source_url: myUrl,
  },
];
function offers(product, url, rows) {
  rows.forEach(([retailer, bd, cd], i) => {
    product.offers.push({
      id: `shop-${i}-bd`,
      retailer,
      edition_ids: ["bd"],
      bonus: bd,
      preorder: unknown(),
      source_url: url,
      shop_url: null,
      note: "官方列出的店铺特典；库存、适用分店及实际发放请向店铺确认。",
    });
    product.offers.push({
      id: `shop-${i}-cd`,
      retailer,
      edition_ids: ["cd"],
      bonus: cd || bd,
      preorder: unknown(),
      source_url: url,
      shop_url: null,
      note: "官方列出的店铺特典；库存、适用分店及实际发放请向店铺确认。",
    });
  });
}
offers(my, myUrl, [
  ["ブシロード オンラインストア", "L判照片"],
  [
    "アニメイト（含通販）",
    "亚克力钥匙扣＋56mm徽章＋L判照片（燈）",
    "L判照片（燈）",
  ],
  ["HMV・HMV&BOOKS online", "57mm徽章＋L判照片（愛音）", "L判照片（愛音）"],
  ["ゲーマーズ", "亚克力立牌＋56mm徽章＋L判照片（楽奈）", "L判照片（楽奈）"],
  ["楽天ブックス", "57mm徽章＋L判照片（そよ）", "L判照片（そよ）"],
  [
    "タワーレコード（部分店铺除外）",
    "57mm徽章＋L判照片（立希）",
    "L判照片（立希）",
  ],
  ["あみあみ", "2L判照片"],
  [
    "ソフマップ・アニメガ",
    "100mm方形亚克力板＋76mm亚克力杯垫",
    "76mm亚克力杯垫",
  ],
  ["TSUTAYA RECORDS（部分店铺除外）", "方形照片"],
  ["WonderGOO / 新星堂（部分店铺除外，含网店）", "徽章＋L判照片", "L判照片"],
  ["赤い熊さん", "57mm徽章＋L判照片", "L判照片"],
  ["Joshinディスクピア（含网店）", "57mm圆形徽章"],
  ["diskunion（部分店铺除外）", "双面钥匙扣"],
  ["Neowing", "58mm方形徽章＋89×89mm方形照片", "89×89mm方形照片"],
  ["メロンブックス", "56mm镭射覆膜徽章（オーバーホロ缶バッジ）"],
]);
my.campaigns = [
  {
    name: "先着購入特典：フォトグレイ風クリアカード",
    window: {
      opens_on: "2026-08-08",
      opens_at: null,
      closes_at: "2026-10-11T23:59:00+09:00",
      note: "公告日开始，未公布具体开始时刻。此处是特典活动预约期，结束后是否有余量请向各店确认；不代表商品停止预约。",
    },
    retailers: [
      "ブシロード オンラインストア",
      "アニメイト（通販含む）",
      "ゲーマーズ全店（オンライン含む）",
      "タワーレコード（一部店舗を除く）",
      "WonderGOO / 新星堂（一部店舗を除く・含网店）",
      "ソフマップ・アニメガ",
      "メロンブックス",
      "HMV・HMV&BOOKS online",
      "ヨドバシカメラ",
      "セブンネットショッピング",
      "楽天ブックス",
      "Neowing",
      "Joshinディスクピア（含网店）",
      "赤い熊さん",
      "diskunion（一部店舗を除く）",
      "Amazon.co.jp",
      "Onburt Entertainment",
      "コーチャンフォー（一部店舗を除く・无通販）",
      "TSUTAYA RECORDS（一部店舗を除く・无通販）",
      "エムズエクスポ盛岡店（无通販）",
    ],
    bonus:
      "透明长条照片卡共5款随机。Blu-ray限定盘每张赠3枚，通常盘每张赠1枚。先着数量有限，不保证当前仍有特典。",
    source_url: myCampaign,
  },
];
my.sources = [
  source(myUrl, "武士道音乐：商品、首批抽选券与店铺特典"),
  source(myCampaign, "武士道音乐：先着特典活动期限与参与店铺"),
];
const ave = base(
  "ave-mujica-kami-no-na-wo",
  "Ave Mujica ミニAlbum「神の名を」",
  ["bang-dream", "ave-mujica"],
  "2026-10-21",
  "三种版本首批附带 2027 年春以后 Ave Mujica 单独 Live 最速先行抽选券。",
);
ave.editions = [
  edition(
    "special",
    "5,000枚限定生産特装盤",
    "BRMM-11071",
    18700,
    "限量5,000枚，仅武士道网店及 Live 会场销售；数量达到上限即结束，不是固定日期截止。首批附券。",
  ),
  edition("bd", "Blu-ray付生産限定盤", "BRMM-11072", 8800),
  edition("cd", "通常盤", "BRMM-11073", 2200),
];
ave.lotteries = [
  {
    id: "ave-2027",
    title: "2027年春以降開催予定 Ave Mujica単独ライブイベント 最速先行",
    edition_ids: ["special", "bd", "cd"],
    event_slug: null,
    live_dates: [],
    venue: null,
    window: unknown(
      "已确认首批附券，具体公演日期、抽选起止与申请平台尚未核实。",
    ),
    conditions: [
      "仅初回生产分附带。",
      "本券与 2026 年 7th LIVE「Virtus」抽选不是同一轮。",
      "申请次数、张数及当落公布时间请查后续公告及封入券。",
    ],
    source_url: aveUrl,
  },
];
offers(ave, aveUrl, [
  ["ブシロード オンラインストア", "57mm徽章＋L判照片", "L判照片"],
  [
    "アニメイト（含通販）",
    "亚克力钥匙扣＋56mm徽章＋L判照片（ドロリス）",
    "L判照片（ドロリス）",
  ],
  [
    "タワーレコード（部分店铺除外）",
    "57mm徽章＋L判照片（モーティス）",
    "L判照片（モーティス）",
  ],
  [
    "楽天ブックス",
    "亚克力钥匙扣＋57mm徽章＋L判照片（ティモリス）",
    "L判照片（ティモリス）",
  ],
  [
    "HMV・HMV&BOOKS online",
    "57mm徽章＋L判照片（アモーリス）",
    "L判照片（アモーリス）",
  ],
  [
    "ゲーマーズ",
    "亚克力钥匙扣＋56mm徽章＋L判照片（オブリビオニス）",
    "56mm徽章＋L判照片（オブリビオニス）",
  ],
  ["あみあみ", "2L判照片"],
  ["WonderGOO / 新星堂（部分店铺除外，含网店）", "徽章＋L判照片", "L判照片"],
  ["ソフマップ・アニメガ", "透明迷你色纸＋76mm亚克力杯垫", "76mm亚克力杯垫"],
  ["TSUTAYA RECORDS（部分店铺除外）", "方形照片"],
  ["赤い熊さん", "57mm徽章＋L判照片", "L判照片"],
  ["diskunion（部分店铺除外）", "双面钥匙扣"],
  ["Joshinディスクピア（含网店）", "57mm徽章"],
  ["Neowing", "58mm方形徽章＋89×89mm方形照片", "89×89mm方形照片"],
  ["メロンブックス", "56mm镭射覆膜徽章（オーバーホロ缶バッジ）"],
]);
ave.offers.push({
  ...ave.offers[0],
  id: "shop-special",
  edition_ids: ["special"],
  note: "特装盘仅武士道网店与 Live 会场销售。限量5,000枚；没有已核实的固定预约截止日。",
});
ave.sources = [source(aveUrl, "BanG Dream! 官方：商品版本、抽选券、店铺特典")];
const book = base(
  "bushiroad-20th-anniversary-book",
  "ブシロード20周年記念 アニバーサリーブック",
  ["bang-dream", "ave-mujica", "starlight", "lovelive"],
  "2027-01-08",
  "武士道20周年纪念书：附最速先行抽选申込券。Live 将于 2027 年 6 月 12、13 日在横滨 Arena 举办。",
);
book.editions = [
  edition(
    "book",
    "纪念书",
    "",
    1760,
    "官方公布的书内附录包含 Live 最速先行抽选申込券。使用方法后续公开；不能据此假定一书可申请两天或具体张数。",
  ),
];
book.lotteries = [
  {
    id: "bushiroad-20th-fastest",
    title: "ブシロード20周年記念ライブ 最速先行",
    edition_ids: ["book"],
    event_slug: "bushiroad-20th-live-2027",
    live_dates: ["2027-06-12", "2027-06-13"],
    venue: "横浜アリーナ（横滨 Arena）",
    window: unknown(
      "官方明确说明申请详情后日公开。抽选开始、截止、当落与付款时间均尚未公布。",
    ),
    conditions: [
      "需要纪念书附带的最速先行抽选申込券。",
      "申请入口、单券申请次数、可报天数、每次张数及费用尚未公布。",
      "出演者具体演出日程尚未公布；已公布的阵容不代表每天全部出演。",
      "另一份附录是「カードゲーム祭2027」PR卡兑换券；书中不直接封入PR卡，也不是另一张Live门票。",
    ],
    source_url: liveUrl,
  },
];
const bookShops = [
  ["Amazon", "https://www.amazon.co.jp/dp/B0HMC111ZF"],
  [
    "ブシロード オンラインストア",
    "https://bushiroad-store.com/products/2000328359765",
  ],
  ["ゲーマーズ", "https://www.gamers.co.jp/pn/pd/10945146/"],
  ["アニメイト", "https://www.animate-onlineshop.jp/pd/3610712/"],
  [
    "メロンブックス",
    "https://www.melonbooks.co.jp/detail/detail.php?product_id=3891652",
  ],
  ["書泉・芳林堂書店", "https://shosen.tokyo/?pid=193849192"],
  ["楽天ブックス", "https://books.rakuten.co.jp/rb/18845228/"],
  ["赤い熊さん", "https://onlineshop.akaikumasan.jp/products/1920076016004"],
  ["あみあみ", "https://www.amiami.jp/top/detail/detail?scode=MED-BOOK-056423"],
  ["Joshinディスクピア", "https://joshinweb.jp/dp/1920076016004.html"],
  ["タワーレコード", "https://tower.jp/item/8187307"],
  ["HMV&BOOKS online", "https://www.hmv.co.jp/product/detail/17333889"],
  ["ヨドバシカメラ", "https://www.yodobashi.com/product/100000009004299701/"],
  ["カドスト（角川商店）", kadUrl],
];
book.offers = bookShops.map(([retailer, shop_url], i) => ({
  id: `book-shop-${i}`,
  retailer,
  edition_ids: ["book"],
  bonus:
    "独立店铺特典尚未核实。书内两种附录属于商品内容，不能视为该店独家赠品。",
  preorder: unknown("出版社列为销售渠道；本条未确认该店预约起止或当前库存。"),
  source_url: bookUrl,
  shop_url,
  note: "销售链接来自出版社公告，不代表已核实该店可下单。",
}));
book.offers.at(-1).preorder = {
  opens_on: null,
  opens_at: null,
  closes_at: "2026-11-15T23:59:00+09:00",
  note: "仅角川商店商品预约期限；开始时刻未列出。达到预定数量可能提前结束。2026-10-28 页面标示接受预约，不代表实时库存。",
};
book.offers.at(-1).source_url = kadUrl;
book.offers.at(-1).note =
  "该店标示2027年1月中旬发售、发售日起依次送达，与出版社1月8日发售表述不同。不要据此承诺1月8日收到商品。店铺页的“特典付き”未明确另有独家赠品。";
book.sources = [
  source(bookUrl, "武士道 Works：纪念书发售、附录与销售链接"),
  source(liveUrl, "20周年 Live 官方：最速先行与出演日程说明"),
  source(
    "https://bushiroad.com/news/2026/12075",
    "武士道官方：Live 日期与横滨会场",
  ),
  source(kadUrl, "角川商店：本店预约截止及配送说明"),
];
const bushShop = "https://bushiroad-store.com/products/2000328359765";
book.sources.push(source(bushShop, "武士道网店：预约商品、配送与购买数量说明"));
book.offers[1].source_url = bushShop;
book.offers[1].preorder = unknown(
  "2026-10-28 核实页面标为预约商品，未列出固定预约开始或截止；并非实时库存查询。",
);
book.offers[1].note =
  "网店每人限购10件，不等于每人可以申请10张门票。页面说明2027年1月8日以后送达，不承诺当日到货；不提供海外配送。";
book.offers[2].note =
  "出版社确认销售链接；本次店铺详情访问返回403，独立特典、预约期限与库存待复核。";
book.offers[3].note = book.offers[2].note;
writeFileSync(
  "src/data/releases.json",
  JSON.stringify([book, my, ave], null, 2) + "\n",
);
const catalog = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
if (!catalog.events.some((e) => e.id === "bushiroad-20th-2027")) {
  catalog.events.push({
    id: "bushiroad-20th-2027",
    slug: "bushiroad-20th-live-2027",
    title_ja: "ブシロード20周年記念ライブ",
    title_zh: "武士道20周年纪念 Live",
    category: "音乐和声优活动",
    summary:
      "2027年6月12日、13日于横滨 Arena 举办。2027年1月8日发售的纪念书附带最速先行抽选申込券，申请详情尚未公布。",
    fees: "门票价格、席种及手续费尚未公布。纪念书1,760日元是商品价格，不是门票价格。",
    conditions: [
      "需要纪念书附带的最速先行抽选申込券；申请方法与起止时间后日公开。",
      "出演者各自演出日程后日公开，不能假定两天阵容相同。",
      "已公布阵容包含 Ave Mujica、Morfonica、Poppin’Party、RAISE A SUILEN、Roselia、少女☆歌劇 レヴュースタァライト、蓮ノ空女学院スクールアイドルクラブ、ミルキィホームズ、夢限大みゅーたいぷ；后续以官网为准。",
    ],
    status: "published",
    verified_at: "2026-10-28T00:00:00+09:00",
    updated_at: "2026-10-28T00:00:00+09:00",
    franchise_ids: book.franchise_ids,
    venues: ["2027-06-12", "2027-06-13"].map((date, i) => ({
      id: `bushiroad20-day${i + 1}`,
      city: "横滨",
      name: `横浜アリーナ DAY${i + 1}`,
      address: "神奈川県横浜市港北区新横浜3-10",
      start_date: date,
      end_date: date,
      rounds: [
        {
          id: `bushiroad20-first-day${i + 1}`,
          label: "纪念书最速先行（详情待公布）",
          method: "抽选报名",
          kind: "unannounced",
          opens_at: null,
          closes_at: null,
          days_before: null,
          open_time: null,
          cutoff_days_before: null,
          cutoff_time: null,
          url: liveUrl,
          note: "需要2027年1月8日发售的纪念书附录。当前入口为官方公告，尚未公布实际申请平台；单券能否申请两天及张数未公布。",
        },
      ],
    })),
    sources: book.sources
      .slice(0, 3)
      .map((s, i) => ({
        id: `bushiroad20-source${i}`,
        label: s.label,
        url: s.url,
        checked_at: "2026-10-28T00:00:00+09:00",
      })),
  });
  writeFileSync(
    "src/data/catalog.json",
    JSON.stringify(catalog, null, 2) + "\n",
  );
}
