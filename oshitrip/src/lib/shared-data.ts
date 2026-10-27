import "server-only";
import { cache } from "react";
import catalog from "@/data/catalog.json";
import releases from "@/data/releases.json";
import stores from "@/data/stores.json";
import announcements from "@/data/announcements.json";
import metadata from "@/data/public-meta.json";
import { dataBundleSchema } from "./data-bundle";
import { DataSync } from "./data-sync";

export function sharedDataEnabled() {
  return process.env.OSHITRIP_SHARED_DATA === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
export function sharedDataService() {
  const globalStore = globalThis as typeof globalThis & { oshitripDataSyncV1?: DataSync };
  if (!globalStore.oshitripDataSyncV1) {
    const bundled = dataBundleSchema.parse({ ...metadata, data: {
      catalog: { franchises: catalog.franchises, events: catalog.events.filter(e => ["published", "cancelled"].includes(e.status)) },
      releases: releases.filter(r => r.status === "published"),
      stores: stores.filter(s => s.status === "published"),
      announcements,
    } });
    globalStore.oshitripDataSyncV1 = new DataSync({ bundled,
      cacheDir: process.env.OSHITRIP_DATA_DIR || undefined,
      offline: process.env.OSHITRIP_DATA_OFFLINE === "1",
    });
  }
  return globalStore.oshitripDataSyncV1;
}
// One render reads one complete revision across activities, products and stores.
export const getSharedSnapshot = cache(() => sharedDataService().snapshot());
