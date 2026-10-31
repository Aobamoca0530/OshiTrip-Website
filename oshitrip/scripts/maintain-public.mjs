import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { acquireRunLock, preparePublication, publishValidated, saveRunReport, git } from './crawler/daily-run.mjs';
import { WORKFLOW_VERSION, workflowContract, maintenanceStages, runStages, canSkipUnchanged } from './crawler/workflow.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--replay', '--contract', '--publish', '--collect-only', '--full', '--continue-updates'].includes(arg) && !/^--source=[a-z0-9-]+$/.test(arg))) throw new Error('Unsupported maintenance argument');
if (args.includes('--collect-only') && (args.includes('--publish') || args.includes('--replay'))) throw new Error('--collect-only cannot be combined with --publish or --replay');
if (args.includes('--full') && args.includes('--replay')) throw new Error('--full cannot be combined with --replay');
const sourceId = args.find(arg => arg.startsWith('--source='))?.slice(9);
if (args.includes('--continue-updates') && (sourceId || args.includes('--full') || args.includes('--replay'))) throw new Error('--continue-updates cannot be combined with full/source/replay');
if (sourceId && args.includes('--replay')) throw new Error('--source cannot be combined with --replay');
if (args.includes('--contract')) {
  console.log(JSON.stringify(workflowContract(), null, 2));
} else {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  const directory = 'var/public-crawler';
  const release = await acquireRunLock(directory);
  const started = new Date().toISOString();
  const report = { workflow_version: WORKFLOW_VERSION, run_id: `${started.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`, started_at: started, mode: args.includes('--replay') ? 'replay' : args.includes('--full') || sourceId ? 'full' : 'updates', status: 'running', remote_published: false, publication: { status: 'not-requested' }, stages: [] };
  try {
    const base = args.includes('--publish') ? await preparePublication() : null;
    const execute = command => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, command, { stdio: 'inherit', windowsHide: true,
        env: { ...process.env, CRAWLER_IMAGE_RULES: process.env.CRAWLER_IMAGE_RULES || 'true' } });
      child.once('error', reject);
      child.once('exit', code => resolve(code));
    });
    const stages = maintenanceStages({ replay: args.includes('--replay'), sourceId, full: args.includes('--full'), continueUpdates: args.includes('--continue-updates') });
    await runStages(stages.slice(0, 1), execute, report);
    const crawl = JSON.parse(await fs.readFile('var/public-crawler/report.json', 'utf8'));
    report.updates = crawl.updates;
    report.unavailable_sources = crawl.sources.filter(s => s.status !== 'success').map(s => s.id);
    report.deferred_pages = crawl.sources.reduce((n, s) => n + (s.deferred_urls?.length || 0), 0);
    report.source_checked_at = crawl.checked_at;
    const hasPendingEdits = !!(await git(['status', '--porcelain']));
    const skip = !args.includes('--replay') && canSkipUnchanged(crawl, hasPendingEdits);
    if (args.includes('--collect-only') || skip) {
      report.status = report.unavailable_sources.length ? 'checked-with-source-errors'
        : crawl.updates?.no_content_change ? 'no-updates' : 'awaiting-review';
      report.pending = JSON.parse(await fs.readFile('var/public-crawler/assistant-queue.json', 'utf8')).items.length;
      report.publication = { status: skip ? 'unchanged' : 'not-requested' };
    } else {
      await runStages(stages.slice(1), execute, report);
      const queue = JSON.parse(await fs.readFile('var/public-crawler/assistant-queue.json', 'utf8'));
      const ticketReport = JSON.parse(await fs.readFile('var/public-crawler/ticket-products-report.json', 'utf8'));
      const imageReport = JSON.parse(await fs.readFile('var/public-crawler/image-review-report.json', 'utf8'));
      report.images = { total: imageReport.total, pending: imageReport.pending, needs_review: imageReport.needs_review, failed: imageReport.failed, source_unavailable: imageReport.source_unavailable, reviewed_snapshot: imageReport.reviewed_snapshot };
      report.bundle_revision = JSON.parse(await fs.readFile('src/data/public-meta.json', 'utf8')).revision;
      report.pending_ticket_products = ticketReport.pending.length;
      report.discovery = crawl.discovery;
      report.pending = queue.items.length + queue.missing_observations.length;
      report.status = report.pending || report.pending_ticket_products || imageReport.total > imageReport.reviewed_snapshot || report.unavailable_sources.length || report.deferred_pages ? 'checked-with-pending-items' : 'checked';
      if (args.includes('--publish')) await publishValidated(report, base);
    }
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
