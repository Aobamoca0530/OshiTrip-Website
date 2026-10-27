import fs from 'node:fs/promises';
import { crawlSource } from './crawler/core.mjs';
import { mergeAnnouncements } from './crawler/public-news.mjs';
import { loadDataSchema } from './load-data-schema.mjs';
import { createProjectFilter, relevantAnnouncement } from './crawler/project-filter.mjs';

const configured = JSON.parse(await fs.readFile('scripts/crawler/sources.json', 'utf8'));
const projectFilter = createProjectFilter(JSON.parse(await fs.readFile('scripts/crawler/project-keywords.json', 'utf8')));
const relevant = (sourceId, title) => relevantAnnouncement(sourceId, title, projectFilter);
const pruneOnly = process.argv.includes('--prune-only');
// Explicitly selected public HTML sources. This is a project crawl decision,
// not a claim of a copyright license. Robots/HTTP access restrictions still apply.
const enabled = new Set(['bang-dream-news', 'bushiroad-creative', 'sweets-paradise', 'nijigasaki-news', 'starlight-news']);
const sources = configured.filter(s => enabled.has(s.id)).map(s => ({ ...s, public_fetch_enabled: true, index_url: s.id === 'sweets-paradise' ? 'https://www.sweets-paradise.jp/collaboration/' : s.index_url }));
const stamp = new Date().toISOString();
const report = { checked_at: stamp, sources: [], items: 0, images: 0 };
const observations = [];
for (const source of pruneOnly ? [] : sources) {
  const result = await crawlSource(source, { limit: 12, acceptDiscoveredLink: ({ title }) => relevant(source.id, title) });
  report.sources.push({ id: source.id, status: result.status, robots: result.robots_status || 'not-checked', pages: result.observations.length, excluded: result.observations.filter(o => !relevant(source.id, o.title)).length, errors: result.errors });
  for (const observation of result.observations) if (relevant(source.id, observation.title)) observations.push({ source, observation });
}
await fs.mkdir('var/public-crawler', { recursive: true });
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
if (!pruneOnly && !report.sources.some(source => source.pages > 0 || source.status === 'success')) throw new Error('No source returned a usable announcement; existing public data has been preserved.');
const existing = JSON.parse(await fs.readFile('src/data/announcements.json', 'utf8'));
const previous = existing.filter(row => relevant(row.source_id, row.title));
report.removed_unrelated = existing.length - previous.length;
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
