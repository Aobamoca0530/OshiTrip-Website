import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(app);
const version = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8')).version;
const nodeVersion = '24.19.0';
const cache = path.join(app, '.desktop-cache');
const dist = path.join(repo, 'dist');
const output = path.join(dist, `OshiTrip-${version}-windows-x64`);
const zip = `${output}.zip`;
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64.');
for (const entry of await fs.readdir(app)) {
  if (entry.startsWith('.env') && entry !== '.env.example')
    throw new Error(`Remove private environment files from this build checkout first: ${entry}`);
}
const env = { ...process.env, OSHITRIP_DESKTOP_BUILD: '1', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' };
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DASHSCOPE_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY']) delete env[key];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: app, env, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download failed: ${url} (${response.status})`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }

await fs.mkdir(cache, { recursive: true });
run(process.execPath, ['scripts/publish-data.mjs', '--check']);
await fs.mkdir(dist, { recursive: true });
// Delete only this script's previously marked output, always inside dist/.
if (path.dirname(output) !== dist) throw new Error('Invalid output path');
if (await exists(output)) {
  if (!await exists(path.join(output, '.oshitrip-portable'))) throw new Error('Refusing to replace an unmarked output directory');
  await fs.rm(output, { recursive: true });
}
const archiveName = `node-v${nodeVersion}-win-x64.zip`;
const archive = path.join(cache, archiveName);
const sumsFile = path.join(cache, `SHASUMS256-${nodeVersion}.txt`);
if (!await exists(sumsFile)) await download(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`, sumsFile);
const sumLine = (await fs.readFile(sumsFile, 'utf8')).split(/\r?\n/).find(line => line.endsWith(`  ${archiveName}`));
if (!sumLine) throw new Error('Official checksum missing');
if (!await exists(archive)) await download(`https://nodejs.org/dist/v${nodeVersion}/${archiveName}`, archive);
const expected = sumLine.split(/\s+/)[0];
const actual = createHash('sha256').update(await fs.readFile(archive)).digest('hex');
if (actual !== expected) throw new Error('Node archive checksum mismatch; delete the cached ZIP and retry');
const runtimeSource = path.join(cache, `node-v${nodeVersion}-win-x64`);
if (path.dirname(runtimeSource) !== cache) throw new Error('Invalid runtime cache path');
if (await exists(runtimeSource)) await fs.rm(runtimeSource, { recursive: true });
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)}, ${quote(cache)})`]);
if (!process.argv.includes('--skip-build')) run(process.execPath, ['node_modules/next/dist/bin/next', 'build']);

const standalone = path.join(app, '.next', 'standalone');
if (!await exists(path.join(standalone, 'server.js'))) throw new Error('Missing standalone/server.js; run a desktop build first');
await fs.mkdir(output);
await fs.writeFile(path.join(output, '.oshitrip-portable'), version);
// Copy application files separately; flatten traced pnpm packages below so the
// portable archive has neither machine-specific junctions nor long store paths.
await fs.cp(standalone, path.join(output, 'app'), {
  recursive: true, dereference: true,
  filter: source => source !== path.join(standalone, 'node_modules') && !path.basename(source).startsWith('.env') && path.basename(source) !== '.git',
});
const tracedStore = path.join(standalone, 'node_modules', '.pnpm');
const copied = new Map();
for (const entry of await fs.readdir(tracedStore)) {
  const modules = path.join(tracedStore, entry, 'node_modules');
  if (!await exists(modules)) continue;
  const dirs = [];
  for (const item of await fs.readdir(modules, { withFileTypes: true })) {
    if (!item.isDirectory() || item.isSymbolicLink()) continue;
    const dir = path.join(modules, item.name);
    if (item.name.startsWith('@')) {
      for (const child of await fs.readdir(dir, { withFileTypes: true }))
        if (child.isDirectory() && !child.isSymbolicLink()) dirs.push(path.join(dir, child.name));
    } else dirs.push(dir);
  }
  for (const dir of dirs) {
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    if (copied.has(pkg.name) && copied.get(pkg.name) !== pkg.version)
      throw new Error(`Cannot flatten conflicting runtime versions of ${pkg.name}`);
    if (copied.has(pkg.name)) continue;
    copied.set(pkg.name, pkg.version);
    await fs.cp(dir, path.join(output, 'app', 'node_modules', pkg.name), { recursive: true, dereference: true });
  }
}
if (!copied.has('next') || !copied.has('react')) throw new Error('Incomplete standalone runtime');
// These fields describe the build machine; resolve them to the relocated app.
const serverPath = path.join(output, 'app', 'server.js');
let serverText = await fs.readFile(serverPath, 'utf8');
serverText = serverText.replace(/^const nextConfig = (.+)$/m, (_, json) => {
  const config = JSON.parse(json);
  delete config.outputFileTracingRoot;
  delete config.repoRoot;
  if (config.turbopack) delete config.turbopack.root;
  return `const nextConfig = ${JSON.stringify(config)}`;
});
await fs.writeFile(serverPath, serverText);
await fs.cp(path.join(app, '.next', 'static'), path.join(output, 'app', '.next', 'static'), { recursive: true, dereference: true });
if (await exists(path.join(app, 'public'))) await fs.cp(path.join(app, 'public'), path.join(output, 'app', 'public'), { recursive: true });
await fs.mkdir(path.join(output, 'runtime'));
await fs.copyFile(path.join(runtimeSource, 'node.exe'), path.join(output, 'runtime', 'node.exe'));
await fs.copyFile(path.join(runtimeSource, 'LICENSE'), path.join(output, 'runtime', 'NODE-LICENSE.txt'));
await fs.copyFile(path.join(app, 'desktop', 'bootstrap.mjs'), path.join(output, 'bootstrap.mjs'));

// Include dependency notices, even when file tracing omits them.
const notices = path.join(output, 'THIRD-PARTY-NOTICES');
await fs.mkdir(notices);
const store = path.join(app, 'node_modules', '.pnpm');
for (const entry of await fs.readdir(store, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const modules = path.join(store, entry.name, 'node_modules');
  if (!await exists(modules)) continue;
  const packageDirs = [];
  for (const item of await fs.readdir(modules, { withFileTypes: true })) {
    if (item.isSymbolicLink() || !item.isDirectory()) continue;
    if (item.name.startsWith('@')) {
      for (const child of await fs.readdir(path.join(modules, item.name), { withFileTypes: true }))
        if (child.isDirectory() && !child.isSymbolicLink()) packageDirs.push(path.join(modules, item.name, child.name));
    } else packageDirs.push(path.join(modules, item.name));
  }
  for (const dir of packageDirs) {
    if (!await exists(path.join(dir, 'package.json'))) continue;
    const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    const target = path.join(notices, `${pkg.name.replaceAll('/', '__')}@${pkg.version}`);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository }, null, 2));
    for (const name of await fs.readdir(dir))
      if (/^(license|licence|notice|copyright)(\.|$)/i.test(name) && (await fs.stat(path.join(dir, name))).isFile())
        await fs.copyFile(path.join(dir, name), path.join(target, name));
  }
}
const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
run(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', `/out:${path.join(output, 'OshiTrip.exe')}`, path.join(app, 'desktop', 'Launcher.cs')]);
await fs.writeFile(path.join(output, '使用说明.txt'), '\ufeff' + [
  'OshiTrip · Windows 本地版', '',
  '1. 将整个 ZIP 解压到可写文件夹，不要只复制 EXE，也不要直接在压缩包内运行。',
  '2. 双击 OshiTrip.exe，等待浏览器自动打开。无需安装 Node.js 或 pnpm。',
  '3. 保持启动器运行；关闭窗口或点击“停止并退出”会停止本地服务。',
  '4. 收藏和行程保存在当前浏览器、当前地址中，不会自动跨设备同步。',
  '5. 端口通常固定；若被占用会提示更换。使用原地址才能看到原地址的浏览器数据。',
  '6. 启动时自动检查活动数据更新；可点击“刷新活动数据”。断网时使用缓存或内置资料，官方图片和外部链接仍需联网。',
  '7. Windows 10/11 x64；使用系统自带 .NET Framework。此版本尚未进行代码签名。',
  '8. 启动器设置和日志位于 %LOCALAPPDATA%\\OshiTrip，活动缓存位于其 data 文件夹；收藏仍保存在浏览器。',
  '', '源码与更新：https://github.com/Aobamoca0530/OshiTrip-Website',
].join('\r\n'));
await fs.writeFile(path.join(output, 'build-info.json'), JSON.stringify({ version, node: nodeVersion, architecture: 'x64', mode: 'shared', builtAt: new Date().toISOString() }, null, 2));
// System zip support includes hidden .next files; Compress-Archive can omit them.
if (await exists(zip)) await fs.unlink(zip);
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(output)}, ${quote(zip)}, [System.IO.Compression.CompressionLevel]::Optimal, $true)`]);
const checksum = createHash('sha256').update(await fs.readFile(zip)).digest('hex');
await fs.writeFile(`${zip}.sha256`, `${checksum}  ${path.basename(zip)}\n`);
console.log(`\nPortable package: ${zip}\nSHA256: ${checksum}`);
