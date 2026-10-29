import type { Announcement } from './announcements';
import type { OshiEvent } from './schema';
import type { Release } from './releases';

const sourceIPs: Record<string, string[]> = {
  'liella-official':['lovelive','liella'], 'hasunosora-official':['lovelive','hasunosora'],
  'aqours-official':['lovelive','aqours'], 'muse-official':['lovelive','muse'],
  'nijigasaki-news':['lovelive','nijigasaki'], 'ikizulive-official':['lovelive','ikizulive'],
  'lovelive-series-live':['lovelive'], 'bang-dream-live':['bang-dream'], 'bang-dream-news':['bang-dream'],
  'starlight-events':['starlight'], 'starlight-news':['starlight'],
  'gakuen-idolmaster-live':['gakuen-idolmaster'], 'gakuen-idolmaster-portal':['gakuen-idolmaster'],
};
const namedIPs: [RegExp,string][] = [[/MyGO/i,'mygo'],[/Roselia/i,'roselia'],[/Ave Mujica/i,'ave-mujica'],[/RAISE A SUILEN/i,'raise-a-suilen'],[/Morfonica/i,'morfonica'],[/Poppin.?Party/i,'poppin-party'],[/夢限大みゅーたいぷ|千石ユノ|仲町あられ/,'yumemita'],[/millsage/i,'millsage'],[/一家Dumb Rock/i,'ikka-dumb-rock']];
export function liveLotteryItems(announcements: Announcement[], events: OshiEvent[], products: Release[]) {
  const items = announcements.filter(a => a.activity?.kind === 'live' || /Musical Performance|地元愛まつり/.test(a.title)).map(a => {
    const event = events.find(e => a.related_event_ids.includes(e.id) || e.sources.some(s => s.url === a.source_url));
    const related = products.filter(p => p.lotteries.some(l => l.source_url === a.source_url || (event && l.event_slug === event.slug)));
    return { id:a.id, title:a.activity?.title_zh || a.title, url:a.source_url,
      franchise_ids:event?.franchise_ids || [...new Set([...(sourceIPs[a.source_id] || []), ...namedIPs.filter(([rx]) => rx.test(a.title)).map(([,id]) => id)])],
      summary:a.activity?.summary_zh || '尚无已核实的中文票务信息，请查官方原文。',
      pending:a.activity?.state !== 'ready', reason:a.activity?.reason || '等待对照官方原文审核',
      rules:a.activity?.rules || [], event, products:related };
  });
  for (const event of events.filter(e => e.category === '音乐和声优活动')) {
    if (items.some(item => item.event?.id === event.id)) continue;
    items.push({ id:event.id, title:event.title_zh, url:event.sources[0]?.url || '', franchise_ids:event.franchise_ids,
      summary:event.summary, pending:false, reason:'已发布活动', rules:event.translated_rules || [], event,
      products:products.filter(p => p.lotteries.some(l => l.event_slug === event.slug)) });
  }
  return items;
}
