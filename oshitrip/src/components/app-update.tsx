"use client";
import { useEffect, useState } from "react";
import { APP_VERSION, UPDATE_URL, RELEASES_URL, releaseSchema, newerVersion, type AppRelease } from "@/lib/app-update";

export function AppUpdate({ web = false }: { web?: boolean }) {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(signal?: AbortSignal) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(UPDATE_URL, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("update");
      const text = await response.text();
      if (text.length > 10000) throw new Error("size");
      const next = releaseSchema.parse(JSON.parse(text));
      if (signal?.aborted) return;
      setRelease(newerVersion(next.version, APP_VERSION) ? next : null);
      setMessage(newerVersion(next.version, APP_VERSION) ? "" : "当前已是最新版本。");
    } catch {
      if (!signal?.aborted) setMessage("暂时无法检查软件更新，仍可继续使用。");
    } finally { if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, []);
  return <section className="data-sync-bar" aria-label="软件版本更新">
    <div><strong>OshiTrip {APP_VERSION}{release ? ` · 新版本 ${release.version} 已发布` : ""}</strong>
      <small role="status">{busy ? "正在检查软件更新…" : release ? release.notes : message}</small>
      {release && <small>{web ? "更新页面后使用新版；收藏和行程保留在本设备。" : "下载对应设备的新版安装包；收藏和行程保留在原设备及原访问地址。"}</small>}
    </div>
    {release ? <><a className="button" href={release.url} target="_blank" rel="noopener noreferrer">查看新版与下载</a>{web && <button className="button secondary" onClick={() => location.reload()}>更新页面</button>}<button className="button secondary" onClick={() => { setRelease(null); setMessage("本次稍后更新，下次打开仍会检查。"); }}>稍后</button></> : <><button className="button secondary" disabled={busy} onClick={() => void check()}>检查软件更新</button><a className="text-link" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">下载中心 ↗</a></>}
  </section>;
}
