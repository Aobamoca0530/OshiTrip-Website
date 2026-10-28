# 官方消息、Live 与线下活动维护流程

流程版本：1.0.0。维护者、Codex、本地定时任务和 GitHub Actions 共用本流程；入口是 `pnpm maintain:public`。此命令准备并校验本地发布文件，只有检查全部通过后才能提交并推送到统一数据仓库。程序不携带 Git 凭据，也不替用户创建服务商 API Key。

## 固定步骤

1. **采集官方原文**：来源范围由 `scripts/crawler/sources.json` 和企划白名单决定。优先官方 Live/Event 目录，再查新闻目录和已知详情；对显式配置的分页逐页读取。报告必须列出未读的延期 URL，不能把采集上限当成已经查全。页面至少间隔 2 秒，限制响应大小与超时，遵守 robots；不通过更换身份、代理或验证码破解来绕过限制。
2. **分类、去重和发现**：正文是否存在现场活动优先于标题关键词。GIG、DJ、舞台及官方 Live 分类都要识别；作品名中的 Love Live 不代表演唱会。排除纯网售、线上配信及演出回顾。同一公告按 URL 合并，同一活动按官方来源及详情链接关联。Live 和其他线下活动分为两个合集，新消息立即进入“发现活动”的待审核区。
3. **翻译与提取**：读取本次 `body_text`，按共享 JSON Schema 返回中文标题、摘要、参与规则、日期及场地。证据必须是当前正文连续原句。巡演逐站核对报名期限，发售日、公告日不得充当活动日；未知不补猜。当前结构化报名仅支持日本时区，海外时区未适配时保留中文说明与待审核状态。图片文字与 HTML 证据分开，不从图片猜日期。
4. **独立复核**：第二次 AI 请求以官方原文核对候选译文；可单独选择审核服务商。检查日期、场地、报名方式、票种或附券商品、费用、年龄与数量限制、特典、取消信息和遗漏。单独请求不保证模型完全独立，因此始终还要做程序证据校验。没有密钥时由维护者/Codex 阅读原文后复核。
5. **证据门槛**：`validateReading` 验证连续原句、日期、场地、企划及报名时刻。只有规则可确认且审核通过才成为正式活动。待审核公告可以公开显示，但不能进入行程匹配。审核记录绑定 `content_hash`；正文变化后失效。失败页面保留原资料和原核实时间，不能冒充本轮核实。
6. **准备和校验**：统一命令依次生成 public-v1/v2/v3、校验包、生成 SQL、生成 Next 类型、TypeScript 检查、lint、单元测试。任一步骤失败立即停止后续步骤，`workflow-report.json` 标记失败；已写入的本地文件留供检查，但不得推送。修改网页功能时还需 build 和相关桌面/手机端到端测试；修改启动包时还需 Windows 包测试。
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

## 本次虹咲 403 诊断（2026-10-29，北京时间）

对 `/nijigasaki/topics.php` 的正常 GET 返回 HTTP 403；本轮七个已知详情也不可读取。错误页本身包含官网样式、`NOT FOUND`、`お探しのページは見つかりませんでした` 和“指定 URL 不存在或可能被删除”的提示。响应标识为 `server: AmazonS3`、`x-cache: Error from cloudfront`，通过 CloudFront 东京节点 NRT12-P6。未发现验证码或浏览器挑战页面。

进一步正常访问错误页提供的官网首页 `/` 和新闻总目录 `/news/`，两者也返回同样的 403 和页面不存在提示。因首页也失败，不能把原因简单归为某个旧 PHP 地址失效。独立网页读取工具也返回 403，但这不等于跨地区测试。没有执行更换身份、代理、Cookie 或绕过访问控制的尝试。

**能确定**：本次请求收到 CDN/源站链路的错误响应，正文不是新闻；从客户端无法确认具体拒绝规则。**倾向解释**：源站权限、路径/路由或自定义错误映射值得优先排查。**尚不能确定**：WAF/反爬、地区/IP 限制、临时故障与配置问题中的哪一种；没有验证码也不能排除 WAF。AWS 明确指出 CloudFront 的 403 可来自源站或 WAF，S3 对错误路径、对象不存在、访问权限和自定义错误页都可能返回 403。最终确认需要站方日志或恢复后的正常对照，不能声称官方已部署反爬。

依据：[AWS CloudFront 403 说明](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-403-permission-denied.html)。采集器的 `access-diagnostics.mjs` 保存状态及少量安全响应头和错误页类别，不保存 Cookie 或完整错误页，不把推测写成确定事实。现有虹咲资料保留并标明本轮无法复核；恢复访问后重新采集和审核。

## 2026-10-29 漏项复核范围

BanG Dream! Live 前两页共 37 个详情和少女歌剧 Event 目录 9 个详情已纳入本轮观察。此前漏收的原因包括仅按标题寻找 Live/ライブ、缺少 GIG/DJ 分类、只看新闻而未接入 Event 详情目录，以及目录详情预算不足。已补充分类、两页发现和预算延期报告。

本次官方消息 70 条（Live 39、其他线下活动 31）；62 条有本轮正文支持的中文摘要，8 条仅能保留标题说明，其中 7 条虹咲及 1 条 AGF 缺少本轮正文。正式活动 25 条；其余仍有只翻译摘要、历史公告或票务规则未核全的待办。上述数字是本次快照，不代表所有官网、所有历史页或尚未公开信息都已覆盖。
