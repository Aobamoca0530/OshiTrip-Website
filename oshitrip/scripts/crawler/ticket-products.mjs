import { z } from 'zod';
import { containsEvidence, explicitDates, reviewSchema, timeInEvidence } from './event-intelligence.mjs';

const quote = z.string().min(1).max(4000);
const date = z.iso.date();
export const ticketProductSchema = z.object({
  id: z.string().regex(/^ticket-[a-z0-9-]+$/),
  source_url: z.url({ protocol: /^https$/ }),
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  title_ja: z.string().min(1).max(500),
  franchise_ids: z.array(z.string()).min(1).max(20),
  release_on: date.nullable(),
  edition_ja: z.string().min(1).max(300).nullable(),
  summary_zh: z.string().min(1).max(2000),
  qualification_zh: z.string().min(1).max(2000),
  product_evidence_ja: quote,
  lotteries: z.array(z.object({
    title_zh: z.string().min(1).max(500),
    venue_ja: z.string().min(1).max(300),
    live_dates: z.array(date).min(1).max(10),
    performance_day: z.string().regex(/^Day\.[1-9]$/).nullable(),
    opens_at: z.iso.datetime({ offset: true }).nullable(),
    closes_at: z.iso.datetime({ offset: true }).nullable(),
    conditions_zh: z.array(z.string().min(1).max(2000)).min(1).max(15),
    evidence_ja: quote,
    schedule_evidence_ja: quote,
  })).min(1).max(30),
});
export const verifiedTicketProductSchema = z.object({
  product: ticketProductSchema,
  review: reviewSchema,
  reviewed_at: z.iso.datetime({ offset: true }),
});
export const TICKET_PRODUCT_INSTRUCTIONS = '从官方正文提取明确附现场Live抽选申込券的商品。商品名保留原文，发行日期与现场日期分开；按每站、Day1/Day2、商品版本、申请轮次逐项记录，所有时间为+09:00。商品、版本、场地、日期、报名时段分别附连续原句。没有版号/价格/店铺依据时不要编造；一般抽选或先着售票不能伪造附券商品。图片只取官方正文图片，演出海报不能冒充商品封面。候选必须另行对照原文审核，source_hash绑定正文，变化即失效。';

export function validateTicketProduct(input, observation, franchises) {
  const record = verifiedTicketProductSchema.parse(input), p = record.product;
  if (p.source_url !== observation.source_url || p.source_hash !== observation.content_hash) throw new Error('附券商品正文指纹已变化');
  if (!p.franchise_ids.every(id => franchises.some(f => f.id === id))) throw new Error('附券商品引用未知IP');
  const quotes = [p.product_evidence_ja, ...p.lotteries.flatMap(l => [l.evidence_ja, l.schedule_evidence_ja]), ...record.review.evidence_ja];
  if (!quotes.every(q => containsEvidence(observation.body_text, q))) throw new Error('附券商品或审核证据不在原文');
  if (!containsEvidence(p.product_evidence_ja, p.title_ja) || (p.edition_ja && !containsEvidence(p.product_evidence_ja, p.edition_ja)) || !/封入|申込券|シリアル/.test(p.product_evidence_ja)) throw new Error('商品与附券版本缺少依据');
  if (p.release_on && !explicitDates(p.product_evidence_ja).includes(p.release_on)) throw new Error('商品发售日缺少依据');
  for (const l of p.lotteries) {
    if (!containsEvidence(l.schedule_evidence_ja, l.venue_ja) || !l.live_dates.every(d => explicitDates(l.schedule_evidence_ja).includes(d))) throw new Error('Live日期或场地缺少依据');
    if (l.performance_day) {
      const day = l.performance_day.replace('.', '\\.');
      const scope = new RegExp(`${day}(?![0-9])`);
      const dayDates = [...l.schedule_evidence_ja.matchAll(new RegExp(`${day}\\s*[：:]?\\s*(20\\d{2}年\\d{1,2}月\\d{1,2}日)`, 'g'))].flatMap(m => explicitDates(m[1]));
      if (!scope.test(p.product_evidence_ja) || !l.live_dates.every(d => dayDates.includes(d))) throw new Error('附券Day与演出日期不对应');
    }
    if (!/抽選/.test(l.evidence_ja) || !timeInEvidence(l.opens_at, l.evidence_ja) || !timeInEvidence(l.closes_at, l.evidence_ja) || (l.opens_at && l.closes_at && l.opens_at > l.closes_at)) throw new Error('抽选时间或时区缺少依据');
  }
  return record;
}

export function releaseFromTicketProduct(record, catalog) {
  const p = record.product, checked = record.reviewed_at.slice(0, 10);
  const event = catalog.events.find(e => e.status === 'published' && e.sources.some(s => s.url === p.source_url));
  return {
    id: p.id, slug: p.id, title: p.title_ja, franchise_ids: p.franchise_ids, release_on: p.release_on,
    summary: p.summary_zh, status: record.review.approved ? 'published' : 'review', updated_at: record.reviewed_at,
    editions: [{ id: 'enclosed-ticket', label: p.edition_ja || '附申込券版本（具体版号未核实）', sku: '', price_yen: null, eligibility: p.qualification_zh }],
    lotteries: p.lotteries.map((l, i) => ({ id: `${p.id}-${i}`, title: l.title_zh, edition_ids: ['enclosed-ticket'], event_slug: event?.slug || null,
      live_dates: l.live_dates, venue: l.venue_ja, window: { opens_on: null, opens_at: l.opens_at, closes_at: l.closes_at, note: '本轮为商品附券抽选；购入商品不保证中选。时间均为日本时间。' },
      conditions: [p.qualification_zh, ...l.conditions_zh], source_url: p.source_url })),
    offers: [], campaigns: [], sources: [{ label: '官方Live页面 · 附券商品与场次已复核', url: p.source_url, checked_on: checked }],
  };
}
