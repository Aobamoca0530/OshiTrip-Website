"use client";
import Image from "next/image";
import { useState } from "react";
import type { OfficialImage as Asset } from "@/lib/schema";
export function OfficialImage({
  asset,
  compact = false,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <figure
      className={`official-image ${compact ? "compact" : ""}`}
      data-testid="official-image"
    >
      <a
        href={asset.source_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${asset.alt} · 查看官方出处`}
      >
        {failedUrl === asset.url ? (
          <span className="image-fallback">图片暂不可用 · 查看官方图片</span>
        ) : (
          <Image
            src={asset.url}
            alt={asset.alt}
            width={640}
            height={480}
            unoptimized
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(asset.url)}
          />
        )}
      </a>
      {!compact && (
        <figcaption>
          <a
            className="text-link"
            href={asset.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            图片官方出处 ↗
          </a>
          <span> · 核实 {asset.checked_on || "待核实"}</span>
        </figcaption>
      )}
    </figure>
  );
}
