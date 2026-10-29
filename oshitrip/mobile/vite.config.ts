import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root, base: "./", publicDir: "public",
  resolve: { alias: {
    "@": path.resolve(root, "../src"),
    "next/link": path.join(root, "link.tsx"),
    "next/navigation": path.join(root, "navigation.ts"),
    "next/image": path.join(root, "image.tsx"),
  } },
  build: { outDir: "../mobile-dist", emptyOutDir: true },
});
