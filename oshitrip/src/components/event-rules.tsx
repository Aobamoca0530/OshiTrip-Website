import type { OshiEvent } from "@/lib/schema";
export function EventRules({ event }: { event: OshiEvent }) {
  if (!event.translated_rules?.length) return null;
  return (
    <section className="panel section-space" id="rules">
      <span className="eyebrow">BEFORE YOU GO</span>
      <h2>合集说明 · 中文参加与购买指南</h2>
      <p className="helper">
        依据官方公告及图片整理、人工复核的中文说明，非官方译文。各门店日期见下方列表。
      </p>
      <div className="translated-rules">
        {event.translated_rules.map((r) => (
          <article key={r.id}>
            <span className="badge">{r.kind}</span>
            <h3>{r.title}</h3>
            <p>{r.text_zh}</p>
            <details>
              <summary>查看日文证据与出处</summary>
              <p lang="ja">{r.evidence_ja || "依据官方正文整理"}</p>
              <a
                className="text-link"
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                官方公告 ↗
              </a>
              {r.image_url && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    className="text-link"
                    href={r.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    规则原图 ↗
                  </a>
                </>
              )}
              <p className="helper">核实：{r.checked_on || "待核实"}</p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
