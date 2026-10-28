import { resolveAI, publicAIConfig } from "./crawler/ai-provider.mjs";
try {
  console.log(
    JSON.stringify(
      {
        translation: publicAIConfig(resolveAI("translation")),
        review: publicAIConfig(resolveAI("review")),
        note: "仅检查配置，不发送请求；无密钥时由 Codex 对照原文处理 assistant-queue.json。",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
