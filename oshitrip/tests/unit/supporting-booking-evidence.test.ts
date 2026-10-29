import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { confirmedBookingMethods } from '../../scripts/crawler/supporting-booking-evidence.mjs';
describe('supplemental official booking method evidence',()=>{
  const observation={source_url:'https://bang-dream.com/events/example/',content_hash:'a'.repeat(64),body_text:'プレイガイド二次先行'};
  const excerpt='抽選2次プレオーダー受付';
  const proof={primary_url:observation.source_url,primary_hash:observation.content_hash,primary_booking_evidence_ja:observation.body_text,source_url:'https://eplus.jp/example/',checked_at:'2026-10-29T13:00:00Z',method:'抽选报名',excerpt_ja:excerpt,excerpt_hash:createHash('sha256').update(excerpt).digest('hex'),approved:true,reason:'独立核对官方售票页'};
  it('binds the checked excerpt to the exact primary page revision',()=>{
    expect(confirmedBookingMethods(observation,[proof])).toHaveLength(1);
    expect(confirmedBookingMethods({...observation,content_hash:'b'.repeat(64)},[proof])).toHaveLength(0);
    expect(confirmedBookingMethods({...observation,source_url:'https://bang-dream.com/events/another/'},[proof])).toHaveLength(0);
  });
  it('rejects tampered evidence and unofficial sources',()=>{
    expect(()=>confirmedBookingMethods(observation,[{...proof,excerpt_ja:'先着'}])).toThrow('指纹');
    expect(()=>confirmedBookingMethods(observation,[{...proof,source_url:'https://eplus.jp.evil.test/'}])).toThrow('出处');
    expect(()=>confirmedBookingMethods(observation,[{...proof,method:'先着预约'}])).toThrow('报名方式');
    expect(()=>confirmedBookingMethods(observation,[{...proof,primary_booking_evidence_ja:'另一个轮次'}])).toThrow('报名轮次');
  });
});
