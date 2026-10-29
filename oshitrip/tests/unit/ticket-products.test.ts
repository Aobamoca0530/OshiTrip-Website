import { describe, expect, it } from 'vitest';
import { validateTicketProduct, releaseFromTicketProduct } from '../../scripts/crawler/ticket-products.mjs';
import { releaseFranchiseGroups } from '../../src/lib/franchises';
import { liveLotteryItems } from '../../src/lib/live-lotteries';
import { announcementsSchema } from '../../src/lib/announcements';
import { catalogSchema } from '../../src/lib/schema';
import { releasesSchema } from '../../src/lib/releases';
import records from '../../scripts/crawler/verified-ticket-products.json';
import rawCatalog from '../../src/data/catalog.json';
import rawNews from '../../src/data/announcements.json';
import rawReleases from '../../src/data/releases.json';
const catalog=catalogSchema.parse(rawCatalog);
const record=records[0];
const observation={source_url:record.product.source_url,content_hash:record.product.source_hash,body_text:[record.product.product_evidence_ja,...record.product.lotteries.flatMap(l=>[l.evidence_ja,l.schedule_evidence_ja]),...record.review.evidence_ja].join('\n')};

describe('source-bound ticket products',()=>{
  it('requires a fresh fingerprint and actual continuous source quotes',()=>{
    expect(validateTicketProduct(record,observation,catalog.franchises).product.id).toBe(record.product.id);
    expect(()=>validateTicketProduct(record,{...observation,content_hash:'f'.repeat(64)},catalog.franchises)).toThrow(/指纹/);
    expect(()=>validateTicketProduct(record,{...observation,body_text:''},catalog.franchises)).toThrow(/原文/);
    const bad=structuredClone(record);bad.review.evidence_ja=['伪造原文'];
    expect(()=>validateTicketProduct(bad,observation,catalog.franchises)).toThrow(/原文/);
  });
  it('rejects a Day2 date applied to a Day1 voucher and non-Japan timestamps',()=>{
    const wrongDay=structuredClone(record);wrongDay.product.lotteries[0].live_dates=['2027-03-07'];
    expect(()=>validateTicketProduct(wrongDay,observation,catalog.franchises)).toThrow(/不对应/);
    const wrongZone=structuredClone(record);wrongZone.product.lotteries[0].opens_at='2026-11-18T12:00:00+08:00';
    expect(()=>validateTicketProduct(wrongZone,observation,catalog.franchises)).toThrow(/时区/);
  });
  it('keeps rejected candidates unpublished and unknown price/stock empty',()=>{
    const rejected=structuredClone(record);rejected.review.approved=false;
    const release=releaseFromTicketProduct(rejected,catalog);
    expect(release.status).toBe('review');expect(release.editions[0].price_yen).toBeNull();expect(release.offers).toEqual([]);
  });
  it('groups child IPs once and keeps multi-series products in a shared group',()=>{
    const rows=[{id:'li',franchise_ids:['lovelive','liella']},{id:'hasu',franchise_ids:['hasunosora']},{id:'cross',franchise_ids:['lovelive','bang-dream']}];
    const groups=releaseFranchiseGroups(rows,catalog.franchises);
    expect(groups.map(g=>g.id)).toEqual(['liella','hasunosora','cross-series']);
    expect(groups.flatMap(g=>g.products)).toHaveLength(3);
  });
  it('includes previously collected Live news, separates pending facts and links voucher products',()=>{
    const items=liveLotteryItems(announcementsSchema.parse(rawNews),catalog.events,releasesSchema.parse(rawReleases));
    const liella=items.find(i=>i.url.endsWith('p=8thlivetour'))!;
    expect(liella.products).toHaveLength(2);
    expect(items.some(i=>i.franchise_ids.includes('starlight'))).toBe(true);
    expect(items.some(i=>i.franchise_ids.includes('gakuen-idolmaster'))).toBe(true);
    expect(items.find(i=>i.url.endsWith('_id=3rdLIVE'))?.pending).toBe(true);
  });
});
