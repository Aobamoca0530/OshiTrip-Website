// Links between standalone concert detail pages often mean another day or a
// related concert, not the same event. News articles can still link to details.
export function eventIdentityLinks(observation) {
  const u=new URL(observation.source_url);
  const detail=(u.hostname==='bang-dream.com' && /^\/events\/[^/]+\/$/.test(u.pathname))
    || (u.hostname==='revuestarlight.com' && /^\/event\/\d+\/$/.test(u.pathname))
    || (u.hostname==='www.lovelive-anime.jp' && (/\/live_detail\.php$/.test(u.pathname) || /^\/otonokizaka\/event\//.test(u.pathname)))
    || (u.hostname==='idolmaster-official.jp' && /^\/live_event\/[^/]+\/information\/[^/]+\.php$/.test(u.pathname));
  return detail ? [] : observation.event_links || [];
}
