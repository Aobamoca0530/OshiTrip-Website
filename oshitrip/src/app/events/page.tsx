import { getCatalog } from "@/lib/catalog";
import { EventExplorer, SourceNote } from "@/components/events";
import type { Filters } from "@/lib/domain";
export const metadata = { title: "发现活动" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  const initial: Filters = {};
  for (const key of [
    "ip",
    "city",
    "category",
    "start",
    "end",
    "method",
    "status",
    "sort",
  ] as const)
    if (typeof params[key] === "string") initial[key] = params[key];
  initial.history = params.history === "true";
  initial.benefits = params.benefits === "true";
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">DISCOVER YOUR NEXT DETOUR</span>
        <h1>发现活动</h1>
        <p>从喜欢的 IP 出发，找到刚好与你的旅行相遇的联动。</p>
        <p className="helper">
          更多官方动态：
          <a
            className="text-link"
            href="https://bang-dream.com/news/"
            target="_blank"
            rel="noopener noreferrer"
          >
            BanG Dream! 公告 ↗
          </a>{" "}
          ·{" "}
          <a
            className="text-link"
            href="https://x.com/bang_dream_info"
            target="_blank"
            rel="noopener noreferrer"
          >
            官方 SNS ↗
          </a>{" "}
          ·{" "}
          <a
            className="text-link"
            href="https://bushiroad-creative.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            联动与快闪公告 ↗
          </a>
          {" · "}
          <a
            className="text-link"
            href="https://www.lovelive-anime.jp/nijigasaki/topics.php"
            target="_blank"
            rel="noopener noreferrer"
          >
            虹咲官方公告 ↗
          </a>
          {" · "}
          <a
            className="text-link"
            href="https://x.com/LoveLive_staff"
            target="_blank"
            rel="noopener noreferrer"
          >
            LoveLive! 官方 SNS ↗
          </a>
        </p>
      </div>
      <SourceNote mode={catalog.mode} error={catalog.error} />
      <EventExplorer
        events={catalog.events}
        franchises={catalog.franchises}
        initial={initial}
      />
    </>
  );
}
