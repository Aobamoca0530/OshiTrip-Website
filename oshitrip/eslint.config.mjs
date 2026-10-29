import { defineConfig, globalIgnores } from "eslint/config";
import next from "@next/eslint-plugin-next";
import ts from "typescript-eslint";
export default defineConfig([
  ...ts.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
    },
  },
  globalIgnores([
    ".next/**",
    ".desktop-cache/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "var/**",
  ]),
]);
