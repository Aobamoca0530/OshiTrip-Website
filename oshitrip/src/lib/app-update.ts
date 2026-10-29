import { z } from "zod";
import { version } from "../../package.json";

export const APP_VERSION = version;
export const RELEASES_URL = "https://github.com/Aobamoca0530/OshiTrip-Website/releases";
export const UPDATE_URL = "https://raw.githubusercontent.com/Aobamoca0530/OshiTrip-Website/main/data/app-release.json";
export const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  notes: z.string().min(1).max(2000),
  url: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === "https://github.com" && url.pathname.startsWith("/Aobamoca0530/OshiTrip-Website/releases/tag/");
  }),
});
export type AppRelease = z.infer<typeof releaseSchema>;
export function newerVersion(candidate: string, current: string) {
  if (![candidate, current].every(v => /^\d+\.\d+\.\d+$/.test(v))) return false;
  const a = candidate.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
