import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Test on Windows or macOS');
const parent = path.join(app, 'var', 'desktop-cleanup-tests');
await fs.mkdir(parent, { recursive: true });
const root = await fs.mkdtemp(path.join(parent, 'fixture-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: app, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
async function write(relative, text = 'fixture') {
  const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text);
}
try {
  await write('OshiTrip/data/snapshot.json', '{}');
  await write('OshiTrip/port.txt', '45000');
  await write('OshiTrip/launcher.log');
  await write('OshiTrip/personal.txt');
  await write('linked/OshiTrip/launcher.log');
  await write('outside/keep.txt', 'safe');
  await fs.symlink(path.join(root, 'outside'), path.join(root, 'linked/OshiTrip/data'), process.platform === 'win32' ? 'junction' : 'dir');
  if (process.platform === 'win32') {
    for (const file of ['OshiTrip.exe', 'bootstrap.mjs', 'app/server.js', 'runtime/node.exe']) await write(`program/${file}`);
    await write('program/.oshitrip-portable', '1.6.0');
    const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
    const exe = path.join(root, 'tests.exe');
    run(compiler, ['/nologo', '/utf8output', '/target:exe', '/main:CleanupTests', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', `/out:${exe}`, path.join(app, 'desktop/Cleanup.cs'), path.join(app, 'tests/desktop/CleanupTests.cs')]);
    run(exe, [root]);
  } else {
    for (const file of ['MacOS/OshiTrip', 'Resources/runtime/node', 'Resources/mac-bootstrap.mjs', 'Resources/app/server.js']) await write(`OshiTrip.app/Contents/${file}`);
    await write('OshiTrip.app/Contents/Info.plist', '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.oshitrip.desktop</string><key>CFBundleExecutable</key><string>OshiTrip</string></dict></plist>');
    const exe = path.join(root, 'tests');
    run('/usr/bin/xcrun', ['swiftc', 'desktop/DesktopLock.swift', 'desktop/MacCleanupCore.swift', 'tests/desktop/MacCleanupTests.swift', '-o', exe]);
    run(exe, [root]);
  }
} finally {
  // This exact newly created fixture is the only recursively removed directory.
  if (path.dirname(path.resolve(root)) !== path.resolve(parent) || !path.basename(root).startsWith('fixture-')) throw new Error('Unsafe test cleanup');
  // Remove the test link explicitly before removing the fixture tree.
  await fs.unlink(path.join(root, 'linked/OshiTrip/data')).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await fs.rm(root, { recursive: true, force: true });
}
