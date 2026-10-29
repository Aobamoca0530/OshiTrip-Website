import { z } from "zod";

export const categories = [
  "联动咖啡厅",
  "快闪店",
  "主题展览",
  "音乐和声优活动",
  "其他联动",
] as const;
export const methods = [
  "先着预约",
  "抽选报名",
  "当日整理券",
  "无需预约",
  "官方 App 预约",
  "尚未公布",
] as const;
export const cities = [
  "东京",
  "大阪",
  "名古屋",
  "京都",
  "神户",
  "广岛",
  "町田",
  "埼玉",
  "仙台",
  "横滨",
  "札幌",
  "福冈",
  "金泽",
  "沼津",
  "千叶",
  "常滑",
  "所泽",
  "牛久",
  "加贺",
  "松山",
  "新潟",
  "福井",
  "盛冈",
] as const;

// All entry points use the same list; newly verified venues also become choices.
export function cityChoices(events: { venues: { city: string }[] }[]) {
  return [...new Set([...cities, ...events.flatMap(event => event.venues.map(venue => venue.city))])];
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "日期无效",
  );
export const urlSchema = z
  .url()
  .refine((s) => new URL(s).protocol === "https:", "必须使用 HTTPS 官方链接");
export const officialImageSchema = z.object({
  url: urlSchema.refine((s) => {
    const u = new URL(s);
    return !u.username && !u.password;
  }, "图片地址不能包含凭据"),
  alt: z.string().min(1).max(500),
  source_url: urlSchema,
  checked_on: dateSchema.nullable(),
});
export type OfficialImage = z.infer<typeof officialImageSchema>;
export const translatedRuleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["参加", "点单", "购买", "特典", "预约", "其他"]),
  title: z.string().min(1).max(120),
  text_zh: z.string().min(1).max(2000),
  evidence_ja: z.string().max(2000),
  source_url: urlSchema,
  image_url: urlSchema.nullable(),
  image_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  checked_on: dateSchema.nullable(),
});
export const benefitSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    rule: z.string().min(1),
    threshold_yen: z.number().int().positive().nullable(),
    threshold_quantity: z.number().int().positive().nullable(),
    channel: z.enum(["门店", "通販", "门店及通販"]),
    scope: z.string().min(1),
    venue_ids: z.array(z.string()),
    starts_on: dateSchema.nullable(),
    ends_on: dateSchema.nullable(),
    selection: z.enum(["随机", "可选", "固定", "未说明"]),
    receipt_combination: z.enum(["不可合并", "可合并", "未说明"]),
    while_supplies_last: z.boolean().nullable(),
    image: officialImageSchema.nullable(),
    source_url: urlSchema,
    checked_on: dateSchema.nullable(),
  })
  .refine(
    (b) => !b.starts_on || !b.ends_on || b.starts_on <= b.ends_on,
    "特典日期无效",
  );
export const franchiseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  parent_id: z.string().nullable(),
});
export const roundSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    method: z.enum(methods),
    kind: z.enum(["rolling", "fixed", "none", "unannounced", "unknown"]),
    opens_at: z.iso.datetime({ offset: true }).nullable(),
    closes_at: z.iso.datetime({ offset: true }).nullable(),
    days_before: z.number().int().min(0).max(365).nullable(),
    open_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    cutoff_days_before: z.number().int().min(0).max(365).nullable(),
    cutoff_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    url: urlSchema.nullable(),
    note: z.string(),
  })
  .superRefine((r, ctx) => {
    if (
      r.kind === "rolling" &&
      (r.days_before === null ||
        r.cutoff_days_before === null ||
        !r.cutoff_time ||
        r.days_before < r.cutoff_days_before)
    )
      ctx.addIssue({
        code: "custom",
        message: "滚动预约需要完整、合理的提前天数和截止时间",
      });
    if (
      r.opens_at &&
      r.closes_at &&
      Date.parse(r.opens_at) > Date.parse(r.closes_at)
    )
      ctx.addIssue({ code: "custom", message: "报名开始不能晚于截止" });
  });
export const venueSchema = z
  .object({
    id: z.string().min(1),
    city: z.string().min(1),
    name: z.string().min(1),
    address: z.string().nullable(),
    official_url: urlSchema.nullable().optional(),
    start_date: dateSchema,
    end_date: dateSchema,
    rounds: z.array(roundSchema),
  })
  .refine((v) => v.start_date <= v.end_date, "门店开始日期不能晚于结束日期");
export const eventSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title_ja: z.string().min(1),
    title_zh: z.string().min(1),
    category: z.enum(categories),
    summary: z.string(),
    image: officialImageSchema.nullable().optional(),
    gallery: z.array(officialImageSchema).max(40).optional(),
    benefits: z.array(benefitSchema).max(40).optional(),
    translated_rules: z.array(translatedRuleSchema).max(60).optional(),
    fees: z.string().nullable(),
    conditions: z.array(z.string()),
    status: z.enum(["draft", "review", "published", "cancelled", "archived"]),
    verified_at: z.iso.datetime({ offset: true }).nullable(),
    updated_at: z.iso.datetime({ offset: true }),
    franchise_ids: z.array(z.string()).min(1),
    venues: z.array(venueSchema).min(1),
    sources: z
      .array(
        z.object({
          id: z.string().min(1),
          url: urlSchema,
          label: z.string().min(1),
          checked_at: z.iso.datetime({ offset: true }).nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((e, ctx) => {
    const evidence = [
      ...(e.gallery || []),
      ...(e.benefits || []),
      ...(e.translated_rules || []),
      ...(e.benefits || []).flatMap((b) => (b.image ? [b.image] : [])),
    ];
    const assets = [
      e.image,
      ...(e.gallery || []),
      ...(e.benefits || []).map((b) => b.image),
    ].filter(Boolean);
    if (
      e.translated_rules?.some(
        (r) =>
          r.image_url &&
          (!assets.some(
            (a) => a!.url === r.image_url && a!.source_url === r.source_url,
          ) ||
            !r.image_sha256),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "图片译文必须关联本活动原图和图片内容指纹",
      });
    if (
      evidence.some(
        (item) =>
          !e.sources.some((s) => s.url === item.source_url) ||
          (e.status === "published" && !item.checked_on),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "特典和图片需要已关联来源及发布前核实日期",
      });
    if (
      e.benefits?.some((b) =>
        b.venue_ids.some((id) => !e.venues.some((v) => v.id === id)),
      )
    )
      ctx.addIssue({ code: "custom", message: "特典引用了不属于此活动的门店" });
    if (
      e.image &&
      (!e.sources.some((s) => s.url === e.image!.source_url) ||
        (e.status === "published" && !e.image.checked_on))
    )
      ctx.addIssue({
        code: "custom",
        message: "活动图片需要已关联来源及发布前核实日期",
      });
    if (
      e.status === "published" &&
      (!e.verified_at || !e.sources.some((s) => s.checked_at))
    )
      ctx.addIssue({
        code: "custom",
        message: "发布前需要核实时间和已核实官方来源",
      });
    for (const ids of [
      e.venues.map((v) => v.id),
      e.venues.flatMap((v) => v.rounds.map((r) => r.id)),
      e.sources.map((s) => s.id),
      (e.benefits || []).map((b) => b.id),
      (e.translated_rules || []).map((r) => r.id),
    ]) {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: "custom", message: "记录 ID 不能重复" });
    }
  });
export const catalogSchema = z
  .object({
    franchises: z.array(franchiseSchema),
    events: z.array(eventSchema),
  })
  .superRefine((c, ctx) => {
    const ids = new Set(c.franchises.map((f) => f.id));
    for (const e of c.events)
      if (e.franchise_ids.some((id) => !ids.has(id)))
        ctx.addIssue({ code: "custom", message: "活动引用了不存在的 IP" });
  });
export type Franchise = z.infer<typeof franchiseSchema>;
export type OshiEvent = z.infer<typeof eventSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export const tripSchema = z
  .object({
    start: z.union([dateSchema, z.literal("")]),
    end: z.union([dateSchema, z.literal("")]),
    stays: z.array(
      z
        .object({
          id: z.string(),
          city: z.string().min(1),
          start: dateSchema,
          end: dateSchema,
        })
        .refine((s) => s.start <= s.end, "城市停留结束日不能早于开始日"),
    ),
    plans: z.array(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        city: z.string().min(1),
        date: dateSchema,
        place: z.string(),
      }),
    ),
    venue_ids: z.array(z.string()),
  })
  .superRefine((t, ctx) => {
    if (t.start && t.end && t.start > t.end)
      ctx.addIssue({ code: "custom", message: "旅行结束日不能早于开始日" });
    if (t.stays.length && (!t.start || !t.end))
      ctx.addIssue({ code: "custom", message: "请先填写完整旅行日期" });
    if (t.stays.some((s) => s.start < t.start || s.end > t.end))
      ctx.addIssue({ code: "custom", message: "城市停留日期需要在旅行范围内" });
    if (
      t.plans.some(
        (p) => !t.start || !t.end || p.date < t.start || p.date > t.end,
      )
    )
      ctx.addIssue({ code: "custom", message: "已有安排需要在旅行日期内" });
  });
export type Trip = z.infer<typeof tripSchema>;
