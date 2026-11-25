<div align="center">

# dsh-typst

<img
  src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=18&pause=2000&color=239DAD&center=true&vCenter=true&width=760&lines=%3E+Write+and+fix+Typst+documents+in+place.%3B%3E+Watch+every+save+redraw+the+page.%3B%3E+Hand+the+agent+diagnostics%2C+rendered+pages+and+PDF+export."
  alt="dsh-typst"
/>
<p align="center">
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&amp;logo=deepseek&amp;logoColor=white" alt="powered by dsh" style="max-width:100%;"></a>
  <a href="https://www.npmjs.com/package/dsh-typst-plugin"><img src="https://img.shields.io/npm/v/dsh-typst-plugin" alt="npm version" style="max-width:100%;"></a>
  <a href="https://www.npmjs.com/package/dsh-typst-plugin"><img src="https://img.shields.io/npm/dm/dsh-typst-plugin" alt="npm downloads" style="max-width:100%;"></a>
  <a href="https://www.npmjs.com/package/dsh-typst-plugin"><img src="https://img.shields.io/npm/l/dsh-typst-plugin" alt="license" style="max-width:100%;"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness/releases"><img src="https://img.shields.io/badge/dsh-0.2.2--rc.5-blue" alt="dsh version" style="max-width:100%;"></a>
</p>
</div>

<p align="center">
  <a href="README.en.md"><b>English</b></a> · <b>中文</b>
</p>

dsh-typst 把本机 Typst 接入 DeepSeek Harness。Agent 在对话中撰写、修复 `.typ` 文档，右侧边栏同步显示实时排版；每次保存后可见页面原地重绘并保持滚动位置。Agent 读取带 `file:line`、源码行、`hint:` 与调用链的编译诊断，查看渲染页，在预览中标出位置，导出 PDF。你在预览里选中文字，可连同对应源码位置交给 Agent。

## 主要功能

- **对话中的文档工作**
  - **定向与编译**：`typst_status` 读取 Typst 版本、路径、主文件与最近一次编译结果；`typst_check` 等到已保存的改动编译完，返回位置、源码行、Typst `hint:` 与调用链。
  - **修复循环**：Agent 编辑 `.typ` 后立即 `typst_check`，直到诊断清空；编译失败时面板保留上一次成功的预览。
  - **看排版**：`typst_render_pages` 把至多 4 页渲染成 PNG，检查溢出的行、图片位置与分页。
  - **标注与导出**：`typst_show` 请求用户查看某页，或高亮渲染文字/源码行并附备注；`typst_clear_highlights` 移除标注；`typst_export_pdf` 把 PDF 写入工作区，可选 PDF 标准与页选择。
- **右侧预览面板**
  - **实时预览**：每次保存经 `typst watch` 增量重编译，可见页面原地重绘，滚动位置保持；侧栏尺寸变化后重新适配，保留页内阅读位置。
  - **状态与问题**：工具栏显示编译阶段、耗时与诊断数量；问题辅助区可按级别筛选、选择单条或多条、打开源码或调用链，并把修复请求放进可编辑草稿。
  - **主文件**：菜单分为当前主文件、其他 Typst 文件与被当前文档引用的片段；片段来自 Typst 自己的依赖报告。索引默认跳过隐藏目录及 `node_modules`、`target`、`__pycache__`、`venv`、`build`、`dist`，勾选后可包含。
  - **安装引导**：Typst 缺失或过旧时，引导页列出检测事实、查找目录与平台命令；安装请求先审阅再提交，手动检查与重启预览保持可用。
- **运行方式**
  - **本机编译器**：插件调用你安装的 Typst，使用同一套字体、包与版本；字体目录、`@local` 包目录与排除目录可在设置里调整。
  - **读写边界**：`.typ` 源文件由 Agent 的文件工具编辑，插件只读；预览 PDF 与渲染图存放在插件私有缓存 `~/.dsh/cache/typst`，工作区成品由导出工具写出。
  - **网络**：插件自身不发起网络请求；Typst 首次使用 `@preview` 包时按终端行为下载。

## 安装

### 桌面端安装（插件管理器）

在 DeepSeek Harness 桌面端打开侧栏的**插件**，点击**添加插件**，输入对应标识：

- 最新版（推荐）：`dsh-typst-plugin`
- 指定版本：`dsh-typst-plugin@0.1.0-alpha.0`
- GitHub 预构建分支：`github:Vncntvx/dsh-typst#release`

### 命令行安装

```sh
# npm 安装最新版（推荐）
dsh plugin --profile <name> add dsh-typst-plugin

# 安装指定版本
dsh plugin --profile <name> add dsh-typst-plugin@<version>

# 从 GitHub 预构建分支安装
dsh plugin --profile <name> add github:Vncntvx/dsh-typst#release
```

npm 包与 `#release` 分支都带构建产物，安装后新建会话即可使用。在插件管理器中打开 **dsh-typst-plugin** 详情页，可在配置区填写 Typst 路径、字体目录、包目录与排除目录。

## 前置条件

1. Node.js 24.9 或更高，以及一个带右侧停靠栏的 DeepSeek Harness 界面；插件要求 dsh 0.2.2-rc.5 或更高。
2. 本机安装 **Typst 0.12 或更高**，例如 `brew install typst`（macOS）、`winget install --id Typst.Typst`（Windows）、`cargo install --locked typst-cli`，或从 <https://github.com/typst/typst/releases> 下载。
3. 一个包含 `.typ` 文件的工作区。

插件按顺序查找 `typst`：插件设置中的路径 → PATH → 常见安装位置（Homebrew、Cargo、`~/.local/bin`、Nix、Snap、WinGet、Scoop）→ 登录 shell（mise/asdf 等版本管理器）。装在别处时，在插件设置 **Typst 路径** 中填写可执行文件的路径，绝对路径或相对工作区的路径都可以。

## 工具一览

| 工具                     | 用途                                                                      |
| ------------------------ | ------------------------------------------------------------------------- |
| `typst_status`           | Typst 版本与路径、主文件、其余 `.typ` 文件、最近一次编译结果              |
| `typst_set_main`         | 选择主 `.typ` 文件，按工作区记忆                                          |
| `typst_check`            | 等到已保存的改动全部编译完，再报错误与警告：位置、源码行、`hint:`、调用链 |
| `typst_render_pages`     | 把至多 4 页渲染成 PNG，供 Agent 检查排版                                  |
| `typst_show`             | 请求查看预览某页，或高亮渲染文字/源码行，附备注                           |
| `typst_clear_highlights` | 移除 Agent 高亮                                                           |
| `typst_export_pdf`       | 编译 PDF 写入工作区，可选 PDF 标准与页选择                                |

技能 `typst` 随插件注册，指导 Agent 按定向、编辑、检查、看图、指向、导出的顺序工作。参数、返回值与错误码见[工具参考](docs/tools.md)。

## 说明文档

### 使用

| 文档                                | 内容                                             |
| ----------------------------------- | ------------------------------------------------ |
| [快速入门](docs/getting-started.md) | 安装、连接验证与第一个任务                       |
| [产品模型](docs/product-model.md)   | 工作台、面板与 Agent 工具的分工，以及系统边界    |
| [功能概览](docs/features.md)        | 实时预览、问题辅助区、选中定位、Agent 高亮与导出 |
| [故障排查](docs/troubleshooting.md) | 常见现象、可能原因与处理方式                     |

### 维护

| 文档                                  | 内容                                         |
| ------------------------------------- | -------------------------------------------- |
| [系统架构](docs/architecture.md)      | 组件拓扑、数据流、状态、并发、安全与端侧契约 |
| [工具参考](docs/tools.md)             | 7 个工具与面板 wire 方法的参数与错误码       |
| [配置参考](docs/configuration.md)     | 设置字段、查找顺序与热重载行为               |
| [开发指南](docs/development.md)       | 构建、调试、测试与发布流程                   |
| [Typst 技能](docs/skills.md)          | 四阶段工作流、预算与证据边界                 |
| [开发留意](docs/development-notes.md) | 上游补丁、妥协与退出条件                     |

## 开发

```sh
npm install          # 同时通过 prepare 构建 lib/
npm test             # 测试规范守卫 + 全部测试（含对模拟 typst CLI 的 session 集成）
npm run typecheck    # harness 引脚 + node/test/client/client-test/scripts 五套 tsc
npm run release:check
```

## 许可证

本项目遵循 [MIT 许可证](./LICENSE)。
