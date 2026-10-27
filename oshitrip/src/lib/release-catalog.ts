import "server-only";
import seed from "@/data/releases.json";
import { releasesSchema, type Release } from "./releases";
import { createDatabase } from "./supabase";
export async function getReleases(): Promise<{
  releases: Release[];
  mode: "local" | "database";
  error?: string;
}> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return {
      releases: releasesSchema
        .parse(seed)
        .filter((p) => p.status === "published"),
      mode: "local",
    };
  try {
    const { data, error } = await createDatabase()
      .from("releases")
      .select("document,updated_at")
      .eq("status", "published");
    if (error) throw error;
    return {
      releases: releasesSchema.parse(
        data.map((r) => ({ ...r.document, updated_at: r.updated_at })),
      ),
      mode: "database",
    };
  } catch {
    return {
      releases: [],
      mode: "database",
      error:
        "商品资料读取失败，请检查数据库连接及 002 迁移。没有以本地数据替代在线结果。",
    };
  }
}
