<p align="right"><a href="architecture.en.md"><b>English</b></a></p>

# 系统架构

dsh-typst 是一个请求驱动的插件：加载它不启动 typst，不触碰磁盘。第一个工具调用，或面板第一次订阅某个工作区，才为那个工作区建出会话。本文按运行时关注点描述系统：组件拓扑、数据流、状态与一致性、并发与资源、安全边界、端侧契约、设计边界。每条不变量给出当前实现和验证位置。配置字段、工具参数、界面呈现分别由 `configuration.md`、`tools.md`、`features.md` 拥有；上游绕行补丁由 `development-notes.md` 拥有。本文按职责组织，不按源码目录罗列实现。

## 组件拓扑与生命周期

### 组件与依赖方向

| 组件        | Cordis 键        | Wire 命名空间 | 设置命名空间 | 默认 | 职责                                                                              |
| ----------- | ---------------- | ------------- | ------------ | ---- | --------------------------------------------------------------------------------- |
| `dsh-typst` | `typstWorkbench` | `typst`       | `typst`      | 启用 | 本机 typst 定位、watch 生命周期、快照、7 个工具、`typst` 技能、右侧栏预览与设置页 |

插件只有一个组件，没有可独立关闭的子面：预览和喂给它 PDF 的 watch 必须同生共死。host 半边由 `TypstWorkbenchService` 持有会话注册表、配置生命周期、Typert manifest 与 scope 查找、工具与技能；浏览器半边由 `src/client/` 持有面板、资源协议、Remote 命名空间、pdf.js 视图与工具卡片。

依赖方向固定为：浏览器表面 → `ctx.remote.typst` / `typst` 资源协议 → host 服务 → `WorkspaceSession` → `src/typst/`。宿主运行时与浏览器表面通过契约相连，依赖保持单向。

### 挂载、配置与卸载

加载器把默认导出与校验后的配置一同挂载；挂载本身不生成进程，也不扫描工作区。配置是 volatile 的：`loader/volatile-update` 到达后，服务按顺序应用一次设置变更，只处理 `active === true` 的会话——工具链字段变化重启 watch，`excludeDirs` 变化重扫主文件候选；未激活的会话保持休眠，首次使用时读取新值。

会话在首次使用时激活：定位工具链、选择主文件、启动 watch。卸载时关闭所有会话，watch 随会话关闭而退出；进程退出钩子再兜底调用一次 `killNow`，面板的流订阅同时中止 host 侧的 watch 注册。生命周期由 `tests/host/lifecycle.spec.ts`、`tests/host/composition.spec.ts` 与 `tests/workspace/session-lifecycle.spec.ts` 验证。

### 宿主契约适配

`ctx.typstWorkbench` 是插件对宿主暴露的稳定边界；Typert manifest 在 `src/typert.ts` 手写并经 `ctx.typert.register()` 注册。生成器不能用于独立 checkout 的原因、补丁代价与退出条件见 `development-notes.md` 的 DN-1。

每个 wire 方法都带 `typstScope` 参数，服务端用 `typstScope` 查找把 wire 上的 SessionId 解析为工作区根后再执行方法体；面板在客户端只传 sessionId。同一个宿主里的两个会话可以位于两个工作区，互不干扰。

## 数据流

### 启动、定位与主文件

`typst_status` 是定向入口：它报告 Typst 版本、主文件、其他 `.typ` 文件与最近一次编译结果。`typstPath` 为空时，`src/typst/locate.ts` 按设置 → PATH → 常见安装位置 → 登录 shell 的顺序查找，解析版本并与 `MIN_TYPST`（0.12.0）比较；低于版本要求是 `too_old`，不是 `ready`。

`src/typst/mainfile.ts` 扫描 `.typ` 候选，跳过内置目录与 `excludeDirs`（按目录名、任意层级、不区分大小写），挑出主文件。主文件按工作区记住，`typst_set_main` 与面板菜单都走同一条路径收敛。没有 `.typ` 文件时面板停在安装引导页；技能要求模型创建 `main.typ`，以实际文件确定文档结构。定位与发现由 `tests/typst/mainfile.spec.ts`、`tests/host/which.spec.ts` 和 `tests/workspace/discovery.spec.ts` 验证。

### 编辑、编译与诊断

Agent 用普通文件工具编辑 `.typ`；插件从不写源文件。保存触发 `typst watch` 重新编译，`src/typst/diagnostics.ts` 把输出解析成 `WatchLog` 与诊断列表，含 `file:line:column`、源码行、Typst 的 `hint:` 行和调用链。

`typst_check` 不猜时间：它调用 `WorkspaceSession.settle`，等到磁盘上已有的改动全部编译完成；watch 漏掉改动时只重启一次再判断。面板看到的也是同一条状态流，不另开编译器。settle 与诊断解析由 `tests/workspace/session.spec.ts`、`tests/typst/watch-log.spec.ts` 和 `tests/unit/diagnostic-text.spec.ts` 验证。

### 预览、定位与高亮

watch 把 PDF 写进插件私有缓存；每次成功编译形成一份快照，身份是 `generation/seq/run/pages/sha256`。`LIMITS.snapshots` 限制保留份数（3），同时受总字节上限约束；旧快照按序淘汰，供高亮重定位使用。

面板读状态走资源协议 `dsh-resource://typst/state/<sessionId>`：首帧是当前状态，之后每帧对应一次相关变化。PDF 字节不在状态帧里，面板通过 `typst/readPreview` 按精确身份拉取；身份不匹配会明确失败，预览只使用请求时的身份。候选 PDF 的首屏和文字层就绪后才替换可读预览。快照身份与过期读取由 `tests/workspace/snapshot-identity.spec.ts` 与 `tests/client/provider.spec.ts` 验证。

`typst_show` 的 `quote` 走渲染文本反查源码（`src/typst/match.ts`、`text.ts`），`file` + `line` 直接定位源码范围；两者都产出引用与 PDF 用户空间矩形。重编译后高亮按引用重新定位，目标消失则标为 stale，而不是悄悄消失。匹配近似性由 `tests/typst/match.spec.ts`、`tests/client/source.spec.ts` 覆盖。

### 导出与一次性编译

`typst_export_pdf` 与 `typst_render_pages` 走 `src/typst/oneshot.ts` 的独立编译，不占用 watch：导出可带 PDF 标准与页选择，渲染一次最多 4 页，默认 110 ppi。导出的 PDF 写入工作区，路径由 `insideWorkspace` 收敛；渲染结果作为附件交给工具卡，字节存 attachment store。一次性编译的参数接线由 `tests/tools/render.spec.ts` 与 `tests/workspace/export-policy.spec.ts` 验证。

### 面板 wire 与反馈

`typst/watch` 是流方法，`typst/readPreview` 是带精确身份的请求；host 与客户端各自物化同一份 `src/wire-schemas.ts` 的严格 codec。面板反馈不经过插件 host 的发送代理：公开的 `conversation.input.requestDraftInitialization`、`sessions.using`、`fileUpload.uploadImage` 和 `Session.prompt` 把文字或截图放进可编辑草稿，用户明确提交后才成为会话消息。

面板状态以 `defineStore` 声明为 `sidebar.right.pane.tab` 的 store seat。框架按会话持有一个实例，按标签 id 分桶保留阅读位置、历史、大纲折叠和反馈。组件通过 `useStore` 读取，通过 `actions` 首次写入时创建分桶。标签隐藏时保留状态，标签记录关闭时丢弃分桶并忽略后续异步写入，由 `tests/client/preview.interaction.spec.tsx` 验证。wire 一致性由 `tests/client/assembly.spec.ts`、`tests/unit/remote-codes.spec.ts` 验证，反馈路径由 `tests/client/feedback.interaction.spec.tsx` 验证。

## 状态、存储与一致性

### 工作区会话

`WorkspaceSession` 是一个工作区的全部状态：工具链、主文件、watch 进程、快照、高亮、settle 语义与路径收敛。它对外暴露动作（`activate`、`setMain`、`settle`、`renderPages`、`exportPdf`、`highlight`、`locateSource`）与只读 `state()`，不暴露进程细节。

会话区分**文档**与**片段**：片段是当前文档用 `#include`/`#import` 拉进去的 `.typ` 文件，由 typst 自己的依赖报告（`typst --deps`）点名，状态帧的 `fragments` 字段带着它。typst 报告的是解析后的真实路径，而 macOS 的临时目录是 `/private/var` 的符号链接；两边都 `realpath` 后再比较，否则依赖报告会被静默丢弃。片段与 realpath 归一化由 `tests/workspace/fragments.spec.ts` 验证。

### 快照、主文件与高亮

快照按 `seq` 保存在会话内，字节与元数据一起保留；新编译递增 generation，旧 generation 的迟到结果被丢弃，当前预览只由最新 generation 提交。主文件按工作区记住，切换主文件会重扫候选并重启 watch。高亮保存引用与矩形；重编译后引用仍在就更新身份，找不到就转 stale。

这些状态保存在会话内；进程重启后从磁盘上的源文件与 PDF 缓存重建。`tests/workspace/session.spec.ts` 覆盖快照提交、高亮重定位与主文件切换，`tests/workspace/isolation.spec.ts` 覆盖两个工作区互不污染。

### 设置提交

`typst` 命名空间有 4 个字段：`typstPath`、`fontPaths`、`packagePath`、`excludeDirs`。`src/config.ts` 持有 schema、`ResolvedConfig` 与 `settingsChanged`；设置页提交通过 `loader/volatile-update` 进入运行中的 fiber，串行应用，插件保持挂载。

配置优先级是 Schema 默认值 → Composition 入口配置 → 当前 profile 的 Cordis patch 覆盖层 → home patch → `--patch` 覆盖层。活跃会话在工具链或字体/包目录变化时重启 watch，在 `excludeDirs` 变化时只重扫主文件；一次性编译在下一次调用读取新值。字段与热重载的完整规则由 `configuration.md` 拥有，测试在 `tests/unit/config.spec.ts`、`tests/workspace/config.spec.ts`。

### 磁盘与缓存

插件只写两个位置：工作区内的导出 PDF，以及自己的私有缓存目录 `~/.dsh/cache/typst`（预览 PDF）。源文件、工作区里的 `.pdf` 和宿主文档预览都不被接管。缓存与导出的路径边界由 `tests/workspace/containment.spec.ts`、`tests/workspace/export-policy-root.spec.ts` 验证。

## 并发、资源与隔离

一个工作区只有一个 `typst watch`；渲染与导出走一次性编译，与 watch 并行运行，工作区仍只有一个 watch。会话启动、watch 重启与设置提交都在会话自己的串行链上执行；面板流订阅在关闭时中止 host 侧注册，状态写入随订阅结束。

PDF 渲染在浏览器侧使用 pdf.js Blob Worker，worker 源码由 esbuild `?raw` 内联；页面画布、大纲与加载任务各有自己的资源所有权。两个工作区各自持有会话与缓存快照，互不共享可变状态。并发与隔离由 `tests/workspace/isolation.spec.ts`、`tests/workspace/session-lifecycle.spec.ts`、`tests/client/pdf-runtime.spec.ts` 验证。

## 安全与信任边界

- **工作区收敛**：每个路径先解析为工作区内的绝对路径，越界以 `TYPST_PATH_OUTSIDE_WORKSPACE` 拒绝；导出只允许写工作区内。`tests/workspace/containment.spec.ts` 覆盖点段、符号链接与绝对路径逃逸。
- **会话作用域**：wire 方法只接受 `typstScope` 解析出的工作区；跨工作区 id 被拒绝。
- **进程边界**：`typst watch` 只由 `src/typst/watcher.ts` 通过 `ProcessRunner` 生成；进程身份与终止由 harness 子进程 provider 管理，watcher 只持有运行句柄。预览由工作台生成，shell 用于一次性查询。
- **网络边界**：插件自身零网络请求；Typst 下载 `@preview` 包与终端行为一致。安装、更新、`sudo` 与 shell profile 修改都需要用户明确要求，面板提交的安装请求算一次明确要求。
- **文件类型边界**：工作区里的 `.pdf` 仍由宿主内置文档预览打开，插件保留这一职责。

## 端侧契约与界面表面

host 在 `typst` wire 命名空间注册 `TypstRuntime`：`status`、`setMain`、`watch`、`readPreview`、`locateSource`、`recheck`、`restart` 与 `discover`。`watch` 是流方法，descriptor 带 `mode: 'stream'`；`readPreview` 的 `data` 是 `Uint8Array<ArrayBuffer>`，字节走附件通道。

`src/contract.ts` 持有共享视图类型，`src/wire-schemas.ts` 持有两半共享的严格 zod schema，host 与客户端各自物化 codec。插件自有域的每个稳定错误码在 wire 上各有一个 `typst/<reason>` 码，稳定域码同时放在 `details.code`；消费方按 `code` / `details.code` 判别。契约由 `tests/host/typert-manifest.spec.ts`、`tests/client/assembly.spec.ts`、`tests/unit/remote-codes.spec.ts` 验证。

浏览器只有一份 `lib/client.js`。`src/client/index.ts` 先 `await ctx.remote.$mount`，再注册面板、资源协议、工具卡片与设置页；设置页通过 optional `configForms` injection 与 `configForms.whileServed(["typst"])` 挂到 `plugins.bundle.config`，只在组件 serve 期间注册。浏览器可值导入的范围由 `scripts/client-graph-authority.mjs` 限定，`tests/unit/client-platform.spec.ts` 验证平台边界。

界面表面包括：右侧栏 `kind: 'typst'` 的预览标签（`PreviewTab.tsx`，definition 与 keyed body 同 id）、`typst` 资源协议（`provider.ts`）、工具卡片（`toolviews.tsx`）、设置页（`settings.tsx`）。大纲来自 PDF 书签，片段来自 typst 依赖报告；文件布局不参与推断。面板状态来自流，PDF 按身份拉取。

## 设计边界

- **只调用用户的编译器**：插件不带 Typst，使用用户已安装的那一个。
- **源码只读**：Agent 用自己的文件工具编辑 `.typ`，插件只读。
- **状态走流**：面板状态来自流，不来自定时器。
- **无网络**：插件自身零网络请求；Typst 的包下载与终端一致。
- **一个 watch**：同一工作区只有一个 watch 进程；渲染与导出走一次性编译，不占用 watch。
- **工作区隔离**：会话按工作区根隔离，两个工作区各自独立地预览。
- **PDF 交给宿主**：工作区里的 PDF 由宿主内置预览负责。

这些边界分别由 `tests/typst/process.spec.ts`、`tests/workspace/isolation.spec.ts`、`tests/workspace/export-policy.spec.ts`、`tests/client/provider.spec.ts` 与 `tests/host/composition.spec.ts` 验证。
