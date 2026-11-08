<p align="right"><a href="development.en.md"><b>English</b></a></p>

# 开发指南

本文档说明仓库结构、文档资产、构建与调试方式、测试规范和发布检查清单。代理与贡献者规则见仓库根部的 `AGENTS.md`，测试分层规则见 [tests/README.md](../tests/README.md)。

## 仓库结构

```text
src/
├── index.ts             # 插件入口
├── service.ts           # ctx.typstWorkbench：会话注册表、配置生命周期、工具与技能
├── remote.ts            # host Typert Remote 运行时（typst 命名空间）
├── typert.ts            # 手写的 Typert manifest
├── contract.ts          # wire 视图类型（两半共享）
├── wire-schemas.ts      # 两半共享的 zod schema
├── status-codec.ts      # host 端 zod codec
├── config.ts            # 设置 schema（volatile）
├── constants.ts         # 两半共享的常量与 LIMITS
├── errors.ts            # 领域错误码与 RemoteError 转译
├── client/              # 浏览器半边
│   ├── index.ts         # 客户端插件主体
│   ├── provider.ts      # typst 资源协议
│   ├── remote.ts        # 客户端 Typert contribution
│   ├── PreviewTab.tsx   # 右侧停靠栏预览面板
│   ├── candidates.ts    # 文档与片段的分组
│   ├── ProblemsPanel.tsx
│   ├── SetupPanel.tsx
│   ├── selection.ts     # 选中文字 → 源码定位
│   ├── toolviews.tsx    # 工具卡片
│   └── pdf/             # pdf.js Blob Worker
│       ├── document.ts  # 画布渲染
│       ├── outline.ts   # PDF 书签 → 大纲
│       └── runtime.ts   # Worker 与加载任务
├── host/                # 主机事实探测（安装引导用）
├── skills/              # typst 技能
├── tools/               # 7 个工具的注册与共享工具
├── typst/               # Typst 域：定位、watch、诊断、匹配、一次性编译
└── workspace/           # WorkspaceSession

tests/
├── unit/                # 跨切面的纯逻辑
├── typst/               # src/typst/ 的行为
├── workspace/           # src/workspace/ 的行为
├── tools/               # src/tools/ 的行为
├── skills/              # src/skills/ 的行为
├── host/                # src/host/ 与文档守卫
├── client/              # src/client/ 的行为
├── fixtures/            # 模拟 typst CLI
└── README.md            # 测试规范
```

## 文档资产

`docs/` 下的中文文档与 `.en.md` 英文文档成对维护，修改一侧必须同步另一侧；术语与边界以 [产品模型](product-model.md) 为准。

| 文档                           | 内容                                   |
| ------------------------------ | -------------------------------------- |
| [文档索引](index.md)           | 文档地图                               |
| [产品模型](product-model.md)   | 词汇、入口、组件、数据流与运行边界     |
| [系统架构](architecture.md)    | 分层职责、数据流、进程与生命周期       |
| [工具参考](tools.md)           | 7 个工具与面板 wire 方法的参数与错误码 |
| [配置参考](configuration.md)   | 设置字段、查找顺序与热重载行为         |
| [快速入门](getting-started.md) | 安装、前置条件与第一个任务             |
| [功能概览](features.md)        | 各表面的能力与不承担的职责             |
| [故障排查](troubleshooting.md) | 常见现象、原因与处理方式               |

代理与贡献者规则见仓库根部的 `AGENTS.md`。

## 安装与构建

```sh
npm install                  # 依赖安装，同时通过 prepare 构建 lib/
npm run build                # tsc 声明 + 浏览器 bundle
npm run build:client         # 只构建浏览器 bundle（改过 src/client/** 后必跑）
npm run typecheck            # harness 引脚检查 + node/test/client 三套 tsc
npm test                     # 测试规范守卫 + 全部 vitest 用例
npm run format               # prettier --write；用 format:check 校验
```

`prepare` 是消费者从源码安装时跑的构建：它只转译 Node 半边、跑真实的客户端构建、并检查入口文件确实落盘。声明文件由 `npm run build` 的 `tsc` 产出，发布路径（`prepublishOnly` → `release:check`）会先跑它。

### 上游产物一致性门禁

```sh
npm run harness:check        # 引脚、lockfile 与上游产物新鲜度
npm run deps:check           # 直接依赖是否都还在 registry 后面
npm run tokens:write         # harness 升级后刷新设计令牌快照
```

`harness:check` 报的是**问题**，`deps:check` 报的是**待办**：前者失败会挡住发布，后者失败说明有依赖还没进 registry，需要处理而不是忽略。

## 本地调试

### 完整插件调试（含 Web 界面）

复制 `dev.cordis.yml.example` 为 `dev.cordis.yml`，把 `name` 改成本仓库的绝对路径，再用本地的 harness 启动。改 `src/client/**` 之后要跑 `npm run build:client`，浏览器半边是打包产物，不看源码。

> 说明：`dev.cordis.yml` 带绝对路径，永远不要提交；改模板 `dev.cordis.yml.example`。

### 仅 Host 端调试

`npm run dev` 以 watch 模式跑 `tsc`。host 半边是 ESM 源码，改完重新构建即可生效，不必重启整个宿主。

### 预览面板的调试

面板的问题多数在两半的契约上：状态帧的形状、资源地址的拼接、或 pdf.js 的加载。先看宿主日志里的 `[dsh-typst]` 前缀行——会话的定位、watch 的启动与重定位都在那里。

## 测试规范

- 一个 spec 一个行为；不使用 `.only`、`.skip`、`.todo`（需要条件门用 `.runIf`）。
- 同步等待自己拥有的 promise，绝不用 sleep 等待。
- spec 的位置由它测的模块决定，见 [tests/README.md](../tests/README.md)。
- `tests/fixtures/typst-fake.cjs` 是模拟的 typst CLI，它的输出形状必须与 `src/typst/diagnostics.ts` 解析的形状保持一致。
- `npm run lint:test` 是机械守卫（体积、车道、焦点用例、上游源码导入），它和用例一起跑。

## 发布检查清单

1. `npm run format:check` —— 格式一致。
2. `npm run lint:test` —— 测试规范守卫通过。
3. `npm run style:check` —— 客户端样式守卫与令牌快照一致。
4. `npm run harness:check`（严格模式）—— 引脚、lockfile 与上游产物新鲜。
5. `npm run typecheck` —— 三套 tsc 通过。
6. `npm run test:coverage` —— 全部用例通过并满足覆盖率阈值。
7. `npm run build` —— 声明文件与浏览器 bundle 产出。
8. `npm run verify:pack` —— 打包产物的入口与文件清单正确。

整条链路由 `npm run release:check` 一次跑完，它同时是 `prepublishOnly` 的内容。

客户端可见的改动还要跑 `npm run smoke:discovery`；带浏览器时加跑 `npm run smoke:web-composition`。

> 注意：没有 PR 工作流会跑这套检查，本地验证就是闸门。没跑的检查要如实说明。
