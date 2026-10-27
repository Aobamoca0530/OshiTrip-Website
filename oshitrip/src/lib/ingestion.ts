// Future source adapters must pass a documented authorization review before fetching.
// Release crawler and daily workflow live in scripts/crawler; source permission gates remain enforced.
import { createHash } from "node:crypto";
import { z } from "zod";
import { dateSchema, urlSchema } from "./schema";
export const candidateSchema = z.object({
  source_url: urlSchema,
  title_ja: z.string().min(1),
  franchise_ids: z.array(z.string()),
  venues: z.array(
    z
      .object({
        city: z.string().nullable(),
        name: z.string().nullable(),
        start_date: dateSchema.nullable(),
        end_date: dateSchema.nullable(),
      })
      .refine(
        (v) => !v.start_date || !v.end_date || v.start_date <= v.end_date,
        "日期顺序错误",
      ),
  ),
  method: z.string().nullable(),
  opens_at: z.iso.datetime({ offset: true }).nullable(),
  closes_at: z.iso.datetime({ offset: true }).nullable(),
  conditions: z.array(z.string()),
});
export type Candidate = z.infer<typeof candidateSchema>;
export interface SourceAdapter {
  name: string;
  policy: {
    permission: "approved" | "unreviewed" | "denied";
    terms_url: string;
    robots_checked_at: string | null;
    authorization_note: string;
  };
  discover(): Promise<unknown[]>;
}
export interface ReviewSink {
  start(adapter: string): Promise<string>;
  enqueue(candidate: Candidate, fingerprint: string): Promise<void>; // upsert/ignore by unique fingerprint; status must remain pending
  finish(
    id: string,
    status: "success" | "failed" | "blocked",
    error?: string,
  ): Promise<void>;
}
export function fingerprint(c: Candidate) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        new URL(c.source_url).origin + new URL(c.source_url).pathname,
        c.title_ja,
        [...c.venues].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        ),
        c.method,
        c.opens_at,
        c.closes_at,
        c.conditions,
      ]),
    )
    .digest("hex");
}
export async function discoverToReview(
  adapter: SourceAdapter,
  sink: ReviewSink,
) {
  const id = await sink.start(adapter.name);
  if (
    adapter.policy.permission !== "approved" ||
    !adapter.policy.robots_checked_at ||
    !adapter.policy.authorization_note
  ) {
    await sink.finish(
      id,
      "blocked",
      "尚未确认站点条款、robots 与访问授权；未发起获取。",
    );
    return;
  }
  try {
    const candidates = (await adapter.discover()).map((x) =>
      candidateSchema.parse(x),
    );
    for (const c of candidates) await sink.enqueue(c, fingerprint(c));
    await sink.finish(id, "success");
  } catch (e) {
    await sink.finish(
      id,
      "failed",
      e instanceof Error ? e.message : "未知获取错误",
    );
  }
}
