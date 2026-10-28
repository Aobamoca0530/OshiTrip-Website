import fs from 'node:fs/promises';
import { resolveAI, requestJSON } from './crawler/ai-provider.mjs';

// One manual, small request through the production adapter. Never print a key,
// response body, headers or provider error message, even when authentication fails.
const config = resolveAI('translation');
const report = { provider: config.provider, model: config.model, configured: config.configured, success: false, requests: 0 };
const safeCodes = new Set(['insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key', 'model_not_found', 'permission_denied', 'access_denied', 'billing_hard_limit_reached', 'account_deactivated', 'unsupported_parameter', 'unsupported_value', 'invalid_value']);
try {
  if (config.provider !== 'openai' || !config.configured) throw new Error('configuration');
  const value = await requestJSON('Return exactly this JSON object: {"ok":true}', { task: 'connection check' }, {
    ...config,
    fetcher: async (url, options) => {
      report.requests++;
      if (report.requests !== 1) throw new Error('request limit');
      const body = JSON.parse(options.body);
      body.max_output_tokens = 128;
      const response = await fetch(url, { ...options, body: JSON.stringify(body) });
      report.http_status = response.status;
      if (!response.ok) {
        const result = await response.clone().json().catch(() => null);
        const code = result?.error?.code;
        report.error_code = safeCodes.has(code) ? code : 'unclassified_api_error';
        const type = result?.error?.type;
        if (safeCodes.has(type)) report.error_code = type;
        const message = typeof result?.error?.message === 'string' ? result.error.message : '';
        if (report.error_code === 'unclassified_api_error' && /billing|credit|quota|balance/i.test(message)) report.error_code = 'quota_or_billing_limit';
        if (report.error_code === 'unclassified_api_error' && /rate.limit|requests per|tokens per/i.test(message)) report.error_code = 'rate_limit_exceeded';
        if (typeof result?.error?.message === 'string' && /input messages.*json|json.*input messages/i.test(result.error.message)) report.error_code = 'json_input_requirement';
        if (['input', 'model', 'text.format', 'max_output_tokens'].includes(result?.error?.param)) report.error_param = result.error.param;
      }
      return response;
    },
  });
  if (value?.ok !== true) throw new Error('response validation');
  report.success = true;
} catch {
  report.error_code ||= !config.configured ? 'missing_key' : 'connection_or_response_validation_failed';
  process.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `OpenAI connection check\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
