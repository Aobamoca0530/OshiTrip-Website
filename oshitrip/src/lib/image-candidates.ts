import { z } from "zod";
import { urlSchema } from "./schema";
export const imageCandidateSchema = z.object({
  kind: z.literal("event-source"),
  title: z.string(),
  images: z
    .array(z.object({ url: urlSchema, alt: z.string(), context: z.string() }))
    .max(80)
    .default([]),
  image_reviews: z
    .array(
      z.object({
        url: urlSchema,
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        status: z.enum(["pending", "needs_review", "failed"]),
        reason: z.string(),
        reading: z
          .object({
            unreadable: z.boolean(),
            rules: z.array(
              z.object({
                kind: z.enum(["参加", "点单", "购买", "特典", "预约", "其他"]),
                title: z.string(),
                evidence_ja: z.string(),
                text_zh: z.string(),
                uncertain: z.boolean(),
              }),
            ),
          })
          .nullable(),
      }),
    )
    .max(80)
    .default([]),
});
