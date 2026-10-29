import { describe, expect, it } from 'vitest';
import { discoveryReport, officialGallery, prioritizeDiscovery, syncApprovedGallery, useManualReading } from '../../scripts/crawler/discovery-promotion.mjs';
import { explicitDates, validateReading } from '../../scripts/crawler/event-intelligence.mjs';
import verified from '../../scripts/crawler/verified-readings.json';
import catalog from '../../src/data/catalog.json';

const url = 'https://example.com/event';
const images = [{url:'https://example.com/a.jpg',alt:'海报'}, {url:'https://example.com/b.jpg',alt:'商品图'}];
const stamp = '2026-10-29T10:00:00Z';
const ready = { source_url: url, images, related_event_ids:['e'], activity:{state:'ready',review:{state:'approved'},source_hash:'hash'} };

describe('reviewed multi-image discovery', () => {
  it('lets AI complete partial manual summaries and keeps subsequent approved results during outages', () => {
    const override={source_hash:'h',reading:{uncertain:true}};
    const partial=()=>({ready:false});
    expect(useManualReading(override,'h',true,false,partial)).toBe(false);
    expect(useManualReading(override,'h',false,true,partial)).toBe(false);
    expect(useManualReading(override,'h',false,false,partial)).toBe(true);
    expect(useManualReading({...override,review:{approved:false}},'h',true,true,partial)).toBe(true);
    expect(useManualReading(override,'changed',false,false,()=>({ready:true}))).toBe(false);
    expect(useManualReading(override,'h',true,true,()=>({ready:true}))).toBe(true);
  });
  it('keeps distinct official pictures and provenance without claiming OCR', () => {
    expect(officialGallery([...images,images[0]],url,stamp)).toEqual(images.map(image=>({...image,source_url:url,checked_on:'2026-10-29'})));
  });
  it('never promotes because there are several pictures', () => {
    const row = {...ready, activity:{state:'needs_review',review:{state:'approved'},reason:'日期不全'}};
    const event = {id:'e',status:'published',sources:[{url}],gallery:[]};
    expect(syncApprovedGallery(event,row,stamp)).toBe(false);
    const report=discoveryReport([row],[{observation:{source_url:url}}],{events:[event]},[],stamp);
    expect(report).toMatchObject({published:0,promoted:0,pending:1,image_text_verified:false});
  });
  it('requires independent approval even when an activity says ready', () => {
    expect(syncApprovedGallery({sources:[{url}]},{...ready,activity:{state:'ready',review:{state:'rejected'}}},stamp)).toBe(false);
  });
  it('repairs cached galleries idempotently and preserves other source pictures', () => {
    const other={url:'https://other.test/photo.jpg',alt:'已核实',source_url:'https://other.test/event',checked_on:'2026-10-20'};
    const event={sources:[{url}],gallery:[other],image:images[0]};
    expect(syncApprovedGallery(event,ready,stamp)).toBe(true);
    expect(event.gallery).toHaveLength(3);
    expect(event.gallery[0]).toEqual(other);
    expect(syncApprovedGallery(event,ready,stamp)).toBe(false);
    expect(syncApprovedGallery({sources:[],gallery:[]},ready,stamp)).toBe(false);
  });
  it('does not count failed-source retention or unlinked ready records as published this run', () => {
    const event={id:'e',status:'published'};
    expect(discoveryReport([ready],[],{events:[event]},[],stamp).items[0]).toMatchObject({state:'source_unavailable',newly_promoted:false});
    expect(discoveryReport([ready],[{observation:{source_url:url}}],{events:[]},[],stamp).published).toBe(0);
    const report=discoveryReport([ready],[{observation:{source_url:url}}],{events:[event]},[],stamp);
    expect(report.promoted).toBe(1);
    expect(discoveryReport([ready],[{observation:{source_url:url}}],{events:[event]},[ready],stamp).promoted).toBe(0);
  });
  it('prioritizes incomplete multi-image pages, counting unique image URLs', () => {
    const rows=[ready,{...ready,source_url:'pending',activity:{state:'needs_review'}},{...ready,source_url:'single',images:[images[0],images[0]],activity:{state:'needs_review'}}];
    const observations=rows.map(row=>({observation:{source_url:row.source_url,images:row.images,content_hash:'hash'}}));
    expect(prioritizeDiscovery(observations,rows).map(row=>row.observation.source_url)).toEqual(['pending','single',url]);
  });
  it('reads spaced Japanese date ranges without inventing a year', () => {
    expect(explicitDates('2026 年11 月18 日(水)～12 月8 日(火)')).toEqual(['2026-11-18','2026-12-08']);
    expect(explicitDates('11 月18 日～12 月8 日')).toEqual([]);
    expect(explicitDates('2026 年12 月23 日～2027 年1 月5 日')).toEqual(['2026-12-23','2027-01-05']);
  });
  it('preserves cafe branch periods and excludes the closed GiGO Okayama branch', () => {
    const r=verified['https://www.sweets-paradise.jp/collaboration/ournotes'].reading;
    const body=[...r.rules.map(rule=>rule.evidence_ja),...r.venues.map(v=>v.evidence_ja),r.booking.evidence_ja].join('\n');
    expect(validateReading(r,{source_url:url,body_text:body},catalog.franchises).ready).toBe(true);
    expect(r.venues).toHaveLength(9);
    expect(r.venues.find(v=>v.city==='广岛')?.end_date).toBe('2026-11-19');
    const gigo=verified['https://www.lovelive-anime.jp/nijigasaki/detail.php?p=01_6557'].reading;
    expect(gigo.venues.some(v=>v.name.includes('岡山'))).toBe(false);
    expect(gigo.venues[0].booking?.method).toBe('尚未公布');
    expect(gigo.venues.slice(1).every(v=>v.booking?.method==='无需预约' && v.booking.note_zh.includes('整理券'))).toBe(true);
  });
});
