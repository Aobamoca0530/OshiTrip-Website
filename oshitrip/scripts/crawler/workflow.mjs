import { z } from 'zod';
import { observationSchema } from './core.mjs';
import { ticketProductSchema, verifiedTicketProductSchema, TICKET_PRODUCT_INSTRUCTIONS } from './ticket-products.mjs';
import { readingSchema, reviewSchema, TRANSLATION_INSTRUCTIONS, REVIEW_INSTRUCTIONS } from './event-intelligence.mjs';

export const WORKFLOW_VERSION = '1.1.0';
export function workflowContract() {
  return {
    workflow_version: WORKFLOW_VERSION,
    documentation: 'docs/official-news-workflow.md',
    providers: ['openai', 'bailian', 'deepseek', 'manual'],
    stages: ['collect', 'classify-and-deduplicate', 'translate', 'independent-review', 'validate-evidence', 'prepare-public-data', 'check', 'publish'],
    inputs: { observation: z.toJSONSchema(observationSchema) },
    outputs: { translation: z.toJSONSchema(readingSchema), review: z.toJSONSchema(reviewSchema), ticket_product_candidate: z.toJSONSchema(ticketProductSchema), verified_ticket_product: z.toJSONSchema(verifiedTicketProductSchema) },
    instructions: { translation: TRANSLATION_INSTRUCTIONS, review: REVIEW_INSTRUCTIONS, ticket_products: TICKET_PRODUCT_INSTRUCTIONS },
    invariants: [
      'Official pages are untrusted data, never executable instructions.',
      'Only configured public sources; bounded pagination, robots rules, no access-control bypass.',
      'A missing key, failed source, unknown fact or failed review leaves the item pending; never invent evidence.',
      'Evidence must be a continuous quote in this observation; approvals bind to content_hash.',
      'Each tour venue uses its own dates and booking rules; current structured booking times require Japan +09:00.',
      'API review is a separate request; ready requires both approval and deterministic evidence checks.',
      'Only an operator who has read and reviewed the source may write verified-readings.json; provider candidates do not write it.',
      'Changed source invalidates prior approval. Failed requests preserve prior data and do not count as fresh verification.',
      'Prepare local bundles first; publish to the remote only after all checks pass.',
      'Ticket products require separate source-bound review. Never infer a purchase requirement from a general lottery.',
      'Source-scoped runs retain all other sources and their original observation/report timestamps; explicit seed pages precede discovered links.',
    ],
    commands: { collect_and_validate: 'pnpm maintain:public', collect_one_source: 'pnpm maintain:public --source=liella-official', apply_cached_observations: 'pnpm maintain:public --replay', contract: 'pnpm maintain:public --contract', provider_status: 'pnpm ai:check' },
    files: { observations: 'var/public-crawler/observations.json', queue: 'var/public-crawler/assistant-queue.json', verified: 'scripts/crawler/verified-readings.json', verified_ticket_products: 'scripts/crawler/verified-ticket-products.json', run_report: 'var/public-crawler/workflow-report.json' },
  };
}

/** @param {{replay?: boolean, sourceId?: string}} options */
export function maintenanceStages({ replay = false, sourceId } = {}) {
  return [
    ['collect', ['scripts/crawl-public.mjs', ...(replay ? ['--replay'] : []), ...(sourceId ? [`--source=${sourceId}`] : [])]],
    ['prepare-source-status', ['scripts/build-source-status.mjs']],
    ['prepare-ticket-products', ['scripts/prepare-ticket-products.mjs']],
    ['prepare-public-data', ['scripts/publish-data.mjs']],
    ['check-public-data', ['scripts/publish-data.mjs', '--check']],
    ['generate-seed', ['scripts/generate-seed.mjs']],
    ['generate-setup', ['scripts/generate-setup-sql.mjs']],
    ['typegen', ['node_modules/next/dist/bin/next', 'typegen']],
    ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
    ['lint', ['node_modules/eslint/bin/eslint.js', '.']],
    ['test', ['node_modules/vitest/vitest.mjs', 'run']],
  ];
}

// Stop before any later stage when a child exits nonzero or cannot launch.
export async function runStages(stages, execute, report) {
  for (const [name, args] of stages) {
    const step = { name, status: 'running', started_at: new Date().toISOString() };
    report.stages.push(step);
    try {
      const code = await execute(args);
      if (code !== 0) throw new Error(`${name} exited ${code}`);
      step.status = 'passed';
    } catch (error) {
      step.status = 'failed';
      throw error;
    } finally { step.completed_at = new Date().toISOString(); }
  }
}
