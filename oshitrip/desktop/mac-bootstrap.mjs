import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const data = process.env.OSHITRIP_LAUNCHER_DIR;
if (!data) throw new Error('Missing launcher data directory');
await fs.mkdir(data, { recursive: true });
// Keep one stable origin so browser favorites survive application updates.
const portFile = path.join(data, 'port.txt');
let port = 43187;
try { const stored = Number(await fs.readFile(portFile, 'utf8')); if (Number.isInteger(stored) && stored >= 1024 && stored <= 65535) port = stored; } catch { /* first launch */ }
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
process.env.HOSTNAME = '127.0.0.1'; process.env.PORT = String(port);
process.stdin.resume(); process.stdin.on('end', () => process.exit(0));
await import(path.join(root, 'app/server.js'));
const url = `http://127.0.0.1:${port}/`;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (response.ok) { await fs.writeFile(portFile, String(port)); console.log(`OSHITRIP_READY ${url}`); break; }
  } catch { /* wait for server startup */ }
  if (Date.now() + 300 >= deadline) throw new Error('Server readiness timeout');
  await new Promise(resolve => setTimeout(resolve, 300));
}
