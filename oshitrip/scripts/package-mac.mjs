import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(app);
const version = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8')).version;
if (process.platform !== 'darwin' || !['x64', 'arm64'].includes(process.arch)) throw new Error('Build on a Mac of the target architecture');
for (const entry of await fs.readdir(app)) if (entry.startsWith('.env') && entry !== '.env.example') throw new Error('Build from a clean checkout without private environment files');
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, OSHITRIP_DESKTOP_BUILD: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' };
function run(cmd, args, options = {}) { const r = spawnSync(cmd, args, { cwd: app, env, stdio: 'inherit', ...options }); if (r.error) throw r.error; if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`); }
const dist = path.join(repo, 'dist');
const output = path.join(dist, `OshiTrip-${version}-macos-${process.arch}`);
if (path.dirname(output) !== dist) throw new Error('Invalid output');
try { await fs.access(output); throw new Error('Output exists; use a clean build directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
run(process.execPath, ['scripts/publish-data.mjs', '--check']);
run(process.execPath, ['node_modules/next/dist/bin/next', 'build']);
const contents = path.join(output, 'OshiTrip.app', 'Contents');
const resources = path.join(contents, 'Resources');
await fs.mkdir(path.join(contents, 'MacOS'), { recursive: true });
await fs.mkdir(resources, { recursive: true });
await fs.cp(path.join(app, '.next/standalone'), path.join(resources, 'app'), { recursive: true, verbatimSymlinks: true, filter: p => !path.basename(p).startsWith('.env') });
const serverPath = path.join(resources, 'app/server.js');
let serverText = await fs.readFile(serverPath, 'utf8');
serverText = serverText.replace(/^const nextConfig = (.+)$/m, (_, json) => {
  const config = JSON.parse(json);
  delete config.outputFileTracingRoot; delete config.repoRoot;
  if (config.turbopack) delete config.turbopack.root;
  return `const nextConfig = ${JSON.stringify(config)}`;
});
await fs.writeFile(serverPath, serverText);
await fs.cp(path.join(app, '.next/static'), path.join(resources, 'app/.next/static'), { recursive: true });
try { await fs.cp(path.join(app, 'public'), path.join(resources, 'app/public'), { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const nodeVersion = '24.19.0';
const name = `node-v${nodeVersion}-darwin-${process.arch}.tar.gz`;
const base = `https://nodejs.org/dist/v${nodeVersion}/`;
async function download(url) { const r = await fetch(url, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error(`Download HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
const archive = await download(base + name);
const sums = (await download(base + 'SHASUMS256.txt')).toString();
const expected = sums.split(/\r?\n/).find(line => line.endsWith(`  ${name}`))?.split(/\s+/)[0];
if (createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Node checksum mismatch');
const cache = path.join(app, '.desktop-cache'); await fs.mkdir(cache, { recursive: true });
const tar = path.join(cache, name); await fs.writeFile(tar, archive);
run('/usr/bin/tar', ['-xzf', tar, '-C', cache]);
await fs.mkdir(path.join(resources, 'runtime'));
await fs.copyFile(path.join(cache, `node-v${nodeVersion}-darwin-${process.arch}/bin/node`), path.join(resources, 'runtime/node'));
await fs.chmod(path.join(resources, 'runtime/node'), 0o755);
await fs.copyFile(path.join(cache, `node-v${nodeVersion}-darwin-${process.arch}/LICENSE`), path.join(resources, 'runtime/NODE-LICENSE.txt'));
await fs.copyFile(path.join(app, 'desktop/mac-bootstrap.mjs'), path.join(resources, 'mac-bootstrap.mjs'));
run('/usr/bin/xcrun', ['swiftc', path.join(app, 'desktop/DesktopLock.swift'), path.join(app, 'desktop/MacLauncher.swift'), '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macos13.5`, '-o', path.join(contents, 'MacOS/OshiTrip'), '-framework', 'Cocoa']);
await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>OshiTrip</string><key>CFBundleIdentifier</key><string>com.oshitrip.desktop</string><key>CFBundleName</key><string>OshiTrip</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
await fs.writeFile(path.join(output, '使用说明.txt'), 'OshiTrip Mac 本地版\n解压后将 OshiTrip.app 拖入应用程序文件夹，双击运行。\nApple Silicon 下载 arm64，Intel 下载 x64。\n未使用 Apple Developer ID 签名或公证；macOS 可能阻止首次运行，请在系统设置→隐私与安全性中按需允许该应用。\n关闭启动器窗口会停止服务。收藏和行程保存在原浏览器与原地址中。\n日志与活动缓存：~/Library/Application Support/OshiTrip\n启动时检查软件新版与活动资料。软件更新需下载对应安装包。\n');
await fs.writeFile(path.join(output, 'build-info.json'), JSON.stringify({ version, node: nodeVersion, architecture: process.arch, mode: 'shared' }, null, 2));
// Test the relocated server, readiness signal and stdin shutdown before archiving.
run(process.execPath, ['scripts/test-mac-package.mjs', output]);
const zip = output + '.zip';
run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', output, zip]);
await fs.writeFile(zip + '.sha256', `${createHash('sha256').update(await fs.readFile(zip)).digest('hex')}  ${path.basename(zip)}\n`);
console.log(`Mac package: ${zip}`);
