// Retain only identity, never stale booking rules or an approval. This metadata
// survives collect-only -> review -> replay but is stripped by the public schema.
export function withdrawAutomaticEvent(catalog, row) {
  const former = catalog.events.find(event => event.id.startsWith('auto-')
    && event.sources.some(source => source.url === row.source_url));
  if (former) {
    row.event_identity = {
      id: former.id, slug: former.slug,
      venues: former.venues.map(({ id, name, start_date }) => ({ id, name, start_date })),
    };
    catalog.events = catalog.events.filter(event => event.id !== former.id);
  }
  return row.event_identity;
}

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
