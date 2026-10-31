import fs from 'node:fs/promises';

const configured = JSON.parse(await fs.readFile('scripts/crawler/sources.json', 'utf8')).filter(source => source.transport === 'browser');
const report = JSON.parse(await fs.readFile('var/public-crawler/report.json', 'utf8'));
const lines = ['## Browser collection', '', `Observed at: ${report.checked_at}`, '', '| Source | Transport | Mode | Result | Pages | Deferred |', '| --- | --- | --- | --- | ---: | ---: |'];
let incomplete = false;
for (const source of configured) {
  const result = report.sources.find(item => item.id === source.id);
  const complete = result?.transport === 'browser' && result.browser_mode === (source.browser_mode || 'headless') && result.status === 'success' && (result.scope === 'updates' ? result.index_pages > 0 || (result.continuation && result.pages > 0) : result.pages > 0) && !result.deferred_urls?.length;
  incomplete ||= !complete;
  lines.push(`| ${source.id} | ${result?.transport || 'not-run'} | ${result?.browser_mode || 'unknown'} | ${complete ? 'complete' : 'incomplete'} | ${result?.pages || 0} | ${result?.deferred_urls?.length || 0} |`);
  if (!complete) console.log(`::warning::${source.id}: browser collection is incomplete. Existing records are retained; see public-crawler-report.`);
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
if (incomplete && process.env.CRAWLER_REQUIRE_BROWSER_SUCCESS === 'true') process.exitCode = 1;
