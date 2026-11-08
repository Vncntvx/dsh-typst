# dsh-typst

[English](README.en.md) · 简体中文

DeepSeek Harness 的 Typst 插件:Agent 撰写、修复 Typst 文档时,右侧边栏实时排版预览——由**你本机的 Typst**驱动(你的字体、你下载的包、你的 Typst 版本),预览与终端里 `typst compile` 的结果一致。文件一保存(无论你改还是 Agent 改),预览即刻增量重编译、原地重绘,不闪烁、不丢位置。Agent 能读到带 `file:line`、源码行、`hint:` 与调用链的错误,把渲染页面当图看,在预览里为你标出位置,导出 PDF;你在预览中选中文字,可以连同对应源码位置一起发给 Agent。

安装包内含编译产物,无需构建。需要:

- Node.js 24+,以及一个带右侧停靠栏的 DeepSeek Harness Web 界面;
- 本机安装 **Typst 0.12 或更高**,例如 `brew install typst`(macOS)、`winget install --id Typst.Typst`(Windows)、`cargo install --locked typst-cli`,或从 <https://github.com/typst/typst/releases> 下载。

插件按顺序查找 `typst`:插件设置中的路径 → PATH → 常见安装位置(Homebrew、Cargo、`~/.local/bin`、Nix、Snap、WinGet、Scoop)→ 登录 shell(mise/asdf 等版本管理器)。装在别处时,在插件设置 **Typst 路径** 中填写完整路径。

## 使用

安装并启用 `dsh-typst-plugin` 后,可以试着让 Agent:

- "用 Typst 起一篇双栏论文,带标题块和摘要。"
- "修复我论文里的错误,然后告诉我改了什么。"
- "第 3 页的表格溢出了——让它排进去。"
- "把 `paper.pdf` 导出成 PDF/A-2b。"

也可以从右侧栏"+"菜单或引导页打开 **Typst** 面板。

### 面板

- **实时预览**主文件。每次保存经 `typst watch` 增量重编译,可见页面原地重绘——不闪烁,滚动位置不动。缩放(适宽、适页、百分比)、页码框。
- **主文件**：点击“预览主文件”主动选择，支持搜索、直接输入相对路径及包含隐藏目录的完整索引。切换会重新编译，选择按工作区记忆。
- **状态与问题**：显示编译阶段、耗时及诊断数量。失败时标记并保留上次成功预览；底部问题辅助区可筛选、选择、打开源码并审阅修复请求。
- **文字与区域反馈**：选中文字后可追加到主输入框现有草稿；询问先进入可编辑请求，可核对源码候选后明确提交。框选可截取真实页面图片，支持多页区域、审阅、移除和失败重试。
- **Agent 标注**：位置请求先通知，点击后导航，可返回原阅读位置；标注展示完整引文和备注，无法重新定位时保留过期状态。
- **安装引导**：显示检测事实、查找目录和对应平台的命令。安装请求先审阅再提交；手动检查和重启始终可用。

### 工具

| 工具                     | 用途                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `typst_status`           | Typst 版本与路径、主文件、其余 `.typ` 文件、最近一次编译结果          |
| `typst_set_main`         | 选择主 `.typ` 文件(按工作区记忆)                                      |
| `typst_check`            | 等到已保存的改动全部编译完,再报错误与警告(位置、源码行、hint、调用链) |
| `typst_render_pages`     | 把至多 4 页渲染成 PNG 供 Agent 看排版                                 |
| `typst_show`             | 请求查看预览某页,或高亮渲染文本/源码行,带备注                         |
| `typst_clear_highlights` | 移除 Agent 高亮                                                       |
| `typst_export_pdf`       | 编译 PDF 写入工作区(可选 PDF 标准、页选择)                            |

技能 `typst`(模型可调用)教 Agent 完整的工作流:先 `typst_status` 定向,编辑后立即 `typst_check`,布局问题 `typst_render_pages` 看图,`typst_show` 指给用户。

### 权限、隐私与网络

- 插件以工作区为工作目录运行你的 `typst`,与你在终端里手动运行一致。
- 插件从不编辑 `.typ` 文件;只有 `typst_export_pdf` 会写工作区,且仅限工作区内。预览 PDF 与渲染图存放在插件私有缓存目录(`~/.dsh/cache/typst`)。
- 插件自身不联网;Typst 首次使用 `@preview` 包时会自行下载,与终端一致。

## 文档

### 使用

| 文档                                | 内容                                                 |
| ----------------------------------- | ---------------------------------------------------- |
| [快速入门](docs/getting-started.md) | 安装、前置条件与第一个任务                           |
| [产品模型](docs/product-model.md)   | 工作台、面板与 Agent 工具的分工,以及系统边界         |
| [功能概览](docs/features.md)        | 实时预览、底部问题辅助区、选中定位、Agent 高亮与导出 |
| [故障排查](docs/troubleshooting.md) | 常见现象、可能原因与处理方式                         |

### 维护

| 文档                              | 内容                                   |
| --------------------------------- | -------------------------------------- |
| [系统架构](docs/architecture.md)  | 分层职责、数据流、进程与生命周期       |
| [工具参考](docs/tools.md)         | 7 个工具与面板 wire 方法的参数与错误码 |
| [配置参考](docs/configuration.md) | 设置字段、查找顺序与热重载行为         |
| [开发指南](docs/development.md)   | 构建、调试、测试与发布流程             |

## 开发

```sh
npm install          # 同时通过 prepare 构建 lib/
npm test             # 测试规范守卫 + 全部测试(含对模拟 typst CLI 的 session 集成)
npm run typecheck    # harness 引脚 + node/test/client 三套 tsc
npm run release:check
```

以兄弟目录 `../deepseek-harness` 开发时,用 `dev.cordis.yml.example` 挂本地 harness;`npm run link:local-harness` 在 sibling 领先于 registry 时同步声明。详见 [AGENTS.md](AGENTS.md)。

## License

MIT — 见 [LICENSE](LICENSE)。
