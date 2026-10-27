import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSchema } from './load-data-schema.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { makeDataBundle, dataBundleSchema, MAX_DATA_BYTES } = await loadDataSchema();
const read = async name => JSON.parse(await fs.readFile(path.join(app, 'src', 'data', name), 'utf8'));
const catalog = await read('catalog.json');
const data = {
  catalog: { franchises: catalog.franchises, events: catalog.events.filter(e => ['published', 'cancelled'].includes(e.status)) },
  releases: (await read('releases.json')).filter(r => r.status === 'published'),
  stores: (await read('stores.json')).filter(s => s.status === 'published'),
};
let bundle = makeDataBundle(data, new Date().toISOString());
const destination = path.join(app, '..', 'data', 'public-v1.json');
try {
  const previous = dataBundleSchema.parse(JSON.parse(await fs.readFile(destination, 'utf8')));
  if (previous.revision === bundle.revision) bundle = previous;
} catch { /* First publication. */ }
const { data: unused, ...metadata } = bundle;
void unused;
const json = JSON.stringify(bundle, null, 2) + '\n';
const metaJson = JSON.stringify(metadata, null, 2) + '\n';
if (Buffer.byteLength(json) > MAX_DATA_BYTES) throw new Error('Public bundle exceeds the v1 size limit');
const metaFile = path.join(app, 'src', 'data', 'public-meta.json');
if (process.argv.includes('--check')) {
  if ((await fs.readFile(destination, 'utf8')).replaceAll('\r\n', '\n') !== json || (await fs.readFile(metaFile, 'utf8')).replaceAll('\r\n', '\n') !== metaJson)
    throw new Error('Public data is out of date. Run pnpm data:publish and commit both data/public-v1.json and src/data/public-meta.json.');
} else {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, json);
  await fs.writeFile(metaFile, metaJson);
}
console.log(`Public data ${bundle.revision.slice(0, 12)}: ${data.catalog.events.length} events, ${data.releases.length} products, ${data.stores.length} stores; published ${bundle.publishedAt}`);
