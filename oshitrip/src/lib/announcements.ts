import { z } from "zod";
import { urlSchema } from "./schema";

export const announcementSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  source_id: z.string().min(1),
  source_url: urlSchema,
  title: z.string().min(1).max(500),
  first_seen_at: z.iso.datetime({ offset: true }),
  last_seen_at: z.iso.datetime({ offset: true }),
  changed_at: z.iso.datetime({ offset: true }),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  related_event_ids: z.array(z.string()).max(20),
  images: z.array(z.object({
    url: urlSchema.refine(value => { const u = new URL(value); return !u.username && !u.password; }),
    alt: z.string().max(500),
    kind: z.enum(["merchandise", "bonus", "menu", "visual", "unknown"]),
  })).max(80),
});
export const announcementsSchema = z.array(announcementSchema).max(120);
export type Announcement = z.infer<typeof announcementSchema>;
export const imageKindLabels = { merchandise: "售卖商品图", bonus: "特典 / 满赠图", menu: "餐饮菜单图", visual: "活动宣传图", unknown: "其他官方图片" };
