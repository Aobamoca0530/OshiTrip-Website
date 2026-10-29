import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('mobile-dist');
async function files(dir) {
  const result = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, item.name);
    if (item.isDirectory()) result.push(...await files(name));
    else if (item.name !== 'sw.js') result.push(name);
  }
  return result;
}
const all = (await files(root)).sort();
const hash = createHash('sha256');
for (const file of all) hash.update(await fs.readFile(file));
const cache = `oshitrip-shell-${hash.digest('hex').slice(0, 16)}`;
await fs.writeFile(path.join(root, 'sw.js'), `
const NAME = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(all.map(f => './' + path.relative(root, f).replaceAll('\\', '/')))};
self.addEventListener('install', event => event.waitUntil(caches.open(NAME).then(cache => cache.addAll(ASSETS))));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('oshitrip-shell-') && key !== NAME).map(key => caches.delete(key))))])));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(NAME).then(cache => cache.match('./index.html')).then(cached => cached || fetch(event.request)));
    return;
  }
  event.respondWith(caches.open(NAME).then(cache => cache.match(event.request, { ignoreVary: true })).then(cached => cached || fetch(event.request)));
});
`);
console.log(`Offline shell: ${cache}, ${all.length} files`);
