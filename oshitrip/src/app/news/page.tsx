import { getAnnouncements } from "@/lib/announcement-catalog";
import { AnnouncementList } from "@/components/announcements";
import { OfficialNewsSources } from "@/components/official-news-sources";
export const metadata = { title: "官方新消息与商品图" };
export default async function Page() {
  const items = await getAnnouncements();
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">OFFLINE EVENTS &amp; LIVE</span>
        <h1>官方新消息与商品图</h1>
        <p>
          只收集线下联动、快闪、展览、Live
          和票务公告；中文介绍、参与规则与图片一并整理。
        </p>
        <p className="helper">
          完整活动进入“发现活动”，Live
          单独成合集；信息不全的保留为待补全公告。纯配信、网售和一般商品宣传会被过滤。机器译文附原文依据，日期不明时不会用于行程匹配。按内容变更时间排序；采集时间不是发布时间。
        </p>
        <OfficialNewsSources />
      </div>
      <AnnouncementList items={items} />
    </>
  );
}
