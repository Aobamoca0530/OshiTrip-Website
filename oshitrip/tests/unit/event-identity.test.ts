import {it,expect} from 'vitest';
import {eventIdentityLinks} from '../../scripts/crawler/event-identity.mjs';
it('keeps cross-linked concert days separate while allowing news to point at a detail',()=>{
  const day1='https://bang-dream.com/events/13th-live-day1/';
  expect(eventIdentityLinks({source_url:'https://bang-dream.com/events/13th-live-day2/',event_links:[day1]})).toEqual([]);
  expect(eventIdentityLinks({source_url:'https://bang-dream.com/news/1234/',event_links:[day1]})).toEqual([day1]);
});
