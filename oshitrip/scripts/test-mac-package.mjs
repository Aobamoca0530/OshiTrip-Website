import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.join(path.resolve(process.argv[2]), 'OshiTrip.app/Contents/Resources');
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'oshitrip-mac-test-'));
const child = spawn(path.join(root, 'runtime/node'), [path.join(root, 'mac-bootstrap.mjs')], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, OSHITRIP_LAUNCHER_DIR: data, OSHITRIP_DATA_DIR: path.join(data, 'data'), OSHITRIP_SHARED_DATA: '1', OSHITRIP_DATA_OFFLINE: '1', NODE_ENV: 'production' }, stdio: ['pipe', 'pipe', 'inherit'] });
let output = ''; child.stdout.on('data', bytes => output += bytes);
const exited = new Promise(resolve => child.once('exit', resolve));
try {
  const deadline = Date.now() + 60000;
  while (!output.includes('OSHITRIP_READY ') && Date.now() < deadline && child.exitCode === null) await new Promise(r => setTimeout(r, 250));
  const url = output.match(/OSHITRIP_READY (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
  assert.ok(url, 'Packaged server must be ready');
  for (const route of ['', 'events', 'trip', 'news', 'releases']) {
    const response = await fetch(url + route); assert.equal(response.status, 200); assert.match(await response.text(), /OshiTrip/);
  }
  child.stdin.end();
  const result = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))]);
  assert.equal(result, 0, 'Server must exit when launcher input closes');
  console.log('Mac packaged routes and shutdown passed');
} finally { if (child.exitCode === null) child.kill(); await fs.rm(data, { recursive: true, force: true }); }
