import {
  readFile,
  writeFile,
  mkdir,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createImageReviewer, boundedInteger } from "./crawler/image-rules.mjs";
import { selectedSources } from "./crawler/config.mjs";
import {
  crawlSource,
  observationFingerprint,
  observationSchema,
  extractObservation,
  allowedUrl,
} from "./crawler/core.mjs";
const folder = "var/crawler";
await mkdir(folder, { recursive: true });
let lock;
try {
  lock = await open(`${folder}/run.lock`, "wx");
} catch {
  throw new Error(
    "已有爬虫正在运行；若上次进程异常退出，先确认其已停止再删除 var/crawler/run.lock。",
  );
}
const stamp = new Date().toISOString();
const report = {
  started_at: stamp,
  finished_at: null,
  status: "running",
  sources: [],
  new_candidates: 0,
};
let db;
const imageCache = new Map();
try {
  for (const [key, value] of JSON.parse(
    await readFile(`${folder}/image-cache.json`, "utf8"),
  ))
    imageCache.set(key, value);
} catch {
  /* Cache is optional; candidates remain authoritative. */
}
const check = (r) => {
  if (r.error) throw new Error(`数据库写入失败：${r.error.code || "unknown"}`);
  return r.data;
};
try {
  const imageReviewer = createImageReviewer({ cache: imageCache });
  const pageLimit = boundedInteger(process.env.CRAWLER_PAGE_LIMIT, 3, 30);
  const sources = selectedSources(
    JSON.parse(await readFile("scripts/crawler/sources.json", "utf8")),
    process.env.CRAWLER_SOURCE_IDS,
  );
  let queue = [];
  try {
    queue = JSON.parse(await readFile(`${folder}/queue.json`, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const known = new Set(queue.map((x) => x.fingerprint));
  if (process.argv.includes("--database")) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !(
        process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    )
      throw new Error(
        "数据库模式需要服务端 Supabase URL 与 secret / service_role 密钥；不可放入 NEXT_PUBLIC 密钥。",
      );
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  const argument = (name) => {
    const i = process.argv.indexOf(name);
    return i < 0 ? null : process.argv[i + 1];
  };
  const manualFile = argument("--import-html"),
    manualUrl = argument("--source-url");
  const manifestFile = argument("--import-manifest");
  if (manifestFile && manualFile)
    throw new Error("单页导入与批量清单不能同时使用。");
  if (manualFile && !manualUrl)
    throw new Error(
      "导入 HTML 时必须同时指定 --source-url；不会发出网络请求。",
    );
  const imports = manifestFile
    ? JSON.parse(await readFile(manifestFile, "utf8"))
    : manualFile
      ? [{ file: manualFile, url: manualUrl }]
      : null;
  if (
    imports &&
    (!Array.isArray(imports) || !imports.length || imports.length > 30)
  )
    throw new Error("导入清单需要 1–30 条记录。");
  const jobs = imports
    ? imports.map((item) => {
        if (
          !item ||
          typeof item.file !== "string" ||
          typeof item.url !== "string"
        )
          throw new Error("每条导入需要 file 和 url。");
        const matched = sources.filter((s) => allowedUrl(item.url, s));
        if (matched.length !== 1)
          throw new Error("来源 URL 不在唯一的已配置官方路径范围内。");
        return { source: matched[0], file: item.file, url: item.url };
      })
    : sources.map((source) => ({ source, file: null, url: null }));
  for (const { source, file, url } of jobs) {
    const result = file
      ? {
          status: "success",
          observations: [
            extractObservation(
              await readFile(file, "utf8"),
              url,
              source.kind || "release-source",
            ),
          ],
          errors: [],
        }
      : await crawlSource(source, { imageReviewer, limit: pageLimit });
    const imageReviews = result.observations.flatMap(
      (o) => o.image_reviews || [],
    );
    if (imageReviews.some((r) => r.status === "failed")) {
      result.status = "failed";
      result.errors.push(
        "部分图片识别失败，查看候选 image_reviews 的状态；已有资料未修改。",
      );
    }
    report.sources.push({
      source: source.id,
      method: file ? "manual-html-import" : "scheduled-fetch",
      status: result.status,
      pages: result.observations.length,
      errors: result.errors,
      image_rules: {
        needs_review: imageReviews.filter((r) => r.status === "needs_review")
          .length,
        pending: imageReviews.filter((r) => r.status === "pending").length,
        failed: imageReviews.filter((r) => r.status === "failed").length,
      },
    });
    for (const value of result.observations) {
      const payload = observationSchema.parse(value);
      const fingerprint = observationFingerprint(payload);
      const row = {
        source_url: payload.source_url,
        fingerprint,
        payload,
        status: "pending",
        created_at: stamp,
      };
      if (db)
        check(
          await db
            .from("ingestion_candidates")
            .upsert(row, { onConflict: "fingerprint", ignoreDuplicates: true }),
        );
      if (!known.has(fingerprint)) {
        queue.push(row);
        known.add(fingerprint);
        report.new_candidates++;
      }
    }
  }
  await writeFile(
    `${folder}/queue.next.json`,
    JSON.stringify(queue, null, 2) + "\n",
  );
  await rename(`${folder}/queue.next.json`, `${folder}/queue.json`);
  await writeFile(
    `${folder}/image-cache.json`,
    JSON.stringify([...imageCache]),
  );
  report.status = report.sources.some((s) => s.status === "failed")
    ? "failed"
    : report.sources.some((s) => s.status === "blocked")
      ? "blocked"
      : "success";
} catch (e) {
  report.status = "failed";
  report.error = e.message;
} finally {
  report.finished_at = new Date().toISOString();
  try {
    if (db)
      check(
        await db.from("ingestion_runs").insert({
          adapter: "release-crawler",
          started_at: stamp,
          finished_at: report.finished_at,
          status: report.status,
          error:
            report.status === "success"
              ? null
              : JSON.stringify({
                  error: report.error,
                  sources: report.sources,
                }),
        }),
      );
  } catch (e) {
    report.status = "failed";
    report.error = e.message;
  }
  try {
    await writeFile(
      `${folder}/last-run.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
    await writeFile(
      `${folder}/${stamp.replaceAll(":", "-")}.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
  } finally {
    await lock.close();
    await unlink(`${folder}/run.lock`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "success") process.exitCode = 1;
}
