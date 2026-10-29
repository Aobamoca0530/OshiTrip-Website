// Run only in the release workflow. No private keys enter the downloaded artifacts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo = 'Aobamoca0530/OshiTrip-Website';
const token = process.env.GH_TOKEN;
const target = process.env.GITHUB_SHA;
if (!token || !target || process.env.GITHUB_REPOSITORY !== repo) throw new Error('Run in the authorized repository release workflow');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function api(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
function run(cmd, args, capture = false) {
  const result = spawnSync(cmd, args, { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed`);
  return result.stdout;
}
const version = JSON.parse(await fs.readFile('oshitrip/package.json', 'utf8')).version;
const tag = `v${version}`;
const directory = path.resolve('release-assets'); await fs.mkdir(directory, { recursive: true });
const sources = [];
for (const [kind, id, names] of [
  ['desktop', process.env.DESKTOP_RUN, ['OshiTrip-windows', 'OshiTrip-mac-arm64', 'OshiTrip-mac-x64']],
  ['android', process.env.ANDROID_RUN, ['OshiTrip-android']],
]) {
  if (!/^\d+$/.test(id || '')) throw new Error('Invalid run ID');
  const workflow = await api(`actions/runs/${id}`);
  if (workflow.path !== '.github/workflows/platform-packages.yml' || workflow.head_branch !== 'main') throw new Error('Unexpected artifact workflow');
  const jobs = (await api(`actions/runs/${id}/jobs?per_page=100`)).jobs;
  const required = kind === 'desktop' ? ['desktop (windows-latest, windows)', 'desktop (macos-15, mac-arm64)', 'desktop (macos-15-intel, mac-x64)'] : ['android'];
  for (const name of required) if (!jobs.some(j => j.name === name && j.conclusion === 'success')) throw new Error(`Required job not successful: ${name}`);
  // Desktop artifacts may predate mobile-only corrections. Reject any changed desktop input.
  const changed = run('git', ['diff', '--name-only', workflow.head_sha, target, '--', 'oshitrip'], true).trim().split('\n').filter(Boolean);
  const allowed = kind === 'desktop' ? p => p.startsWith('oshitrip/mobile/') || p.startsWith('oshitrip/android/') || p === 'oshitrip/scripts/publish-app-release.mjs' : p => p === 'oshitrip/scripts/publish-app-release.mjs';
  if (changed.some(p => !allowed(p))) throw new Error(`Artifact source differs from release inputs: ${changed.join(', ')}`);
  sources.push(`${kind}: ${workflow.html_url} (${workflow.head_sha})`);
  for (const name of names) run('gh', ['run', 'download', id, '--repo', repo, '--name', name, '--dir', directory]);
}
const expected = [`OshiTrip-${version}-windows-x64.zip`, `OshiTrip-${version}-macos-arm64.zip`, `OshiTrip-${version}-macos-x64.zip`, `OshiTrip-${version}-android.apk`];
const all = expected.flatMap(name => [name, `${name}.sha256`]);
const actual = (await fs.readdir(directory)).sort();
if (JSON.stringify(actual) !== JSON.stringify([...all].sort())) throw new Error('Unexpected or missing release files');
const digests = new Map();
for (const name of all) digests.set(name, createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex'));
for (const name of expected) {
  const checksum = (await fs.readFile(path.join(directory, `${name}.sha256`), 'utf8')).trim();
  if (checksum !== `${digests.get(name)}  ${name}`) throw new Error(`Checksum mismatch: ${name}`);
}
const notes = `## OshiTrip ${version} · 手机、Mac 与启动更新提示

- Android：下载签名 APK 安装。内置文字活动资料，可离线筛选、收藏和规划旅行；联网同步公共资料，图片与官方链接需联网。后续使用同签名新版覆盖安装，不要先卸载。
- iPhone / iPad：Safari 打开 https://aobamoca0530.github.io/OshiTrip-Website/ ，分享 → 添加到主屏幕。首次联网打开等待“已可离线使用”。
- Mac：Apple Silicon 选 macos-arm64；Intel 选 macos-x64。解压后将 OshiTrip.app 拖入应用程序。尚未 Apple Developer ID 签名和公证，首次运行可能需在系统设置 → 隐私与安全性中允许。macOS 13.5+。
- Windows：解压 windows-x64 ZIP 后运行 OshiTrip.exe，关闭启动器会停止服务。
- 打开应用后检查软件新版，显示版本说明与下载入口，可稍后更新。活动资料更新独立进行，联网失败不影响现有资料。不会静默安装程序，不是应用关闭后的系统推送。

旧 Windows 1.5.0 及以前版本需要先手动升级一次。桌面保留原浏览器与访问地址，手机保留原应用数据；设备之间不自动同步。Android APK 使用长期发布签名，密钥未包含在源码或安装包中。

验证：248 项单元测试；手机网页离线重开、收藏、路由及更新提示测试；Windows 启动/重启/端口冲突/强制退出测试；两种 Mac 架构打包服务页面与退出测试；Android release 构建、lint 和 APK 签名校验。Mac GUI 与 Android 真机体验仍建议安装后确认。

构建来源：\n${sources.join('\n')}
`;
const notesFile = path.join(directory, 'release-notes.md'); await fs.writeFile(notesFile, notes);
const releases = await api('releases?per_page=100');
let release = releases.find(r => r.tag_name === tag);
if (release && (!release.draft || release.target_commitish !== target)) throw new Error('Release already published or target differs');
if (!release) release = await api('releases', 'POST', { tag_name: tag, target_commitish: target, name: `OshiTrip ${version} · Android、iPhone 与 Mac`, body: notes, draft: true });
for (const name of all) {
  const existing = release.assets.find(a => a.name === name);
  if (existing) { if (existing.digest !== `sha256:${digests.get(name)}`) throw new Error('Existing asset mismatch'); continue; }
  run('gh', ['release', 'upload', tag, path.join(directory, name), '--repo', repo]);
}
release = await api(`releases/${release.id}`);
for (const name of all) {
  const asset = release.assets.find(a => a.name === name);
  if (!asset || asset.state !== 'uploaded' || asset.digest !== `sha256:${digests.get(name)}`) throw new Error(`Uploaded asset verification failed: ${name}`);
}
await api(`releases/${release.id}`, 'PATCH', { draft: false, make_latest: 'true' });
console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
