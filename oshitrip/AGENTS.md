<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Official news maintenance

For official news, Live/offline events, translation/review providers, or crawler changes, read `docs/official-news-workflow.md` and use the shared `pnpm maintain:public` workflow. `pnpm maintain:public --contract` exposes the actual model schemas and instructions. Preserve pending/failed-source states; do not turn missing evidence into approval or publish if checks fail.
