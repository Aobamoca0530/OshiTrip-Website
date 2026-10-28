# 官方消息、Live 与线下活动维护流程

流程版本：1.0.0。维护者、Codex、本地定时任务和 GitHub Actions 共用本流程；入口是 `pnpm maintain:public`。此命令准备并校验本地发布文件，只有检查全部通过后才能提交并推送到统一数据仓库。程序不携带 Git 凭据，也不替用户创建服务商 API Key。

## 固定步骤

1. **采集官方原文**：来源范围由 `scripts/crawler/sources.json` 和企划白名单决定。优先官方 Live/Event 目录，再查新闻目录和已知详情；对显式配置的分页逐页读取。报告必须列出未读的延期 URL，不能把采集上限当成已经查全。页面至少间隔 2 秒，限制响应大小与超时，遵守 robots；不通过更换身份、代理或验证码破解来绕过限制。
2. **分类、去重和发现**：正文是否存在现场活动优先于标题关键词。GIG、DJ、舞台及官方 Live 分类都要识别；作品名中的 Love Live 不代表演唱会。排除纯网售、线上配信及演出回顾。同一公告按 URL 合并，同一活动按官方来源及详情链接关联。Live 和其他线下活动分为两个合集，新消息立即进入“发现活动”的待审核区。
3. **翻译与提取**：读取本次 `body_text`，按共享 JSON Schema 返回中文标题、摘要、参与规则、日期及场地。证据必须是当前正文连续原句。巡演逐站核对报名期限，发售日、公告日不得充当活动日；未知不补猜。当前结构化报名仅支持日本时区，海外时区未适配时保留中文说明与待审核状态。图片文字与 HTML 证据分开，不从图片猜日期。
4. **独立复核**：第二次 AI 请求以官方原文核对候选译文；可单独选择审核服务商。检查日期、场地、报名方式、票种或附券商品、费用、年龄与数量限制、特典、取消信息和遗漏。单独请求不保证模型完全独立，因此始终还要做程序证据校验。没有密钥时由维护者/Codex 阅读原文后复核。
5. **证据门槛**：`validateReading` 验证连续原句、日期、场地、企划及报名时刻。只有规则可确认且审核通过才成为正式活动。待审核公告可以公开显示，但不能进入行程匹配。审核记录绑定 `content_hash`；正文变化后失效。失败页面保留原资料和原核实时间，不能冒充本轮核实。
6. **准备和校验**：统一命令先从采集报告生成公共来源状态摘要，再依次生成 public-v1/v2/v3/v4、校验包、生成 SQL、生成 Next 类型、TypeScript 检查、lint、单元测试。任一步骤失败立即停止后续步骤，`workflow-report.json` 标记失败；已写入的本地文件留供检查，但不得推送。修改网页功能时还需 build 和相关桌面/手机端到端测试；修改启动包时还需 Windows 包测试。
7. **发布和回看**：审查 Git 差异，只提交本次公共资料与源码；不提交 `.env.local`、`var/`、私人成员数据或 API Key。检查全过后提交并普通推送（不强推）。GitHub Actions 已按此流程提交；Codex 维护任务在用户已授权范围内执行同样步骤。回看远程提交和数据包校验和；用户端刷新数据后核对。内容未变不刷屏；新增、规则变化、发布失败或需要用户处理时再通知。

## 所有模型共用的调用约定

```sh
pnpm ai:check
pnpm maintain:public --contract
pnpm maintain:public
pnpm maintain:public --replay
```

`--contract` 不联网，输出版本、输入/输出 JSON Schema、翻译与审核的实际提示词、约束、命令及文件位置。Schema 和提示词直接来自生产代码，不维护另一个可能过期的副本。需要纯 JSON 时用 `node scripts/maintain-public.mjs --contract`，避免包管理器额外输出命令标题。

服务端模块接口为 `translateActivity(observation, franchises, config)`、`reviewActivity(reading, observation, franchises, config)`，位于 `scripts/crawler/event-intelligence.mjs`。统一适配器在 `ai-provider.mjs`：OpenAI 使用 Responses，百炼与 DeepSeek 使用各自官方兼容接口。两类任务共用数据契约，分别读取 `EVENT_TRANSLATION_*` / `EVENT_REVIEW_*`。配置示例见 `.env.example`；实际密钥只存本机 `.env.local` 或 GitHub Secrets。`ai:check` 只检查配置存在，不代表密钥已经联通。

未配置密钥：`assistant-queue.json` 提供正文、任务类型及已有候选译文；`missing_observations` 表示本轮没读到的页面。由 Codex/维护者阅读原文，将核实后的记录按下面形式写入 `scripts/crawler/verified-readings.json`，再执行 `pnpm maintain:public --replay`。这份文件是人工复核入口，不能让翻译接口把未经复核的候选直接写成已验证记录。多个字段仍未知时，保留 `uncertain: true`；摘要已翻译不等于全部规则已审核。

```json
{
  "https://官方域名/已读取的详情页": {
    "source_hash": "本次 observation.content_hash 的完整 SHA256",
    "reading": "填写 --contract 返回的 translation 结构，不是这个说明字符串"
  }
}
```

`--replay` 不重新抓取网页，必须已有本轮 `observations.json` 和 `report.json`，保留原采集时间。离线回放只能证明这份快照的处理结果，不能说明官网目前没有变化。后续新一轮采集仍要重新取源。无密钥情况下，应用程序本身不能调用当前聊天会话；代办依赖实际运行的 Codex 定时任务，本机需在线且应用能执行任务。

报告位置：`var/public-crawler/workflow-report.json`（步骤与总体结果）、`report.json`（源状态、延期 URL、HTTP 诊断与模型状态）、`assistant-queue.json`（待办）、`observations.json`（本轮原文）。GitHub Actions 上传这些文件保留 14 天，不在公共 JSON 包中转载完整正文。

`scripts/build-source-status.mjs` 从 `report.json`、当前公告和 `observations.json` 生成 `src/data/source-status.json`，并保留已记录的最近完整成功时间。原始错误仅映射到固定的安全类别，不发布响应头、正文、模型候选或配置。v4 将状态摘要与公告放在同一份校验和保护的数据包；旧版 v1/v2/v3 继续输出原格式。`/admin/sources` 从这份快照展示来源状态与待办，待办按公告实际处理状态计算（正文指纹由采集与审核流程验证），不能用 `report.review.approved` 代替正式活动数量。部分失败和预算延期均标为部分完成；无报告和未启用不可视为读取成功。

回放只重建同一次采集的摘要，不刷新其采集时间。全部来源失败时维护流程仍立即停止，不发布新快照；最新失败查看 Actions 原始报告，面板明确显示上次快照时间并在超过 36 小时后提示过期。面板为只读公共摘要，不提供绕过现有证据门槛的“通过审核”操作。

## 本次虹咲 403 诊断（2026-10-29，北京时间）

对 `/nijigasaki/topics.php` 的正常 GET 返回 HTTP 403；本轮七个已知详情也不可读取。错误页本身包含官网样式、`NOT FOUND`、`お探しのページは見つかりませんでした` 和“指定 URL 不存在或可能被删除”的提示。响应标识为 `server: AmazonS3`、`x-cache: Error from cloudfront`，通过 CloudFront 东京节点 NRT12-P6。未发现验证码或浏览器挑战页面。

进一步正常访问错误页提供的官网首页 `/` 和新闻总目录 `/news/`，两者也返回同样的 403 和页面不存在提示。因首页也失败，不能把原因简单归为某个旧 PHP 地址失效。独立网页读取工具也返回 403，但这不等于跨地区测试。没有执行更换身份、代理、Cookie 或绕过访问控制的尝试。

**能确定**：本次请求收到 CDN/源站链路的错误响应，正文不是新闻；从客户端无法确认具体拒绝规则。**倾向解释**：源站权限、路径/路由或自定义错误映射值得优先排查。**尚不能确定**：WAF/反爬、地区/IP 限制、临时故障与配置问题中的哪一种；没有验证码也不能排除 WAF。AWS 明确指出 CloudFront 的 403 可来自源站或 WAF，S3 对错误路径、对象不存在、访问权限和自定义错误页都可能返回 403。最终确认需要站方日志或恢复后的正常对照，不能声称官方已部署反爬。

依据：[AWS CloudFront 403 说明](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-403-permission-denied.html)。采集器的 `access-diagnostics.mjs` 保存状态及少量安全响应头和错误页类别，不保存 Cookie 或完整错误页，不把推测写成确定事实。现有虹咲资料保留并标明本轮无法复核；恢复访问后重新采集和审核。

## 补充：正常浏览器与 HTTP 采集对照（2026-10-29 北京时间）

用户提供 403 排查文章后，使用应用内浏览器正常打开虹咲 `topics.php`，成功显示新闻列表，包括 2026-10-28 的公告；点击 `detail.php?p=01_6737` 可读取正文，直接打开此前失败的 `detail.php?p=01_6700`（Sweet Collection）也可读取正文。过程中未要求登录或验证码。这里的“成功”依据浏览器实际可见内容，不冒称已获取浏览器网络层 HTTP 状态。

同一时段（北京时间 06:28）用现有 `fetchLimited` 再次请求 `topics.php`，仍收到 HTTP 403、AmazonS3 / CloudFront 的 NOT FOUND 错误页。诊断保存在本地 `var/public-crawler/nijigasaki-http-comparison.json`。因此结论是“直接 HTTP 采集路径失败、当前应用内浏览器可以读取”，不能归纳为官网整体不可用，也不能仅凭对照确定是 User-Agent、会话、网络出口、TLS 或缓存差异。

此对照最初仅验证浏览器读取路径；后续接入方式与自动运行验证见下节。局部浏览器访问不能标为全来源采集成功。

## 虹咲浏览器辅助采集

`nijigasaki-news` 配置 `transport: "browser"` 和 `browser_mode: "headed"`，统一采集入口调用 Playwright Chromium 的临时浏览器上下文，以普通有界面模式运行。robots.txt 也由同一个浏览器读取，避免不同请求方式取得不同规则响应；沿用原有 robots 匹配与失败处理策略。目录和详情由浏览器读取 DOM，随后使用同一个 `extractObservation`、正文指纹、翻译、独立复核与证据校验流程。未采用用户浏览器档案、Cookie 导入、代理、User-Agent 覆写、隐身插件或验证绕过。页面间隔至少 2 秒，单页导航超时 20 秒，正文上限 1.5 MB，robots 上限 100 KB，详情沿用每轮 16 页预算。只接受原地址内容，过滤 iframe、第三方资源和后台接口；403/401/429 停止该来源本轮采集。失败仍保留原资料及核实时间。

本地安装 `pnpm exec playwright install chromium` 后运行 `pnpm maintain:public`；已安装 Edge 的 Windows 可设置 `CRAWLER_BROWSER_CHANNEL=msedge`，维护时会临时打开浏览器窗口并在结束时关闭。浏览器仅用于维护脚本，不随 Windows 用户客户端运行。GitHub 每日任务自动安装 Chromium，以 `xvfb-run --auto-servernum pnpm maintain:public` 提供虚拟显示器，按北京时间 **09:17** 的原有计划运行（平台可能延迟）。这是 [Playwright 官方支持的 Linux 有界面运行方式](https://playwright.dev/docs/ci#running-headed)。报告记录 `transport` 和 `browser_mode`，Actions 摘要单列浏览器来源结果，不能用整体任务通过来推断虹咲采集成功。

2026-10-29 北京时间 06:38–06:42 的 [首次 GitHub Actions 实测](https://github.com/Aobamoca0530/OshiTrip-Website/actions/runs/40781445206) 已成功安装并启动无头 Chromium，但虹咲目录返回 HTTP 403，取得 0 页，7 个已知详情延期；其他六个来源取得 63 页。应用内浏览器可读不等于无头采集可读。该运行也暴露了空 `DASHSCOPE_BASE_URL` 导致测试失败的问题，现已将空值按未配置处理并补充回归测试。报告显示云端翻译与审核均未配置 API 密钥，新增内容继续进入人工待办，不自动批准。

### 普通模式与无头模式对照（2026-10-29 07:11–07:13 北京时间）

在同一台机器、同一 Edge 156.0.4314.50、相同 URL、全新临时上下文且不拦截页面资源的条件下，普通有界面模式返回 **HTTP 200 / Apache / Miss from cloudfront**，读到 6 个新闻详情链接；无头模式返回 **HTTP 403 / AmazonS3 / Error from cloudfront**，0 个新闻链接。两者都经过 NRT12-P6 节点。无头对照在与普通模式相同的沙箱外执行环境复测仍为 403，因此不是仅由沙箱执行权限造成的差异。诊断保存在维护机 `var/public-crawler/normal-headed.json` 与 `normal-headless.json`。

这些证据支持“浏览器运行模式对应的请求特征影响响应”，同时排除了必须登录、导入个人 Cookie 或取消采集器资源拦截才能读取目录的推断。站方究竟依据哪个请求头、缓存变体或检测规则区分请求，需要服务端日志才能确认，不能把 User-Agent 单独写成已证实的根因。采集器改用普通模式，保留现有范围、频率与审核规则；不进行无头伪装或失败后切换身份重试。云端是否成功仍须单独实测。

07:14–07:18 的本机完整采集取得虹咲 8 篇详情，0 个错误、0 页延期；正文进入原有翻译和审核队列，未把读取成功当作审核通过。随后普通浏览器读取到真实 robots 规则 `User-agent: *`、`Disallow: /common/`，切换为同浏览器核实规则后，以生产采集器再验证一篇详情仍成功。回放完整维护校验通过，210 项单元测试通过。

[07:23–07:32 的云端验证](https://github.com/Aobamoca0530/OshiTrip-Website/actions/runs/40786880547) 也取得虹咲 8 篇详情，`browser_mode: headed`、`robots: rules`、0 错误、0 页延期，维护步骤和 210 项测试通过，证明普通模式可在每日运行环境采集。该运行最后因 main 同时出现新提交而推送被拒绝；维护者下载原始报告，在最新代码上执行 `pnpm maintain:public --replay` 校验后同步数据，保留云端采集时间。云端报告另有翻译接口 HTTP 429，相关内容保留待审核；这是模型服务问题，与官网采集成功分别记录。

手动运行同一个工作流并勾选 `validate_only` 时，完整执行采集和维护校验，但不推送数据；虹咲未完整取得正文会让验证步骤失败。普通每日运行保留失败来源状态并允许其他已校验来源更新。报告附件保留 14 天。2026-10-29 本机独立无头 Edge 实测仍返回 HTTP 403，不能把应用内浏览器成功推广为本机或云端定时任务成功；云端结果需以实际工作流报告为准。

## 2026-10-29 漏项复核范围

BanG Dream! Live 前两页共 37 个详情和少女歌剧 Event 目录 9 个详情已纳入本轮观察。此前漏收的原因包括仅按标题寻找 Live/ライブ、缺少 GIG/DJ 分类、只看新闻而未接入 Event 详情目录，以及目录详情预算不足。已补充分类、两页发现和预算延期报告。

本次官方消息 70 条（Live 39、其他线下活动 31）；62 条有本轮正文支持的中文摘要，8 条仅能保留标题说明，其中 7 条虹咲及 1 条 AGF 缺少本轮正文。正式活动 25 条；其余仍有只翻译摘要、历史公告或票务规则未核全的待办。上述数字是本次快照，不代表所有官网、所有历史页或尚未公开信息都已覆盖。
