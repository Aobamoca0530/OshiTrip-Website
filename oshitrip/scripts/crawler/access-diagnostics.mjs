// Evidence about an HTTP failure, not a definitive diagnosis of the origin's policy.
export function accessDiagnostic(response, body = '') {
  const headers = Object.fromEntries(['server', 'via', 'x-cache', 'x-amz-cf-pop', 'content-type', 'date', 'retry-after']
    .map(key => [key, response.headers.get(key)?.slice(0, 500)]).filter(([, value]) => value));
  const text = body.replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ');
  const kind = response.status === 429 ? 'rate_limited'
    : /captcha|verify you are human|checking your browser|cf-chl-/i.test(body) ? 'challenge'
    : /お探しのページは見つかりません|指定されたURLは存在しない|\bNOT FOUND\b/i.test(text) ? 'not_found_page'
    : /access denied|アクセスが拒否|forbidden/i.test(text) ? 'access_denied_page' : 'unknown';
  return {
    http_status: response.status, headers, error_page_kind: kind,
    conclusion: kind === 'not_found_page'
      ? '响应为页面不存在提示；可能涉及源站路径、权限或自定义错误映射，不能仅凭 403 认定反爬。'
      : kind === 'challenge' ? '错误页含验证提示；停止自动采集，不绕过验证。'
      : kind === 'rate_limited' ? '请求受到限流；结束本轮，不立即重试。'
      : '客户端证据不足以区分源站权限、CDN/WAF、地区或其他访问限制。',
  };
}

export async function readErrorSample(response, limit = 32768) {
  if (!response.body) return '';
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, limit - size);
      chunks.push(chunk); size += chunk.length;
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}
