import { createHash } from 'node:crypto';

export const UPDATE_LIMIT = 5;
export const UPDATE_IMAGE_LIMIT = 8;
export const RECENT_DAYS = 14;
export const updateKey = value => {
  const u = new URL(value);
  return u.hostname === 'www.lovelive-anime.jp' && /\/detail\.php$/.test(u.pathname) && /^01_\d+$/.test(u.searchParams.get('p') || '')
    ? `${u.hostname}:news:${u.searchParams.get('p')}` : u.href;
};

// Only list-card text is compared. No requests to historical detail pages,
// no rotating sweep, and no claim to detect silent edits absent from the index.
export function createUpdatePlanner({ state, announcements, excluded, catalog, now, limit = UPDATE_LIMIT }) {
  const day = now.slice(0, 10);
  const cutoff = new Date(Date.parse(now) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  const knownUrls = new Set([...announcements.map(a => a.source_url), ...Object.keys(excluded), ...catalog.events.flatMap(e => e.sources.map(s => s.url))]);
  const known = new Set([...knownUrls].map(updateKey));
  const ended = new Set(catalog.events.filter(e => e.venues.length && e.venues.every(v => v.end_date < day)).flatMap(e => e.sources.map(s => updateKey(s.url))));
  const active = new Set(catalog.events.filter(e => e.venues.some(v => v.end_date >= day)).flatMap(e => e.sources.map(s => updateKey(s.url))));
  const selected = new Set();
  let remaining = limit;
  const next = structuredClone(state);
  next.version = 1;
  next.sources ||= {};
  next.entries ||= {};
  const signature = title => createHash('sha256').update(title.normalize('NFKC').replace(/\bNEW\b/gi, '').replace(/\s+/g, ' ').trim()).digest('hex');
  return {
    state: next,
    select(source, entries, { complete }) {
      for (const { url, title } of entries) {
        const key = updateKey(url), old = next.entries[url];
        const sig = signature(title);
        const dates = [...title.normalize('NFKC').matchAll(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/g)]
          .map(m => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
        const stale = ended.has(key) || (!active.has(key) && dates.length > 0 && dates.every(d => d < cutoff));
        if (old?.signature === sig) {
          if (stale || old.first_seen_on < cutoff) old.pending = false;
          continue;
        }
        // First inspection establishes a baseline. Existing entries are already
        // collected; undated unknown history is not backfilled on initialization.
        const changed = !!old && old.signature !== sig;
        const fresh = !known.has(key) && (next.sources[source.id] || dates.some(d => d >= cutoff));
        const duplicate = key !== url && known.has(key) && !knownUrls.has(url);
        next.entries[url] = { source_id: source.id, signature: sig, first_seen_on: day,
          pending: !stale && !duplicate && (changed || fresh), reason: changed ? '列表标题或日期变化' : '列表新增且未收录' };
      }
      if (complete) next.sources[source.id] = true;
      const candidates = Object.entries(next.entries).filter(([url, e]) => e.source_id === source.id && e.pending
        && e.first_seen_on >= cutoff && !ended.has(updateKey(url)))
        .sort((a, b) => b[1].first_seen_on.localeCompare(a[1].first_seen_on));
      const picked = [];
      for (const [url] of candidates) {
        const key = updateKey(url);
        if (selected.has(key) || remaining <= 0 || picked.length >= 2) continue;
        selected.add(key); remaining--; picked.push(url);
      }
      return picked;
    },
    finish(observations) {
      for (const o of observations) {
        known.add(updateKey(o.source_url));
        knownUrls.add(o.source_url);
        for (const [url, e] of Object.entries(next.entries)) if (updateKey(url) === updateKey(o.source_url)) e.pending = false;
      }
    },
    summary() {
      return { mode: 'updates', detail_limit: limit, selected: selected.size,
        pending_urls: Object.entries(next.entries).filter(([, e]) => e.pending && e.first_seen_on >= cutoff).map(([url]) => url),
        state_changed: JSON.stringify(next) !== JSON.stringify(state) };
    },
  };
}

export function updateIndexes(source) {
  // Keep distinct news/live homepages; omit archive pagination.
  return { ...source, urls: [], index_urls: (source.index_urls || []).filter(url => !/\/page\/\d+|[?&]page_index=[2-9]/.test(url)) };
}

export function substantiveObservation(observation, old) {
  if (!old) return true;
  return old.title !== observation.title || old.activity?.source_hash !== observation.content_hash
    || JSON.stringify(old.images.map(i => [i.url, i.alt])) !== JSON.stringify(observation.images
      .filter(i => !/(?:^|[/_-])(?:logo|icon|sns|bnr)(?:[._/-]|$)/i.test(new URL(i.url).pathname)).map(i => [i.url, i.alt]));
}
