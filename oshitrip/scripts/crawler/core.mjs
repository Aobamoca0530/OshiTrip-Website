import { createHash } from "node:crypto";
import { z } from "zod";
import { imageReviewSchema, pendingImage } from "./image-rules.mjs";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
export const observationSchema = z.object({
  kind: z.enum(["release-source", "event-source"]),
  source_url: z.url({ protocol: /^https$/ }),
  title: z.string().min(1).max(500),
  release_on: date.nullable(),
  skus: z.array(z.string()).max(50),
  edition_mentions: z.array(z.string().max(260)).max(30).default([]),
  event_mentions: z.array(z.string().max(260)).max(30).default([]),
  lottery_mentions: z.array(z.string().max(260)).max(30),
  windows: z.array(z.string().max(260)).max(30),
  retailer_mentions: z.array(z.string().max(260)).max(30),
  benefit_mentions: z.array(z.string().max(260)).max(40).default([]),
  social_links: z
    .array(z.url({ protocol: /^https$/ }))
    .max(20)
    .default([]),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  image_reviews: z.array(imageReviewSchema).max(80).default([]),
  images: z
    .array(
      z.object({
        url: z.url({ protocol: /^https$/ }),
        alt: z.string().max(500),
        context: z.string().max(260),
      }),
    )
    .max(80)
    .default([]),
});
function articleHtml(html, sourceUrl) {
  if (new URL(sourceUrl).hostname === "bushiroad-creative.com" && /^\/topics\/\d+\/$/.test(new URL(sourceUrl).pathname)) {
    const title = html.match(/<h1\b[^>]*class=["'][^"']*p-block-b-b__title[^"']*["'][^>]*>([^]*?)<\/h1>/i)?.[1];
    const article = html.match(/<article\b[^>]*class=["'][^"']*c-post[^"']*["'][^>]*>([^]*?)<\/article>/i)?.[1];
    if (!title || !article) throw new Error("Bushiroad Creative 正文结构变化，保留原资料");
    return `<h1>${title}</h1>${article}`;
  }
  if (
    new URL(sourceUrl).hostname === "www.sweets-paradise.jp" &&
    /^\/collaboration\/.+/.test(new URL(sourceUrl).pathname)
  ) {
    const start = html.search(/<h1\b[^>]*class=["'][^"']*news__title/);
    if (start < 0) throw new Error("甜品天堂公告正文结构变化，需人工检查");
    return html.slice(start).split(/<footer\b|<!--\s*関連記事/i)[0];
  }
  if (
    new URL(sourceUrl).hostname === "www.lovelive-anime.jp" &&
    new URL(sourceUrl).pathname === "/nijigasaki/detail.php"
  ) {
    const article = [...html.matchAll(/<article\b[^>]*>([^]*?)<\/article>/gi)]
      .map((m) => m[1])
      .find((value) => /class=["']newsbox["']/.test(value));
    if (!article) throw new Error("虹咲公告正文结构变化，需人工检查");
    return article;
  }
  return html.match(/<main\b[^>]*>([^]*?)<\/main>/i)?.[1] || html;
}
export function extractImageCandidates(html, sourceUrl) {
  const content = articleHtml(html, sourceUrl).replace(
    /<(script|style|nav|footer|header)\b[^>]*>[^]*?<\/\1>/gi,
    "",
  );
  const seen = new Set(),
    images = [];
  for (const m of content.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = Object.fromEntries(
      [...m[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((a) => [
        a[1].toLowerCase(),
        a[2],
      ]),
    );
    const raw = attrs["data-src"] || attrs.src;
    if (!raw) continue;
    try {
      const u = new URL(raw.replaceAll("&amp;", "&"), sourceUrl);
      const loveLiveImage =
        u.hostname === "www.lovelive-anime.jp" &&
        u.pathname === "/nijigasaki/module/image.php" &&
        [...u.searchParams.keys()].length === 1 &&
        /^\/lovelive\/jp\/news\/[0-9/]+\/[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(
          u.searchParams.get("img_path") || "",
        );
      const staticImage =
        /(?:uploads|assets|files|images|img)\//.test(u.pathname) &&
        /\.(?:png|jpe?g|webp|avif)$/i.test(u.pathname);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        !new Set([
          new URL(sourceUrl).hostname,
          "bang-dream.com",
          "bushiroad-music.com",
          "bushiroad-works.com",
          "bushiroad-creative.com",
          "cdn.shopify.com",
          "www.sweets-paradise.jp",
          ...(new URL(sourceUrl).hostname === "www.lovelive-anime.jp"
            ? ["img.sunrise-inc.co.jp"]
            : []),
        ]).has(u.hostname) ||
        (!staticImage && !loveLiveImage) ||
        seen.has(u.href)
      )
        continue;
      seen.add(u.href);
      images.push({
        url: u.href,
        alt: (attrs.alt || "").slice(0, 500),
        context: textFromHtml(
          content.slice(Math.max(0, m.index - 1800), m.index),
        ).slice(-260),
      });
    } catch {
      /* Ignore malformed and non-public asset URLs. */
    }
    if (images.length >= 80) break;
  }
  return images;
}
export function textFromHtml(html) {
  return html
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[^]*?<\/\1>/gi, "")
    .replace(/<(?:br|\/p|\/div|\/h[1-6]|\/tr|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, x) => {
      const n =
        x[0].toLowerCase() === "x" ? parseInt(x.slice(1), 16) : Number(x);
      return n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo);/g,
      (_, x) =>
        ({
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          nbsp: " ",
          rsquo: "’",
          lsquo: "‘",
        })[x],
    )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
export function extractObservation(html, url, kind = "release-source") {
  const body = articleHtml(html, url).replace(
    /<(script|style|nav|footer|header)\b[^>]*>[^]*?<\/\1>/gi,
    "",
  );
  const text = textFromHtml(body);
  const title =
    (new URL(url).hostname === "www.lovelive-anime.jp" &&
      textFromHtml(body.match(/<h5\b[^>]*>([^]*?)<\/h5>/i)?.[1] || "")) ||
    (new URL(url).hostname === "www.team-e.co.jp" &&
      new URL(url).pathname === "/popup/lovelive/" &&
      textFromHtml(body.match(/<h2\b[^>]*>([^]*?)<\/h2>/i)?.[1] || "")) ||
    [...body.matchAll(/<h1\b[^>]*>([^]*?)<\/h1>/gi)]
      .map((m) => textFromHtml(m[1]))
      .find(Boolean) ||
    "";
  if (
    !title ||
    text.length < 120 ||
    /captcha|access denied|verify you are human/i.test(title)
  )
    throw new Error("页面结构不匹配或访问受限；保留原数据。");
  const release = text.match(/発売日\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const candidate = release
    ? `${release[1]}-${release[2].padStart(2, "0")}-${release[3].padStart(2, "0")}`
    : null;
  const lines = text.split("\n");
  const collect = (re) =>
    [
      ...new Set(lines.filter((l) => re.test(l)).map((l) => l.slice(0, 260))),
    ].slice(0, 30);
  // Evidence is untrusted, bounded text, never instructions or confirmed edition/lottery relationships.
  return observationSchema.parse({
    kind,
    source_url: url,
    title,
    release_on: candidate,
    skus: [...new Set(text.match(/BRMM-\d{5}/g) || [])].sort().slice(0, 50),
    edition_mentions: collect(/BRMM-|円|延期|販売中止/),
    event_mentions: collect(/開催|会場|店舗|場所|期間|[0-9]{4}年/),
    lottery_mentions: collect(/抽選|申込券|シリアル/),
    benefit_mentions: collect(
      /特典|税込|ごと|毎に|合算|ランダム|なくなり|プレゼント|同時購入|ノベルティ/,
    ).slice(0, 40),
    social_links: [
      ...new Set(
        [
          ...body.matchAll(
            /href\s*=\s*["'](https:\/\/(?:x\.com|twitter\.com)\/[^"']+)["']/gi,
          ),
        ]
          .map((m) => m[1])
          .filter((value) => {
            try {
              const u = new URL(value);
              return (
                /^\/[A-Za-z0-9_]+(?:\/status\/\d+)?\/?$/.test(u.pathname) &&
                !/\/(?:intent|share|home)\/?$/.test(u.pathname) &&
                !u.search
              );
            } catch {
              return false;
            }
          }),
      ),
    ].slice(0, 20),
    windows: collect(/受付期間|予約期間|予約締切|予約締め切り|申込期間/),
    retailer_mentions: lines
      .flatMap((line, i) => {
        if (!line.startsWith("▼")) return [];
        const following = lines.slice(i + 1),
          next = following.findIndex((l) => l.startsWith("▼"));
        return [
          [line, ...following.slice(0, next < 0 ? 3 : Math.min(next, 3))]
            .join(" ")
            .slice(0, 260),
        ];
      })
      .slice(0, 30),
    content_hash: createHash("sha256").update(text).digest("hex"),
    images: extractImageCandidates(html, url),
    image_reviews: extractImageCandidates(html, url).map((x) =>
      pendingImage(x.url),
    ),
  });
}
export const observationFingerprint = (o) =>
  createHash("sha256")
    .update(JSON.stringify(observationSchema.parse(o)))
    .digest("hex");
export function allowedUrl(value, source) {
  try {
    const u = new URL(value);
    const rule = source.query_rules?.[u.pathname];
    const queryAllowed = rule
      ? Object.keys(rule).length === [...u.searchParams.keys()].length &&
        Object.entries(rule).every(
          ([key, pattern]) =>
            u.searchParams.getAll(key).length === 1 &&
            new RegExp(pattern).test(u.searchParams.get(key)),
        )
      : !u.search;
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.origin === source.origin &&
      queryAllowed &&
      !u.hash &&
      source.path_patterns.some((p) => new RegExp(p).test(u.pathname))
    );
  } catch {
    return false;
  }
}
export function discoverLinks(html, source) {
  const urls = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], source.index_url);
      if (
        allowedUrl(u.href, source) &&
        (/\/(?:discographies|news|topics)\/\d+\/$/.test(u.pathname) ||
          (source.discovery_patterns || []).some((p) =>
            new RegExp(p).test(u.pathname),
          ))
      )
        urls.push(u.href);
    } catch {
      /* Ignore non-URL links. */
    }
  }
  return [...new Set(urls)];
}
// Fail closed when robots is unavailable; longest matching rule wins, allow wins ties.
export function robotsAllows(text, path, agent = "oshitripbot") {
  const groups = [];
  let current = { agents: [], rules: [] },
    hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(),
      value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (hasRules) {
        groups.push(current);
        current = { agents: [], rules: [] };
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (["allow", "disallow"].includes(key) && current.agents.length) {
      hasRules = true;
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  groups.push(current);
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && agent.includes(a)),
  );
  const selected = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  const rules = selected
    .flatMap((g) => g.rules)
    .filter((r) => {
      const regex = r.pattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$");
      return new RegExp("^" + regex).test(path);
    })
    .sort(
      (a, b) =>
        b.pattern.replace(/\*/g, "").length -
          a.pattern.replace(/\*/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return !rules.length || rules[0].allow;
}
export async function fetchLimited(
  url,
  { fetcher = fetch, maxBytes = 1500000, content = "html" } = {},
) {
  const response = await fetcher(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "OshiTripBot/1.0 (public event facts; daily review queue)",
      Accept: content === "html" ? "text/html" : "text/plain",
    },
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}；不跟随重定向或绕过限制。`);
  if (
    content === "html" &&
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("响应不是 HTML");
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw new Error("页面超过大小限制");
  if (!response.body) throw new Error("空响应");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error("页面超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function crawlSource(
  source,
  {
    fetcher = fetch,
    pause = (ms) => new Promise((r) => setTimeout(r, ms)),
    limit = 20,
    imageReviewer,
  } = {},
) {
  if (
    source.permission === "denied" ||
    !(source.public_fetch_enabled === true || (source.permission === "approved" && source.authorization_note?.trim() && source.terms_checked_on))
  )
    return {
      status: "blocked",
      observations: [],
      errors: ["来源尚未完成自动访问许可核实，未发出网络请求。"],
    };
  const observations = [],
    errors = [];
  let robots;
  try {
    robots = await fetchLimited(`${source.origin}/robots.txt`, {
      fetcher,
      content: "text",
      maxBytes: 100000,
    });
    if (!/^\s*user-agent\s*:/im.test(robots))
      throw new Error("无法识别 robots 规则");
  } catch (e) {
    return {
      status: "blocked",
      observations,
      errors: [`robots 核实失败：${e.message}`],
    };
  }
  const read = async (url) => {
    if (
      !allowedUrl(url, source) ||
      !robotsAllows(robots, new URL(url).pathname + new URL(url).search)
    )
      throw new Error("URL 不在批准范围或 robots 禁止");
    await pause(2000);
    return fetchLimited(url, { fetcher });
  };
  let urls = [...source.urls];
  if (source.index_url) {
    try {
      const html = await read(source.index_url);
      // New announcements must not be starved by a long list of fixed seed URLs.
      urls = [...discoverLinks(html, source), ...urls];
    } catch (e) {
      errors.push(`官方目录：${e.message}`);
    }
  }
  for (const url of [...new Set(urls)].slice(0, Math.min(30, limit))) {
    try {
      const observation = extractObservation(
        await read(url),
        url,
        source.kind || "release-source",
      );
      if (imageReviewer) {
        observation.image_reviews = [];
        for (const image of observation.images)
          observation.image_reviews.push(
            await imageReviewer(image, {
              source,
              permits: (path) => robotsAllows(robots, path),
              pause,
            }),
          );
      }
      observations.push(observation);
    } catch (e) {
      errors.push(`${url}：${e.message}`);
    }
  }
  return { status: errors.length ? "failed" : "success", observations, errors };
}
