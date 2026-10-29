# OshiTrip 应用 🧳

日本 IP 联动活动查询与旅行匹配工具。项目介绍和 AI 辅助本地部署步骤见[仓库首页](../README.md)。

当前应用版本：**1.6.0**；统一维护流程：**1.4.0**。下载安装、首次使用和旧版本升级见[使用指南](../README.md#-下载与开始使用)。以下命令均在仓库的 `oshitrip/` 目录执行。

## 本地启动

推荐使用与 CI 一致的 Node.js 24 和固定的 pnpm 11.25.0（`package.json` 声明 Node.js 最低为 22.12.0），在本目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Windows PowerShell 可将 `pnpm` 替换为 `pnpm.cmd`。打开终端显示的本地地址，通常为 http://localhost:3000。按 Ctrl+C 停止。

生产模式使用 `pnpm build` 构建，然后用 `pnpm start` 启动。

## 数据与配置

本轮增加子 IP 官网入口与固定乐队顺序（RAS → Our Notes → MyGO!!!!! → Ave Mujica），官网映射维护在 `src/lib/franchise-official-links.ts`。首页和旅行偏好可直接跳转官网；此映射不自动启用新采集来源，也不改变旧版公共数据包字段。

「Live 抽选与发售」和商品详情可展开对应公告的官方配图，保留出处及未核实提示。演出海报不能代替商品封面。历史附券轮次明确标记已截止，不因补录而重新成为可报名。

2026-10-29补充复核10条Live、新增5项历史附券商品，详见[核对记录](docs/reviews/2026-10-29-ticket-followup.md)。叶月恋店铺公告属于2026年度语境，但销售段落未完整写年，预约方式仍未明示，保持待审核。

默认读取 `src/data/catalog.json`、`src/data/releases.json` 和 `src/data/stores.json`，不需要数据库或 AI API Key。资料包含官方来源和核实日期，不代表实时预约名额或库存。关注、收藏与旅行安排保存在当前浏览器中。

本地模式下，`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 均应未设置或为空。只配置一项会报错；两项都有值时会切换为数据库模式。修改环境变量后需要重启服务。

### 统一数据模式

Windows / Mac 启动器自动启用此模式。手机版独立下载并缓存同一份公共数据。源码版或自托管网页版可设置 `OSHITRIP_SHARED_DATA=1`，并保持两个 Supabase 变量为空。可选设置 `OSHITRIP_DATA_DIR` 为服务器上可写的缓存目录（绝对路径）；不设置时只缓存于进程内存，重启回到内置资料。不要把个人电脑的缓存路径直接复制到云端。

源码版可在本目录新建或编辑未提交的 `.env.local`，保留已有其他配置，加入：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OSHITRIP_SHARED_DATA=1
```

保存后重启开发服务；生产模式重新构建再启动。若希望重启后也保留下载资料，再设置 `OSHITRIP_DATA_DIR` 为自己的可写绝对路径。默认源码模式不自动联网更新，单纯运行 `pnpm dev` 也不会启动采集器。

服务从本公开仓库 `main` 分支的 `data/public-v4.json` 获取活动、附券商品、门店、自动采集的公告图片和来源状态摘要。每次启动先加载本地资料，再后台检查更新；持续使用时在页面或状态请求中最多每 15 分钟检查一次。页面提供手动刷新，连续点击有 10 秒间隔限制。下载超时、版本不兼容、校验失败或缓存不可写时保留现有资料。

Windows 持久缓存为 `%LOCALAPPDATA%\OshiTrip\data\public-v4.json`。断网也能查询和规划，远程图片与官方链接仍需网络。网页版的服务器缓存不等于浏览器离线访问能力。`OSHITRIP_DATA_OFFLINE=1` 可用于明确禁用下载的离线测试。

### 来源状态与待审核面板

从「活动管理」、页脚或「官方新消息」进入 `/admin/sources`。这是公共资料的只读维护面板，本地模式无需 Supabase 登录；数据库模式下也仅展示公共采集流程的状态，不代表数据库私有审核队列。

- **来源状态**：查看每个来源的最近尝试、最近完整成功、发现链接、读到正文、未处理链接和保留旧公告数。区分完整成功、部分完成、无候选、读取失败、停止采集、未启用及暂无报告；未知数量显示“—”。成功指本轮选定范围，不代表全站覆盖。
- **待审核**：从当前公告的实际 `activity.state` 生成待办（正文指纹由采集与审核流程验证），可按来源、待翻译、待复核、本轮缺少正文及关键词筛选。显示原有待办原因、摘要和原句依据；只读浏览不会通过审核。图片译文仍需对照原图核实。
- **时间与边界**：面板使用日本时间，超过 36 小时的采集快照提示过期。回放保留原采集时间，失败不更新最近完整成功时间；第一次接入时无法证明的历史成功显示“暂无记录”。刷新数据只下载已发布快照，不启动采集。全部来源失败或校验失败时，线上仍保留上次发布的快照，需要在 Actions 报告中检查最新失败。

`pnpm maintain:public` 在采集后自动运行 `scripts/build-source-status.mjs`，把现有报告投影为 `src/data/source-status.json`，再与公告一起校验并生成 v4 数据包。摘要不包含原始错误、服务密钥、响应头、完整正文或模型候选。已发布的公告、待审核原因和引用证据仍按原有公开规则展示。

v1/v2/v3 数据包继续生成，保留各自的字段、校验和算法和未变化内容的发布时间；旧客户端不读取 v4。新客户端使用独立的 v4 缓存，不覆盖旧缓存。已有 EXE 需要更新应用版本才能显示新面板。

### 每日自动采集

仓库根目录的 `.github/workflows/public-data.yml`（Actions 名称 **Daily collection, translation, review and discovery publication**）每天北京时间 **22:00** 运行，也可手动运行。不依赖本机开机或 Supabase；采集不需要 AI 密钥，模型自动翻译和审核需要。当前维护流程为 **1.4.0**。

```sh
pnpm exec playwright install chromium  # 首次采集前安装浏览器
pnpm ai:check                          # 检查配置，不输出密钥、不调用模型
pnpm maintain:public                   # 采集、生成资料及本地校验，不提交推送
pnpm maintain:public --publish         # 检查通过后提交、推送并确认远端 main
pnpm maintain:public --replay           # 基于已有 observations/report 应用复核
pnpm maintain:public --replay --publish # 回放、检查并发布已复核资料
```

Windows 已安装 Edge 时可设置 `CRAWLER_BROWSER_CHANNEL=msedge`；浏览器采集会临时打开窗口。GitHub Actions 安装 Chromium 并通过 `xvfb-run` 运行，默认在 main 使用 `--publish`；勾选 `validate_only` 时不提交推送。

`--publish` 要求已有 Git 认证、HEAD 与远端 main 一致、没有已暂存或无关源码改动；使用专门的维护工作区。它会执行数据包、SQL、类型、lint 和单元测试，任一检查失败即停止发布；远端并发更新时停止，不强推。完整步骤与模型契约见[官方消息维护流程](docs/official-news-workflow.md)，模型契约可用 `pnpm maintain:public --contract` 查看。机器人提交不会再触发普通 push CI，校验由维护流程完成。

`var/public-crawler/workflow-report.json` 区分本地检查与远端发布；`assistant-queue.json`、`discovery-review-report.json` 和 `image-review-report.json` 分别记录正文待办、发现活动状态及图片复核待办。图中文字必须实际读图并独立核对，已复核记录写入 `scripts/crawler/verified-image-readings.json`；图片 URL 被收录不代表文字已核实。失败、缺密钥或证据不足时保留待办，不自动批准。

当前公共来源包括 BanG Dream! 新闻与 Live 目录、Love Live! 系列（虹咲、莲之空、Liella!、Aqours、μ’s、人生不易部及系列 Live）、少女歌剧新闻与 Event、学园偶像大师官方入口、Bushiroad Creative 和 SWEETS PARADISE。实际启用清单见 `scripts/crawler/public-sources.mjs`，目录、固定详情与每轮页数见 `scripts/crawler/sources.json`。BanG Dream! Live 默认每轮最多 40 篇，其他来源默认 16 篇，设置了 `page_limit` 的来源使用各自上限。页面请求至少间隔 2 秒，目录链接先筛选再分配预算；报告记录未处理及延期 URL。来源不可读取时保留旧资料，全部来源失败时不发布；采集成功也不代表覆盖所有历史公告。

虹咲新闻使用普通有界面的浏览器辅助采集；直接 HTTP 或无头模式此前返回 403，不能将其等同于当前浏览器读取结果。来源失败时保留旧资料和原核实时间，本轮状态以报告为准。历史对照及云端验证见[虹咲浏览器辅助采集](docs/official-news-workflow.md#虹咲浏览器辅助采集)。

“虹咲公式X”链接为 `https://x.com/Nijigaku_movie`，用于打开官方账号；当前没有可用的帖子采集接口，不宣称自动同步 X。公开采集不依赖 X 登录或 AI 密钥；是否可读取取决于来源实际响应。

**企划白名单**：Bushiroad Creative、SWEETS PARADISE 只保留公告标题命中 `scripts/crawler/project-keywords.json` 的内容。目前包含 BanG Dream! 及旗下乐队、Love Live! 系列、少女歌剧和学园偶像大师。目录链接先筛选，读取公告后再按正文标题复查，避免其他企划耗尽采集额度；不会因为页脚、侧栏或“联动 / 商品 / Live”等泛词命中而收录。英文大小写、全半角、空格和标点差异会统一处理。标题未写企划名的公告可能漏收；多企划联合公告只要明确包含白名单企划就保留，原图可能包含联合展出内容。

增删关注范围时修改上述 JSON 的 `projects[].keywords`，不要加入 `Live`、`咖啡`、`グッズ` 等过宽的词。这是维护者统一数据源的关注范围，与用户浏览器中个人关注的 IP 分开。运行 `node scripts/crawl-public.mjs --prune-only` 可不联网清理已有的无关公告，再执行 `pnpm data:publish` 并提交源码及数据包；后续每日任务也会应用相同规则。成功读取来源但没有白名单命中属于正常结果，不会把“零条相关新消息”误报为采集故障。

`src/data/announcements.json` 保存筛选后的线下公告、中文摘要、规则短句证据、图片及译文状态，不保存全文转载。与已有活动的来源 URL 或正文中的同站活动链接匹配时建立关联；新活动仅在证据校验通过后写入 `catalog.json`，ID 以 `auto-` 开头。人工记录不会被机器覆盖。自动记录的来源有变化而新规则尚未通过校验时，暂时撤出行程匹配；获取失败时保留原资料。

**翻译与审核接口**：在 GitHub Settings → Secrets and variables → Actions 添加所需 Secret：`OPENAI_API_KEY`、`DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`。本机可写入未提交的 `.env.local`。不要把密钥写进前端、JSON、EXE 或 `NEXT_PUBLIC_` 变量。

| 任务 | Provider Variable | Model Variable | 每轮调用上限 |
| --- | --- | --- | --- |
| 中文翻译和信息提取 | EVENT_TRANSLATION_PROVIDER | EVENT_TRANSLATION_MODEL | EVENT_TRANSLATION_LIMIT（默认24） |
| 独立内容审核 | EVENT_REVIEW_PROVIDER | EVENT_REVIEW_MODEL | EVENT_REVIEW_LIMIT（默认24） |

Provider 支持 `auto`、`openai`、`bailian`、`deepseek`、`manual`，两项任务可独立选择。默认 auto 按 OpenAI → 百炼 → DeepSeek 选择第一家已配置密钥的服务；未配置则进入 Codex 待办。明确选中的服务缺少密钥或调用失败时不会偷偷调用其他服务。默认模型为 OpenAI `gpt-4.1-mini`、百炼 `qwen-plus`、DeepSeek `deepseek-flash`；模型可覆盖，实际可用性以对应账户为准。百炼保留官方北京地域工作空间 Base URL 支持（`DASHSCOPE_BASE_URL`）。`pnpm ai:check` 仅报告配置是否存在，不输出密钥、不消耗额度。

新公告自动进入“官方新消息”的线下活动/Live 合集，并进入“发现活动”的待审核区。独立模型复核和本地证据校验都通过后才生成正式活动；审核失败、响应截断、虚构原句或日期不明时保留待审核。模型无法绕过本地证据校验。

**无密钥时由 Codex 代办**：采集器生成 `var/public-crawler/assistant-queue.json`，包括待翻译/待复核原文和缺少正文的链接；Actions 同时保留队列、原始观察和报告14天。Codex 对照官方原文，将中文标题、摘要、参与规则和核实结果写入 `scripts/crawler/verified-readings.json`，只在正文指纹一致时生效。对本轮已抓取资料运行 `pnpm maintain:public --replay` 应用复核结果并完成发布前校验（不重新联网，保留原采集时间）。来源变化后旧复核不会自动通过。聊天登录本身不是 API Key；持续代办需要本地 Codex 定时任务实际运行，电脑离线或任务未运行时保留待办，不能宣称实时完成。

图片识别通过 `IMAGE_RULE_PROVIDER` / `IMAGE_RULE_MODEL` 单独配置百炼或 OpenAI；默认优先使用已有 OpenAI 密钥，否则百炼。当前 DeepSeek 适配用于文字翻译和审核。每轮图片调用默认4次，识别结果仍标为待核实，不自动确认行程日期。

接口依据：[OpenAI Responses JSON 输出](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)、[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[百炼思考模式参数](https://help.aliyun.com/zh/model-studio/deep-thinking)。

正文日期必须在对应场地原句中明确出现；不同场次报名规则不明确时保留待核实，未公布不等于无需预约或正在受理。当前不支持从图片自动确认可用于行程的日期；图片识字译文标为待核实。正文按内容指纹复用，图片按 SHA256 复用；图片仍需重新读取以检测同 URL 换图。纯网售、配信、演出回顾等被过滤，Love Live! 作品名本身不作为演唱会判据。`verified-readings.json` 保存已对照原文整理的初始资料，只有来源指纹相同时使用。

日常维护使用上述 `pnpm maintain:public` 统一入口；`crawl:public` 等底层命令用于排查，不替代完整发布前校验。报告在 `var/public-crawler/report.json`，云端在 Actions 的 `public-crawler-report` 附件中保留 14 天；该目录不提交。关闭自动采集可禁用 **Daily collection, translation, review and discovery publication** 工作流。公开仓库长时间无活动时，GitHub 可能停用定时工作流，需要在 Actions 重新启用。

此前的 `discover-releases.yml` 是单独的数据库审核流程。公共采集仅访问明确接入的来源；配置所选服务密钥后会产生翻译、审核或图像识别费用，未配置时不调用模型。robots 通行不代表图片转载授权；未接入或受限的网站不宣称已支持。

### 统一数据发布步骤

在仓库的 `oshitrip/` 目录维护以下源文件：

| 内容 | 源文件 |
| --- | --- |
| IP、活动、举办门店、预约规则 | `src/data/catalog.json` |
| 附券商品、抽选与特典 | `src/data/releases.json` |
| 常设店铺 | `src/data/stores.json` |
| 自动采集的官方公告与商品图片 | `src/data/announcements.json`（通常由工作流维护） |

1. 核对官方来源，更新活动日期、参加方式、来源链接与 `verified_at`；保持现有记录的 ID 和 slug 稳定，避免影响收藏。取消的活动标记为 `cancelled`。未核实信息保持未知。
2. 运行以下命令。发布脚本校验关联关系和字段、计算内容校验和，活动仅打包已发布及已取消记录，活动草稿不进入下载包；官方公告可保留待审核状态供用户查看，但不会因此成为正式行程活动。资料内容未变时保留原发布时间。

   ```sh
   pnpm data:publish
   pnpm data:check
   pnpm seed:sql
   pnpm typecheck
   pnpm test
   ```

3. 检查 Git 差异，将源文件、仓库根目录 `data/public-v1.json` 至 `data/public-v4.json`、`src/data/source-status.json`、`src/data/public-meta.json` 以及变更后的 SQL 种子文件一同提交并推送到公开仓库的 `main`。`data:publish` 只生成本地文件，推送后才对用户发布。CI 会检查数据包是否与源文件一致。
4. 在客户端点击「刷新活动数据」，核对页面顶部的发布时间及修改内容。GitHub 分发缓存可能使更新延迟几分钟；网络不可达时客户端继续使用旧资料。发布错误时修正源文件并重新生成、发布，不要只倒退数据包时间，因为客户端会拒绝比当前资料更早的包。

无需为普通资料更新重新打包 EXE；新增数据格式或软件功能则发布新版启动包。1.2 客户端使用格式 `2`；发布脚本同时生成格式 `1` 的旧活动数据包，供 1.1 客户端继续使用，避免添加新字段后破坏其校验和。单个包上限 5 MiB。公共数据及本仓库的提交历史都可公开查看，源文件和生成包都不要放入私人计划、账号或密钥。私人备份仓库不是客户端下载源。

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

脚本会校验公共数据包、下载并核对官方 Node.js 24.19.0 ZIP 的 SHA256，构建 Next.js standalone 服务，用系统 .NET Framework 编译启动器，并生成仓库根目录下的 `dist/OshiTrip-1.6.0-windows-x64.zip` 及 SHA256 校验文件（文件名版本取自 `package.json`）。启动器启用统一数据模式，附带一份离线资料。构建目录不能包含 `.env.local` 等私人配置。

启动器仅监听 `127.0.0.1`。端口偏好和日志放在 `%LOCALAPPDATA%\OshiTrip`；关闭窗口会停止其创建的后台进程。首次运行通常使用 43187 端口，后续使用已保存端口。端口临时冲突不会覆盖已保存的地址。

GitHub Actions 的 **Package Windows portable app** 工作流支持手动构建，成功后可在该次运行的 Artifacts 下载 ZIP。构建产物不提交到源码仓库。


## 手机与 Mac 构建

版本号以 package.json 为准。Android versionCode 自动按 major × 1000000 + minor × 1000 + patch 生成，minor / patch 均应小于1000。桌面继续使用 Next.js standalone；手机版使用 Vite 打包已有 React 组件、相同的领域规则和经校验的公共资料，不依赖 Next.js 服务器，也不打包私有配置或管理数据库入口。

- 手机版：运行 pnpm build:mobile；产物为 mobile-dist/，可部署到任意 HTTPS 静态托管。使用 hash 路由，支持 GitHub Pages 子路径。首次访问缓存整套页面资源，旧页面在用户点击更新前继续使用旧缓存。
- Android：运行 pnpm android:sync，然后在 android/ 运行 gradlew assembleRelease lintRelease。发布构建需提供 ANDROID_KEYSTORE_PATH、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。签名密钥必须长期保留；更换密钥无法覆盖更新原安装。不要提交 keystore 或密码。使用 scripts/collect-android.mjs 校验签名并生成 APK 和 SHA256。
- Mac：在目标架构的 Mac 上运行 pnpm package:mac，生成 .app 的 ZIP 和 SHA256。脚本验证官方 Node.js 校验和、编译 AppKit 启动器并测试打包服务与退出清理。Apple Silicon 和 Intel 分别构建，尚未公证。
- Windows：继续使用 pnpm package:windows 和 node scripts/test-windows-package.mjs。
- 验证：pnpm typecheck、pnpm lint、pnpm test、pnpm build；手机版另外运行 pnpm build:mobile 和 pnpm exec playwright test --config mobile/playwright.config.ts。

GitHub Actions 的 Package desktop and Android apps 工作流手动构建四个平台，产物存于 Artifacts。Android 需要仓库 Secrets：ANDROID_KEYSTORE_BASE64（keystore 的 base64）、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。同一长期签名密钥用于所有版本，不使用临时调试密钥发布。

Deploy iPhone and mobile web app 工作流构建并测试手机版，部署到 GitHub Pages。仓库 Pages 的 Source 应为 GitHub Actions。

软件更新源为仓库根目录 data/app-release.json。**先完成安装包验证并发布正式 GitHub Release，再修改该文件中的 version、notes 和 url 并推送 main**，避免提示用户下载不存在的版本。仅接受本仓库 HTTPS Release 链接，使用数值语义版本比较，失败保留当前功能。更新源只发布已完成版本，不用于执行脚本或自动安装。

Mac 本地缓存与日志：~/Library/Application Support/OshiTrip；默认端口43187，端口冲突时停止并提示，避免切换地址导致误以为收藏丢失。Mac 与 Windows 仅监听127.0.0.1。
