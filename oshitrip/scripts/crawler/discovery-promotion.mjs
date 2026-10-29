// Image count schedules review; it never grants approval.
export const uniqueImages = images => [...new Map((images || []).map(image => [image.url, image])).values()];

export function useManualReading(override, sourceHash, translationConfigured, approvedCache, validate) {
  if (override?.source_hash !== sourceHash) return false;
  if (override.review?.approved === false) return true;
  if (validate(override.reading).ready) return true;
  return !translationConfigured && !approvedCache;
}

export function prioritizeDiscovery(observations, announcements) {
  const rows = new Map(announcements.map(row => [row.source_url, row]));
  const priority = item => {
    const row = rows.get(item.observation.source_url);
    const changed = row?.activity?.source_hash !== item.observation.content_hash;
    return (changed || row?.activity?.state !== 'ready' ? 2 : 0) + (uniqueImages(row?.images || item.observation.images).length >= 2 ? 1 : 0);
  };
  return [...observations].sort((a, b) => priority(b) - priority(a)
    || (rows.get(b.observation.source_url)?.changed_at || '').localeCompare(rows.get(a.observation.source_url)?.changed_at || ''));
}

export function officialGallery(images, sourceUrl, stamp) {
  // Collection verifies origin, not the text printed inside a picture.
  return uniqueImages(images).slice(0, 40).map(image => ({
    url: image.url, alt: image.alt || '官方公告配图（图中文字请以原图为准）',
    source_url: sourceUrl, checked_on: stamp.slice(0, 10),
  }));
}

export function syncApprovedGallery(event, row, stamp) {
  if (row.activity?.state !== 'ready' || row.activity?.review?.state !== 'approved') return false;
  if (!event.sources.some(source => source.url === row.source_url)) return false;
  const assets = officialGallery(row.images, row.source_url, stamp);
  // Preserve curated images and other sources. Replace only this source's gallery.
  const other = (event.gallery || []).filter(asset => asset.source_url !== row.source_url);
  const next = uniqueImages([...other, ...assets]).slice(0, 40);
  const changed = JSON.stringify(event.gallery || []) !== JSON.stringify(next);
  event.gallery = next;
  if (!event.image && assets[0]) event.image = assets[0];
  return changed;
}

export function discoveryReport(announcements, observations, catalog, previous, stamp) {
  const observed = new Map(observations.map(item => [item.observation.source_url, item.observation]));
  const oldReady = new Set(previous.filter(row => row.activity?.state === 'ready').map(row => row.source_url));
  const items = announcements.map(row => {
    const observation = observed.get(row.source_url);
    const events = catalog.events.filter(event => ['published', 'cancelled'].includes(event.status) && row.related_event_ids.includes(event.id));
    const ready = row.activity?.state === 'ready' && row.activity.review?.state === 'approved' && events.length > 0;
    return {
      source_url: row.source_url, title: row.activity?.title_zh || row.title,
      image_count: uniqueImages(row.images).length,
      state: !observation ? 'source_unavailable' : ready ? 'published' : 'pending',
      newly_promoted: !!observation && ready && !oldReady.has(row.source_url),
      event_ids: events.map(event => event.id),
      reason: !observation ? '本轮没有可复核正文，保留原资料与时间' : ready ? '正文证据与审核通过，已关联正式活动' : row.activity?.reason || '等待翻译和独立审核',
    };
  });
  return { checked_at: stamp, image_text_verified: false, total: items.length,
    promoted: items.filter(item => item.newly_promoted).length,
    published: items.filter(item => item.state === 'published').length,
    pending: items.filter(item => item.state !== 'published').length, items };
}
