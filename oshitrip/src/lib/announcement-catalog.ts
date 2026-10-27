import "server-only";
import seed from "@/data/announcements.json";
import { announcementsSchema } from "./announcements";
import { getSharedSnapshot, sharedDataEnabled } from "./shared-data";
export async function getAnnouncements() {
  return sharedDataEnabled() ? (await getSharedSnapshot()).data.announcements : announcementsSchema.parse(seed);
}
