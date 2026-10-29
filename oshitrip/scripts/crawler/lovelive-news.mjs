// Love Live republishes the same globally numbered news article under each
// project's site. Keep the already-known URL so old review/source links survive.
export function deduplicateSeriesNews(observations, existing = []) {
  const known = new Map(existing.map(row => [row.source_url, row.first_seen_at || '']));
  const selected = new Map();
  for (const item of observations) {
    const { source_url: url, title } = item.observation;
    const u = new URL(url);
    const shared = u.hostname === 'www.lovelive-anime.jp' && /\/(?:news\/|topics\/)?detail\.php$/.test(u.pathname) && /^01_\d+$/.test(u.searchParams.get('p') || '');
    const key = shared ? `${u.searchParams.get('p')}:${title.normalize('NFKC').replace(/\s+/g, '')}` : url;
    const previous = selected.get(key)?.observation.source_url;
    if (!previous || (known.has(url) && (!known.has(previous) || known.get(url) < known.get(previous)))) selected.set(key, item);
  }
  return [...selected.values()];
}
