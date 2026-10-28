import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadDataSchema } from './load-data-schema.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8')).version;
const name = `OshiTrip-${version}-windows-x64`;
const zip = path.join(app, '..', 'dist', `${name}.zip`);
const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'OshiTrip 测试-'));
const quote = value => `'${value.replaceAll("'", "''")}'`;
const unzip = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(zip)}, ${quote(testRoot)})`], { stdio: 'inherit' });
assert.equal(unzip.status, 0, 'ZIP must extract with the Windows ZIP library');
const exe = path.join(testRoot, name, 'OshiTrip.exe');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForFile(file, child) {
  for (let i = 0; i < 600; i++) {
    try { return (await fs.readFile(file, 'utf8')).replace(/^\ufeff/, ''); } catch { /* wait for startup */ }
    if (child.exitCode !== null) throw new Error(`Launcher exited early (${child.exitCode})`);
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${file}`);
}
async function processGone(pid) {
  for (let i = 0; i < 50; i++) {
    try { process.kill(pid, 0); } catch { return true; }
    await delay(100);
  }
  return false;
}
async function smoke(label, killLauncher = false) {
  const report = path.join(testRoot, `${label}.txt`);
  const child = spawn(exe, ['--smoke-test', report], { windowsHide: true, stdio: 'ignore', env: { ...process.env, OSHITRIP_DATA_OFFLINE: '1', PATH: process.env.SystemRoot + '\\System32', NEXT_PUBLIC_SUPABASE_URL: 'https://must-not-be-used.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-not-a-key' } });
  const exited = new Promise(resolve => child.once('exit', resolve));
  let pid;
  try {
    const [url, pidText] = (await waitForFile(`${report}.ready`, child)).trim().split(/\r?\n/);
    pid = Number(pidText);
    assert.equal(new URL(url).hostname, '127.0.0.1');
    const html = await (await fetch(url)).text();
    assert.match(html, /OshiTrip/);
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(match => match[1]))];
    assert(assets.some(asset => asset.includes('.js')), 'HTML must reference JS assets');
    assert(assets.some(asset => asset.includes('.css')), 'HTML must reference CSS assets');
    for (const asset of assets) assert.equal((await fetch(new URL(asset.replaceAll('&amp;', '&'), url))).status, 200, asset);
    const endpoint = new URL('/api/data-sync', url);
    const status = await (await fetch(endpoint)).json();
    assert.equal(status.enabled, true, 'Launcher must enable shared data');
    assert.equal(status.result, 'unavailable', 'Offline launch must remain usable');
    assert.equal(status.source, label === 'first-run' ? 'bundled' : 'cache');
    assert.match(html, /刷新活动数据/);
    const blocked = await fetch(endpoint, { method: 'POST', headers: { Origin: 'https://example.com', 'X-OshiTrip-Refresh': '1' } });
    assert.equal(blocked.status, 403, 'Cross-origin refresh must be rejected');
    const refreshed = await fetch(endpoint, { method: 'POST', headers: { Origin: new URL(url).origin, 'X-OshiTrip-Refresh': '1' } });
    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).revision, status.revision);
    if (label !== 'first-run') {
      const activities = await (await fetch(new URL('/events?history=1', url))).text();
      assert.match(activities, /离线缓存测试/);
    }
    if (killLauncher) child.kill();
    else await fs.writeFile(`${report}.done`, 'done');
    const exitCode = await exited;
    if (!killLauncher) {
      assert.equal(exitCode, 0, await fs.readFile(report, 'utf8'));
      assert.match(await fs.readFile(report, 'utf8'), /PASS/);
    }
    assert(await processGone(pid), 'Node process must stop when launcher exits');
    console.log(`PASS ${label}: ${url}, ${assets.length} assets, child stopped`);
    return url;
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

const first = await smoke('first-run');
const { makeDataBundle } = await loadDataSchema();
const cached = JSON.parse(await fs.readFile(path.join(app, '..', 'data', 'public-v4.json'), 'utf8'));
cached.data.catalog.events.forEach(event => { event.title_zh += '（离线缓存测试）'; });
const updated = makeDataBundle(cached.data, new Date(Date.now() + 1000).toISOString());
const cacheDir = path.join(testRoot, 'launcher-data', 'data');
await fs.mkdir(cacheDir, { recursive: true });
await fs.writeFile(path.join(cacheDir, 'public-v4.json'), JSON.stringify(updated));
const second = await smoke('restart');
assert.equal(second, first, 'Restarts must preserve the browser origin for localStorage');
const occupied = net.createServer();
await new Promise((resolve, reject) => { occupied.once('error', reject); occupied.listen(Number(new URL(first).port), '127.0.0.1', resolve); });
try {
  const fallback = await smoke('port-conflict');
  assert.notEqual(fallback, first, 'Must not use an occupied port');
} finally { await new Promise(resolve => occupied.close(resolve)); }
assert.equal(await smoke('forced-exit', true), first, 'After a temporary conflict, restore the saved origin');
console.log(`All portable package checks passed. Reports: ${testRoot}`);
