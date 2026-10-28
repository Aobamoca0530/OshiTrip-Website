import fs from 'node:fs/promises';
import { crawlSource, robotsAllows } from './crawler/core.mjs';
import { createImageReviewer, bailianEndpoint } from './crawler/image-rules.mjs';
import { mergeAnnouncements } from './crawler/public-news.mjs';
import { loadDataSchema } from './load-data-schema.mjs';
import { createProjectFilter, relevantAnnouncement } from './crawler/project-filter.mjs';
import { classifyOffline, translateActivity, validateReading, eventFromReading, pendingActivity } from './crawler/event-intelligence.mjs';

const configured = JSON.parse(await fs.readFile('scripts/crawler/sources.json', 'utf8'));
const projectFilter = createProjectFilter(JSON.parse(await fs.readFile('scripts/crawler/project-keywords.json', 'utf8')));
const relevant = (sourceId, title) => relevantAnnouncement(sourceId, title, projectFilter);
const pruneOnly = process.argv.includes('--prune-only');
// Explicitly selected public HTML sources. This is a project crawl decision,
// not a claim of a copyright license. Robots/HTTP access restrictions still apply.
const enabled = new Set(['bang-dream-news', 'bang-dream-live', 'bushiroad-creative', 'sweets-paradise', 'nijigasaki-news', 'starlight-news']);
const sources = configured.filter(s => enabled.has(s.id)).map(s => ({ ...s, public_fetch_enabled: true, index_url: s.id === 'sweets-paradise' ? 'https://www.sweets-paradise.jp/collaboration/' : s.index_url }));
const stamp = new Date().toISOString();
const report = { checked_at: stamp, sources: [], items: 0, images: 0 };
const observations = [];
const observedUrls = new Set();
const policies = new Map();
for (const source of pruneOnly ? [] : sources) {
  const result = await crawlSource(source, { limit: source.id === 'bang-dream-live' ? 20 : 12, acceptDiscoveredLink: ({ title }) => relevant(source.id, title) && (classifyOffline(title) !== null || /抽選|先行|コラボ|イベント/.test(title)) });
  for (const o of result.observations) observedUrls.add(o.source_url);
  if (result.robots_rules) policies.set(source.id, result.robots_rules);
  report.sources.push({ id: source.id, status: result.status, robots: result.robots_status || 'not-checked', pages: result.observations.length, excluded: result.observations.filter(o => !relevant(source.id, o.title)).length, errors: result.errors });
  for (const observation of result.observations) if (relevant(source.id, observation.title) && classifyOffline(observation.title, observation.body_text)) observations.push({ source, observation });
}
await fs.mkdir('var/public-crawler', { recursive: true });
await fs.writeFile('var/public-crawler/observations.json', JSON.stringify(observations, null, 2));
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
if (!pruneOnly && !report.sources.some(source => source.pages > 0 || source.status === 'success')) throw new Error('No source returned a usable announcement; existing public data has been preserved.');
const existing = JSON.parse(await fs.readFile('src/data/announcements.json', 'utf8'));
const previous = existing.filter(row => relevant(row.source_id, row.title) && (row.activity || classifyOffline(row.title)) && (!observedUrls.has(row.source_url) || observations.some(x => x.observation.source_url === row.source_url)));
report.removed_unrelated = existing.length - previous.length;
const catalog = JSON.parse(await fs.readFile('src/data/catalog.json', 'utf8'));
catalog.events = catalog.events.filter(e => !e.id.startsWith('auto-') || !e.sources.some(s => observedUrls.has(s.url) && !observations.some(x => x.observation.source_url === s.url)));
let next = mergeAnnouncements(previous, observations, catalog, stamp);
const overrides = JSON.parse(await fs.readFile('scripts/crawler/verified-readings.json', 'utf8'));
const excluded = JSON.parse(await fs.readFile('scripts/crawler/excluded-sources.json', 'utf8'));
let remaining = Number(process.env.EVENT_TRANSLATION_LIMIT || 24);
if (!Number.isInteger(remaining) || remaining < 1 || remaining > 80) throw new Error('EVENT_TRANSLATION_LIMIT must be 1–80');
report.translation = { translated: 0, cached: 0, pending: 0, excluded: 0, errors: [] };
for (const { observation: o } of observations) {
  const row = next.find(r => r.source_url === o.source_url);
  if (excluded[o.source_url] === o.content_hash) { next = next.filter(r => r.id !== row.id); report.translation.excluded++; continue; }
  const old = existing.find(r => r.source_url === o.source_url);
  if (old?.activity?.source_hash === o.content_hash && old.activity.state !== 'translation_pending') {
    row.activity = old.activity; report.translation.cached++; continue;
  }
  const kind = classifyOffline(o.title, o.body_text);
  row.activity = pendingActivity(o, kind, '等待中文翻译，尚不用于行程匹配');
  // A changed official page must not leave obsolete automatic booking rules active.
  const former = catalog.events.find(e => e.id.startsWith('auto-') && e.sources.some(s => s.url === o.source_url));
  if (former) catalog.events = catalog.events.filter(e => e.id !== former.id);
  try {
    const override = overrides[o.source_url];
    let result, model;
    if (override?.source_hash === o.content_hash) {
      result = validateReading(override.reading, o, catalog.franchises); model = 'source-reviewed';
    } else if (process.env.DASHSCOPE_API_KEY && remaining > 0) {
      remaining--; result = await translateActivity(o, catalog.franchises); model = process.env.EVENT_TRANSLATION_MODEL || 'qwen-plus';
    } else { report.translation.pending++; continue; }
    if (!result.reading.offline) { excluded[o.source_url] = o.content_hash; next = next.filter(r => r.id !== row.id); report.translation.excluded++; continue; }
    const r = result.reading;
    row.activity = { kind: r.kind, state: result.ready ? 'ready' : 'needs_review', title_zh: r.title_zh, summary_zh: r.summary_zh, rules: r.rules, source_hash: o.content_hash, model, reason: result.reason };
    if (result.ready) {
      const manual = catalog.events.find(e => e.sources.some(s => s.url === o.source_url || o.event_links?.includes(s.url)));
      if (!manual) catalog.events.push(eventFromReading(r, o, row.images, stamp, former));
    }
    report.translation.translated++;
  } catch (error) {
    report.translation.pending++;
    report.translation.errors.push({ source_url: o.source_url, error: String(error.message).slice(0, 300) });
  }
}
for (const row of next) {
  const observation = observations.find(x => x.observation.source_url === row.source_url)?.observation;
  row.related_event_ids = catalog.events.filter(e => e.sources.some(s => s.url === row.source_url || observation?.event_links?.includes(s.url)) || (!observation && row.related_event_ids.includes(e.id))).map(e => e.id);
}
const imageCacheFile = 'var/public-crawler/image-cache.json';
let imageCache = new Map();
try { imageCache = new Map(JSON.parse(await fs.readFile(imageCacheFile, 'utf8'))); } catch { /* No cache yet. */ }
for (const row of existing) for (const r of row.image_readings || []) {
  imageCache.set(`image-rules-v2:bailian:${bailianEndpoint(process.env.DASHSCOPE_BASE_URL || undefined)}:${r.model}:${r.sha256}`, { unreadable: r.unreadable, rules: r.rules.map(rule => ({ ...rule, kind: '其他' })) });
}
const reviewImage = createImageReviewer({ provider: 'bailian', cache: imageCache });
for (const { source, observation: o } of observations) {
  const row = next.find(r => r.source_url === o.source_url);
  if (!row) continue;
  const old = existing.find(r => r.source_url === o.source_url);
  row.image_readings = (old?.image_readings || []).filter(r => row.images.some(i => i.url === r.url));
  if (process.env.CRAWLER_IMAGE_RULES !== 'true' || !process.env.DASHSCOPE_API_KEY) continue;
  const candidates = o.images.filter(i => /注意|予約|参加|入場|購入|特典|メニュー|商品|グッズ|ルール|整理券/.test(`${i.alt} ${i.context}`)).slice(0, 4);
  for (const image of candidates) {
    const result = await reviewImage(image, { source, permits: path => policies.has(source.id) && robotsAllows(policies.get(source.id), path), pause: ms => new Promise(resolve => setTimeout(resolve, ms)) });
    // Image-only readings remain visibly unverified and never set travel or ticket dates.
    if (result.reading && result.sha256) {
      row.image_readings = row.image_readings.filter(r => r.url !== image.url);
      row.image_readings.push({ url: image.url, sha256: result.sha256, model: result.model, rules: result.reading.rules.map(({ kind, ...rule }) => { void kind; return rule; }), unreadable: result.reading.unreadable });
    }
  }
  row.image_readings = row.image_readings.slice(-8);
}
await fs.writeFile(imageCacheFile, JSON.stringify([...imageCache].slice(-400)));
const { publicDataSchema } = await loadDataSchema();
// Validate through the same application schema before replacing the file.
publicDataSchema.parse({ catalog: { ...catalog, events: catalog.events.filter(e => ['published', 'cancelled'].includes(e.status)) }, releases: JSON.parse(await fs.readFile('src/data/releases.json', 'utf8')).filter(r => r.status === 'published'), stores: JSON.parse(await fs.readFile('src/data/stores.json', 'utf8')).filter(s => s.status === 'published'), announcements: next });
await fs.writeFile('src/data/announcements.next.json', JSON.stringify(next, null, 2) + '\n');
await fs.rename('src/data/announcements.next.json', 'src/data/announcements.json');
await fs.writeFile('src/data/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile('scripts/crawler/excluded-sources.json', JSON.stringify(excluded, null, 2) + '\n');
report.items = next.length;
report.images = next.reduce((sum, item) => sum + item.images.length, 0);
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.translation.pending) console.log(`::warning::${report.translation.pending} 条线下公告等待翻译或证据复核；未用于新增行程匹配。${process.env.DASHSCOPE_API_KEY ? '' : '请配置 DASHSCOPE_API_KEY。'}`);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## Official announcements\n${report.items} announcements; ${report.images} image links.\n\n${report.sources.map(s => `- ${s.id}: ${s.status} (${s.pages} pages)`).join('\n')}\n`);
