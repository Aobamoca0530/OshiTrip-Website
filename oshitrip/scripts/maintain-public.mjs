import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORKFLOW_VERSION, workflowContract, maintenanceStages, runStages } from './crawler/workflow.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--replay', '--contract'].includes(arg) && !/^--source=[a-z0-9-]+$/.test(arg))) throw new Error('Only --replay, --contract and --source=<id> are supported');
const sourceId = args.find(arg => arg.startsWith('--source='))?.slice(9);
if (sourceId && args.includes('--replay')) throw new Error('--source cannot be combined with --replay');
if (args.includes('--contract')) {
  console.log(JSON.stringify(workflowContract(), null, 2));
} else {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  const report = { workflow_version: WORKFLOW_VERSION, started_at: new Date().toISOString(), mode: args.includes('--replay') ? 'replay' : 'collect', status: 'running', stages: [] };
  await fs.mkdir('var/public-crawler', { recursive: true });
  try {
    await runStages(maintenanceStages({ replay: args.includes('--replay'), sourceId }), command => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, command, { stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', code => resolve(code));
    }), report);
    const crawl = JSON.parse(await fs.readFile('var/public-crawler/report.json', 'utf8'));
    const queue = JSON.parse(await fs.readFile('var/public-crawler/assistant-queue.json', 'utf8'));
    const ticketReport = JSON.parse(await fs.readFile('var/public-crawler/ticket-products-report.json', 'utf8'));
    report.pending_ticket_products = ticketReport.pending.length;
    report.pending = queue.items.length + queue.missing_observations.length;
    report.unavailable_sources = crawl.sources.filter(s => s.status !== 'success').map(s => s.id);
    report.deferred_pages = crawl.sources.reduce((n, s) => n + (s.deferred_urls?.length || 0), 0);
    report.status = report.pending || report.pending_ticket_products || report.unavailable_sources.length || report.deferred_pages ? 'checked-with-pending-items' : 'checked';
    report.remote_published = false;
  } catch (error) {
    report.status = 'failed';
    // Child tools report their own bounded diagnostics; don't serialize env or remote response bodies.
    console.error(error instanceof Error ? error.message : 'Workflow failed');
    process.exitCode = 1;
  } finally {
    report.completed_at = new Date().toISOString();
    await fs.writeFile('var/public-crawler/workflow-report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
}
