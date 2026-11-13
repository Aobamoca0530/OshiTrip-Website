import { resolveAI, requestJSON, publicAIConfig } from './crawler/ai-provider.mjs';

// Explicit, single-request smoke check. No response bodies or secrets in logs.
const config = resolveAI('translation', {
  ...process.env,
  EVENT_TRANSLATION_PROVIDER: 'muse',
  EVENT_TRANSLATION_MODEL: process.env.MUSE_MODEL || 'muse-spark-1.3',
});
const report = { ...publicAIConfig(config), success: false, requests: 0 };
try {
  if (!config.configured) throw new Error('missing key');
  const result = await requestJSON('Return JSON exactly: {"ok":true}', {}, {
    ...config,
    outputSchema: {
      type: 'object', properties: { ok: { type: 'boolean', const: true } },
      required: ['ok'], additionalProperties: false,
    },
    fetcher: async (url, options) => {
      report.requests++;
      if (report.requests !== 1) throw new Error('request limit');
      const body = JSON.parse(options.body);
      body.max_output_tokens = 512;
      body.reasoning = { effort: 'minimal' };
      const response = await fetch(url, { ...options, body: JSON.stringify(body) });
      report.http_status = response.status;
      return response;
    },
  });
  if (result?.ok !== true) throw new Error('invalid response');
  report.success = true;
} catch {
  report.error_code = !config.configured ? 'missing_key' : 'connection_or_response_validation_failed';
  process.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
