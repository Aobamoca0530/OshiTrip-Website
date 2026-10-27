import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>这条旅行线索还不存在</h1>
      <p>活动可能已下架，或链接有误。</p>
      <Link className="button primary" href="/events">
        返回活动列表
      </Link>
    </div>
  );
}
