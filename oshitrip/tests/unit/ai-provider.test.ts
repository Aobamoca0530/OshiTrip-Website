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
  it("selects Muse independently without exposing its key or replacing existing auto priority", () => {
    const env = { MODEL_API_KEY: "muse-private", MUSE_MODEL: "muse-spark-1.3" };
    expect(publicAIConfig(resolveAI("translation", env))).toEqual({
      provider: "muse", model: "muse-spark-1.3", configured: true, limit: 24,
    });
    expect(resolveAI("review", { ...env, EVENT_REVIEW_MODEL: "custom-model" }).model).toBe("custom-model");
    expect(resolveAI("translation", { ...env, OPENAI_API_KEY: "openai" }).provider).toBe("openai");
    expect(resolveAI("review", { OPENAI_API_KEY: "openai", EVENT_REVIEW_PROVIDER: "muse" }))
      .toMatchObject({ provider: "muse", configured: false });
    expect(JSON.stringify(publicAIConfig(resolveAI("review", env)))).not.toContain("muse-private");
  });
  it.each(["bailian", "deepseek", "openai", "muse"])(
    "uses the correct %s protocol and rejects incomplete responses",
    async (provider) => {
      const fetcher: typeof fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(init?.redirect).toBe("error");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer test" });
        if (provider === "openai" || provider === "muse") {
          expect(url).toBe(provider === "muse"
            ? "https://api.meta.ai/v1/responses" : "https://api.openai.com/v1/responses");
          expect(body.store).toBe(false);
          expect(body.text.format.type).toBe(provider === "muse" ? "json_schema" : "json_object");
          if (provider === "muse") expect(body.text.format.schema).toEqual({ type: "object" });
          expect(body.input).toMatch(/\bJSON\b/);
          expect(JSON.parse(body.input.split('\n').slice(1).join('\n'))).toEqual({});
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
      const config = { provider, apiKey: "test", model: "test-model", fetcher, outputSchema: { type: "object" } };
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
  it("keeps Muse refusals and malformed JSON out of review, without retrying another service", async () => {
    for (const content of [
      [{ type: "refusal", refusal: "Cannot comply" }],
      [{ type: "output_text", text: "not JSON" }],
    ]) {
      let calls = 0;
      await expect(requestJSON("Return JSON", {}, {
        provider: "muse", apiKey: "test", model: "muse-spark-1.3",
        outputSchema: { type: "object" },
        fetcher: async () => {
          calls++;
          return Response.json({ status: "completed", output: [{ type: "message", content }] });
        },
      })).rejects.toThrow();
      expect(calls).toBe(1);
    }
  });
  it.each(["deepseek", "muse"])("requires grounded evidence even if the %s reviewer approves", async (provider) => {
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
      provider,
      apiKey: "test",
      model: "test",
      fetcher: async (_url: string | URL | Request, init?: RequestInit) => {
        const verdict = { approved: true, reason: "核对通过", evidence_ja: [quote] };
        if (provider === "muse") {
          const body = JSON.parse(String(init?.body));
          expect(body.text.format.schema.required).toContain("approved");
          return Response.json({
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(verdict) }] }],
          });
        }
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(verdict),
              },
            },
          ],
        });
      },
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
