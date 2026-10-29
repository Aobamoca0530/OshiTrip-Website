import { z } from "zod";
import bundled from "../../data/public-v4.json";
import { publicDataSchema, MAX_DATA_BYTES, PUBLIC_DATA_URL } from "@/lib/public-data-schema";
const envelope = z.object({ formatVersion: z.literal(4), revision: z.string().regex(/^[a-f0-9]{64}$/), publishedAt: z.iso.datetime({ offset: true }), data: publicDataSchema }).strict();
export type MobileBundle = z.infer<typeof envelope>;
export const initialBundle = envelope.parse(bundled);
const cacheKey = "oshitrip.public.v4";
export async function validateBundle(input: unknown) {
  const bundle = envelope.parse(input);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(bundle.data)));
  const checksum = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  if (checksum !== bundle.revision) throw new Error("checksum");
  return bundle;
}
export async function cachedBundle() {
  try {
    const text = localStorage.getItem(cacheKey);
    if (text && text.length <= MAX_DATA_BYTES) {
      const cache = await validateBundle(JSON.parse(text));
      if (Date.parse(cache.publishedAt) >= Date.parse(initialBundle.publishedAt)) return cache;
    }
  } catch { /* An invalid or unavailable cache must not prevent offline launch. */ }
  return initialBundle;
}
export async function refreshBundle(current: MobileBundle, signal?: AbortSignal) {
  const response = await fetch(PUBLIC_DATA_URL, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("network");
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_DATA_BYTES) throw new Error("size");
  const next = await validateBundle(JSON.parse(text));
  if (Date.parse(next.publishedAt) < Date.parse(current.publishedAt)) return { bundle: current, saved: true };
  let saved = true;
  try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { saved = false; }
  return { bundle: next, saved };
}
