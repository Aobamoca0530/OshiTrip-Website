import { describe, it, expect } from "vitest";
import {
  resolveAI,
  requestJSON,
  publicAIConfig,
} from "../../scripts/crawler/ai-provider.mjs";
import { reviewActivity } from "../../scripts/crawler/event-intelligence.mjs";
import verified from "../../scripts/crawler/verified-readings.json";
import catalog from "../../src/data/catalog.json";
import { bailianEndpoint } from "../../scripts/crawler/image-rules.mjs";

describe("translation and review providers", () => {
  it.each(["", "   "])("uses the official default for an empty Actions base URL %j", (baseUrl) => {
    expect(bailianEndpoint(baseUrl)).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  });
  it("queues manual work without keys and selects independent configured providers", () => {
    expect(resolveAI("translation", {}).provider).toBe("manual");
    const env = {
      OPENAI_API_KEY: "private",
      DEEPSEEK_API_KEY: "ds",
      EVENT_REVIEW_PROVIDER: "deepseek",
    };
    expect(resolveAI("translation", env).provider).toBe("openai");
    expect(resolveAI("review", env).provider).toBe("deepseek");
    expect(
      JSON.stringify(publicAIConfig(resolveAI("translation", env))),
    ).not.toContain("private");
    expect(
      resolveAI("review", { ...env, EVENT_REVIEW_PROVIDER: "bailian" })
        .configured,
    ).toBe(false);
    expect(
      resolveAI("review", { ...env, EVENT_REVIEW_PROVIDER: "manual" })
        .configured,
    ).toBe(false);
    expect(() =>
      resolveAI("review", { EVENT_REVIEW_PROVIDER: "unknown" }),
    ).toThrow();
    expect(() =>
      resolveAI("translation", { EVENT_TRANSLATION_LIMIT: "0" }),
    ).toThrow();
  });
  it.each(["bailian", "deepseek", "openai"])(
    "uses the correct %s protocol and rejects incomplete responses",
    async (provider) => {
      const fetcher: typeof fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(init?.redirect).toBe("error");
        if (provider === "openai") {
          expect(url).toBe("https://api.openai.com/v1/responses");
          expect(body.store).toBe(false);
          return Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: '{"ok":true}' }],
              },
            ],
          });
        }
        expect(url).toBe(
          provider === "deepseek"
            ? "https://api.deepseek.com/chat/completions"
            : "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        );
        expect(body.response_format.type).toBe("json_object");
        expect(body.enable_thinking).toBe(
          provider === "bailian" ? false : undefined,
        );
        return Response.json({
          choices: [
            { finish_reason: "stop", message: { content: '{"ok":true}' } },
          ],
        });
      };
      const config = { provider, apiKey: "test", model: "test-model", fetcher };
      expect(await requestJSON("Return JSON", {}, config)).toEqual({
        ok: true,
      });
      await expect(
        requestJSON(
          "Return JSON",
          {},
          {
            ...config,
            fetcher: async () =>
              Response.json({
                status: "incomplete",
                choices: [{ finish_reason: "length" }],
              }),
          },
        ),
      ).rejects.toThrow();
      await expect(
        requestJSON(
          "Return JSON",
          {},
          {
            ...config,
            fetcher: async () => new Response("secret error", { status: 401 }),
          },
        ),
      ).rejects.toThrow("HTTP 401");
    },
  );
  it("requires grounded evidence even if the reviewer approves", async () => {
    const [url, fixture] = Object.entries(verified)[0];
    const reading = structuredClone(fixture.reading);
    const body = [
      ...reading.rules.map((r) => r.evidence_ja),
      ...reading.venues.map((v) => v.evidence_ja),
      reading.booking.evidence_ja,
    ].join("\n");
    const observation = {
      source_url: url,
      title: reading.title_zh,
      body_text: body,
    };
    let quote = reading.rules[0].evidence_ja;
    const options = {
      provider: "deepseek",
      apiKey: "test",
      model: "test",
      fetcher: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  approved: true,
                  reason: "核对通过",
                  evidence_ja: [quote],
                }),
              },
            },
          ],
        }),
    };
    expect(
      (await reviewActivity(reading, observation, catalog.franchises, options))
        .approved,
    ).toBe(true);
    reading.venues[0].start_date = "2027-04-05";
    expect(
      (await reviewActivity(reading, observation, catalog.franchises, options))
        .approved,
    ).toBe(false);
    quote = "原文不存在的审核依据";
    await expect(
      reviewActivity(reading, observation, catalog.franchises, options),
    ).rejects.toThrow("审核证据");
  });
});
