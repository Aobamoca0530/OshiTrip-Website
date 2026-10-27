// Facts manually checked against the official announcement on 2026-10-25.
import { mkdirSync, writeFileSync } from "node:fs";
const verified = "2026-10-25T00:00:00+09:00";
const franchises = [
  ["lovelive", "Love Live! 系列", null],
  ["nijigasaki", "虹咲学园学园偶像同好会", "lovelive"],
  ["bang-dream", "BanG Dream!", null],
  ["mygo", "MyGO!!!!!", "bang-dream"],
  ["ave-mujica", "Ave Mujica", "bang-dream"],
  ["our-notes", "Our Notes", "bang-dream"],
  ["starlight", "少女☆歌剧 Revue Starlight", null],
].map(([id, name, parent_id]) => ({ id, name, parent_id }));
const venues = [
  ["shinjuku", "东京", "新宿東口店", "02", "29"],
  ["nagoya", "名古屋", "名古屋スパイラルタワーズ店", "02", "29"],
  ["umeda", "大阪", "梅田店", "02", "29"],
  ["kyoto", "京都", "京都河原町OPA店", "02", "23"],
  ["hiroshima", "广岛", "広島パルコ店", "02", "19"],
  ["kobe", "神户", "クレフィ三宮店", "10", "29"],
  ["machida", "町田", "町田モディ店", "10", "29"],
  ["omiya", "埼玉", "丸井大宮店", "17", "29"],
  ["sendai", "仙台", "仙台パルコ店", "17", "29"],
].map(([id, city, name, start, end]) => ({
  id: `ournotes-${id}`,
  city,
  name,
  address: null,
  start_date: `2026-11-${start}`,
  end_date: `2026-11-${end}`,
  rounds: [
    {
      id: `app-${id}`,
      label: "官方 App 先着预约",
      method: "官方 App 预约",
      kind: "rolling",
      opens_at: null,
      closes_at: null,
      days_before: 35,
      open_time: null,
      cutoff_days_before: 1,
      cutoff_time: "20:00",
      url: "https://www.sweets-paradise.jp/app/",
      note: "到店日期五周前开放，具体开放时刻尚未核实；前一天日本时间 20:00 截止。当天不可通过 App 预约。",
    },
  ],
}));
const events = [
  {
    id: "ournotes-sweets-2026",
    slug: "ournotes-sweets-paradise-2026",
    title_ja: "BanG Dream! Our Notes × SWEETS PARADISE",
    title_zh: "Our Notes × SWEETS PARADISE 联动咖啡厅",
    category: "联动咖啡厅",
    summary:
      "把喜欢的音乐企划，加入下一次日本旅行。九家门店分期举办，出发前请核对所选门店日期与官方 App。",
    fees: "联动餐品之外需另付自助餐费用；具体金额尚未核实，请查看官方菜单。",
    conditions: [
      "周边仅限消费联动餐品的顾客购买，不能仅购买周边。",
      "未预约可否入场取决于现场空位，不能保证。",
      "一个 App 账号同时只能预约一个日期与时段。",
      "商品、赠品可能售罄；开放预约时间不代表有剩余名额。",
    ],
    status: "published",
    verified_at: verified,
    updated_at: verified,
    franchise_ids: ["bang-dream", "our-notes"],
    venues,
    sources: [
      {
        id: "ournotes-official",
        label: "SWEETS PARADISE 官方活动公告",
        url: "https://www.sweets-paradise.jp/collaboration/ournotes",
        checked_at: verified,
      },
      {
        id: "app-official",
        label: "SWEETS PARADISE 官方 App 入口",
        url: "https://www.sweets-paradise.jp/app/",
        checked_at: verified,
      },
    ],
  },
];
mkdirSync("src/data", { recursive: true });
writeFileSync(
  "src/data/catalog.json",
  JSON.stringify({ franchises, events }, null, 2) + "\n",
);
