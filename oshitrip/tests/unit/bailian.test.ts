import { describe, it, expect, vi } from "vitest";
import {
  recognizeImage,
  bailianEndpoint,
  createImageReviewer,
} from "../../scripts/crawler/image-rules.mjs";
import {
  configurationReport,
  selectedSources,
} from "../../scripts/crawler/config.mjs";
const reading = {
  unreadable: false,
  rules: [
    {
      kind: "购买",
      title: "购买限制",
      evidence_ja: "お一人様1会計",
      text_zh: "每人限结账一次",
      uncertain: false,
    },
  ],
};
const config = {
  provider: "bailian",
  apiKey: "fake-test-key",
  model: "qwen3-vl-plus",
};
describe("Bailian vision integration", () => {
  it("uses the Beijing official endpoint, JSON mode and bounded non-thinking output", async () => {
    const fetcher = vi.fn(
      async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        expect(url).toBe(
          "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        );
        const body = JSON.parse(init!.body as string);
        expect(body.enable_thinking).toBe(false);
        expect(body.max_tokens).toBe(4096);
        expect(body.response_format).toEqual({ type: "json_object" });
        expect(body.messages[0].content).toContain("JSON");
        expect(body.messages[1].content[1].image_url.url).toMatch(
          /^data:image\/png;base64,/,
        );
        expect(init!.redirect).toBe("error");
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(reading) },
            },
          ],
        });
      },
    );
    expect(
      await recognizeImage(Buffer.from("test"), "image/png", {
        ...config,
        fetcher,
      }),
    ).toEqual(reading);
  });
  it("validates output locally and never accepts truncation or malformed rules", async () => {
    for (const response of [
      {
        choices: [
          {
            finish_reason: "length",
            message: { content: JSON.stringify(reading) },
          },
        ],
      },
      {
        choices: [
          { finish_reason: "stop", message: { content: '{"rules":[]}' } },
        ],
      },
      {
        choices: [{ finish_reason: "stop", message: { content: "not json" } }],
      },
    ])
      await expect(
        recognizeImage(Buffer.from("test"), "image/png", {
          ...config,
          fetcher: async () => Response.json(response),
        }),
      ).rejects.toThrow();
  });
  it("rejects nonofficial endpoints before sending the key", async () => {
    for (const baseUrl of [
      "https://evil.example/compatible-mode/v1",
      "https://dashscope.aliyuncs.com.evil.example/compatible-mode/v1",
      "http://dashscope.aliyuncs.com/compatible-mode/v1",
      "https://user:pass@dashscope.aliyuncs.com/compatible-mode/v1",
    ]) {
      const fetcher = vi.fn();
      await expect(
        recognizeImage(Buffer.from("test"), "image/png", {
          ...config,
          baseUrl,
          fetcher,
        }),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    }
    expect(
      bailianEndpoint(
        "https://llm-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/",
      ),
    ).toBe(
      "https://llm-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
  });
  it("applies paid-call budget only to uncached images across runs", async () => {
    const context = {
      source: {
        origin: "https://www.sweets-paradise.jp",
        permission: "approved",
        terms_checked_on: "2026-10-28",
        authorization_note: "test fixture",
      },
      permits: () => true,
      pause: async () => {},
    };
    const cache = new Map();
    let calls = 0;
    const fetcher = vi.fn(async (u: Parameters<typeof fetch>[0]) => {
      if (String(u).includes("sweets-paradise"))
        return new Response(String(u), {
          headers: { "content-type": "image/png" },
        });
      calls++;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(reading) },
          },
        ],
      });
    });
    const a = { url: "https://www.sweets-paradise.jp/uploads/a.png" },
      b = { url: "https://www.sweets-paradise.jp/uploads/b.png" };
    const first = createImageReviewer({
      ...config,
      fetcher,
      cache,
      limit: 1,
      enabled: true,
    });
    expect((await first(a, context)).status).toBe("needs_review");
    expect((await first(b, context)).status).toBe("pending");
    expect(calls).toBe(1);
    const second = createImageReviewer({
      ...config,
      fetcher,
      cache: new Map(JSON.parse(JSON.stringify([...cache]))),
      limit: 1,
      enabled: true,
    });
    expect((await second(a, context)).status).toBe("needs_review");
    expect((await second(b, context)).status).toBe("needs_review");
    expect(calls).toBe(2);
  });
});
describe("non-network configuration checks", () => {
  const sources = [
    {
      id: "sweets-paradise",
      permission: "unreviewed",
      terms_checked_on: null,
      authorization_note: "待核实",
    },
  ];
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "private-db-value",
    DASHSCOPE_API_KEY: "private-ai-value",
    IMAGE_RULE_PROVIDER: "bailian",
    CRAWLER_IMAGE_RULES: "true",
  };
  it("distinguishes present secrets from source readiness without leaking values", () => {
    const r = configurationReport(env, sources);
    expect(r.configured).toBe(true);
    expect(r.ready).toBe(false);
    expect(JSON.stringify(r)).not.toContain("private-");
  });
  it("requires the selected provider's key and enforces bounded settings", () => {
    expect(
      configurationReport(
        { ...env, DASHSCOPE_API_KEY: "", OPENAI_API_KEY: "unrelated" },
        sources,
      ).configured,
    ).toBe(false);
    expect(
      configurationReport({ ...env, CRAWLER_IMAGE_LIMIT: "1000" }, sources)
        .configured,
    ).toBe(false);
    expect(
      configurationReport({ ...env, CRAWLER_PAGE_LIMIT: "-1" }, sources)
        .configured,
    ).toBe(false);
    expect(() => selectedSources(sources, "typo")).toThrow();
  });
});
