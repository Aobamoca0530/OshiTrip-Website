import { describe, it, expect, vi } from "vitest";
import sharp from 'sharp';
import { allowedImageUrl, validatedImageMime } from '../../scripts/crawler/image-assets.mjs';
import { createImageReviewer } from "../../scripts/crawler/image-rules.mjs";
import {
  extractObservation,
  observationFingerprint,
} from "../../scripts/crawler/core.mjs";
const url = "https://www.sweets-paradise.jp/wp-content/uploads/test.jpg";
const context = {
  source: {
    origin: "https://www.sweets-paradise.jp",
    permission: "approved",
    terms_checked_on: "2026-10-28",
    authorization_note: "test only",
  },
  permits: () => true,
  pause: async () => {},
};
const reading = {
  unreadable: false,
  rules: [
    {
      kind: "购买",
      title: "测试",
      evidence_ja: "1会計",
      text_zh: "每次入店结账一次",
      uncertain: false,
    },
  ],
};
describe("image evidence pipeline", () => {
  it("extracts the article title and pictures without neighboring promotions", () => {
    const html =
      '<h1>コラボレーション</h1><img src="/wp-content/uploads/unrelated.jpg"><h1 class="news__title">テストコラボ開催</h1><p>開催期間 2026年11月2日〜29日</p><img src="/wp-content/uploads/test.jpg"><footer><img src="/wp-content/uploads/footer.jpg"></footer>';
    const o = extractObservation(
      html.replace(
        "<footer>",
        "<p>" + "テスト用の参加条件。".repeat(20) + "</p><footer>",
      ),
      "https://www.sweets-paradise.jp/collaboration/test",
      "event-source",
    );
    expect(o.title).toBe("テストコラボ開催");
    expect(o.images.map((i) => i.url)).toEqual([url]);
    expect(o.image_reviews[0].status).toBe("pending");
  });
  it("makes no requests without explicit configuration or when robots disallows", async () => {
    const fetcher = vi.fn();
    const disabled = createImageReviewer({ enabled: false, fetcher });
    expect((await disabled({ url }, context)).status).toBe("pending");
    const enabled = createImageReviewer({
      enabled: true,
      apiKey: "fake",
      model: "test-vision",
      fetcher,
    });
    expect(
      (await enabled({ url }, { ...context, permits: () => false })).status,
    ).toBe("pending");
    expect(
      (await enabled({ url: "https://other.example/img/test.jpg" }, context))
        .status,
    ).toBe("pending");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("hashes bytes, reuses translation for unchanged bytes and detects same-URL replacement", async () => {
    let image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).jpeg().toBuffer(),
      apiCalls = 0;
    const fetcher = vi.fn(
      async (u: Parameters<typeof fetch>[0], options?: RequestInit) => {
        if (u === url)
          return new Response(image, {
            headers: { "content-type": "image/jpeg" },
          });
        apiCalls++;
        const request = JSON.parse(options!.body as string);
        expect(request.store).toBe(false);
        expect(request.text.format.strict).toBe(true);
        return Response.json({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(reading) }],
            },
          ],
        });
      },
    );
    const review = createImageReviewer({
      enabled: true,
      apiKey: "fake",
      model: "test-vision",
      fetcher,
    });
    const a = await review({ url }, context),
      b = await review({ url }, context);
    expect(a.status).toBe("needs_review");
    expect(a.sha256).toBe(b.sha256);
    expect(apiCalls).toBe(1);
    image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    const c = await review({ url }, context);
    expect(c.sha256).not.toBe(a.sha256);
    expect(apiCalls).toBe(2);
    const o = extractObservation(
      "<main><h1>テストイベント</h1><p>開催期間 2026年11月2日" +
        "テスト用の参加条件。".repeat(20) +
        "</p></main>",
      "https://example.org/news/1/",
      "event-source",
    );
    expect(observationFingerprint({ ...o, image_reviews: [a] })).not.toBe(
      observationFingerprint({ ...o, image_reviews: [c] }),
    );
  });
  it("leaves refusals, malformed output, large downloads and failures unpublished", async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).jpeg().toBuffer();
    for (const mode of ["refusal", "bad-json", "large", "network"]) {
      const fetcher = vi.fn(async (u: Parameters<typeof fetch>[0]) => {
        if (mode === "network") throw new Error("private diagnostic");
        if (u === url)
          return new Response(image, {
            headers: {
              "content-type": "image/jpeg",
              ...(mode === "large" ? { "content-length": "9000000" } : {}),
            },
          });
        return Response.json({
          status: "completed",
          output: [
            {
              content:
                mode === "refusal"
                  ? [{ type: "refusal" }]
                  : [{ type: "output_text", text: "broken" }],
            },
          ],
        });
      });
      const r = await createImageReviewer({
        enabled: true,
        apiKey: "fake",
        model: "test-vision",
        fetcher,
      })({ url }, context);
      expect(r.status).toBe("failed");
      expect(r.reading).toBeNull();
      expect(r.reason).not.toContain("private");
    }
  });
});

describe('official image byte validation', () => {
  it('recognizes raster bytes despite the PHP endpoint declaring text/html', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'red' } }).toFormat(format).toBuffer();
      expect(await validatedImageMime(bytes)).toBe(`image/${format}`);
    }
    const proxy = 'https://www.lovelive-anime.jp/nijigasaki/module/image.php?img_path=/lovelive/jp/news/2026/10/30/1002/test/photo.jpeg';
    const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const fetcher = vi.fn(async (u, options) => {
      if (u === proxy) return new Response(image, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      const request = JSON.parse(options.body);
      expect(request.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(reading) }] }] });
    });
    const r = await createImageReviewer({ enabled: true, apiKey: 'fake', model: 'test', fetcher })({ url: proxy }, { ...context, source: { ...context.source, origin: 'https://www.lovelive-anime.jp' } });
    expect(r.status).toBe('needs_review');
    expect(r.sha256).toHaveLength(64);
    expect(allowedImageUrl(proxy + '&extra=1', 'https://www.lovelive-anime.jp')).toBe(false);
    expect(allowedImageUrl(proxy.replace('/test/', '/../'), 'https://www.lovelive-anime.jp')).toBe(false);
  });
  it('rejects real HTML, SVG and corrupt raster bytes regardless of the advertised type', async () => {
    for (const bytes of [Buffer.from('<html>NOT FOUND</html>'), Buffer.from('<svg></svg>'), Buffer.from([255,216,255,0,1])]) {
      await expect(validatedImageMime(bytes)).rejects.toThrow();
    }
  });
});
