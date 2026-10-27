import { readFile } from "node:fs/promises";
import { configurationReport } from "./crawler/config.mjs";
const sources = JSON.parse(
  await readFile("scripts/crawler/sources.json", "utf8"),
);
const report = configurationReport(process.env, sources);
console.log(JSON.stringify(report, null, 2));
if (
  !report.configured ||
  (process.argv.includes("--require-ready") && !report.ready)
)
  process.exitCode = 1;
