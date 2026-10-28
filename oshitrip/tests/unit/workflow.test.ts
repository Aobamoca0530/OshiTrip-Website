import { describe, it, expect } from 'vitest';
import { accessDiagnostic, readErrorSample } from '../../scripts/crawler/access-diagnostics.mjs';
import { workflowContract, runStages } from '../../scripts/crawler/workflow.mjs';
import { fetchLimited } from '../../scripts/crawler/core.mjs';

describe('official news workflow', () => {
  it('exports the same bounded schemas and instructions for every provider without secrets', () => {
    const contract = workflowContract();
    expect(contract.outputs.translation.required).toContain('venues');
    expect(contract.outputs.review.required).toContain('evidence_ja');
    expect(contract.instructions.translation).toContain('每个venues');
    expect(contract.providers).toEqual(['openai', 'bailian', 'deepseek', 'manual']);
    expect(JSON.stringify(contract)).not.toContain('apiKey');
  });

  it('stops after a failed stage and never attempts publication', async () => {
    const called: string[] = [], report = { stages: [] };
    await expect(runStages([['check', ['check']], ['publish', ['publish']]], async (args: string[]) => {
      called.push(args[0]); return 1;
    }, report)).rejects.toThrow('check exited 1');
    expect(called).toEqual(['check']);
    expect(report.stages).toEqual([expect.objectContaining({ name: 'check', status: 'failed', completed_at: expect.any(String) })]);
  });

  it('records an unlaunchable child as failed', async () => {
    const report = { stages: [] };
    await expect(runStages([['check', ['check']]], async () => { throw new Error('ENOENT'); }, report)).rejects.toThrow('ENOENT');
    expect(report.stages).toEqual([expect.objectContaining({ status: 'failed' })]);
  });
});

describe('HTTP failure diagnostics', () => {
  it('does not mislabel a branded S3 not-found response as proven anti-bot', async () => {
    const response = new Response('<h2>NOT FOUND</h2><p>お探しのページは見つかりませんでした</p>', { status: 403, headers: { server: 'AmazonS3', 'x-cache': 'Error from cloudfront', 'set-cookie': 'private=value' } });
    await expect(fetchLimited('https://www.lovelive-anime.jp/nijigasaki/topics.php', { fetcher: async () => response })).rejects.toMatchObject({ httpStatus: 403, diagnostic: { error_page_kind: 'not_found_page', headers: { server: 'AmazonS3' } } });
    const diagnostic = accessDiagnostic(new Response('', { status: 403, headers: { 'set-cookie': 'private=value' } }), 'NOT FOUND');
    expect(diagnostic.conclusion).toContain('不能仅凭');
    expect(JSON.stringify(diagnostic)).not.toContain('private');
  });

  it('distinguishes challenges and rate limits without claiming their root cause', () => {
    expect(accessDiagnostic(new Response('', { status: 403 }), 'Verify you are human').error_page_kind).toBe('challenge');
    expect(accessDiagnostic(new Response('', { status: 429 }), '').error_page_kind).toBe('rate_limited');
    expect(accessDiagnostic(new Response('', { status: 403 }), '').error_page_kind).toBe('unknown');
  });

  it('bounds error-body reads even without a content length', async () => {
    expect(await readErrorSample(new Response('a'.repeat(100000)), 20)).toBe('a'.repeat(20));
  });
});
