import fs from 'node:fs/promises';
import { loadDataSchema } from './load-data-schema.mjs';
import { PUBLIC_SOURCE_IDS } from './crawler/public-sources.mjs';

const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const { buildSourceStatus, sourceStatusSchema } = await loadDataSchema();
const report = await read('var/public-crawler/report.json');
const observations = await read('var/public-crawler/observations.json');
let previous;
try { previous = sourceStatusSchema.parse(await read('src/data/source-status.json')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const status = buildSourceStatus({
  report, sources: await read('scripts/crawler/sources.json'), enabled: PUBLIC_SOURCE_IDS,
  announcements: await read('src/data/announcements.json'),
  observedUrls: observations.map(row => row.observation.source_url), previous,
});
await fs.writeFile('src/data/source-status.next.json', JSON.stringify(status, null, 2) + '\n');
await fs.rename('src/data/source-status.next.json', 'src/data/source-status.json');
console.log(`Source status: ${status.sources.length} sources; crawl timestamp ${status.checked_at}`);
