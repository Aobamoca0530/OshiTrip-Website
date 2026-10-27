"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>暂时无法加载</h1>
      <p>请稍后再试，已保存的本地行程不会被删除。</p>
      <button className="button primary" onClick={reset}>
        重新加载
      </button>
    </div>
  );
}
