import { z } from "zod";
import { dateSchema, urlSchema, officialImageSchema } from "./schema";

// Product orders, bonus campaigns and ticket lotteries deliberately use separate windows.
export const salesWindowSchema = z
  .object({
    opens_on: dateSchema.nullable(),
    opens_at: z.iso.datetime({ offset: true }).nullable(),
    closes_at: z.iso.datetime({ offset: true }).nullable(),
    note: z.string(),
  })
  .superRefine((w, ctx) => {
    if (w.opens_at && w.opens_on)
      ctx.addIssue({
        code: "custom",
        message: "开始日期与精确开始时间只能填写一个",
      });
    const start =
      w.opens_at || (w.opens_on ? `${w.opens_on}T00:00:00+09:00` : null);
    if (start && w.closes_at && Date.parse(start) > Date.parse(w.closes_at))
      ctx.addIssue({ code: "custom", message: "开始不能晚于截止" });
  });
export type SalesWindow = z.infer<typeof salesWindowSchema>;
export const releaseSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    franchise_ids: z.array(z.string()).min(1),
    release_on: dateSchema.nullable(),
    summary: z.string(),
    images: z
      .array(
        officialImageSchema.extend({
          kind: z.enum(["cover", "bonus"]),
          edition_ids: z.array(z.string()),
          retailer: z.string().nullable(),
        }),
      )
      .max(100)
      .optional(),
    status: z.enum(["draft", "review", "published", "archived"]),
    updated_at: z.iso.datetime({ offset: true }),
    editions: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          sku: z.string(),
          price_yen: z.number().int().nonnegative().nullable(),
          eligibility: z.string().min(1),
        }),
      )
      .min(1),
    lotteries: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          edition_ids: z.array(z.string()).min(1),
          event_slug: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .nullable(),
          live_dates: z.array(dateSchema),
          venue: z.string().nullable(),
          window: salesWindowSchema,
          conditions: z.array(z.string()).min(1),
          source_url: urlSchema,
        }),
      )
      .min(1),
    offers: z.array(
      z.object({
        id: z.string().min(1),
        retailer: z.string().min(1),
        retailer_id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .nullable()
          .default(null),
        edition_ids: z.array(z.string()).min(1),
        bonus: z.string().min(1),
        preorder: salesWindowSchema,
        source_url: urlSchema,
        shop_url: urlSchema.nullable(),
        note: z.string(),
      }),
    ),
    campaigns: z.array(
      z.object({
        name: z.string().min(1),
        window: salesWindowSchema,
        retailers: z.array(z.string()).min(1),
        bonus: z.string().min(1),
        source_url: urlSchema,
      }),
    ),
    sources: z
      .array(
        z.object({
          label: z.string().min(1),
          url: urlSchema,
          checked_on: dateSchema.nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((p, ctx) => {
    for (const image of p.images || []) {
      if (
        image.edition_ids.some((id) => !p.editions.some((e) => e.id === id)) ||
        !p.sources.some((s) => s.url === image.source_url) ||
        (p.status === "published" && !image.checked_on)
      )
        ctx.addIssue({
          code: "custom",
          message: "图片需要正确版本、已关联来源及核实日期",
        });
      if (
        image.kind === "bonus" &&
        (!image.retailer ||
          !p.offers.some((o) => o.retailer === image.retailer))
      )
        ctx.addIssue({ code: "custom", message: "特典图必须关联已录入店铺" });
    }
    for (const items of [p.editions, p.lotteries, p.offers])
      if (new Set(items.map((x) => x.id)).size !== items.length)
        ctx.addIssue({ code: "custom", message: "同类记录 ID 不可重复" });
    for (const item of [...p.lotteries, ...p.offers])
      if (item.edition_ids.some((id) => !p.editions.some((e) => e.id === id)))
        ctx.addIssue({
          code: "custom",
          message: "抽选或特典引用了不存在的版本",
        });
    const urls = new Set(p.sources.map((s) => s.url));
    if (
      [...p.lotteries, ...p.offers, ...p.campaigns].some(
        (x) => !urls.has(x.source_url),
      )
    )
      ctx.addIssue({ code: "custom", message: "每项信息都需要关联来源" });
    if (p.status === "published" && p.sources.some((s) => !s.checked_on))
      ctx.addIssue({ code: "custom", message: "发布前必须核实所有来源" });
  });
export const releasesSchema = z.array(releaseSchema).superRefine((ps, ctx) => {
  for (const key of ["id", "slug"] as const)
    if (new Set(ps.map((p) => p[key])).size !== ps.length)
      ctx.addIssue({ code: "custom", message: "商品 ID / slug 不可重复" });
});
export type Release = z.infer<typeof releaseSchema>;
export function windowStatus(
  w: SalesWindow,
  now: Date,
): "upcoming" | "open" | "closed" | "unknown" {
  if (w.closes_at && now.getTime() >= Date.parse(w.closes_at)) return "closed";
  if (w.opens_at && now.getTime() < Date.parse(w.opens_at)) return "upcoming";
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  if (w.opens_on && day < w.opens_on) return "upcoming";
  // On a date-only opening day the hour is unknown. A missing boundary never implies open.
  const started = w.opens_at
    ? now.getTime() >= Date.parse(w.opens_at)
    : w.opens_on
      ? day > w.opens_on
      : false;
  return started && w.closes_at ? "open" : "unknown";
}
export const salesStatusLabels = {
  upcoming: "尚未开始",
  open: "处于公布的时间范围内",
  closed: "本轮公布期限已过",
  unknown: "状态无法确认",
};
export function japanTimestamp(value: string | null) {
  if (!value) return "尚未核实 / 官方未列出";
  return new Date(Date.parse(value) + 9 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}
