# 第三方说明

根 MIT 许可适用于项目自有部分，不覆盖第三方原有声明。精确依赖版本以 `package-lock.json` 为准，各包的许可文件随包分发。

- `components/ui/`、`hooks/use-mobile.ts` 和 `vendor/shadcn-tailwind-4.13.0.css`：shadcn/ui，MIT，Copyright (c) 2023 shadcn。完整许可保留在 [vendor/shadcn-tailwind-4.13.0.LICENSE.md](vendor/shadcn-tailwind-4.13.0.LICENSE.md)。
- Sites 构建插件的原始许可保留在 `build/sites-vite-plugin.LICENSE`，须随对应插件代码分发。
- React、Vinext、Vite、Tailwind、Vitest、TypeScript、Lucide、Wrangler 和 UI 依赖由 npm 安装。分发依赖副本或构建产物时保留其实际版本要求的声明，本文件不代替各包 LICENSE。

围棋交互的[设计参考](docs/open-source-references.md)包括 Sabaki、Shudan、Tenuki、KaTrain、frank_go、OGS 和 KataGo。本版没有采用它们的代码、二进制、模型或题库。

以后复用须记录实际版本/提交、文件、许可、版权和修改情况。OGS 客户端与 Goban 库许可不同；KaTrain 的资源和 frank_go 的题库也不能只按主代码 MIT 标记处理。
