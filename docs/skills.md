<p align="right"><a href="skills.en.md"><b>English</b></a></p>

# Typst 工作流技能参考

技能是分阶段的指令。模型先从短目录选择技能，再通过 Harness 的 `skill` 工具加载完整 Markdown SOP；完整正文不进入常驻 system prompt。目录保留技能名称和短描述，仍会占用少量 Token。

插件只注册一个技能 `typst`；名称与 description 使用英文，中文提问由模型跨语言匹配。

## 选择技能

| 技能    | 组件 | 输入与产出                                                                   | 职责边界                                                     |
| ------- | ---- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `typst` | 核心 | `.typ` 文档或排版请求 → 修改后的源码、编译诊断、渲染页、预览定位与导出的 PDF | 通过工作台完成排版；安装由用户明确要求触发，预览走工作台工具 |

技能在工具可用时使用条件化的安装引导与 Zotero 引用配方；Zotero 插件不可用时只交付本地结果和缺失说明，引用生成留给可用的 Zotero 工具。

## 阶段、批处理与停止条件

技能包含四个有序阶段：定向、编辑循环、指向与反馈、导出与引用。阶段状态保存在模型的任务上下文里；复用已经取得的主文件、快照与诊断，不重复扫描。

| 阶段       | 顺序                                               | 默认预算与停止条件                                                                                                                               |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 定向       | `typst_status` → 主文件 → 工作区约定               | 先读状态；`TYPST_NO_MAIN` 时选一个能独立编译的主文件，仍不明确就问用户；没有 `.typ` 时创建 `main.typ`。版本不可用时转安装引导，不猜测语法版本。  |
| 编辑循环   | 改源码 → `typst_check` → 修错 → 需要时渲染         | 每次改完立即 check，等磁盘上已有改动全部编译完成；布局问题按受影响的页渲染，单次最多 4 页，默认 110 ppi。诊断清零且布局核实后停止。              |
| 指向与反馈 | `typst_show` / `typst_clear_highlights` → 面板反馈 | 引用按文档中的可见文字，源码定位用 `file` + `line`；一次只标用户需要看的位置，附一句原因。高亮跨重编译跟随文本，找不到时转 stale。               |
| 导出与引用 | `typst_export_pdf` → 引用文件 → 安装引导           | 导出一次到工作区内路径，可选 PDF 标准与页选择；引用优先生成 `.bib` 并复用返回的 key；安装只在用户明确要求时执行，确认 `typst --version` ≥ 0.12。 |

不要为预览在 shell 里运行 `typst compile` 或 `typst watch`；一次性查询（如 `typst fonts`、`typst query`）可以用 shell。参数名错误只允许对照 schema 修正一次。

## 证据与安全边界

- 诊断以 `file:line:column`、源码行、Typst 的 `hint:` 行和调用链为准；`typst_check` 成功只证明编译通过，不证明布局正确。
- 预览反馈带有主文件、快照身份、选中文字或截图，以及可选的近似源码摘录。编辑前核对摘录与快照年龄；数学、编号、参考文献和生成文本的匹配是近似的。
- 位置通知只提示，不导航；用户点击后才跳转，并可返回原阅读位置。高亮跟随文本变化，目标消失时明确标为 stale。
- 导出路径由 `insideWorkspace` 收敛，越界以 `TYPST_PATH_OUTSIDE_WORKSPACE` 拒绝；预览自己的 PDF 在插件私有缓存里，不在工作区。
- 安装、更新、`sudo`、安装包管理器或修改 shell profile 都需要用户明确要求；面板提交的安装请求算一次明确要求。插件自身不联网。

## 注册与维护

`src/skills/typst.ts` 是纯 Host 模块。`typstSkill()` 返回 `SkillRegistration`，`registerTypstSkill()` 通过可选 `ctx.inject(["skills"])` 注册；技能来源是 `runtime`，模型与用户都可调用，`metadata.component` 为 `typst`。正文是 TypeScript 字符串，构建直接编译，不需要复制 Markdown 资源；注册由 fiber 清理。

测试归属：`tests/skills/typst.spec.ts` 断言技能名、调用方式、正文包含全部 `TYPST_TOOL_NAMES`，并验证注册经过 `ctx.skills.register`。文档示例由 `tests/host/doc-examples.spec.ts` 对照真实工具 schema；发布前运行 focused spec、`npm run typecheck`、`npm test` 和 `npm run release:check`。
