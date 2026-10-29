import fs from 'node:fs/promises';
import { validateTicketProduct, releaseFromTicketProduct, verifiedTicketProductSchema } from './crawler/ticket-products.mjs';
import { loadDataSchema } from './load-data-schema.mjs';
const read = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const records = await read('scripts/crawler/verified-ticket-products.json');
const observations = await read('var/public-crawler/observations.json');
const catalog = await read('src/data/catalog.json');
const releases = await read('src/data/releases.json');
const ids = new Set();
const pending = [];
for (const input of records) {
  const record = verifiedTicketProductSchema.parse(input), p = record.product;
  if (ids.has(p.id)) throw new Error('Duplicate verified ticket product');
  ids.add(p.id);
  const old = releases.findIndex(r => r.id === p.id);
  const observation = observations.find(row => row.observation.source_url === p.source_url)?.observation;
  // Failed/unread sources do not manufacture a new verification date.
  if (!observation) { pending.push({id:p.id,source_url:p.source_url,reason:'本轮未读到正文，保留已有资料及原核实日期'}); continue; }
  if (observation.content_hash !== p.source_hash) {
    if (old >= 0) releases[old].status = 'review';
    pending.push({id:p.id,source_url:p.source_url,reason:'正文已变化，旧审批失效；重新核对商品与场次后才能发布'});
    continue;
  }
  const verified = validateTicketProduct(record, observation, catalog.franchises);
  const release = releaseFromTicketProduct(verified, catalog);
  if (!verified.review.approved) pending.push({id:p.id,source_url:p.source_url,reason:verified.review.reason});
  if (old >= 0) releases[old] = release; else releases.push(release);
}
const { publicDataSchema } = await loadDataSchema();
publicDataSchema.shape.releases.parse(releases);
await fs.writeFile('src/data/releases.json', JSON.stringify(releases, null, 2) + '\n');
await fs.writeFile('var/public-crawler/ticket-products-report.json', JSON.stringify({reviewed:records.length,pending}, null, 2) + '\n');
console.log(`Ticket products: ${records.length} reviewed records; ${releases.filter(r => r.status === 'published').length} published products`);
