import { createHash } from "node:crypto";
import { z } from "zod";
import { publicDataSchema, type PublicData } from "./public-data-schema";
export * from "./public-data-schema";
export { buildSourceStatus, sourceStatusSchema } from "./source-status";
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
