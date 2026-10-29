import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repo = 'Aobamoca0530/OshiTrip-Website';
const token = process.env.GH_TOKEN;
const sha = process.env.GITHUB_SHA;
const runId = process.env.GITHUB_RUN_ID;
if (process.env.GITHUB_REPOSITORY !== repo || !token || !/^[a-f0-9]{40}$/.test(sha || '') || !/^\d+$/.test(runId || '')) throw new Error('Run in the authorized cleanup workflow');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function api(route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const workflow = await api(`actions/runs/${runId}`);
if (workflow.path !== '.github/workflows/cleanup-packages.yml' || workflow.head_sha !== sha || workflow.head_branch !== 'main') throw new Error('Unexpected build source');
const platforms = ['windows-x64', 'macos-arm64', 'macos-x64'];
const jobs = (await api(`actions/runs/${runId}/jobs?per_page=100`)).jobs;
for (const platform of platforms) {
  if (!jobs.some(job => job.name.startsWith('cleanup (') && job.name.endsWith(`, ${platform})`) && job.conclusion === 'success')) throw new Error(`Build/test job not successful: ${platform}`);
}
const version = JSON.parse(await fs.readFile('oshitrip/package.json', 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid version');
const directory = path.resolve('cleanup-release-assets');
await fs.mkdir(directory, { recursive: true });
const result = spawnSync('gh', ['run', 'download', runId, '--repo', repo, '--pattern', 'OshiTrip-Cleanup-*', '--dir', directory], { stdio: 'inherit' });
if (result.error || result.status !== 0) throw new Error('Could not download workflow artifacts');
const files = [];
for (const platform of platforms) {
  const name = `OshiTrip-Cleanup-${version}-${platform}.zip`;
  const folder = path.join(directory, `OshiTrip-Cleanup-${platform}`);
  const zip = await fs.readFile(path.join(folder, name));
  const digest = createHash('sha256').update(zip).digest('hex');
  const checksum = await fs.readFile(path.join(folder, name + '.sha256'));
  if (checksum.toString('utf8').trim() !== `${digest}  ${name}`) throw new Error(`Checksum mismatch: ${name}`);
  files.push({ name, bytes: zip, digest: 'sha256:' + digest });
  files.push({ name: name + '.sha256', bytes: checksum, digest: 'sha256:' + createHash('sha256').update(checksum).digest('hex') });
}
const tag = `cleanup-v${version}`;
const notes = `独立的 OshiTrip 卸载与活动缓存清理工具，无需运行主程序或安装 Node.js。

- Windows 10/11 x64：下载 windows-x64 ZIP，解压后运行 OshiTrip-Cleanup.exe。工具应放在待卸载的程序目录之外。
- Mac Apple Silicon：下载 macos-arm64；Intel Mac：下载 macos-x64。需要 macOS 13.5 或更新版本，打开 OshiTrip Cleanup.app。
- 仅清理缓存：删除下载的活动资料与启动日志，默认保留原访问地址。
- 卸载并清理：确认范围后，将所选程序目录／应用移入回收站／废纸篓，并清理活动缓存。
- 收藏、关注、行程及浏览器缓存保存在浏览器中，需按工具内说明单独清除；本工具不会自动删除这些私人数据。
- Windows 尚未代码签名；Mac 尚未 Apple Developer ID 签名及公证，首次运行可能需要在系统设置中允许。

验证：Windows、Mac Apple Silicon、Mac Intel 均完成原生编译与隔离测试，覆盖缓存清理、端口保留／重置、重复执行、链接拒绝、包身份检查及回收站／废纸篓操作；Mac 另验证并发锁和启动器编译。未进行完整人工 GUI／真机体验验收。

构建来源：${workflow.html_url}
源码提交：${sha}
每份 ZIP 均附 SHA256 校验文件。此 Release 单独发布清理工具，不替换主应用的 latest Release 或软件更新源。
`;
const releases = await api('releases?per_page=100');
let release = releases.find(item => item.tag_name === tag);
if (release && (!release.draft || release.target_commitish !== sha)) throw new Error('Cleanup release already published or source differs');
if (!release) release = await api('releases', 'POST', { tag_name: tag, target_commitish: sha, name: `OshiTrip Cleanup ${version} · 独立卸载与缓存清理工具`, body: notes, draft: true, make_latest: 'false' });
for (const file of files) {
  const existing = release.assets.find(item => item.name === file.name);
  if (existing) {
    if (existing.digest !== file.digest || existing.size !== file.bytes.length) throw new Error(`Existing asset differs: ${file.name}`);
    continue;
  }
  const response = await fetch(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: file.bytes, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Upload failed: ${file.name} (${response.status})`);
  const asset = await response.json();
  if (asset.state !== 'uploaded' || asset.digest !== file.digest || asset.size !== file.bytes.length) throw new Error(`Upload mismatch: ${file.name}`);
}
release = await api(`releases/${release.id}`);
for (const file of files) {
  const asset = release.assets.find(item => item.name === file.name);
  if (!asset || asset.state !== 'uploaded' || asset.digest !== file.digest || asset.size !== file.bytes.length) throw new Error(`Final asset mismatch: ${file.name}`);
}
release = await api(`releases/${release.id}`, 'PATCH', { draft: false, make_latest: 'false' });
console.log(`Published ${release.html_url}`);
