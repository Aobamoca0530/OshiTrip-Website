import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireRunLock, preparePublication, publishValidated, saveRunReport } from '../../scripts/crawler/daily-run.mjs';
import { imageReviewQueue } from '../../scripts/crawler/image-queue.mjs';
import { discoveryReport } from '../../scripts/crawler/discovery-promotion.mjs';
import { syncVerifiedImageRules, verifiedImage } from '../../scripts/crawler/verified-images.mjs';

function repository({ dirty = '', staged = '', remote = 'base', pushFailures = 0 } = {}) {
  const calls: string[][] = [];
  let head = 'base', index = staged, attempts = 0;
  const runGit = async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'remote') return 'https://github.com/Aobamoca0530/OshiTrip-Website.git';
    if (args.includes('ls-files')) return dirty;
    if (args[0] === 'diff') return index;
    if (args[0] === 'rev-parse') return head;
    if (args[0] === 'ls-remote') return `${remote}\trefs/heads/main`;
    if (args[0] === 'add') index = dirty;
    if (args.includes('commit')) { head = 'commit'; index = ''; }
    if (args[0] === 'push') {
      if (++attempts <= pushFailures) throw new Error('network');
      remote = head;
    }
    return '';
  };
  return { runGit, calls };
}
const checked = () => ({ status: 'checked-with-pending-items', stages: [{ name: 'test', status: 'passed' }], remote_published: false, publication: { status: 'not-requested' } });

describe('daily maintenance publication', () => {
  it('rejects overlapping runs without overwriting reports and releases its own lock', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oshitrip-lock-'));
    try {
      const release = await acquireRunLock(directory);
      await expect(acquireRunLock(directory)).rejects.toThrow('already locked');
      await release();
      await (await acquireRunLock(directory))();
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it('preserves a staged user change and rejects unrelated modifications including root files', async () => {
    for (const options of [{ staged: 'oshitrip/src/data/catalog.json' }, { dirty: 'README.md' }, { dirty: 'oshitrip/src/app/page.tsx' }, { remote: 'newer' }]) {
      const fake = repository(options);
      await expect(preparePublication(fake.runGit)).rejects.toThrow();
      expect(fake.calls.some(args => args[0] === 'add' || args.includes('commit') || args[0] === 'push')).toBe(false);
    }
  });
  it('never publishes failed checks', async () => {
    const fake = repository();
    await expect(publishValidated({ ...checked(), stages: [{ status: 'failed' }] }, 'base', fake)).rejects.toThrow('all maintenance checks');
    expect(fake.calls).toEqual([]);
  });
  it('does not commit or claim publication on an unchanged run', async () => {
    const fake = repository(), report = checked();
    await publishValidated(report, 'base', fake);
    expect(report.publication.status).toBe('unchanged');
    expect(report.remote_published).toBe(false);
    expect(fake.calls.some(args => args.includes('commit') || args[0] === 'push')).toBe(false);
  });
  it('retries a network push and only reports success after remote verification', async () => {
    const fake = repository({ dirty: 'oshitrip/src/data/catalog.json', pushFailures: 1 }), report = checked();
    await publishValidated(report, 'base', { ...fake, pause: async () => {} });
    expect(report.remote_published).toBe(true);
    expect(report.publication).toMatchObject({ status: 'published', commit: 'commit', attempts: 2 });
    expect(fake.calls.filter(args => args[0] === 'push')).toHaveLength(2);
  });
  it('stops if remote advances after commit, retaining the local result without force push', async () => {
    const fake = repository({ dirty: 'oshitrip/src/data/catalog.json' });
    let committed = false;
    const runGit = async (args: string[]) => {
      if (args[0] === 'ls-remote' && committed) return 'other\trefs/heads/main';
      const result = await fake.runGit(args);
      if (args.includes('commit')) committed = true;
      return result;
    };
    const report = checked();
    await expect(publishValidated(report, 'base', { runGit })).rejects.toThrow('Remote main advanced');
    expect(report.remote_published).toBe(false);
    expect(fake.calls.some(args => args[0] === 'push')).toBe(false);
  });
  it('keeps the latest report and only the last 30 local run records', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oshitrip-history-'));
    try {
      for (let i = 0; i < 32; i++) await saveRunReport(directory, { run_id: `2026-10-29-${String(i).padStart(2, '0')}`, status: 'checked' });
      expect(await fs.readdir(path.join(directory, 'runs'))).toHaveLength(30);
      expect(JSON.parse(await fs.readFile(path.join(directory, 'workflow-report.json'), 'utf8')).run_id).toBe('2026-10-29-31');
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});

describe('operator-reviewed image evidence', () => {
  const source = 'https://example.com/news', url = 'https://example.com/rules.jpg';
  const record = { source_url: source, source_hash: 'a'.repeat(64), url, sha256: 'b'.repeat(64), reviewed_at: '2026-10-28T10:00:00+09:00', approved: true, reason: '已对照原图逐项核实', reading: { unreadable: false, rules: [{ kind: '购买', title: '限购', text_zh: '每人限购两件', evidence_ja: 'お一人様2点まで', uncertain: false }] } };
  const row = { source_url: source, images: [{ url }], activity: { state: 'ready', review: { state: 'approved' } } };
  const observation = { source_url: source, content_hash: record.source_hash };
  it('rejects changed bytes, changed source, rejected and uncertain readings', () => {
    expect(verifiedImage(record, row, observation, { sha256: 'c'.repeat(64) })).toBeNull();
    expect(verifiedImage(record, row, { ...observation, content_hash: 'c'.repeat(64) })).toBeNull();
    expect(verifiedImage({ ...record, approved: false }, row, observation)).toBeNull();
    expect(verifiedImage({ ...record, reading: { ...record.reading, unreadable: true } }, row, observation)).toBeNull();
    expect(verifiedImage(record, row, observation, { status: 'failed' })).toBeNull();
  });
  it('projects only reviewed image rules, preserves dates and removes invalidated image rules', () => {
    const event = { sources: [{ url: source }], gallery: [{ url, source_url: source }], translated_rules: [{ id: 'manual', source_url: source }], venues: [{ start_date: '2026-11-01' }] };
    const catalog = { events: [event] };
    const sync = (attempts: object[] = []) => syncVerifiedImageRules(catalog, [row], [{ observation }], [record], attempts);
    sync();
    expect(event.translated_rules).toHaveLength(2);
    expect(event.translated_rules[1]).toMatchObject({ image_sha256: record.sha256, checked_on: '2026-10-28', evidence_ja: 'お一人様2点まで' });
    sync();
    expect(event.translated_rules).toHaveLength(2);
    expect(event.venues).toEqual([{ start_date: '2026-11-01' }]);
    sync([{ source_url: source, url, sha256: 'c'.repeat(64) }]);
    expect(event.translated_rules).toEqual([{ id: 'manual', source_url: source }]);
  });
  it('records the actual review date of a snapshot without pretending to re-read it today', () => {
    const report = imageReviewQueue([row], [{ observation }], [], '2026-10-29T12:00:00Z', [record]);
    expect(report.reviewed_snapshot).toBe(1);
    expect(report.items[0]).toMatchObject({ image_text_verified: true, reviewed_at: record.reviewed_at, sha256: record.sha256 });
  });
});

describe('daily image and discovery queues', () => {
  const row = { source_url: 'https://example.com/news', title: 'test', content_hash: 'hash', images: [{ url: 'https://example.com/1.jpg' }, { url: 'https://example.com/2.jpg' }], related_event_ids: [] };
  it('includes pictures without alt text, deduplicates and retains failed recognition', () => {
    const report = imageReviewQueue([{ ...row, images: [...row.images, row.images[0]] }], [{ observation: { source_url: row.source_url, content_hash: 'hash' }, observed_at: 'old' }], [{ source_url: row.source_url, url: row.images[0].url, status: 'failed', reason: 'timeout' }], 'now');
    expect(report).toMatchObject({ total: 2, failed: 1, pending: 1 });
    expect(report.items.every((item: { observed_at: string; image_text_verified: boolean }) => item.observed_at === 'old' && !item.image_text_verified)).toBe(true);
  });
  it('does not mistake cached OCR or an unavailable source for verified image text', () => {
    const cached = { ...row, image_readings: [{ url: row.images[0].url, sha256: 'bytes', rules: [] }] };
    expect(imageReviewQueue([cached], [], [], 'now').items[0]).toMatchObject({ status: 'source_unavailable', observed_at: null, image_text_verified: false });
    expect(imageReviewQueue([cached], [{ observation: { source_url: row.source_url } }], [], 'now').items[0]).toMatchObject({ status: 'needs_review', image_text_verified: false });
  });
  it('includes zero-image and single-image announcements in the discovery report', () => {
    const report = discoveryReport([{ ...row, images: [] }, { ...row, source_url: 'second', images: row.images.slice(0, 1) }], [], { events: [] }, [], 'now');
    expect(report.total).toBe(2);
    expect(report.items.map((item: { image_count: number }) => item.image_count)).toEqual([0, 1]);
    expect(report.published).toBe(0);
  });
});
