import fs from 'node:fs/promises';
import { crawlSource } from './crawler/core.mjs';
import { mergeAnnouncements } from './crawler/public-news.mjs';
import { loadDataSchema } from './load-data-schema.mjs';

const configured = JSON.parse(await fs.readFile('scripts/crawler/sources.json', 'utf8'));
// Explicitly selected public HTML sources. This is a project crawl decision,
// not a claim of a copyright license. Robots/HTTP access restrictions still apply.
const enabled = new Set(['bang-dream-news', 'bushiroad-creative', 'sweets-paradise']);
const sources = configured.filter(s => enabled.has(s.id)).map(s => ({ ...s, public_fetch_enabled: true, index_url: s.id === 'sweets-paradise' ? 'https://www.sweets-paradise.jp/collaboration/' : s.index_url }));
const stamp = new Date().toISOString();
const report = { checked_at: stamp, sources: [], items: 0, images: 0 };
const observations = [];
for (const source of sources) {
  const result = await crawlSource(source, { limit: 12 });
  report.sources.push({ id: source.id, status: result.status, pages: result.observations.length, errors: result.errors });
  for (const observation of result.observations) if (relevant(source.id, observation.title)) observations.push({ source, observation });
}
await fs.mkdir('var/public-crawler', { recursive: true });
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
if (!observations.length) throw new Error('No source returned a usable announcement; existing public data has been preserved.');
const previous = JSON.parse(await fs.readFile('src/data/announcements.json', 'utf8')).filter(row => relevant(row.source_id, row.title));
const catalog = JSON.parse(await fs.readFile('src/data/catalog.json', 'utf8'));
const next = mergeAnnouncements(previous, observations, catalog, stamp);
const { publicDataSchema } = await loadDataSchema();
// Validate through the same application schema before replacing the file.
publicDataSchema.parse({ catalog: { ...catalog, events: catalog.events.filter(e => ['published', 'cancelled'].includes(e.status)) }, releases: JSON.parse(await fs.readFile('src/data/releases.json', 'utf8')).filter(r => r.status === 'published'), stores: JSON.parse(await fs.readFile('src/data/stores.json', 'utf8')).filter(s => s.status === 'published'), announcements: next });
await fs.writeFile('src/data/announcements.next.json', JSON.stringify(next, null, 2) + '\n');
await fs.rename('src/data/announcements.next.json', 'src/data/announcements.json');
report.items = next.length;
report.images = next.reduce((sum, item) => sum + item.images.length, 0);
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## Official announcements\n${report.items} announcements; ${report.images} image links.\n\n${report.sources.map(s => `- ${s.id}: ${s.status} (${s.pages} pages)`).join('\n')}\n`);
function relevant(sourceId, title) {
  return sourceId !== 'bang-dream-news' || /展示|POP.?UP|ポップアップ|コラボ|カフェ|グッズ|物販|会場|フェア|出展|開催|公演|ライブ.*決定/i.test(title) && !/Pre-add|Pre-save|プレイリスト|放送|デジタルリリース/i.test(title);
}
