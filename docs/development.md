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

`docs/` 下的 12 对 zh/en 文档成对维护，修改一侧必须同步另一侧；术语与边界以 [产品模型](product-model.md) 为准。文档归属、写作规则与门禁见 [docs/AGENTS.md](AGENTS.md)。

| 文档                             | 内容                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| [快速入门](getting-started.md)   | 安装、前置条件与第一个任务                                 |
| [产品模型](product-model.md)     | 词汇、入口、单组件、数据流与运行边界：命名与边界的唯一来源 |
| [功能概览](features.md)          | 实时预览、问题区、选中定位、Agent 高亮与导出               |
| [Typst 技能](skills.md)          | 四阶段工作流、批处理预算与证据边界                         |
| [工具参考](tools.md)             | 7 个工具与面板 wire 方法的参数、输出与错误码               |
| [配置参考](configuration.md)     | 4 个设置字段、查找顺序与热重载行为                         |
| [故障排查](troubleshooting.md)   | 常见现象、原因与处理方式                                   |
| [系统架构](architecture.md)      | 组件拓扑、数据流、状态、并发、安全与端侧契约               |
| [开发指南](development.md)       | 仓库结构、构建、测试、调试与发布流程                       |
| [开发留意](development-notes.md) | 上游补丁、妥协与退出条件                                   |
| [文档索引](index.md)             | 读者文档入口                                               |
| [插件详情](plugin-detail.md)     | 插件市场的组件摘要                                         |

产品结构与术语见 [产品模型](product-model.md)；代理与贡献者规则见仓库根部的 `AGENTS.md`。

## 安装与构建

```sh
npm install                  # 依赖安装，同时通过 prepare 构建 lib/
npm run build                # tsc 声明 + 浏览器 bundle
npm run build:client         # 只构建浏览器 bundle（改过 src/client/** 后必跑）
npm run typecheck            # harness 引脚检查 + node/test/client/client-test/scripts 五套 tsc
npm test                     # 测试规范守卫 + 全部 vitest 用例
npm run test:docs            # 文档成对、工具契约与发布清单检查
npm run format               # prettier --write；用 format:check 校验
```

`prepare` 是消费者从源码安装时跑的构建：它只转译 Node 半边、跑真实的客户端构建、并检查入口文件确实落盘。声明文件由 `npm run build` 的 `tsc` 产出，发布路径（`prepublishOnly` → `release:check`）会先跑它。

### 上游产物一致性门禁

```sh
npm run harness:check        # 引脚、lockfile 与上游产物新鲜度
npm run deps:check           # 直接依赖是否都还在 registry 后面
npm run tokens:write         # harness 升级后刷新设计令牌快照
```

`harness:check` 报的是**问题**，`deps:check` 报的是**待办**：前者失败会挡住发布；后者列出尚未进入 registry 的依赖，需要处理。

`tokens:write` 默认读取已安装的 pinned `@deepseek-ai/dsh-client-ui-theme`（与 manifest pin 同版）；`DSH_THEME_DIR` 只用于显式指向另一份主题检出，路径不存在会直接失败。sibling `../deepseek-harness` 的主题版本与 pin 不同时会被跳过，快照因此只记录插件锁定的调色板。

### pin 升级复核清单

1. `npm run harness:pin -- <ver>` 统一改写 `dependencies`、`devDependencies` 与 `overrides` 里的精确版本。
2. `npm install --package-lock-only` 更新锁文件，不手工编辑版本号。
3. `npm run harness:check`；版本钉、vendored 包地板与上游产物必须一致。
4. 逐条核对 [开发留意](development-notes.md) 的上游期望：已满足就迁移并删除条目，未满足只更新 pin 与复核日期。
5. 架构或根 `AGENTS.md` 里依赖 pin 的约束发生变化时，同一次改动同步两处。

## 本地调试

调试分两条路：要改浏览器界面，必须把本包**安装进一个 profile**（`dsh plugin --profile web add .`），否则页面里只有宿主工具、没有面板；只改 host 半边时，才用 `--patch` 叠加层做免重启热重载。

### 先决条件：上游产物与当前源码一致

本仓库通过 sibling `../deepseek-harness` 读取声明与运行时。客户端表现和源码不一致时，先重建上游，再怀疑插件：

```sh
pnpm --dir ../deepseek-harness run build             # 声明与 Node 端产物
pnpm --dir ../deepseek-harness run build:lib:client  # 浏览器运行时
npm run harness:check                                # 检查两边是否仍是同一代
```

> 实测陷阱：上游只构建了一部分时，`dsh web` 仍会启动，但 Typert 装载器会报 `entries did not activate`，页面看起来“没有工作区、没有会话”。这是上游产物问题，不是本插件的面板问题；先按上面的命令重建上游。

### 完整插件调试（含 Web 界面）

每次从干净的临时 profile 起，`~/.dsh` 保持原样：

```sh
export DSH_HOME=$(mktemp -d /tmp/dsh-typst-dev-XXXX)
cp ~/.dsh/.credentials.yaml "$DSH_HOME/"   # 可选：需要真实模型/会话时
chmod 600 "$DSH_HOME/.credentials.yaml"

npm run build                               # 产出 lib/ 与 lib/client.js
dsh plugin --profile web add .              # 把本仓库安装进 profile（面板只认包名）

npm run dev &                               # host：tsc --watch
npm run dev:client &                        # client：esbuild --watch
dsh web --port 3307                         # 启动 Web 宿主
```

打开日志里打印的 `http://127.0.0.1:3307/?token=...`，在默认工作区新建会话，再从右侧栏打开 **Typst** 标签。改 `src/client/**` 后浏览器半边由 `dev:client` 重新打包，刷新页面即可；改 `src/**`（host）后 `dev` 会增量编译，必要时重启 `dsh web`。

> 说明：`dsh plugin --profile web add .` 把 profile 链到当前 checkout，重新 `npm run build` 后立即生效；只有移动 checkout 或换包名时才需要重新执行。只想快速验证 host 行为时，用下一节的 `--patch` 叠加层更轻。

### 仅 Host 端调试（支持热重载）

```sh
npm run build
npm run dev &
cp dev.cordis.yml.example dev.cordis.yml     # 把 name 改成本仓库 lib/index.js 的绝对路径
dsh web --patch ./dev.cordis.yml --port 3307
```

`--patch` 通过绝对路径加载 `lib/index.js`，Loader 监视下改 host 代码可免重启；浏览器半边仍是 `lib/client.js` 打包产物，改 `src/client/**` 后要 `npm run build:client` 并刷新。`dev.cordis.yml` 带绝对路径，永远不要提交。

### 预览面板的调试

面板的问题多数在两半的契约上：状态帧的形状、资源地址的拼接、或 pdf.js 的加载。先看宿主日志里的 `[dsh-typst]` 前缀行——会话的定位、watch 的启动与重定位都在那里。工作区里没有 `.typ` 时面板会停在 setup 页；先放一个能被 `typst` 独立编译的主文件，再看预览、主文件菜单、问题区和大纲。

## 测试规范

- 一个 spec 一个行为；不使用 `.only`、`.skip`、`.todo`（需要条件门用 `.runIf`）。
- 同步等待自己拥有的 promise，绝不用 sleep 等待。
- spec 的位置由它测的模块决定，见 [tests/README.md](../tests/README.md)。
- `tests/fixtures/typst-fake.cjs` 是模拟的 typst CLI，它的输出形状必须与 `src/typst/diagnostics.ts` 解析的形状保持一致。
- `npm run lint:test` 是机械守卫（体积、车道、焦点用例、上游源码导入），它和用例一起跑。

## 发布检查清单

1. `npm run format:check` —— 格式一致。
2. `node scripts/harness-state.mjs --strict` —— 检查 harness pin、lockfile 和上游产物。
3. `npm run lint:test` —— 检查测试规范。
4. `npm run tokens:check` —— 检查设计令牌快照。
5. `npm run style:check` —— 检查客户端样式。
6. `npm run typecheck` —— 检查五套 TypeScript 工程。
7. `npm run test:docs` —— 检查文档成对、工具契约与发布清单。
8. `npm run test:coverage` —— 运行全部用例并检查覆盖率阈值。
9. `npm run build` —— 生成声明文件和浏览器 bundle。
10. `npm run verify:pack` —— 检查打包产物的入口和文件清单。

整条链路由 `npm run release:check` 一次跑完，它同时是 `prepublishOnly` 的内容。

客户端可见的改动还要跑 `npm run smoke:discovery`；带浏览器时加跑 `npm run smoke:web-composition`。

## CI 工作流

`.github/workflows/` 下有五个工作流：

- `release-branch.yml`：推送 `v*` 标签后，只读的质量作业先跑 `npm run release:check`，再生成唯一产物 `release-artifact-<source SHA>`；三平台安装矩阵只消费这份 tarball（`scripts/release-artifact.mjs --verify` 逐文件校验），用隔离的 consumer lockfile 安装发布版精确 pin 的 dsh CLI 与 pnpm，并通过 `dsh plugin add` 真正装载 profile。Linux 继续启动 web composition，断言 boot 图里带着本插件的 `client.js`。三平台全部通过后，`npm-release` 用 OIDC 把同一 tarball 提交 npm，`publish` 复核产物后更新 tag 通道 `stable`。
- `prebuilt.yml`：`main` 推送或手动触发时构建、校验预编译产物并更新滚动通道 `release`；它与上一个共用 `release-branch` 并发组，两个通道的移动按顺序发生。
- `verify-npm-release.yml`：发布工作流成功后由 `npm-publication` 环境延迟运行，下载公开 tarball 并核对 SHA-512 integrity 与产物一致，然后创建或更新 GitHub Release。
- `upstream-health.yml`：每周一 02:00 UTC 跑 `npm run release:check`，并比对 pin 与上游 harness 的 `next` 主线；`deps:check` 失败只作提示，不阻断报告。
- `scanner.yml`：pull request 与 `main` 推送运行 HOL Guard 扫描器，低于 75 分失败。

供应链约定：所有第三方 Action 固定到不可变 commit SHA 并在行尾标注版本；npm 走 OIDC 可信发布（npm CLI ≥ 11.5.1，pin 的 Node 24.22.3 自带 npm 11.19.1），不保存任何 token；`npm-release` 与 `publish` 只下载、校验、提交既有产物，不重新构建；扫描器只授予 `contents: read`，fork 的 PR 也在同等约束下运行。

浏览器验收留在本地：它需要真实的 `typst` 二进制，GitHub runner 不提供；`npm run smoke:web-composition` 仍是发布前的本地闸门。

### 版本、发行说明与发布通道

版本号以 `package.json` 为准，发布前同步 `package-lock.json` 根清单。tag 用 `v<version>`，指向通过全部门禁的 main 提交；tag、清单版本与发行说明必须一致。预发布版本按 SemVer 写（如 `0.2.0-alpha.1`），npm dist-tag 取首个预发布标识（此例为 `alpha`；纯数字或 `latest` 标识用 `next`），GitHub Release 标为 prerelease 且不设为 Latest。

两个安装通道各记来源：`release` 跟随 main，main 被 amend 或 force push 重写后在下一次运行中以当前 main 重新初始化；`stable` 只允许沿 main 历史前进，同源提交产出不同字节会被拒绝。git-hosted 安装用 `github:Vncntvx/dsh-typst#release`（零构建脚本、无需 `allowBuilds` 批准），npm 安装走版本号。

本地审阅：`npm run release:branch -- --dry-run`（工作树须干净）。真实推送需要 `--push --artifact <已校验产物目录>`，目标固定为项目 origin 的 `release` 或 `stable`。

可信发布要求 npmjs.com 上为 `Vncntvx/dsh-typst` 配置可信发布者，workflow 文件名必须精确是 `release-branch.yml`（区分大小写），并允许 `npm publish`。

延迟核验依赖 `npm-publication` 环境：在仓库 Settings → Environments 中为它设置 15 分钟 wait timer，GitHub 在等待结束后才启动核验 runner；npm 还没显示 Published 时，核验作业最多查询 12 次、每次间隔 10 秒，仍为 404 就在作业摘要里提示重跑。

> 注意：pull request 只跑安全扫描；质量门禁在 `v*` 标签与每周定时任务上运行，本地验证仍是合入闸门。没跑的检查要如实说明。
