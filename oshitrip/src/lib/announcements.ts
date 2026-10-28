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
  images: z
    .array(
      z.object({
        url: urlSchema.refine((value) => {
          const u = new URL(value);
          return !u.username && !u.password;
        }),
        alt: z.string().max(500),
        kind: z.enum(["merchandise", "bonus", "menu", "visual", "unknown"]),
      }),
    )
    .max(80),
  image_readings: z
    .array(
      z.object({
        url: urlSchema,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        model: z.string().max(100),
        rules: z
          .array(
            z.object({
              title: z.string().max(120),
              text_zh: z.string().max(2000),
              evidence_ja: z.string().max(2000),
              uncertain: z.boolean(),
            }),
          )
          .max(30),
        unreadable: z.boolean(),
      }),
    )
    .max(8)
    .optional(),
  activity: z
    .object({
      kind: z.enum(["live", "offline"]),
      state: z.enum(["ready", "needs_review", "translation_pending"]),
      title_zh: z.string().max(500),
      summary_zh: z.string().max(3000),
      source_hash: z.string().regex(/^[a-f0-9]{64}$/),
      model: z.string().max(100),
      reason: z.string().max(500),
      rules: z
        .array(
          z.object({
            title: z.string().max(120),
            text_zh: z.string().max(2000),
            evidence_ja: z.string().max(2000),
          }),
        )
        .max(30),
    })
    .optional(),
});
export const announcementsSchema = z.array(announcementSchema).max(120);
export type Announcement = z.infer<typeof announcementSchema>;
export const imageKindLabels = {
  merchandise: "售卖商品图",
  bonus: "特典 / 满赠图",
  menu: "餐饮菜单图",
  visual: "活动宣传图",
  unknown: "其他官方图片",
};
