import { describe, expect, it } from 'vitest';
import { allowedUrl, crawlSource, extractObservation } from '../../scripts/crawler/core.mjs';
import { classifyAnnouncement, classifyOffline } from '../../scripts/crawler/offline-filter.mjs';
import { deduplicateSeriesNews } from '../../scripts/crawler/lovelive-news.mjs';
import { createProjectFilter } from '../../scripts/crawler/project-filter.mjs';
import sources from '../../scripts/crawler/sources.json';
import keywords from '../../scripts/crawler/project-keywords.json';
import { cityChoices } from '../../src/lib/schema';

describe('expanded official project sources', () => {
  it('resolves relative news and Live links against their own directory', async () => {
    const source = {...sources.find(s=>s.id==='hasunosora-official')!, public_fetch_enabled:true, urls:[]};
    const pages = new Map([
      [source.origin+'/robots.txt','User-agent: *\nDisallow: /common/'],
      [source.index_url,'<a href="detail.php?p=01_9000">蓮ノ空 POP UP SHOP</a>'],
      [source.index_urls![0],'<a href="live_detail.php?p=LLDream103">卒業公演</a>'],
    ]);
    const seen:string[]=[];
    const result = await crawlSource(source,{pause:async()=>{},fetcher:async (input:RequestInfo|URL)=>{
      const url=String(input);
      seen.push(url);
      return new Response(pages.get(url)||'<meta property="og:title" content="蓮ノ空 公演"><article>開催概要 会場 日本武道館 チケット '+ '公式情報。'.repeat(30)+'</article>',{headers:{'content-type':'text/html'}});
    }});
    expect(result.observations).toHaveLength(2);
    expect(seen).toContain(source.origin+'/hasunosora/live-event/live_detail.php?p=LLDream103');
    expect(seen).not.toContain(source.origin+'/hasunosora/news/live_detail.php?p=LLDream103');
  });
  it('allows only the documented query parameters',()=>{
    const source=sources.find(s=>s.id==='ikizulive-official')!;
    expect(allowedUrl(source.origin+'/lovehigh/live/live_detail.php?_id=3rdLIVE',source)).toBe(true);
    expect(allowedUrl(source.origin+'/lovehigh/live/live_detail.php?_id=3rdLIVE&redirect=evil',source)).toBe(false);
    expect(allowedUrl(source.origin+'/lovehigh/member/?m=0',source)).toBe(false);
  });
  it('extracts article text and keeps apostrophes in metadata titles',()=>{
    const html='<meta property="og:title" content="μ\'s Orchestra Concert | ラブライブ！Official Web Site"><nav>別の公演 2099年</nav><article><h3>開催概要</h3><p>千葉県文化会館 '+ '2027年1月10日 公式情報。'.repeat(10)+'</p></article><article id="social">無関係</article>';
    const o=extractObservation(html,'https://www.lovelive-anime.jp/otonokizaka/event/lovelive_orchestra2027/','event-source');
    expect(o.title).toBe("μ's Orchestra Concert");
    expect(o.body_text).not.toContain('2099');
    expect(o.body_text).not.toContain('無関係');
    expect(()=>extractObservation('<h1>ページが見つかりません</h1>','https://www.lovelive-anime.jp/hasunosora/news/detail.php?p=01_9000','event-source')).toThrow();
  });
  it('deduplicates syndicated news while retaining the already reviewed URL',()=>{
    const row=(base:string,title='合同カフェ開催')=>({source:{id:base},observation:{source_url:`https://www.lovelive-anime.jp/${base}/detail.php?p=01_6743`,title}});
    const old=row('nijigasaki'),newer=row('uranohoshi');
    expect(deduplicateSeriesNews([newer,old],[{source_url:old.observation.source_url}])).toEqual([old]);
    expect(deduplicateSeriesNews([old,newer],[{source_url:old.observation.source_url,first_seen_at:'2026-10-27'}, {source_url:newer.observation.source_url,first_seen_at:'2026-10-29'}])).toEqual([old]);
    expect(deduplicateSeriesNews([old,row('uranohoshi','別の記事')])).toHaveLength(2);
  });
  it('isolates portal article text from brand navigation and recommendations',()=>{
    const html='<h1>NEWS</h1><h3 class="style_inner_title__abc">学マス コラボ開催</h3><div class="style_inner_content__def"><div>'+ '店舗で開催する公式イベント情報です。'.repeat(10)+'</div></div><aside>別のライブ 2099年</aside>';
    const result=extractObservation(html,'https://idolmaster-official.jp/news/01_20212','event-source');
    expect(result.title).toBe('学マス コラボ開催');
    expect(result.body_text).not.toContain('2099');
    expect(()=>extractObservation('<h1>NEWS</h1>','https://idolmaster-official.jp/news/01_20212','event-source')).toThrow('正文结构');
  });
  it('includes requested projects without widening to every Idolmaster brand',()=>{
    const filter=createProjectFilter(keywords);
    for(const title of ['いきづらい部！ POP UP SHOP','蓮ノ空カフェ','学園アイドルマスター コラボ','学マス 初星学園フェア']) expect(filter('sweets-paradise',title)).toBe(true);
    expect(filter('sweets-paradise','283PRODUCTION POP UP SHOP')).toBe(false);
    expect(classifyOffline('イキヅライブ！ 新情報')).toBeNull();
    expect(classifyOffline('いきづらい部！3rd LIVE')).toBe('live');
    expect(classifyOffline('蓮ノ空 カラオケの鉄人')).toBe('offline');
    expect(classifyOffline('初星学園 LIVE TOUR Single「修楽旅行」発売決定！')).toBeNull();
    expect(classifyOffline('Roselia 10th Anniversary Best Album「Lehre der Rose」リリース記念ライブ')).toBe('live');
    expect(classifyAnnouncement({id:'gakuen-idolmaster-portal'},{title:'学マス生配信 お知らせまとめ',body_text:'全国のローソンで学マスとのコラボキャンペーン',source_url:'https://idolmaster-official.jp/news/01_20075'})).toBe('offline');
    expect(classifyAnnouncement({id:'gakuen-idolmaster-portal'},{title:'学マス生配信 お知らせまとめ',body_text:'ゲーム内のガシャと新曲を公開',source_url:'https://idolmaster-official.jp/news/01_20075'})).toBeNull();
  });
  it('shares host cities and adds newly verified venue cities without duplicates',()=>{
    const choices=cityChoices([{venues:[{city:'沼津'},{city:'新潟'}]}]);
    expect(choices).toEqual(expect.arrayContaining(['沼津','金泽','千叶','福冈','札幌','新潟']));
    expect(choices.filter(c=>c==='沼津')).toHaveLength(1);
  });
});
