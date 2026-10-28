import { SourceDashboard } from "@/components/source-dashboard";
import { getAnnouncements } from "@/lib/announcement-catalog";
import { getSharedSnapshot, sharedDataEnabled } from "@/lib/shared-data";
import { sourceStatusSchema } from "@/lib/source-status";
import localStatus from "@/data/source-status.json";

export const metadata = {
  title: "来源状态与待审核",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const shared = sharedDataEnabled() ? await getSharedSnapshot() : null;
  const status =
    shared?.data.monitoring ?? sourceStatusSchema.parse(localStatus);
  const items = shared?.data.announcements ?? (await getAnnouncements());
  return (
    <SourceDashboard
      status={status}
      items={items}
      now={new Date().toISOString()}
    />
  );
}
