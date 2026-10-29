import { createHash } from 'node:crypto';
import { z } from 'zod';
import { imageReadingSchema } from './image-rules.mjs';

// Operator-only ledger: a model proposal must never write its own approval.
export const verifiedImageSchema = z.object({
  source_url: z.url({ protocol: /^https$/ }), source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  url: z.url({ protocol: /^https$/ }), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed_at: z.iso.datetime({ offset: true }), approved: z.boolean(),
  reason: z.string().min(1).max(500), reading: imageReadingSchema,
});

export function verifiedImage(record, row, observation, attempt) {
  const parsed = verifiedImageSchema.safeParse(record);
  if (!parsed.success || !observation) return null;
  const r = parsed.data;
  if (!r.approved || r.source_url !== row.source_url || r.source_hash !== observation.content_hash
    || !row.images.some(image => image.url === r.url) || r.reading.unreadable
    || r.reading.rules.some(rule => rule.uncertain) || Date.parse(r.reviewed_at) > Date.now()) return null;
  // A changed download invalidates the old image approval even at the same URL.
  if (attempt?.sha256 && attempt.sha256 !== r.sha256) return null;
  if (attempt?.status === 'failed') return null;
  return r;
}

export function syncVerifiedImageRules(catalog, announcements, observations, records, attempts) {
  for (const { observation } of observations) {
    const row = announcements.find(item => item.source_url === observation.source_url);
    if (!row) continue;
    for (const event of catalog.events.filter(event => event.sources.some(source => source.url === row.source_url))) {
      const kept = (event.translated_rules || []).filter(rule => !(rule.id.startsWith('verified-image-') && rule.source_url === row.source_url));
      const rules = row.activity?.state === 'ready' && row.activity?.review?.state === 'approved'
        ? records.filter(record => record.source_url === row.source_url).flatMap(record => {
          const attempt = attempts.find(item => item.source_url === row.source_url && item.url === record.url);
          const verified = verifiedImage(record, row, observation, attempt);
          const assets = [event.image, ...(event.gallery || [])].filter(Boolean);
          if (!verified || !assets.some(asset => asset.url === record.url && asset.source_url === row.source_url)) return [];
          return verified.reading.rules.map(({ uncertain, ...rule }, index) => {
            void uncertain;
            return { ...rule, id: `verified-image-${createHash('sha256').update(`${row.source_url}:${record.url}:${index}`).digest('hex').slice(0, 20)}`,
              source_url: row.source_url, image_url: record.url, image_sha256: record.sha256, checked_on: record.reviewed_at.slice(0, 10) };
          });
        }) : [];
      // Dates and booking rounds are never set from image evidence here.
      if (event.translated_rules || rules.length) event.translated_rules = [...kept, ...rules].slice(0, 60);
    }
  }
}
