import { getAnnouncements } from "@/lib/announcement-catalog";
import { AnnouncementList } from "@/components/announcements";
export const metadata = { title: "官方新消息与商品图" };
export default async function Page() {
  const items = await getAnnouncements();
  return <>
    <div className="page-heading"><span className="eyebrow">OFFICIAL ANNOUNCEMENTS</span><h1>官方新消息与商品图</h1><p>自动收集官方公开公告里的快闪、联动、现场售卖商品和餐饮图片，不必等人工录入后才能发现新消息。</p><p className="helper">目前每日检查 BanG Dream! 公告、Bushiroad Creative 与 SWEETS PARADISE。按内容变更时间排序；历史公告也可能出现在这里，覆盖范围不代表全部活动。</p></div>
    <AnnouncementList items={items} />
  </>;
}
