import { WORKFLOW_VERSION } from './crawler/workflow.mjs';
import { PUBLIC_SOURCE_IDS } from './crawler/public-sources.mjs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { confirmedBookingMethods } from './crawler/supporting-booking-evidence.mjs';
import { eventIdentityLinks } from './crawler/event-identity.mjs';
import { robotsAllows } from './crawler/core.mjs';
import { crawlPublicSource } from './crawler/browser.mjs';
import { createImageReviewer, bailianEndpoint } from './crawler/image-rules.mjs';
import { mergeAnnouncements } from './crawler/public-news.mjs';
import { loadDataSchema } from './load-data-schema.mjs';
import { createProjectFilter, relevantAnnouncement } from './crawler/project-filter.mjs';
import { classifyOffline, translateActivity, validateReading, reviewActivity, eventFromReading, pendingActivity, explicitDates, reviewSchema, containsEvidence } from './crawler/event-intelligence.mjs';
import { resolveAI, publicAIConfig } from './crawler/ai-provider.mjs';
import { classifyAnnouncement } from './crawler/offline-filter.mjs';
import { deduplicateSeriesNews } from './crawler/lovelive-news.mjs';
import { prioritizeDiscovery, syncApprovedGallery, discoveryReport, useManualReading } from './crawler/discovery-promotion.mjs';
import { imageReviewQueue } from './crawler/image-queue.mjs';
import { syncVerifiedImageRules, verifiedImageSchema } from './crawler/verified-images.mjs';
import { createUpdatePlanner, updateIndexes, substantiveObservation, UPDATE_IMAGE_LIMIT } from './crawler/incremental.mjs';

const configured = JSON.parse(await fs.readFile('scripts/crawler/sources.json', 'utf8'));
const projectFilter = createProjectFilter(JSON.parse(await fs.readFile('scripts/crawler/project-keywords.json', 'utf8')));
const relevant = (sourceId, title) => relevantAnnouncement(sourceId, title, projectFilter);
const pruneOnly = process.argv.includes('--prune-only');
const replay = process.argv.includes('--replay');
const updates = process.argv.includes('--updates');
const sourceId = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
if (sourceId && (replay || pruneOnly)) throw new Error('--source cannot be combined with replay/prune');
if (pruneOnly && replay) throw new Error('--prune-only 与 --replay 不能同时使用');
const translationConfig = resolveAI('translation');
const reviewConfig = resolveAI('review');
// Explicitly selected public HTML sources. This is a project crawl decision,
// not a claim of a copyright license. Robots/HTTP access restrictions still apply.
const enabled = new Set(PUBLIC_SOURCE_IDS);
if (sourceId && !enabled.has(sourceId)) throw new Error('Unknown or disabled public source');
const sources = configured.filter(s => enabled.has(s.id) && (!sourceId || s.id === sourceId)).map(s => ({ ...s, public_fetch_enabled: true, index_url: s.id === 'sweets-paradise' ? 'https://www.sweets-paradise.jp/collaboration/' : s.index_url }));
const lastReport = replay || sourceId ? JSON.parse(await fs.readFile('var/public-crawler/report.json', 'utf8')) : null;
const stamp = replay ? lastReport.checked_at : new Date().toISOString();
const retainedReports = sourceId ? lastReport.sources.filter(s => s.id !== sourceId).map(s => ({ ...s, checked_at: s.checked_at || lastReport.checked_at })) : [];
const report = { checked_at: stamp, sources: replay ? lastReport.sources : retainedReports, items: 0, images: 0 };
let observations = replay || sourceId ? JSON.parse(await fs.readFile('var/public-crawler/observations.json', 'utf8')) : [];
if (sourceId) observations = observations.filter(row => row.source.id !== sourceId).map(row => ({ ...row, observed_at: row.observed_at || lastReport.sources.find(s => s.id === row.source.id)?.checked_at || lastReport.checked_at }));
const existing = JSON.parse(await fs.readFile('src/data/announcements.json', 'utf8'));
const catalog = JSON.parse(await fs.readFile('src/data/catalog.json', 'utf8'));
const excluded = JSON.parse(await fs.readFile('scripts/crawler/excluded-sources.json', 'utf8'));
const planner = updates && !replay ? createUpdatePlanner({
  state: JSON.parse(await fs.readFile('scripts/crawler/update-state.json', 'utf8')),
  announcements: existing, excluded, catalog, now: stamp,
}) : null;
const incremental = updates || (replay && lastReport.updates?.mode === 'updates');
const observedUrls = new Set();
const policies = new Map();
const stoppedOrigins = new Map();
for (const { observation: o } of observations) observedUrls.add(o.source_url);
observations = observations.filter(({ source, observation: o }) => relevant(source.id, o.title) && classifyAnnouncement(source, o));
for (const source of pruneOnly || replay ? [] : sources) {
  const result = stoppedOrigins.has(source.origin)
    ? { observations: [], status: 'blocked', errors: [`HTTP ${stoppedOrigins.get(source.origin)}：同站点已停止本轮访问`], deferred_urls: source.urls, discovered: source.urls.length, transport: source.transport || 'http' }
    : await crawlPublicSource(planner ? updateIndexes(source) : source, { ...(planner ? { selectDetailUrls: (entries, result) => planner.select(source, entries, result) } : {}), limit: source.page_limit || (source.id === 'bang-dream-live' ? 40 : 16), acceptDiscoveredLink: ({ url, title }) => {
      const liveDirectory = /\/live_detail\.php|\/otonokizaka\/event\//.test(url);
      const dates = liveDirectory ? explicitDates(title) : [];
      if (dates.length && dates.every(date => date < stamp.slice(0,10))) return false;
      return relevant(source.id, title) && (['bang-dream-live', 'starlight-events', 'gakuen-idolmaster-live', 'gakuen-idolmaster-portal'].includes(source.id) || liveDirectory || classifyOffline(title) !== null || /抽選|先行|コラボ|イベント|ご当地情報|開催|バースデー.*メニュー|記念メニュー/.test(title));
    } });
  const stoppedStatus = result.errors?.join(' ').match(/\bHTTP (401|403|429)\b/)?.[1];
  if (stoppedStatus) stoppedOrigins.set(source.origin, stoppedStatus);
  planner?.finish(result.observations);
  const incoming = planner ? result.observations.filter(o => substantiveObservation(o, existing.find(row => row.source_url === o.source_url))) : result.observations;
  for (const o of incoming) observedUrls.add(o.source_url);
  if (result.robots_rules) policies.set(source.id, result.robots_rules);
  report.sources.push({ id: source.id, transport: result.transport, browser_mode: result.browser_mode, status: result.status, robots: result.robots_status || 'not-checked', pages: result.observations.length, index_pages: result.index_pages || 0, scope: planner ? 'updates' : 'full', discovered: result.discovered, deferred_urls: result.deferred_urls || [], excluded: result.observations.filter(o => !relevant(source.id, o.title)).length, errors: result.errors, access_diagnostics: result.access_diagnostics || [] });
  for (const observation of incoming) if (relevant(source.id, observation.title) && classifyAnnouncement(source, observation)) observations.push({ source, observation, observed_at: stamp });
}
observations = deduplicateSeriesNews(observations, existing);
if (planner) {
  report.updates = { ...planner.summary(), changed_urls: observations.map(x => x.observation.source_url) };
  for (const row of report.sources) row.deferred_urls = report.updates.pending_urls.filter(url => planner.state.entries[url]?.source_id === row.id);
} else if (incremental) report.updates = lastReport.updates;
await fs.mkdir('var/public-crawler', { recursive: true });
await fs.writeFile('var/public-crawler/observations.json', JSON.stringify(observations, null, 2));
if (planner && observations.length) {
  await fs.mkdir('var/public-crawler/update-batches', { recursive: true });
  await fs.writeFile(`var/public-crawler/update-batches/${stamp.replaceAll(':', '-')}.json`, JSON.stringify(observations, null, 2) + '\n');
}
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
if (!pruneOnly && !replay && !report.sources.some(source => (!sourceId || source.id === sourceId) && (source.pages > 0 || source.status === 'success'))) throw new Error('No source returned a usable announcement; existing public data has been preserved.');
if (planner) await fs.writeFile('scripts/crawler/update-state.json', JSON.stringify(planner.state, null, 2) + '\n');
// An unchanged index is a complete lightweight check, not a request to replay
// historical review queues or regenerate every public bundle.
if (planner && !observedUrls.size) {
  report.items = existing.length;
  report.images = existing.reduce((n, row) => n + row.images.length, 0);
  report.updates.no_content_change = true;
  report.discovery = { total: 0, multi_image: 0, promoted: 0, published: 0, pending: 0 };
  await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile('var/public-crawler/assistant-queue.json', JSON.stringify({ workflow_version: WORKFLOW_VERSION, checked_at: stamp, scope: 'updates', items: [], missing_observations: [], historical_pending: existing.filter(row => row.activity?.state !== 'ready').length }, null, 2) + '\n');
  await fs.writeFile('var/public-crawler/discovery-review-report.json', JSON.stringify({ checked_at: stamp, scope: 'updates', ...report.discovery, items: [] }, null, 2) + '\n');
  await fs.writeFile('var/public-crawler/image-review-report.json', JSON.stringify({ checked_at: stamp, scope: 'updates', total: 0, pending: 0, needs_review: 0, failed: 0, source_unavailable: 0, reviewed_snapshot: 0, items: [] }, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const previous = existing.filter(row => relevant(row.source_id, row.title) && (row.activity || classifyOffline(row.title)) && (!observedUrls.has(row.source_url) || observations.some(x => x.observation.source_url === row.source_url)));
report.removed_unrelated = existing.length - previous.length;
const eventOrder = new Map(catalog.events.map((event, index) => [event.id, index]));
catalog.events = catalog.events.filter(e => !e.id.startsWith('auto-') || !e.sources.some(s => observedUrls.has(s.url) && !observations.some(x => x.observation.source_url === s.url)));
let next = mergeAnnouncements(previous, observations, catalog, stamp);
const overrides = JSON.parse(await fs.readFile('scripts/crawler/verified-readings.json', 'utf8'));
let remaining = translationConfig.limit;
let reviewsRemaining = reviewConfig.limit;
report.ai = { translation: publicAIConfig(translationConfig), review: publicAIConfig(reviewConfig) };
report.review = { approved: 0, pending: 0, rejected: 0 };
const queue = [];
report.translation = { translated: 0, cached: 0, pending: 0, excluded: 0, errors: [] };
for (const { source, observation: o, observed_at } of prioritizeDiscovery(observations, next)) {
  const row = next.find(r => r.source_url === o.source_url);
  if (excluded[o.source_url] === o.content_hash) { next = next.filter(r => r.id !== row.id); report.translation.excluded++; continue; }
  const old = existing.find(r => r.source_url === o.source_url);
  const override = overrides[o.source_url];
  const supporting = confirmedBookingMethods(o);
  const supportingHash = supporting.length ? createHash('sha256').update(JSON.stringify(supporting)).digest('hex') : null;
  const approvedCache = old?.activity?.source_hash === o.content_hash && old.activity.state === 'ready' && old.activity.review?.state === 'approved' && catalog.events.some(e => old.related_event_ids.includes(e.id)) && (old.activity.supporting_evidence_hash || null) === supportingHash;
  // Incomplete old manual summaries neither block AI completion nor replace a
  // later approved result when a provider is temporarily unavailable.
  const reviewedManually = useManualReading(override, o.content_hash, translationConfig.configured, approvedCache, reading => validateReading(reading, o, catalog.franchises));
  if (!reviewedManually && approvedCache) {
    row.activity = old.activity; report.translation.cached++; continue;
  }
  const kind = classifyAnnouncement(source, o);
  row.activity = pendingActivity(o, kind, '等待中文翻译，尚不用于行程匹配');
  // A changed official page must not leave obsolete automatic booking rules active.
  const former = catalog.events.find(e => e.id.startsWith('auto-') && e.sources.some(s => s.url === o.source_url));
  if (former) catalog.events = catalog.events.filter(e => e.id !== former.id);
  try {
    let result, model;
    if (reviewedManually) {
      result = validateReading(override.reading, o, catalog.franchises); model = 'source-reviewed';
    } else if (old?.activity?.source_hash === o.content_hash && old.activity.proposal && validateReading(old.activity.proposal, o, catalog.franchises).ready) {
      // Preserve a successful translation while review is missing or out of budget.
      result = validateReading(old.activity.proposal, o, catalog.franchises); model = old.activity.model;
    } else if (translationConfig.configured && remaining > 0) {
      remaining--; result = await translateActivity(o, catalog.franchises, translationConfig); model = `${translationConfig.provider}:${translationConfig.model}`;
    } else { report.translation.pending++; queue.push({ observation: o, task: 'translation-and-review' }); continue; }
    if (!result.reading.offline) { excluded[o.source_url] = o.content_hash; next = next.filter(r => r.id !== row.id); report.translation.excluded++; continue; }
    const r = result.reading;
    let review = { state: 'pending', provider: 'manual', model: 'source-reviewed', reason: '等待对照原文审核' };
    if (reviewedManually) {
      const verdict = override.review ? reviewSchema.parse(override.review) : null;
      if (verdict && !verdict.evidence_ja.every(q => containsEvidence(o.body_text, q))) throw new Error('人工审核证据不在原文');
      review = { ...review, state: verdict?.approved === false ? 'rejected' : 'approved', reason: verdict?.reason || '已对照原文翻译并复核' };
    }
    else if (reviewConfig.configured && reviewsRemaining > 0) {
      reviewsRemaining--;
      try {
        const verdict = await reviewActivity(r, o, catalog.franchises, reviewConfig);
        review = { state: verdict.approved ? 'approved' : 'rejected', provider: reviewConfig.provider, model: reviewConfig.model, reason: verdict.reason };
      } catch { review.reason = '审核接口失败或返回结果未通过校验，等待复核'; }
    }
    report.review[review.state]++;
    const ready = result.ready && review.state === 'approved';
    // proposal/review are worker-only metadata; the public v3 schema strips them.
    row.activity = { kind: r.kind, state: ready ? 'ready' : 'needs_review', title_zh: r.title_zh, summary_zh: r.summary_zh, rules: r.rules, source_hash: o.content_hash, model, reason: (ready ? result.reason : `${result.reason}；${review.reason}`).slice(0, 500), review, ...(!reviewedManually && !ready ? { proposal: r } : {}) };
    if (supportingHash) row.activity.supporting_evidence_hash = supportingHash;
    if (!ready) queue.push({ observation: o, task: 'review', reading: r, reason: row.activity.reason });
    if (ready) {
      const manual = catalog.events.find(e => e.sources.some(s => s.url === o.source_url || eventIdentityLinks(o).includes(s.url)));
      if (!manual) catalog.events.push(eventFromReading(r, o, row.images, observed_at || stamp, former));
    }
    report.translation.translated++;
  } catch (error) {
    report.translation.pending++;
    queue.push({ observation: o, task: 'translation-and-review' });
    report.translation.errors.push({ source_url: o.source_url, error: /^AI 服务 HTTP \d{3}$/.test(error.message) ? error.message : '翻译或证据校验失败，保留待处理' });
  }
}
catalog.events.sort((a, b) => (eventOrder.get(a.id) ?? Infinity) - (eventOrder.get(b.id) ?? Infinity) || a.id.localeCompare(b.id));
for (const row of next) {
  // Older announcements without an activity record also enter discovery immediately.
  row.activity ??= pendingActivity({ content_hash: row.content_hash }, classifyOffline(row.title) || 'offline', '等待对照官方原文翻译与审核');
  const observation = observations.find(x => x.observation.source_url === row.source_url)?.observation;
  row.related_event_ids = catalog.events.filter(e => e.sources.some(s => s.url === row.source_url || (observation && eventIdentityLinks(observation).includes(s.url))) || (!observation && row.related_event_ids.includes(e.id))).map(e => e.id);
  const captured = observations.find(x => x.observation.source_url === row.source_url);
  if (captured) for (const event of catalog.events.filter(e => row.related_event_ids.includes(e.id))) syncApprovedGallery(event, row, captured.observed_at || stamp);
}
const scoped = rows => incremental ? rows.filter(row => observations.some(x => x.observation.source_url === row.source_url)) : rows;
const promotion = discoveryReport(scoped(next), observations, catalog, existing, stamp);
report.discovery = { total: promotion.total, multi_image: promotion.items.filter(item => item.image_count >= 2).length, promoted: promotion.promoted, published: promotion.published, pending: promotion.pending };
await fs.writeFile('var/public-crawler/discovery-review-report.json', JSON.stringify(promotion, null, 2) + '\n');
const imageCacheFile = 'var/public-crawler/image-cache.json';
let imageCache = new Map();
try { imageCache = new Map(JSON.parse(await fs.readFile(imageCacheFile, 'utf8'))); } catch { /* No cache yet. */ }
for (const row of existing) for (const r of row.image_readings || []) {
  const provider = r.provider || 'bailian';
  imageCache.set(`image-rules-v2:${provider}:${provider === 'bailian' ? bailianEndpoint(process.env.DASHSCOPE_BASE_URL || undefined) : 'openai'}:${r.model}:${r.sha256}`, { unreadable: r.unreadable, rules: r.rules.map(rule => ({ ...rule, kind: '其他' })) });
}
const imageProvider = process.env.IMAGE_RULE_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'bailian');
const imageKey = imageProvider === 'bailian' ? process.env.DASHSCOPE_API_KEY : process.env.OPENAI_API_KEY;
const reviewImage = createImageReviewer({ provider: imageProvider, apiKey: imageKey, model: process.env.IMAGE_RULE_MODEL || (imageProvider === 'bailian' ? 'qwen3-vl-plus' : 'gpt-4.1-mini'), cache: imageCache });
const imageAttempts = [];
let imageBudget = incremental ? UPDATE_IMAGE_LIMIT : Infinity;
for (const { source, observation: o } of prioritizeDiscovery(observations, next)) {
  const row = next.find(r => r.source_url === o.source_url);
  if (!row) continue;
  const old = existing.find(r => r.source_url === o.source_url);
  row.image_readings = (old?.image_readings || []).filter(r => row.images.some(i => i.url === r.url));
  if (replay || process.env.CRAWLER_IMAGE_RULES !== 'true' || !imageKey || stoppedOrigins.has(source.origin)) continue;
  // Sparse alt text must not silently exclude a poster. Prefer rule pictures,
  // then unseen pictures; every remaining picture is kept in the review queue.
  const priority = image => (row.image_readings.some(r => r.url === image.url) ? 0 : 2)
    + (/注意|予約|参加|入場|購入|特典|メニュー|商品|グッズ|ルール|整理券/.test(`${image.alt} ${image.context}`) ? 1 : 0);
  const candidates = [...o.images].sort((a, b) => priority(b) - priority(a)).slice(0, 4);
  for (const image of candidates) {
    if (imageBudget <= 0) break;
    imageBudget--;
    const result = await reviewImage(image, { source, permits: path => policies.has(source.id) && robotsAllows(policies.get(source.id), path), pause: ms => new Promise(resolve => setTimeout(resolve, ms)) });
    imageAttempts.push({ source_url: o.source_url, ...result });
    if ([401, 403, 429].includes(result.source_http_status)) {
      stoppedOrigins.set(source.origin, result.source_http_status);
      break;
    }
    // Image-only readings remain visibly unverified and never set travel or ticket dates.
    if (result.reading && result.sha256) {
      row.image_readings = row.image_readings.filter(r => r.url !== image.url);
      row.image_readings.push({ url: image.url, sha256: result.sha256, provider: imageProvider, model: result.model, rules: result.reading.rules.map(({ kind, ...rule }) => { void kind; return rule; }), unreadable: result.reading.unreadable });
    }
  }
  row.image_readings = row.image_readings.slice(-8);
}
await fs.writeFile(imageCacheFile, JSON.stringify([...imageCache].slice(-400)));
const verifiedImages = JSON.parse(await fs.readFile('scripts/crawler/verified-image-readings.json', 'utf8')).map(record => verifiedImageSchema.parse(record));
if (new Set(verifiedImages.map(record => `${record.source_url}\n${record.url}`)).size !== verifiedImages.length) throw new Error('Duplicate image review records');
syncVerifiedImageRules(catalog, next, observations, verifiedImages, imageAttempts);
const imageQueue = imageReviewQueue(scoped(next), observations, imageAttempts, stamp, verifiedImages);
await fs.writeFile('var/public-crawler/image-review-report.json', JSON.stringify(imageQueue, null, 2) + '\n');
const { publicDataSchema } = await loadDataSchema();
// Validate through the same application schema before replacing the file.
publicDataSchema.parse({ catalog: { ...catalog, events: catalog.events.filter(e => ['published', 'cancelled'].includes(e.status)) }, releases: JSON.parse(await fs.readFile('src/data/releases.json', 'utf8')).filter(r => r.status === 'published'), stores: JSON.parse(await fs.readFile('src/data/stores.json', 'utf8')).filter(s => s.status === 'published'), announcements: next });
await fs.writeFile('src/data/announcements.next.json', JSON.stringify(next, null, 2) + '\n');
await fs.rename('src/data/announcements.next.json', 'src/data/announcements.json');
await fs.writeFile('src/data/catalog.json', JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile('scripts/crawler/excluded-sources.json', JSON.stringify(excluded, null, 2) + '\n');
report.items = next.length;
report.images = next.reduce((sum, item) => sum + item.images.length, 0);
await fs.writeFile('var/public-crawler/report.json', JSON.stringify(report, null, 2) + '\n');
await fs.writeFile('var/public-crawler/assistant-queue.json', JSON.stringify({ workflow_version: WORKFLOW_VERSION, contract_command: 'pnpm maintain:public --contract', checked_at: stamp, scope: incremental ? 'updates' : 'full', historical_pending: incremental ? next.filter(r => r.activity.state !== 'ready' && !observedUrls.has(r.source_url)).length : 0, items: queue, missing_observations: incremental ? [] : next.filter(r => r.activity.state !== 'ready' && !observations.some(x => x.observation.source_url === r.source_url)).map(r => ({ source_url: r.source_url, title: r.title })) }, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (queue.length) console.log(`::warning::${queue.length} 条官方公告等待翻译或复核，已进入发现活动待审核区；详见 assistant-queue.json。`);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `## Official announcements\n${report.items} announcements; ${report.images} image links.\n\n${report.sources.map(s => `- ${s.id}: ${s.status} (${s.pages} pages)`).join('\n')}\n`);
