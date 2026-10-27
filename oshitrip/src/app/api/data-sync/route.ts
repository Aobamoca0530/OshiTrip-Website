import { sharedDataEnabled, sharedDataService } from "@/lib/shared-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!sharedDataEnabled()) return Response.json({ enabled: false }, { headers });
  return Response.json({ enabled: true, ...await sharedDataService().status() }, { headers });
}
export async function POST(request: Request) {
  if (!sharedDataEnabled()) return Response.json({ enabled: false }, { status: 404, headers });
  // Only the same-origin UI can refresh the fixed public source.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && host && new URL(origin).host === host && ["http:", "https:"].includes(new URL(origin).protocol)); } catch { /* reject */ }
  if (!sameOrigin || request.headers.get("x-oshitrip-refresh") !== "1" || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ error: "不允许跨站刷新" }, { status: 403, headers });
  return Response.json({ enabled: true, ...await sharedDataService().refresh() }, { headers });
}
