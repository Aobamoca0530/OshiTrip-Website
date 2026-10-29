import { createHash } from 'node:crypto';

export function classifyImage(image) {
  const label = `${image.alt} ${new URL(image.url).pathname}`;
  const classify = text => {
    const goods = /グッズ|商品|goods|merch|ラインナップ|アクリル|缶バッジ|販売商品/i.test(text);
    const bonus = /特典|ノベルティ|プレゼント|bonus|novelty/i.test(text);
    const menu = /メニュー|menu|フード|ドリンク/i.test(text);
    if (Number(goods) + Number(bonus) + Number(menu) > 1) return 'unknown';
    if (goods) return 'merchandise';
    if (bonus) return 'bonus';
    if (menu) return 'menu';
    if (/キービジュアル|メインビジュアル|keyvisual|mainvisual/i.test(text)) return 'visual';
    return null;
  };
  // Only short, nearby captions provide a fallback; a distant bonus paragraph
  // must not turn every later image into a bonus.
  return classify(label) || classify((image.context || '').split('\n').at(-1).slice(-100)) || 'unknown';
}

export function mergeAnnouncements(previous, observations, catalog, stamp) {
  const rows = new Map(previous.map(row => [row.source_url, row]));
  for (const { source, observation: o, observed_at } of observations) {
    const seenAt = observed_at || stamp;
    const old = rows.get(o.source_url);
    const images = o.images
      .filter(image => !/(?:^|[/_-])(?:logo|icon|sns|bnr)(?:[._/-]|$)/i.test(new URL(image.url).pathname))
      .map(image => ({ url: image.url, alt: image.alt, kind: classifyImage(image) }));
    const hash = createHash('sha256').update(JSON.stringify({ title: o.title, text: o.content_hash, images })).digest('hex');
    rows.set(o.source_url, {
      id: createHash('sha256').update(o.source_url).digest('hex').slice(0, 24),
      source_id: source.id, source_url: o.source_url, title: o.title,
      first_seen_at: old?.first_seen_at || seenAt, last_seen_at: seenAt,
      changed_at: old?.content_hash === hash ? old.changed_at : seenAt,
      content_hash: hash,
      related_event_ids: catalog.events.filter(event => event.sources.some(s => s.url === o.source_url)).map(event => event.id),
      images,
      ...(old?.activity ? { activity: old.activity } : {}),
    });
  }
  // Failed sources retain their previous records. Time here means discovery,
  // never the event date or an assertion that the event is still running.
  if (rows.size > 500) throw new Error('公告超过500条；请先人工归档，不能静默丢弃旧资料。');
  return [...rows.values()].sort((a, b) => b.changed_at.localeCompare(a.changed_at) || a.id.localeCompare(b.id));
}
