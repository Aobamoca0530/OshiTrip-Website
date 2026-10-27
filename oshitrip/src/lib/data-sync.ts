import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { dataBundleSchema, MAX_DATA_BYTES, PUBLIC_DATA_URL, type DataBundle } from "./data-bundle";

export type SyncStatus = {
  source: "bundled" | "cache";
  revision: string;
  publishedAt: string;
  lastCheckedAt: string | null;
  checking: boolean;
  result: "idle" | "current" | "updated" | "unavailable";
  message: string;
};

type Options = {
  bundled: DataBundle;
  cacheDir?: string;
  fetcher?: typeof fetch;
  offline?: boolean;
  now?: () => number;
  cooldownMs?: number;
};

export class DataSync {
  private active: DataBundle;
  private source: SyncStatus["source"] = "bundled";
  private initialized?: Promise<void>;
  private pending?: Promise<SyncStatus>;
  private lastAttempt = -Infinity;
  private lastCheckedAt: string | null = null;
  private result: SyncStatus["result"] = "idle";
  private message = "使用软件内置资料。";
  private readonly now: () => number;

  constructor(private readonly options: Options) {
    this.active = dataBundleSchema.parse(options.bundled);
    this.now = options.now || Date.now;
  }

  private async initialize() {
    if (!this.initialized) this.initialized = (async () => {
      if (!this.options.cacheDir) return;
      try {
        const file = path.join(this.options.cacheDir, "public-v2.json");
        if ((await fs.stat(file)).size > MAX_DATA_BYTES) return;
        const cached = dataBundleSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
        if (Date.parse(cached.publishedAt) >= Date.parse(this.active.publishedAt)) {
          this.active = cached;
          this.source = "cache";
          this.message = "使用上次保存的活动资料。";
        }
      } catch { /* No usable cache: the bundled data remains available. */ }
    })();
    await this.initialized;
  }

  async snapshot() {
    await this.initialize();
    // Start in the background: offline launches never wait for the network.
    if (this.now() - this.lastAttempt > 15 * 60 * 1000) void this.refresh();
    return this.active;
  }

  async status(): Promise<SyncStatus> {
    await this.snapshot();
    return this.currentStatus();
  }

  private currentStatus(): SyncStatus {
    return {
      source: this.source,
      revision: this.active.revision,
      publishedAt: this.active.publishedAt,
      lastCheckedAt: this.lastCheckedAt,
      checking: Boolean(this.pending),
      result: this.result,
      message: this.message,
    };
  }

  async refresh(): Promise<SyncStatus> {
    await this.initialize();
    if (this.pending) { await this.pending; return this.currentStatus(); }
    if (this.now() - this.lastAttempt < (this.options.cooldownMs ?? 10000)) return this.currentStatus();
    this.lastAttempt = this.now();
    this.pending = this.download().finally(() => { this.pending = undefined; });
    await this.pending;
    return this.currentStatus();
  }

  private async download(): Promise<SyncStatus> {
    let temp: string | undefined;
    try {
      if (this.options.offline) throw new Error("offline");
      const response = await (this.options.fetcher || fetch)(PUBLIC_DATA_URL, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || !response.body) throw new Error("download");
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MAX_DATA_BYTES) throw new Error("size");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_DATA_BYTES) throw new Error("size");
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const next = dataBundleSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (Date.parse(next.publishedAt) > this.now() + 24 * 60 * 60 * 1000 || Date.parse(next.publishedAt) < Date.parse(this.active.publishedAt)) throw new Error("version");
      // Save the complete, validated bundle before changing the active dataset.
      // A failed/partial download can never overwrite a working cache.
      if (this.options.cacheDir) {
        await fs.mkdir(this.options.cacheDir, { recursive: true });
        temp = path.join(this.options.cacheDir, `public-${randomUUID()}.tmp`);
        await fs.writeFile(temp, JSON.stringify(next), { flag: "wx" });
        await fs.rename(temp, path.join(this.options.cacheDir, "public-v2.json"));
        temp = undefined;
      }
      const changed = next.revision !== this.active.revision;
      this.active = next;
      this.source = "cache";
      this.lastCheckedAt = new Date(this.now()).toISOString();
      this.result = changed ? "updated" : "current";
      this.message = changed ? "活动资料已更新。" : "当前已是最新发布的数据。";
    } catch {
      this.result = "unavailable";
      this.message = this.options.offline
        ? "离线模式：继续使用已保存的资料。"
        : "暂时无法获取或保存有效更新，继续使用现有资料。";
    } finally {
      if (temp) await fs.unlink(temp).catch(() => {});
    }
    return this.currentStatus();
  }
}
