import { createHash } from "node:crypto";
import { z } from "zod";
import { catalogSchema } from "./schema";
import { releasesSchema } from "./releases";
import { storesSchema } from "./shopping";
import { announcementsSchema } from "./announcements";
import { sourceStatusSchema, emptySourceStatus } from "./source-status";
export { buildSourceStatus, sourceStatusSchema } from "./source-status";

export const PUBLIC_DATA_URL =
  "https://raw.githubusercontent.com/Aobamoca0530/OshiTrip-Website/main/data/public-v4.json";
export const MAX_DATA_BYTES = 5 * 1024 * 1024;
export const publicDataSchema = z.object({
  catalog: catalogSchema,
  releases: releasesSchema,
  stores: storesSchema,
  announcements: announcementsSchema.default([]),
  monitoring: sourceStatusSchema.default(emptySourceStatus),
}).superRefine((data, ctx) => {
  const ids = new Set(data.catalog.franchises.map(f => f.id));
  const uniqueGroups = [data.catalog.franchises.map(f => f.id), data.catalog.events.map(e => e.id), data.catalog.events.map(e => e.slug), data.releases.map(r => r.id), data.releases.map(r => r.slug)];
  if (uniqueGroups.some(group => new Set(group).size !== group.length))
    ctx.addIssue({ code: "custom", message: "公共数据中的 ID 或 slug 重复" });
  if (data.catalog.franchises.some(f => f.parent_id && !ids.has(f.parent_id)) || data.releases.some(r => r.franchise_ids.some(id => !ids.has(id))))
    ctx.addIssue({ code: "custom", message: "公共数据引用了不存在的 IP" });
  if (data.catalog.events.some(e => !["published", "cancelled"].includes(e.status)) || data.releases.some(r => r.status !== "published") || data.stores.some(s => s.status !== "published"))
    ctx.addIssue({ code: "custom", message: "数据包只能包含已发布或已取消的公共记录" });
});
export type PublicData = z.infer<typeof publicDataSchema>;
export function dataRevision(data: PublicData) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
export const dataBundleSchema = z.object({
  formatVersion: z.literal(4),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.iso.datetime({ offset: true }),
  data: publicDataSchema,
}).strict().refine(bundle => bundle.revision === dataRevision(bundle.data), "数据校验和不一致");
export type DataBundle = z.infer<typeof dataBundleSchema>;

export function makeDataBundle(input: unknown, publishedAt: string): DataBundle {
  const data = publicDataSchema.parse(input);
  return dataBundleSchema.parse({ formatVersion: 4, revision: dataRevision(data), publishedAt, data });
}
