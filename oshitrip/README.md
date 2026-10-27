# OshiTrip 应用 🧳

日本 IP 联动活动查询与旅行匹配工具。项目介绍和 AI 辅助本地部署步骤见[仓库首页](../README.md)。

## 本地启动

使用 Node.js 24 和 pnpm 11.25.0，在本目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Windows PowerShell 可将 `pnpm` 替换为 `pnpm.cmd`。打开终端显示的本地地址，通常为 http://localhost:3000。按 Ctrl+C 停止。

生产模式使用 `pnpm build` 构建，然后用 `pnpm start` 启动。

## 数据与配置

默认读取 `src/data/catalog.json`、`src/data/releases.json` 和 `src/data/stores.json`，不需要数据库或 AI API Key。资料包含官方来源和核实日期，不代表实时预约名额或库存。关注、收藏与旅行安排保存在当前浏览器中。

本地模式下，`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 均应未设置或为空。只配置一项会报错；两项都有值时会切换为数据库模式。修改环境变量后需要重启服务。

### 可选数据库模式

本地查询不需要执行这一步。需要管理后台时：

1. 创建自己的 Supabase 项目。仅对全新空数据库运行 `supabase/setup-new-project.sql`；已有数据库应按当前版本补齐缺失的迁移，不要重跑初始化脚本。
2. 在 Supabase Auth 创建自己的管理员用户，将其 UUID 添加到 `public.admin_users.user_id`。
3. 参照 `.env.example` 创建本机 `.env.local`，填写自己的项目 URL 和 publishable key，重启后访问 `/admin`。
4. 确认数据库迁移、RLS 和管理员授权均正确，再使用后台维护资料。

`.env.local` 不应提交到 Git。网页不需要 service_role、secret key 或 AI API Key；这些服务端密钥不能放入 `NEXT_PUBLIC_` 环境变量。自动采集属于另行配置的可选功能，不会随本地启动自动执行。

## 常用检查命令

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

端到端测试需要先构建，并安装 Playwright 浏览器：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

CI 工作流位于仓库根目录的 `.github/workflows/`。使用 Vercel 部署时，Root Directory 为 `oshitrip`。

## 构建 Windows 启动包

在 Windows x64 的干净源码目录中安装依赖，然后运行：

```sh
pnpm package:windows
node scripts/test-windows-package.mjs
```

脚本会下载并核对官方 Node.js 24.19.0 ZIP 的 SHA256，以本地资料模式构建 Next.js standalone 服务，用系统 .NET Framework 编译启动器，并生成仓库根目录下的 `dist/OshiTrip-1.0.0-windows-x64.zip` 及 SHA256 校验文件。构建目录不能包含 `.env.local` 等私人配置。

启动器仅监听 `127.0.0.1`。端口偏好和日志放在 `%LOCALAPPDATA%\OshiTrip`；关闭窗口会停止其创建的后台进程。首次运行通常使用 43187 端口，后续使用已保存端口。端口临时冲突不会覆盖已保存的地址。

GitHub Actions 的 **Package Windows portable app** 工作流支持手动构建，成功后可在该次运行的 Artifacts 下载 ZIP。构建产物不提交到源码仓库。
