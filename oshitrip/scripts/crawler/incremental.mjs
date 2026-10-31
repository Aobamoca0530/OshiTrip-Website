import { createHash } from 'node:crypto';

export const UPDATE_LIMIT = 5;
export const UPDATE_IMAGE_LIMIT = 8;
export const RECENT_DAYS = 14;
/** @param {{id: string}} source @param {string} title @param {(title: string) => string[]} matchProjects */
export function sourceProjects(source, title, matchProjects = () => []) {
  if (source.id.startsWith('bang-dream-')) return ['bang-dream'];
  if (source.id.startsWith('starlight-')) return ['starlight'];
  if (source.id.startsWith('gakuen-idolmaster-')) return ['gakuen-idolmaster'];
  if (['nijigasaki-news', 'aqours-official', 'muse-official', 'ikizulive-official', 'lovelive-series-live', 'hasunosora-official', 'liella-official'].includes(source.id)) return ['lovelive'];
  return matchProjects(title);
}
export const updateKey = value => {
  const u = new URL(value);
  return u.hostname === 'www.lovelive-anime.jp' && /\/detail\.php$/.test(u.pathname) && /^01_\d+$/.test(u.searchParams.get('p') || '')
    ? `${u.hostname}:news:${u.searchParams.get('p')}` : u.href;
};

// Only list-card text is compared. No requests to historical detail pages,
// no rotating sweep, and no claim to detect silent edits absent from the index.
export function createUpdatePlanner({ state, announcements, excluded, catalog, now, limit = UPDATE_LIMIT, projectsFor = source => [source.id] }) {
  const chinaTime = Date.parse(now) + 8 * 3600000;
  const day = new Date(chinaTime).toISOString().slice(0, 10);
  const cutoff = new Date(chinaTime - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  const knownUrls = new Set([...announcements.map(a => a.source_url), ...Object.keys(excluded), ...catalog.events.flatMap(e => e.sources.map(s => s.url))]);
  const known = new Set([...knownUrls].map(updateKey));
  const ended = new Set(catalog.events.filter(e => e.venues.length && e.venues.every(v => v.end_date < day)).flatMap(e => e.sources.map(s => updateKey(s.url))));
  const active = new Set(catalog.events.filter(e => e.venues.some(v => v.end_date >= day)).flatMap(e => e.sources.map(s => updateKey(s.url))));
  const selected = new Set();
  const next = structuredClone(state);
  next.version = 2;
  next.sources ||= {};
  next.entries ||= {};
  const usage = next.daily_usage?.day === day ? structuredClone(next.daily_usage.projects) : {};
  const signature = title => createHash('sha256').update(title.normalize('NFKC').replace(/\bNEW\b/gi, '').replace(/\s+/g, ' ').trim()).digest('hex');
  return {
    state: next,
    select(source, entries, { complete }) {
      for (const { url, title } of entries) {
        const key = updateKey(url), old = next.entries[url];
        const projects = [...new Set(projectsFor(source, title))];
        const sig = signature(title);
        const dates = [...title.normalize('NFKC').matchAll(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})/g)]
          .map(m => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
        const stale = ended.has(key) || (!active.has(key) && dates.length > 0 && dates.every(d => d < cutoff));
        if (old?.signature === sig) {
          old.projects = projects;
          if (stale || old.first_seen_on < cutoff) old.pending = false;
          continue;
        }
        // First inspection establishes a baseline. Existing entries are already
        // collected; undated unknown history is not backfilled on initialization.
        const changed = !!old && old.signature !== sig;
        const fresh = !known.has(key) && (next.sources[source.id] || dates.some(d => d >= cutoff));
        const duplicate = key !== url && known.has(key) && !knownUrls.has(url);
        next.entries[url] = { source_id: source.id, projects, signature: sig, first_seen_on: day,
          pending: !stale && !duplicate && (changed || fresh), reason: changed ? '列表标题或日期变化' : '列表新增且未收录' };
      }
      if (complete) next.sources[source.id] = true;
      const candidates = Object.entries(next.entries).filter(([url, e]) => e.source_id === source.id && e.pending
        && e.first_seen_on >= cutoff && !ended.has(updateKey(url)))
        .sort((a, b) => b[1].first_seen_on.localeCompare(a[1].first_seen_on));
      const picked = [];
      for (const [url, candidate] of candidates) {
        const key = updateKey(url);
        const projects = candidate.projects || projectsFor(source, '');
        if (!projects.length || selected.has(key) || Object.values(usage).some(keys => keys.includes(key))
          || projects.some(project => (usage[project]?.length || 0) >= limit)) continue;
        selected.add(key); picked.push(url);
        for (const project of projects) (usage[project] ||= []).push(key);
        // Reserve before detail requests, including failed attempts. The caller
        // persists this state before fetching so a restart cannot reset quotas.
        next.daily_usage = { day, projects: usage };
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
      return { mode: 'updates', daily_detail_limit_per_project: limit, quota_day: day,
        daily_usage: Object.fromEntries(Object.entries(usage).map(([project, keys]) => [project, keys.length])), selected: selected.size,
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
