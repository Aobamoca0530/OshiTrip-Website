import { OfficialImage } from "./official-image";
import type { OshiEvent } from "@/lib/schema";

export function EventBenefits({ event }: { event: OshiEvent }) {
  if (!event.benefits?.length && !event.gallery?.length) return null;
  return (
    <section className="panel section-space" id="benefits">
      <h2>商品图片与特典 / 满赠</h2>
      <p className="helper">
        金额为含税日元。活动期限不代表赠品仍有库存；出发前请向门店确认。
      </p>
      <div className="benefit-list">
        {event.benefits?.map((b) => (
          <article className="benefit-card" key={b.id}>
            <span className="badge green">{b.channel}</span>
            <h3>{b.title}</h3>
            <p>{b.rule}</p>
            {b.image && <OfficialImage asset={b.image} />}
            <dl>
              <dt>领取门槛</dt>
              <dd>
                {b.threshold_yen
                  ? `每满 ¥${b.threshold_yen.toLocaleString("zh-CN")}（含税）`
                  : b.threshold_quantity
                    ? `同次购买 ${b.threshold_quantity} 件 / 杯，适用商品见规则`
                    : "详见规则；未公布金额不作推算"}
              </dd>
              <dt>适用范围</dt>
              <dd>{b.scope}</dd>
              {b.venue_ids.length > 0 && (
                <>
                  <dt>适用门店</dt>
                  <dd>
                    {event.venues
                      .filter((v) => b.venue_ids.includes(v.id))
                      .map((v) => v.name)
                      .join("、")}
                  </dd>
                </>
              )}
              <dt>领取期间</dt>
              <dd>
                {b.starts_on || "开始日待核实"} — {b.ends_on || "截止日待核实"}
              </dd>
              <dt>款式 / 小票</dt>
              <dd>
                {b.selection} ·{" "}
                {b.receipt_combination === "未说明"
                  ? "小票合并规则未说明"
                  : `小票${b.receipt_combination}`}
              </dd>
              <dt>赠品库存</dt>
              <dd>
                {b.while_supplies_last === true
                  ? "赠完即止；当前余量未公开"
                  : "当前余量未知，请向店铺确认"}
              </dd>
            </dl>
            <a
              className="text-link"
              href={b.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看官方领取条件 ↗
            </a>
            <p className="helper">核实：{b.checked_on || "待核实"}</p>
          </article>
        ))}
      </div>
      {!!event.gallery?.length && (
        <div className="event-gallery">
          {event.gallery.map((asset, i) => (
            <div key={`${asset.url}-${i}`}>
              <h3>{asset.alt}</h3>
              <OfficialImage asset={asset} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
