<p align="right"><a href="getting-started.en.md"><b>English</b></a></p>

# 快速入门

dsh-typst 将 Typst 实时预览接入 DeepSeek Harness 的右侧边栏。Agent 使用本机的 typst 编译文档，预览在每次保存后更新，你和 Agent 可以基于同一份排版结果协作。

## 前置条件

- **Node.js 24 或更高**，以及一个带右侧停靠栏的 DeepSeek Harness Web 界面。
- **Typst 0.12 或更高**已安装在本机，例如 `brew install typst`（macOS）、`winget install --id Typst.Typst`（Windows）、`cargo install --locked typst-cli`，或从 <https://github.com/typst/typst/releases> 下载。
- 一个包含 `.typ` 文件的工作区。

插件按顺序查找 typst：插件设置里的路径 → PATH → 常见安装位置（Homebrew、Cargo、`~/.local/bin`、Nix、Snap、WinGet、Scoop）→ 登录 shell。装在别处时在插件设置 **Typst 路径** 里填完整路径。

## 安装插件

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

安装完成后新建会话即可使用。

> 提示：从 `main` 源码分支直接安装需要本地执行构建；`#release` 分支已含构建产物，可直接安装。

## 验证连接

新建一个会话，在工作区里放一个 `main.typ`，然后：

1. 从右侧栏的 "+" 菜单或引导页打开 **Typst** 面板。
2. 看工具栏：它会显示*编译中*，几秒后变成编译耗时，或错误与警告的数量。
3. 编译失败时面板保留上一次成功的版本，展开**问题**辅助区看每条错误的文件:行:列、源码行、Typst 的 `hint:` 与调用链。

面板打不开或停在安装引导页时，按提示装好 typst——引导页会列出检测到的事实、查找过的目录和对应平台的安装命令，并可审阅安装请求后提交。装好后面板自己会开始预览。

## 第一个任务：修一个错误

在工作区里放一个能编译出错误的文档，例如：

```typst
#set page(width: 10cm)
= 标题

#undefined_function()
```

然后让 Agent 处理它：

> 修复我论文里的错误，然后告诉我改了什么。

Agent 会先 `typst_status` 定向，再用 `typst_check` 读到带 `file:line:column`、源码行、`hint:` 与调用链的诊断，改完文件后再次 `typst_check` 确认。核对这几件事：

- 面板的预览在每次保存后重新排版，没有闪烁，滚动位置不变。
- **问题**辅助区里的条目随修复消失。
- Agent 的回答里给出的位置与辅助区里看到的一致。

## 打开预览面板

面板在三种情况下可用：点击右侧栏的 "+" 菜单、从引导页进入、或重新打开已存在的 Typst 标签页。

面板里的三个入口值得知道：

- **缩放与页码框**：适宽、适页或按百分比缩放，页码框显示当前页。
- **文字与区域反馈**：选中文字后可追加到主输入框现有草稿；询问先进入可编辑请求，可核对源码候选后明确提交。框选可截取真实页面图片，支持多页区域、审阅、移除和失败重试。
- **Agent 标注**：位置请求先通知，点击后导航，可返回原阅读位置；标注展示完整引文和备注，无法重新定位时保留过期状态。

下一步：[产品模型](product-model.md)说明工作台与 Agent 工具的分工，[功能概览](features.md)列出各表面的能力。
