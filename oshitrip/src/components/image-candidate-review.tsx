import { imageCandidateSchema } from "@/lib/image-candidates";
export function ImageCandidateReview({ payload }: { payload: unknown }) {
  const parsed = imageCandidateSchema.safeParse(payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  return (
    <div className="translated-rules">
      <h3>{p.title}</h3>
      <p>
        采集顺序：名称 → 官方图片 → 图片规则识别与中文翻译 → 人工审核。共{" "}
        {p.images.length} 张图片。
      </p>
      {p.images.map((image) => {
        const review = p.image_reviews.find((r) => r.url === image.url);
        return (
          <details key={image.url}>
            <summary>
              {image.alt || "官方活动图片"} ·{" "}
              {review?.status === "needs_review"
                ? "译文待审核"
                : review?.status === "failed"
                  ? "识别失败"
                  : "尚未识别"}
            </summary>
            <a
              className="text-link"
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开官方原图对照 ↗
            </a>
            <p>{review?.reason || "需人工阅读图片中的规则。"}</p>
            {review?.reading?.rules.map((r, i) => (
              <div key={i}>
                <h4>
                  {r.title}
                  {r.uncertain ? " · 内容不确定，请勿直接发布" : ""}
                </h4>
                <p lang="ja">{r.evidence_ja}</p>
                <p>{r.text_zh}</p>
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}
