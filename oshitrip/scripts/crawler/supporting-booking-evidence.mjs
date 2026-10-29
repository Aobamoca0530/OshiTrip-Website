import { createHash } from 'node:crypto';
import { z } from 'zod';
import records from './verified-booking-evidence.json' with { type: 'json' };

export const supportingBookingEvidenceSchema = z.object({
  primary_url: z.url(), primary_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source_url: z.url(), checked_at: z.iso.datetime({offset:true}),
  method: z.enum(['抽选报名', '先着预约']),
  primary_booking_evidence_ja: z.string().min(1).max(2000),
  excerpt_ja: z.string().min(1).max(2000), excerpt_hash: z.string().regex(/^[a-f0-9]{64}$/),
  approved: z.literal(true), reason: z.string().min(1).max(500),
});

// Curated by a human reviewer after reading the official ticket page. This is
// a bounded excerpt fingerprint, never a claim that the full page was archived.
// It confirms only the method; venue, dates and times still need primary evidence.
export function confirmedBookingMethods(observation, candidates = records) {
  return candidates.filter(p=>p.primary_url===observation.source_url && p.primary_hash===observation.content_hash).map(p=>{
    const proof=supportingBookingEvidenceSchema.parse(p), url=new URL(proof.source_url);
    const normalized=value=>value.normalize('NFKC').replace(/\s+/g,'');
    if(!normalized(observation.body_text).includes(normalized(proof.primary_booking_evidence_ja))) throw new Error('补充证据未绑定本页报名轮次');
    if(url.protocol!=='https:' || url.hostname!=='eplus.jp' || url.username || url.password) throw new Error('补充票务出处不在已审查官方平台范围');
    if(createHash('sha256').update(proof.excerpt_ja).digest('hex')!==proof.excerpt_hash) throw new Error('补充票务原句指纹不符');
    if(!(proof.method==='抽选报名'?/抽選/:/先着/).test(proof.excerpt_ja)) throw new Error('补充原句没有明确报名方式');
    return proof;
  });
}
