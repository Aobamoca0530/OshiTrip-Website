import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { acquireRunLock, preparePublication, publishValidated, saveRunReport } from './crawler/daily-run.mjs';
import { WORKFLOW_VERSION, workflowContract, maintenanceStages, runStages } from './crawler/workflow.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--replay', '--contract', '--publish'].includes(arg) && !/^--source=[a-z0-9-]+$/.test(arg))) throw new Error('Only --replay, --contract, --publish and --source=<id> are supported');
const sourceId = args.find(arg => arg.startsWith('--source='))?.slice(9);
if (sourceId && args.includes('--replay')) throw new Error('--source cannot be combined with --replay');
if (args.includes('--contract')) {
  console.log(JSON.stringify(workflowContract(), null, 2));
} else {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  const directory = 'var/public-crawler';
  const release = await acquireRunLock(directory);
  const started = new Date().toISOString();
  const report = { workflow_version: WORKFLOW_VERSION, run_id: `${started.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`, started_at: started, mode: args.includes('--replay') ? 'replay' : 'collect', status: 'running', remote_published: false, publication: { status: 'not-requested' }, stages: [] };
  try {
    const base = args.includes('--publish') ? await preparePublication() : null;
    await runStages(maintenanceStages({ replay: args.includes('--replay'), sourceId }), command => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, command, { stdio: 'inherit', windowsHide: true,
        env: { ...process.env, CRAWLER_IMAGE_RULES: process.env.CRAWLER_IMAGE_RULES || 'true' } });
      child.once('error', reject);
      child.once('exit', code => resolve(code));
    }), report);
    const crawl = JSON.parse(await fs.readFile('var/public-crawler/report.json', 'utf8'));
    const queue = JSON.parse(await fs.readFile('var/public-crawler/assistant-queue.json', 'utf8'));
    const ticketReport = JSON.parse(await fs.readFile('var/public-crawler/ticket-products-report.json', 'utf8'));
    const imageReport = JSON.parse(await fs.readFile('var/public-crawler/image-review-report.json', 'utf8'));
    report.images = { total: imageReport.total, pending: imageReport.pending, needs_review: imageReport.needs_review, failed: imageReport.failed, source_unavailable: imageReport.source_unavailable, reviewed_snapshot: imageReport.reviewed_snapshot };
    report.source_checked_at = crawl.checked_at;
    report.bundle_revision = JSON.parse(await fs.readFile('src/data/public-meta.json', 'utf8')).revision;
    report.pending_ticket_products = ticketReport.pending.length;
    report.discovery = crawl.discovery;
    report.pending = queue.items.length + queue.missing_observations.length;
    report.unavailable_sources = crawl.sources.filter(s => s.status !== 'success').map(s => s.id);
    report.deferred_pages = crawl.sources.reduce((n, s) => n + (s.deferred_urls?.length || 0), 0);
    report.status = report.pending || report.pending_ticket_products || imageReport.total > imageReport.reviewed_snapshot || report.unavailable_sources.length || report.deferred_pages ? 'checked-with-pending-items' : 'checked';
    if (args.includes('--publish')) await publishValidated(report, base);
  } catch (error) {
    report.status = 'failed';
    if (args.includes('--publish')) report.publication.status = 'failed';
    // Child tools report their own bounded diagnostics; don't serialize env or remote response bodies.
    console.error(error instanceof Error ? error.message : 'Workflow failed');
    process.exitCode = 1;
  } finally {
    report.completed_at = new Date().toISOString();
    try {
      await saveRunReport(directory, report);
      console.log(JSON.stringify(report, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
        `\n## Daily discovery workflow\nResult: ${report.status}\n\nPublication: ${report.publication.status}\n\nPending text: ${report.pending ?? 'unknown'}; image review: ${report.images ? report.images.total - report.images.reviewed_snapshot : 'unknown'}\n\nBundle: ${report.bundle_revision || 'not-prepared'}\n`);
    } finally { await release(); }
  }
}
