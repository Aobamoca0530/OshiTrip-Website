import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
export const PUBLIC_FILES = [
  'src/data/catalog.json', 'src/data/releases.json', 'src/data/announcements.json',
  'src/data/source-status.json', 'src/data/public-meta.json',
  'scripts/crawler/excluded-sources.json', 'scripts/crawler/verified-readings.json',
  'scripts/crawler/verified-ticket-products.json', 'scripts/crawler/verified-booking-evidence.json',
  'scripts/crawler/verified-image-readings.json',
  'supabase/seed.sql', 'supabase/releases-seed.sql', 'supabase/stores-seed.sql', 'supabase/setup-new-project.sql',
  '../data/public-v1.json', '../data/public-v2.json', '../data/public-v3.json', '../data/public-v4.json',
];

// Never steal a lock by age: a slow collection may still own it. On a crash the
// operator checks the recorded PID and removes only this file before resuming.
export async function acquireRunLock(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'maintenance.lock');
  const token = randomUUID();
  let handle;
  try { handle = await fs.open(file, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Maintenance already locked; check maintenance.lock and its PID before retrying.');
    throw error;
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, token, started_at: new Date().toISOString() }));
  await handle.close();
  return async () => {
    const owner = JSON.parse(await fs.readFile(file, 'utf8'));
    if (owner.token !== token) throw new Error('Maintenance lock ownership changed');
    await fs.unlink(file);
  };
}

export async function git(args) {
  try {
    const { stdout } = await exec('git', args, { windowsHide: true, maxBuffer: 2_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
    return stdout.trim();
  } catch {
    // Git errors can contain credential-bearing remote URLs.
    throw new Error(`Git ${args[0]} failed; inspect repository access or concurrent updates locally.`);
  }
}

export async function preparePublication(runGit = git) {
  const origin = await runGit(['remote', 'get-url', 'origin']);
  if (!['https://github.com/Aobamoca0530/OshiTrip-Website.git', 'git@github.com:Aobamoca0530/OshiTrip-Website.git'].includes(origin))
    throw new Error('Automatic publication requires the configured OshiTrip repository.');
  const staged = await runGit(['diff', '--cached', '--name-only']);
  if (staged) throw new Error('Publication requires an empty Git index; existing staged changes were preserved.');
  // Existing review edits are allowed only in the explicit data allowlist.
  const changed = (await runGit(['-C', '..', 'ls-files', '--modified', '--others', '--exclude-standard', '--full-name'])).split('\n').filter(Boolean);
  const allowed = new Set(PUBLIC_FILES.map(file => path.posix.normalize(`oshitrip/${file}`)));
  if (changed.some(file => !allowed.has(file))) throw new Error('Unrelated edits present. Publish from a clean maintenance checkout.');
  const head = await runGit(['rev-parse', 'HEAD']);
  const remote = (await runGit(['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0];
  if (head !== remote) throw new Error('Maintenance checkout must match remote main before publication; sync and validate again.');
  return head;
}

export async function publishValidated(report, base, { runGit = git, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!['checked', 'checked-with-pending-items'].includes(report.status) || !report.stages.length || report.stages.some(step => step.status !== 'passed'))
    throw new Error('Publication requires all maintenance checks to pass.');
  if (await preparePublication(runGit) !== base) throw new Error('Checkout changed during validation; rerun maintenance.');
  await runGit(['add', '--', ...PUBLIC_FILES]);
  if (!(await runGit(['diff', '--cached', '--name-only']))) {
    report.publication = { status: 'unchanged', commit: base };
    return;
  }
  await runGit(['-c', 'user.name=OshiTrip maintenance', '-c', 'user.email=oshitrip-maintenance@users.noreply.github.com',
    'commit', '-m', 'data: refresh reviewed activities and official images']);
  const commit = await runGit(['rev-parse', 'HEAD']);
  report.publication = { status: 'pending', commit };
  for (let attempt = 1; attempt <= 3; attempt++) {
    report.publication.attempts = attempt;
    // Retry network errors only. Never merge unvalidated remote data or force push.
    const remote = (await runGit(['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0];
    if (remote === commit) break;
    if (remote !== base) throw new Error('Remote main advanced; preserve this commit, sync and rerun checks.');
    try { await runGit(['push', 'origin', 'HEAD:refs/heads/main']); }
    catch { if (attempt === 3) throw new Error('Publication failed after 3 attempts; local commit retained.'); }
    if ((await runGit(['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0] === commit) break;
    if (attempt < 3) await pause(attempt * 2000);
  }
  if ((await runGit(['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0] !== commit)
    throw new Error('Remote publication could not be confirmed; local commit retained.');
  report.remote_published = true;
  report.publication.status = 'published';
}

export async function saveRunReport(directory, report) {
  const json = JSON.stringify(report, null, 2) + '\n';
  await fs.writeFile(path.join(directory, 'workflow-report.json'), json);
  const history = path.join(directory, 'runs');
  await fs.mkdir(history, { recursive: true });
  await fs.writeFile(path.join(history, `${report.run_id}.json`), json);
  const entries = (await fs.readdir(history)).filter(name => /^\d{4}-.*\.json$/.test(name)).sort();
  for (const name of entries.slice(0, -30)) await fs.unlink(path.join(history, name));
}
