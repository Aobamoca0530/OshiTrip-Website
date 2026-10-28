import { describe, expect, it } from "vitest";
import {
  classifyOffline,
  validateReading,
  eventFromReading,
  translateActivity,
} from "../../scripts/crawler/event-intelligence.mjs";
import verified from "../../scripts/crawler/verified-readings.json";
import catalog from "../../src/data/catalog.json";
import { eventSchema } from "../../src/lib/schema";
const [url, fixture] = Object.entries(verified)[0];
const reading = fixture.reading;
const body = [
  ...reading.rules.map((r) => r.evidence_ja),
  ...reading.venues.map((v) => v.evidence_ja),
  reading.booking.evidence_ja,
].join("\n");
const observation = {
  source_url: url,
  title: "RAISE A SUILEN LIVE TOUR 2027",
  body_text: body,
};
describe("offline activity understanding", () => {
  it.each([
    "ラブライブ！虹ヶ咲 バースデーケーキ発売",
    "ラブライブ！新商品のお知らせ",
    "Roselia LIVE Blu-ray 発売決定",
    "虹ヶ咲 生配信のお知らせ",
    "Roselia LIVE 開催報告",
    "バンドリ グッズ通販開始",
  ])("rejects unrelated/online-only news: %s", (title) => {
    expect(classifyOffline(title)).toBeNull();
  });
  it.each([
    "虹ヶ咲 POP UP STORE",
    "THEキャラCAFE × ラブライブ！",
    "虹ヶ咲 キッチンカー ドリンク",
    "Starry Horizon Blu-ray 発売記念 パネル展・抽選会",
    "少女歌劇 舞台挨拶付き上映",
  ])("keeps physical events: %s", (title) => {
    expect(classifyOffline(title)).toBe("offline");
  });
  it("uses concert body evidence for a ticket announcement without confusing merchandise giveaways", () => {
    expect(
      classifyOffline(
        "最速先行抽選受付",
        "ツアー公演 会場 東京 チケット申込券",
      ),
    ).toBe("live");
    expect(
      classifyOffline("グッズ抽選受付", "サイン入り商品を抽選でプレゼント"),
    ).toBeNull();
  });
  it("publishes grounded venues without inventing an open ticket window", () => {
    const result = validateReading(reading, observation, catalog.franchises);
    expect(result.ready).toBe(true);
    const event = eventSchema.parse(
      eventFromReading(
        reading,
        observation,
        [],
        "2026-10-28T08:00:00Z",
        undefined,
      ),
    );
    expect(event.venues).toHaveLength(5);
    expect(
      event.venues.every(
        (v) =>
          v.rounds[0].kind === "unannounced" && v.rounds[0].opens_at === null,
      ),
    ).toBe(true);
  });
  it("rejects invented evidence and withholds invented dates or venue-wide assumptions", () => {
    const invented = structuredClone(reading);
    invented.rules[0].evidence_ja = "存在しないルール";
    expect(() =>
      validateReading(invented, observation, catalog.franchises),
    ).toThrow();
    const wrongDate = structuredClone(reading);
    wrongDate.venues[0].start_date = "2027-04-05";
    expect(
      validateReading(wrongDate, observation, catalog.franchises).ready,
    ).toBe(false);
    const wrongWindow = structuredClone(reading);
    Object.assign(wrongWindow.booking, {
      opens_at: "2026-10-28T12:00:00+09:00",
    });
    expect(
      validateReading(wrongWindow, observation, catalog.franchises).ready,
    ).toBe(false);
    const perVenue = structuredClone(reading);
    perVenue.booking.applies_to_all_venues = false;
    expect(
      validateReading(perVenue, observation, catalog.franchises).ready,
    ).toBe(false);
  });
  it("requires explicit no-reservation evidence instead of treating missing rules as free entry", () => {
    const r = structuredClone(reading);
    r.booking.method = "无需预约";
    expect(validateReading(r, observation, catalog.franchises).ready).toBe(
      false,
    );
  });
  it("calls only the approved translation endpoint and validates complete JSON responses", async () => {
    let request: RequestInit | undefined;
    const result = await translateActivity(observation, catalog.franchises, {
      apiKey: "test-only",
      fetcher: async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        );
        request = init;
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(reading) },
            },
          ],
        });
      },
    });
    expect(result.ready).toBe(true);
    expect(JSON.parse(String(request?.body)).enable_thinking).toBe(false);
    await expect(
      translateActivity(observation, catalog.franchises, {
        apiKey: "test-only",
        baseUrl: "https://evil.test/compatible-mode/v1",
      }),
    ).rejects.toThrow();
    await expect(
      translateActivity(observation, catalog.franchises, {
        apiKey: "test-only",
        fetcher: async () =>
          Response.json({ choices: [{ finish_reason: "length" }] }),
      }),
    ).rejects.toThrow();
  });
});
