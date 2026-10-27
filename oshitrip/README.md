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

### 统一数据模式

Windows 启动器自动启用此模式。源码版或未来的网页版可设置 `OSHITRIP_SHARED_DATA=1`，并保持两个 Supabase 变量为空。可选设置 `OSHITRIP_DATA_DIR` 为服务器上可写的缓存目录（绝对路径）；不设置时只缓存于进程内存，重启回到内置资料。不要把个人电脑的缓存路径直接复制到云端。

服务从本公开仓库 `main` 分支的 `data/public-v1.json` 获取活动、附券商品与门店资料。每次启动先加载本地资料，再后台检查更新；持续使用时在页面或状态请求中最多每 15 分钟检查一次。页面提供手动刷新，连续点击有 10 秒间隔限制。下载超时、版本不兼容、校验失败或缓存不可写时保留现有资料。

Windows 持久缓存为 `%LOCALAPPDATA%\OshiTrip\data\public-v1.json`。断网也能查询和规划，远程图片与官方链接仍需网络。网页版的服务器缓存不等于浏览器离线访问能力。`OSHITRIP_DATA_OFFLINE=1` 可用于明确禁用下载的离线测试。

### 统一数据发布步骤

在仓库的 `oshitrip/` 目录维护以下源文件：

| 内容 | 源文件 |
| --- | --- |
| IP、活动、举办门店、预约规则 | `src/data/catalog.json` |
| 附券商品、抽选与特典 | `src/data/releases.json` |
| 常设店铺 | `src/data/stores.json` |

1. 核对官方来源，更新活动日期、参加方式、来源链接与 `verified_at`；保持现有记录的 ID 和 slug 稳定，避免影响收藏。取消的活动标记为 `cancelled`。未核实信息保持未知。
2. 运行以下命令。发布脚本校验关联关系和字段、计算内容校验和，仅打包已发布资料及已取消活动；草稿与待审核记录不进入下载包。资料内容未变时保留原发布时间。

   ```sh
   pnpm data:publish
   pnpm data:check
   pnpm seed:sql
   pnpm typecheck
   pnpm test
   ```

3. 检查 Git 差异，将源文件、仓库根目录 `data/public-v1.json`、`src/data/public-meta.json` 以及变更后的 SQL 种子文件一同提交并推送到公开仓库的 `main`。`data:publish` 只生成本地文件，推送后才对用户发布。CI 会检查数据包是否与源文件一致。
4. 在客户端点击「刷新活动数据」，核对页面顶部的发布时间及修改内容。GitHub 分发缓存可能使更新延迟几分钟；网络不可达时客户端继续使用旧资料。发布错误时修正源文件并重新生成、发布，不要只倒退数据包时间，因为客户端会拒绝比当前资料更早的包。

无需为普通资料更新重新打包 EXE；新增数据格式或软件功能则发布新版启动包。格式版本为 `1`，单个包上限 5 MiB。公共数据及本仓库的提交历史都可公开查看，源文件和生成包都不要放入私人计划、账号或密钥。私人备份仓库不是客户端下载源。

可以交给 AI 的维护请求示例：

> 请根据这些官方公告更新 OshiTrip 的统一活动资料：[官方链接]。先核实活动日期、城市、参加方式、来源和核实时间，未知内容保持未知，保留已有 ID。修改相应 JSON，运行 data:publish、data:check、seed:sql、typecheck 和 test，检查生成包只含公共资料后，将相关变更提交到公开仓库 main。告诉我本次新增或修改了什么。

### 可选数据库模式

本地查询不需要执行这一步。需要管理后台时：

1. 创建自己的 Supabase 项目。仅对全新空数据库运行 `supabase/setup-new-project.sql`；已有数据库应按当前版本补齐缺失的迁移，不要重跑初始化脚本。
2. 在 Supabase Auth 创建自己的管理员用户，将其 UUID 添加到 `public.admin_users.user_id`。
3. 参照 `.env.example` 创建本机 `.env.local`，填写自己的项目 URL 和 publishable key，重启后访问 `/admin`。
4. 确认数据库迁移、RLS 和管理员授权均正确，再使用后台维护资料。

`.env.local` 不应提交到 Git。网页不需要 service_role、secret key 或 AI API Key；这些服务端密钥不能放入 `NEXT_PUBLIC_` 环境变量。自动采集属于另行配置的可选功能，不会随本地启动自动执行。

数据库模式优先于统一数据模式。当前后台修改只写入 Supabase，**不会自动导出到统一数据包**。如希望网页版与 EXE 使用完全相同的资料，可让网页版也采用上述统一数据模式；接入数据库发布流程需另行实现，暂勿把后台保存当成 EXE 数据已更新。

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

脚本会校验公共数据包、下载并核对官方 Node.js 24.19.0 ZIP 的 SHA256，构建 Next.js standalone 服务，用系统 .NET Framework 编译启动器，并生成仓库根目录下的 `dist/OshiTrip-1.1.0-windows-x64.zip` 及 SHA256 校验文件。启动器启用统一数据模式，附带一份离线资料。构建目录不能包含 `.env.local` 等私人配置。

启动器仅监听 `127.0.0.1`。端口偏好和日志放在 `%LOCALAPPDATA%\OshiTrip`；关闭窗口会停止其创建的后台进程。首次运行通常使用 43187 端口，后续使用已保存端口。端口临时冲突不会覆盖已保存的地址。

GitHub Actions 的 **Package Windows portable app** 工作流支持手动构建，成功后可在该次运行的 Artifacts 下载 ZIP。构建产物不提交到源码仓库。
