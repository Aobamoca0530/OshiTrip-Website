import "server-only";
import seed from "@/data/stores.json";
import { storesSchema, type Store } from "./shopping";
import { createDatabase } from "./supabase";
export async function getStores(): Promise<{
  stores: Store[];
  error?: string;
  mode: "local" | "database";
}> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return {
      stores: storesSchema.parse(seed).filter((s) => s.status === "published"),
      mode: "local",
    };
  try {
    const { data, error } = await createDatabase()
      .from("store_branches")
      .select("*")
      .eq("status", "published");
    if (error) throw error;
    return { stores: storesSchema.parse(data), mode: "database" };
  } catch {
    return {
      stores: [],
      mode: "database",
      error:
        "门店目录读取失败，请检查数据库与003迁移。没有用本地门店冒充数据库结果。",
    };
  }
}
