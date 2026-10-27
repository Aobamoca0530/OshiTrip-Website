import "server-only";
import seed from "@/data/catalog.json";
import { catalogSchema, type Catalog } from "./schema";
import { createDatabase } from "./supabase";
export type CatalogResult = Catalog & {
  mode: "local" | "database";
  error?: string;
};
export async function getCatalog(): Promise<CatalogResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return { ...catalogSchema.parse(seed), mode: "local" };
  try {
    const db = createDatabase();
    const { data, error } = await db.rpc("read_catalog");
    if (error) throw error;
    return { ...catalogSchema.parse(data), mode: "database" };
  } catch {
    console.error(
      "OshiTrip: database catalog read failed. Check configuration, migration and RLS.",
    );
    return {
      franchises: [],
      events: [],
      mode: "database",
      error:
        "数据库暂时无法读取，请检查 Supabase 配置和迁移。此处没有用本地数据冒充在线结果。",
    };
  }
}
