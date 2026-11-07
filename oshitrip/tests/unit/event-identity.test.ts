import {it,expect} from 'vitest';
import {eventIdentityLinks, withdrawAutomaticEvent} from '../../scripts/crawler/event-identity.mjs';
import {mergeAnnouncements} from '../../scripts/crawler/public-news.mjs';
import {eventFromReading, pendingActivity} from '../../scripts/crawler/event-intelligence.mjs';
import {announcementSchema} from '../../src/lib/announcements';
it('keeps cross-linked concert days separate while allowing news to point at a detail',()=>{
  const day1='https://bang-dream.com/events/13th-live-day1/';
  expect(eventIdentityLinks({source_url:'https://bang-dream.com/events/13th-live-day2/',event_links:[day1]})).toEqual([]);
  expect(eventIdentityLinks({source_url:'https://bang-dream.com/news/1234/',event_links:[day1]})).toEqual([day1]);
});

it('preserves published links across serialized collect-only, pending and approved replay runs', () => {
  const stamp = '2026-11-07T14:00:00Z';
  const observation = {source_url:'https://bang-dream.com/events/tour/',title:'Tour',content_hash:'a'.repeat(64),images:[]};
  const reading = {title_zh:'巡演',summary_zh:'已核对的巡演',kind:'live',rules:[],franchise_ids:['roselia'],cancelled:false,
    booking:{method:'抽选报名',opens_at:null,closes_at:'2026-12-07T23:59:00+09:00',note_zh:'新规则'},
    venues:[{city:'东京',name:'会场',start_date:'2027-01-30',end_date:'2027-01-30'}]};
  const event = eventFromReading(reading, observation, [], stamp, undefined);
  event.slug = 'curated-tour';
  event.venues[0].id = 'curated-tokyo';
  event.venues[0].rounds[0].note = '过时的报名规则';
  const catalog = {events:[event]};
  const batch = [{source:{id:'bang-dream-live'},observation}];
  let [row] = mergeAnnouncements([], batch, catalog, stamp);
  withdrawAutomaticEvent(catalog, row);
  row.activity = pendingActivity(observation, 'live', '等待复核');
  expect(catalog.events).toEqual([]);
  expect(JSON.stringify(row.event_identity)).not.toContain('过时的报名规则');

  // Recreate both saved JSON files as subsequent processes would read them.
  for (let attempt = 0; attempt < 2; attempt++) {
    [row] = mergeAnnouncements(JSON.parse(JSON.stringify([row])), batch, JSON.parse(JSON.stringify(catalog)), stamp);
    const identity = withdrawAutomaticEvent(catalog, row);
    expect(identity).toMatchObject({id:event.id,slug:'curated-tour',venues:[{id:'curated-tokyo'}]});
    expect(catalog.events).toEqual([]);
  }
  expect(announcementSchema.parse(row)).not.toHaveProperty('event_identity');
  const approved = eventFromReading(reading, observation, [], stamp, withdrawAutomaticEvent(catalog, row));
  expect(approved.id).toBe(event.id);
  expect(approved.slug).toBe('curated-tour');
  expect(approved.venues[0].id).toBe('curated-tokyo');
  expect(approved.venues[0].rounds[0].note).toBe('新规则');
  expect(approved.venues[0].rounds[0].closes_at).toBe('2026-12-07T23:59:00+09:00');
});

it('does not withdraw curated events or reuse identities from a different source', () => {
  const catalog = {events:[{id:'curated',sources:[{url:'https://example.com/event'}]},
    {id:'auto-other',sources:[{url:'https://example.com/other'}]}]};
  const row = {source_url:'https://example.com/event'};
  expect(withdrawAutomaticEvent(catalog, row)).toBeUndefined();
  expect(catalog.events).toHaveLength(2);
});
