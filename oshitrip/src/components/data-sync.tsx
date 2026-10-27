"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { SyncStatus } from "@/lib/data-sync";

function time(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function DataSyncBar({ initial }: { initial: SyncStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shownRevision = useRef(initial.revision);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/data-sync", { cache: "no-store" });
        if (!response.ok) throw new Error("status");
        const next: SyncStatus & { enabled: boolean } = await response.json();
        if (disposed || !next.enabled) return;
        setStatus(next);
        if (next.revision !== shownRevision.current) { shownRevision.current = next.revision; router.refresh(); }
        if (next.checking || next.result === "idle") timer = setTimeout(poll, 1000);
      } catch { if (!disposed) setError("暂时无法检查更新，现有资料仍可使用。"); }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [router]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/data-sync", { method: "POST", headers: { "X-OshiTrip-Refresh": "1" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("refresh");
      const next: SyncStatus = await response.json();
      setStatus(next);
      shownRevision.current = next.revision;
      router.refresh();
    } catch { setError("刷新未完成，继续使用现有资料，请稍后再试。"); }
    finally { setBusy(false); }
  }
  return <section className="data-sync-bar" aria-label="活动数据更新">
    <div>
      <strong>活动资料 · {status.source === "bundled" ? "内置版本" : "已缓存版本"}</strong>
      <span>数据发布于 {time(status.publishedAt)}（北京时间）</span>
      <small role="status" aria-live="polite">{error || (busy || status.checking ? "正在检查更新，现有资料仍可使用…" : status.message)}{status.lastCheckedAt && !busy && !status.checking ? ` 最近检查：${time(status.lastCheckedAt)}` : ""}</small>
    </div>
    <button type="button" className="button secondary" disabled={busy || status.checking} onClick={refresh}>
      <RefreshCw size={16} aria-hidden="true" />{busy || status.checking ? "检查中…" : "刷新活动数据"}
    </button>
  </section>;
}
