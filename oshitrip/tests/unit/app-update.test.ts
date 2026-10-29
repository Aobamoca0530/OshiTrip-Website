import { describe, expect, it } from "vitest";
import { newerVersion, releaseSchema } from "../../src/lib/app-update";
describe("software update feed", () => {
  it("compares numeric versions without downgrades", () => {
    expect(newerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(newerVersion("2.0.0", "1.99.99")).toBe(true);
    for (const value of ["1.5.0", "1.4.9", "garbage", "1.6.0-beta"]) expect(newerVersion(value, "1.5.0")).toBe(false);
  });
  it("accepts only this repository's release download pages", () => {
    const release = { version: "1.6.0", notes: "新版", url: "https://github.com/Aobamoca0530/OshiTrip-Website/releases/tag/v1.6.0" };
    expect(releaseSchema.safeParse(release).success).toBe(true);
    for (const url of ["javascript:alert(1)", "https://github.com.evil.test/Aobamoca0530/OshiTrip-Website/releases/tag/v2", "https://github.com/other/app/releases/tag/v2"]) expect(releaseSchema.safeParse({ ...release, url }).success).toBe(false);
  });
});
