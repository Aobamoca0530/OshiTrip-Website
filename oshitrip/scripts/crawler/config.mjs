import { bailianEndpoint, boundedInteger } from "./image-rules.mjs";
export function selectedSources(sources, value = "") {
  const ids = value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (ids.some((id) => !sources.some((s) => s.id === id)))
    throw new Error("CRAWLER_SOURCE_IDS 包含未配置的来源 ID");
  return ids.length ? sources.filter((s) => ids.includes(s.id)) : sources;
}
export function configurationReport(env, sources) {
  const provider = env.IMAGE_RULE_PROVIDER || "openai",
    errors = [],
    warnings = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL)
    errors.push("缺少 SUPABASE_URL（工作流映射为 NEXT_PUBLIC_SUPABASE_URL）");
  else {
    try {
      const u = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      errors.push("SUPABASE_URL 不是有效的 HTTPS 项目地址");
    }
  }
  if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY)
    errors.push("缺少 SUPABASE_SECRET_KEY");
  if (!["openai", "bailian"].includes(provider))
    errors.push("IMAGE_RULE_PROVIDER 必须为 bailian 或 openai");
  if (env.CRAWLER_IMAGE_RULES === "true") {
    if (!env[provider === "bailian" ? "DASHSCOPE_API_KEY" : "OPENAI_API_KEY"])
      errors.push(
        `缺少 ${provider === "bailian" ? "DASHSCOPE_API_KEY" : "OPENAI_API_KEY"}`,
      );
    if (provider === "openai" && !env.IMAGE_RULE_MODEL)
      errors.push("缺少 IMAGE_RULE_MODEL");
  } else warnings.push("图片识别未开启，图片规则会保留待人工阅读。");
  if (provider === "bailian")
    try {
      bailianEndpoint(env.DASHSCOPE_BASE_URL || undefined);
    } catch {
      errors.push("DASHSCOPE_BASE_URL 必须是受支持的官方北京地域接入地址");
    }
  let selected = [],
    imageLimit,
    pageLimit;
  try {
    selected = selectedSources(sources, env.CRAWLER_SOURCE_IDS);
  } catch (e) {
    errors.push(e.message);
  }
  try {
    imageLimit = boundedInteger(env.CRAWLER_IMAGE_LIMIT, 4, 16);
    pageLimit = boundedInteger(env.CRAWLER_PAGE_LIMIT, 3, 30);
  } catch (e) {
    errors.push(e.message);
  }
  const approved = selected
    .filter(
      (s) =>
        s.permission === "approved" &&
        s.terms_checked_on &&
        s.authorization_note?.trim(),
    )
    .map((s) => s.id);
  if (!approved.length)
    warnings.push("所选来源尚未完成自动访问许可核实；配置齐全也不会抓取官网。");
  return {
    configured: errors.length === 0,
    ready: errors.length === 0 && approved.length > 0,
    provider,
    image_limit: imageLimit,
    pages_per_source: pageLimit,
    approved_sources: approved,
    errors,
    warnings,
    note: "仅检查配置是否存在及格式，不验证密钥有效性，不发网络请求，也不消耗 AI 额度。",
  };
}
