import { describe, expect, it } from 'vitest';
import { createUpdatePlanner, updateIndexes, updateKey, substantiveObservation, sourceProjects } from '../../scripts/crawler/incremental.mjs';
import { createProjectMatcher } from '../../scripts/crawler/project-filter.mjs';
import projects from '../../scripts/crawler/project-keywords.json';
import { crawlSource, discoverEntries } from '../../scripts/crawler/core.mjs';
import { canSkipUnchanged, maintenanceStages } from '../../scripts/crawler/workflow.mjs';

const now='2026-10-31T12:00:00+09:00';
const source={id:'test',origin:'https://example.com',index_url:'https://example.com/news/',index_urls:['https://example.com/news/page/2/'],urls:['https://example.com/news/1/'],public_fetch_enabled:true,path_patterns:['^/news/(?:[0-9]+/|page/2/)?$'],discovery_patterns:['^/news/[0-9]+/$']};
const empty=()=>({version:3,sources:{},entries:{}});
const options=()=>({state:empty(),announcements:[{source_url:source.urls[0]}],excluded:{},catalog:{events:[]},now});
const entry=(id:number,title='2026.10.31 新イベント')=>({url:`https://example.com/news/${id}/`,title});
const complete={complete:true};

describe('incremental official update checks',()=>{
  it('reads the index but never rereads known seeds, old dates or undated bootstrap history',async()=>{
    const planner=createUpdatePlanner(options()), calls:string[]=[];
    const result=await crawlSource(updateIndexes(source),{pause:async()=>{},readRobots:async()=> 'User-agent: *\n',readPage:async(url:string)=>{
      calls.push(url); return '<a href="/news/1/">2026.10.31 Known</a><a href="/news/2/">2025.01.01 Old</a><a href="/news/3/">Undated archive</a>';
    },selectDetailUrls:(entries:ReturnType<typeof discoverEntries>,r:{complete:boolean})=>planner.select(source,entries,r)});
    expect(calls).toEqual([source.index_url]);
    expect(result).toMatchObject({status:'success',index_pages:1,attempted:0,observations:[]});
    expect(planner.summary().pending_urls).toEqual([]);
  });
  it('detects sibling dates and processes a new recent detail once',async()=>{
    const planner=createUpdatePlanner(options()), calls:string[]=[];
    const html='<li><time>2026.10.31</time><a href="/news/2/">New event</a></li>';
    expect(discoverEntries(html,source)[0].title).toContain('2026.10.31');
    const result=await crawlSource(updateIndexes(source),{pause:async()=>{},readRobots:async()=> 'User-agent: *\n',readPage:async(url:string)=>{
      calls.push(url);return url===source.index_url ? html : '<main><h1>New event</h1>'+ '2026年11月1日 東京イベント開催。'.repeat(12) + '</main>';
    },selectDetailUrls:(entries:ReturnType<typeof discoverEntries>,r:{complete:boolean})=>planner.select(source,entries,r)});
    planner.finish(result.observations);
    expect(calls).toEqual([source.index_url,entry(2).url]);
    const next=createUpdatePlanner({...options(),state:planner.state});
    expect(next.select(source,discoverEntries(html,source),complete)).toEqual([]);
    expect(next.summary().state_changed).toBe(false);
  });
  it('fetches list revisions of known entries but skips ended events',()=>{
    const p=createUpdatePlanner(options());p.select(source,[entry(1)],complete);
    const next=createUpdatePlanner({...options(),state:p.state});
    expect(next.select(source,[entry(1,'2026.10.31 追加公演 更新')],complete)).toEqual([entry(1).url]);
    const ended=createUpdatePlanner({...options(),state:p.state,catalog:{events:[{sources:[{url:entry(1).url}],venues:[{end_date:'2025-12-31'}]}]}});
    expect(ended.select(source,[entry(1,'2026.10.31 更新')],complete)).toEqual([]);
  });
  it('keeps a daily baseline for older bootstrap candidates while giving each project its own batch',()=>{
    const projectsFor=(s:{id:string})=>[s.id==='other'?'other-project':'same-project'];
    const p=createUpdatePlanner({...options(),projectsFor});
    const recent=(n:number)=>entry(n,'2026.10.30 新イベント');
    const a=p.select(source,[2,3,4,5,6,7].map(recent),complete);
    const b=p.select({...source,id:'news'},[recent(8)],complete);
    const c=p.select({...source,id:'other'},[9,10,11,12,13,14].map(recent),complete);
    expect(a).toHaveLength(5);expect(b).toEqual([]);expect(c).toHaveLength(5);
    p.finish([...a,...c].map(source_url=>({source_url})));
    const next=createUpdatePlanner({...options(),projectsFor,state:p.state});
    expect(next.select(source,[],complete)).toEqual([]);
    expect(next.summary().daily_usage).toEqual({'same-project':5,'other-project':5});
    const tomorrow=createUpdatePlanner({...options(),projectsFor,state:p.state,now:'2026-11-01T12:00:00+08:00'});
    expect(tomorrow.select(source,[],complete)).toEqual([entry(7).url]);
  });
  it('resets quotas at Beijing midnight and counts failed attempts across restarts',()=>{
    const p=createUpdatePlanner({...options(),now:'2026-10-31T15:59:00Z'});
    expect(p.select(source,[2,3,4,5,6].map(n=>entry(n)),complete)).toHaveLength(5);
    const restarted=createUpdatePlanner({...options(),state:p.state,now:'2026-10-31T15:59:59Z'});
    expect(restarted.select(source,[],complete)).toEqual([]);
    const midnight=createUpdatePlanner({...options(),state:p.state,now:'2026-10-31T16:00:00Z'});
    expect(midnight.select(source,[],complete)).toHaveLength(5);
    expect(midnight.summary().quota_day).toBe('2026-11-01');
  });
  it('gives child IPs separate groups and counts joint announcements only in the shared series',()=>{
    const match=createProjectMatcher(projects);
    expect(sourceProjects({id:'nijigasaki-news'},'',match)).toEqual(['nijigasaki']);
    expect(sourceProjects({id:'liella-official'},'',match)).toEqual(['liella']);
    expect(sourceProjects({id:'bang-dream-live'},'MyGO!!!!! 新公演',match)).toEqual(['mygo']);
    expect(sourceProjects({id:'bang-dream-news'},'Roselia 新公演',match)).toEqual(['roselia']);
    expect(sourceProjects({id:'bang-dream-live'},'Roselia × MyGO!!!!!',match)).toEqual(['bang-dream']);
    expect(sourceProjects({id:'nijigasaki-news'},'ラブライブ！シリーズ 15周年',match)).toEqual(['lovelive']);
    expect(sourceProjects({id:'sweets-paradise'},'蓮ノ空 コラボカフェ',match)).toEqual(['hasunosora']);
    expect(sourceProjects({id:'starlight-events'},'',match)).toEqual(['starlight']);
    expect(sourceProjects({id:'bushiroad-creative'},'BanG Dream! 新商品',match)).toEqual(['bang-dream']);
    expect(sourceProjects({id:'sweets-paradise'},'学園アイドルマスター × ラブライブ！',match)).toEqual(['lovelive','gakuen-idolmaster']);
    expect(sourceProjects({id:'sweets-paradise'},'',match)).toEqual([]);
  });
  it('handles twelve new updates for one IP as 5 + 5 + 2 without resweeping indexes',async()=>{
    const p=createUpdatePlanner(options());
    const all=Array.from({length:12},(_,i)=>entry(i+2));
    const first=p.select(source,all,complete);expect(first).toHaveLength(5);
    p.finish(first.map(source_url=>({source_url})));
    expect(p.summary().continuation_urls).toHaveLength(7);
    const second=createUpdatePlanner({...options(),state:p.state,continuation:true});
    const calls:string[]=[];
    const result=await crawlSource({...source,index_url:null,index_urls:[],urls:[]},{pause:async()=>{},readRobots:async()=> 'User-agent: *\n',readPage:async(url:string)=>{
      calls.push(url);return '<main><h1>New event</h1>'+ '2026年11月1日 東京イベント開催。'.repeat(12) + '</main>';
    },selectDetailUrls:(entries:ReturnType<typeof discoverEntries>,r:{complete:boolean})=>second.select(source,entries,r)});
    expect(calls).toHaveLength(5);expect(calls).not.toContain(source.index_url);
    second.finish(result.observations);
    const third=createUpdatePlanner({...options(),state:second.state,continuation:true});
    const last=third.select(source,[],complete);expect(last).toHaveLength(2);
    third.finish(last.map(source_url=>({source_url})));
    expect(third.summary().daily_usage.test).toBe(12);
    expect(third.summary().continuation_urls).toEqual([]);
  });
  it('does not use burst mode to backfill old pending entries or retry a stopped origin',()=>{
    const p=createUpdatePlanner(options());
    p.select(source,[2,3,4,5,6,7].map(n=>entry(n,'2026.10.30 新イベント')),complete);
    expect(p.summary().continuation_urls).toEqual([]);
    const next=createUpdatePlanner({...options(),state:p.state,continuation:true});
    expect(next.select(source,[],complete)).toEqual([]);
    const live=createUpdatePlanner(options());
    live.select(source,[2,3,4,5,6,7,8].map(n=>entry(n)),complete);
    live.stopOrigin(source.origin,403);
    expect(live.summary().continuation_urls).toEqual([]);
    const restart=createUpdatePlanner({...options(),state:live.state,continuation:true});
    expect(restart.select(source,[],complete)).toEqual([]);
  });
  it('does not treat a republished Love Live news URL as a new uncollected article',()=>{
    const url='https://www.lovelive-anime.jp/nijigasaki/detail.php?p=01_1234';
    const other='https://www.lovelive-anime.jp/lovehigh/news/detail.php?p=01_1234';
    expect(updateKey(url)).toBe(updateKey(other));
    const p=createUpdatePlanner({...options(),announcements:[{source_url:url}]});
    expect(p.select(source,[{url:other,title:'2026.10.31 同一記事'}],complete)).toEqual([]);
    const next=createUpdatePlanner({...options(),state:p.state,announcements:[{source_url:url}]});
    expect(next.select(source,[{url:other,title:'2026.10.31 同一記事 更新'}],complete)).toEqual([]);
  });
  it('keeps failed new details pending and stops after an access denial',async()=>{
    const p=createUpdatePlanner(options()), calls:string[]=[];
    const result=await crawlSource(updateIndexes(source),{pause:async()=>{},readRobots:async()=> 'User-agent: *\n',readPage:async(url:string)=>{
      calls.push(url);if(url===source.index_url)return '<a href="/news/2/">2026.10.31 New</a><a href="/news/3/">2026.10.31 New</a>';
      throw Object.assign(new Error('HTTP 403'),{httpStatus:403});
    },selectDetailUrls:(entries:ReturnType<typeof discoverEntries>,r:{complete:boolean})=>p.select(source,entries,r)});
    p.finish(result.observations);
    expect(calls).toEqual([source.index_url,entry(2).url]);
    expect(p.summary().pending_urls).toEqual([entry(2).url,entry(3).url]);
  });
  it('does not initialize a source after a failed index read',()=>{
    const p=createUpdatePlanner(options());p.select(source,[],{complete:false});
    expect(p.state.sources.test).toBeUndefined();
  });
  it('retains independent news/live index pages but omits archive pagination',()=>{
    expect(updateIndexes({...source,index_urls:[...source.index_urls,'https://example.com/live/','https://example.com/news?page_index=3']}).index_urls).toEqual(['https://example.com/live/']);
  });
  it('compares actual content and images after a changed listing, without re-reviewing identical details',()=>{
    const o={title:'same',content_hash:'body',images:[{url:'https://example.com/photo.jpg',alt:'poster'}]};
    const a={title:'same',activity:{source_hash:'body'},images:o.images};
    expect(substantiveObservation(o,a)).toBe(false);
    expect(substantiveObservation({...o,content_hash:'changed'},a)).toBe(true);
    expect(substantiveObservation({...o,images:[]},a)).toBe(true);
  });
  it('runs updates by default, keeps explicit audits/replay, and skips validation only on clean unchanged checks',()=>{
    expect(maintenanceStages()[0][1]).toContain('--updates');
    expect(maintenanceStages({full:true})[0][1]).not.toContain('--updates');
    expect(maintenanceStages({replay:true})[0][1]).toContain('--replay');
    expect(maintenanceStages({continueUpdates:true})[0][1]).toContain('--continue-updates');
    const report={updates:{mode:'updates',no_content_change:true,state_changed:false}};
    expect(canSkipUnchanged(report,false)).toBe(true);
    expect(canSkipUnchanged(report,true)).toBe(false);
    expect(canSkipUnchanged({updates:{...report.updates,state_changed:true}},false)).toBe(false);
  });
});
