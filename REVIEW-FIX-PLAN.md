# dsh-typst 暂存变更审阅问题修复计划

日期：2026-11-24
基线：当前索引（HEAD `import dsh-typst` + 已暂存的 195 个文件，`+28599 / -4462`，工作区无未暂存改动）
目标：把上一轮审阅中**经复核属实**的问题全部修完，并为会再次漂移的事实加机械守卫；不保留兼容层、不降级、不留 TODO。
非目标：不重构 `src/workspace/session.ts` 或 `src/client/PreviewTab.tsx` 的整体结构；不改产品语义（唯一新增的可观察输出是 `typst_check` 的两个字段）。

## 0. 基线与验证环境

- 当前索引包含本轮全部改动；`git status --short` 只有 `A`/`M`（195 项），`git diff` 为空。实施前先做一次索引快照：
  ```sh
  git diff --cached > /Volumes/Work/tmp/dsh-typst-review/index-2026-11-24.patch
  ```
  该 patch 只作回滚备份，不进入仓库。
- 本机 shell 的 `node` 为 **v22.23.2**，低于 `package.json engines.node >=24.9.0`，也低于 CI pin 的 24.22.3。本计划中所有本地门禁已在 22.23.2 上跑过（5 套 tsc、59 specs / 294 tests、test-lint、style/tokens、doc-lockstep/doc-examples、client-graph、harness pin 全部通过），但**发布验收必须在 24.22.3 上重跑**。最终 `release:check` 以 24.22.3 的结果为准；本机没有该版本时，以 CI `release-branch.yml` / `upstream-health.yml` 的绿色运行作为证据。
- 已确认的机械事实（用于验收对照）：
  - `test-lint`：59 specs，最大 `tests/client/conversation.spec.ts`（207 行），`MAX_SPEC_LINES=210`，5 helpers。
  - `harness-state.mjs`：pin `0.2.2-rc.5`；sibling HEAD 不是 rc.5，产物新鲜度被跳过。
  - `doc-lockstep`：12 对 zh/en 文档；`doc-examples` 通过。
  - `client-graph-authority`：`CLIENT_SAFE_LOCAL` 已允许 `diagnostic-text`。

## 1. 核实结果总表

15 项确认属实；6 项经复核撤回（见第 2 节）。

| ID  | 问题                                                         | 核实结论 | 证据                                                                                                                                   | 优先级 | 执行序 |
| --- | ------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| F1  | Typert manifest 的 `TypstStateFrame` 声明缺两个字段          | 属实     | 字段对比：contract 19 个字段，声明缺 `diagnosticsTotal`、`diagnosticsTruncated`；`typert-manifest.spec.ts` 只查类型名，不查字段        | P1     | 1      |
| F2  | `docs/tools` 输出表与工具 schema 不一致                      | 属实     | 机器解析：`typst_check` schema 8/docs 10（多出两字段）；`typst_set_main` schema 7/docs 5（缺 `settled`、`reason`）                     | P1     | 2      |
| F3  | `AGENTS.md` 的 client allowlist 漏了 `diagnostic-text`       | 属实     | AGENTS 行只列 3 个；`client-graph-authority.mjs` 正则含 4 个                                                                           | P2     | 9      |
| F4  | `tests/README.md` 说 ratchet 上限是 `doc-examples`（197 行） | 属实     | `test-lint` 报最大 `conversation.spec.ts` 207 行；`wc -l` 为 197 / 207                                                                 | P2     | 9      |
| F5  | 发布检查清单漏两步，且 zh 第 4 步非严格                      | 属实     | `release:check` 有 10 段；清单只列 8 步，缺 `tokens:check`、`test:docs`；zh 写 `npm run harness:check`（非 `--strict`），en 写严格命令 | P2     | 10     |
| F6  | README 语言开关测试被放宽成“任意 href”                       | 属实     | 断言用 `text.includes('href="..."')`；README 实际是带 `<b>English</b>` 标签的锚点，空锚点也会通过                                      | P3     | 11     |
| F7  | store 的 `seed` 约定与 `bucket()` 抛错                       | 属实     | `seed` 幂等；`bucket()` 未 seed 抛错；`PreviewTab` 33 处 `set((a)`、`FeedbackPanel` 12 处，均由 wrapper 先 seed                        | P2     | 3      |
| F9  | `PreviewTab` 相等谓词硬编码 13 个 key                        | 属实     | `TabState` 14 字段（含 `positions`），keys 列 13 个，今天完整但无守卫                                                                  | P2     | 4      |
| F10 | `FeedbackPanel` 订阅整个 bucket                              | 属实     | `useStore(v => v.byTab[tabId])`；面板仅在草稿展开时挂载；滚动每 100ms 写 `positions`                                                   | P2     | 5      |
| F11 | watcher 与 oneshot 各拼一遍 typst flags                      | 属实     | `watcher.ts:105-108` 与 `oneshot.ts:48-58` 重复 `--root/--font-path/--package-path`                                                    | P2     | 6      |
| F12 | `/client` 入口导出无人使用的 `TYPST_TOOL_NAMES`              | 属实     | 仅 `src/client/index.ts:50` 导入、`:208` 导出；仓库内无消费者；上游 package-surface 禁止 `/client` 导出实现值                          | P2     | 7      |
| F13 | `typst_clear_highlights` 两分支返回相同                      | 属实     | 两处 `return { removed: session.clearHighlights(...) }` 仅参数不同，可收敛                                                             | P3     | 8      |
| F14 | `oneshot.ts` 用字面量 `"TYPST_TIMEOUT"`                      | 属实     | `errors.ts` 已导出同名常量；`oneshot.ts:78` 未导入                                                                                     | P3     | 8      |
| F15 | `remote.ts` 注释仍说“the plugin's one code”                  | 属实     | 已改成每错误一码，注释未更新                                                                                                           | P3     | 8      |
| F16 | `host/facts.ts` 的 `_env` 形参全调用点都传、函数未用         | 属实     | 签名 `output(command,args,_env,...)`；3 个调用点都传 `env`                                                                             | P3     | 8      |

## 2. 复核后撤回的问题（不制定修复）

| 原结论                                                  | 复核证据                                                                                                                                                                                                                                                       | 处理                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs/development-notes` 的 pin 仍是 rc.1               | 当前索引与工作区两文件均为 `0.2.2-rc.5`（第 5、29 行）；审阅开始时的 rc.1 已被并发修复并暂存                                                                                                                                                                   | 撤回；不做修改                                                                              |
| `tools/shared.ts` 的 `diagnosticText` 再导出是死代码    | `tests/unit/diagnostic-text.spec.ts:14` 从 `../../src/tools/shared.js` 导入并使用                                                                                                                                                                              | 撤回；保留                                                                                  |
| `diagnosticsTruncated` 是多余的派生状态                 | `ProblemsPanel.tsx:65` 直接消费；`tests/client/problems.interaction.spec.tsx` 和 `tests/client/helpers/frame.ts` 依赖；F2 后 `typst_check` 也会返回                                                                                                            | 撤回；保留                                                                                  |
| `package.json engines >=24.9.0` 与文档 pin 24.22.3 冲突 | README/getting-started/engines 三处一致为 24.9；`docs/development.md` 的 24.22.3 是 CI/供应链 pin；上游 dsh 自身要求 `^24.22.3`，宿主会先拦住更低版本                                                                                                          | 撤回；不改                                                                                  |
| `session.ts` 1980 行 / `PreviewTab.tsx` 895 行是问题    | 仓库无文件行数规则；两处已有清晰分区；上游也没有行数上限                                                                                                                                                                                                       | 撤回；不做重构                                                                              |
| F8：`PreviewActions` 是 `defineStore` 推断结果的重复    | `ActionsDecl<T>` 的签名是 `(draft: T, ...params: any[])`。用一个 `setN: (d, value) => …` 的最小 `defineStore` 做 `tsc --emitDeclarationOnly` 实验，推断结果是 `setN: (d: S, value: any)`。删除手写 `PreviewActions` 会让 `BakedActions` 的每个参数退化为 `any` | 撤回；保留手写契约。这不是冗余，而是 `ActionsDecl` 擦除参数类型后唯一能保住调用方类型的东西 |

## 3. 逐项修复方案

### F1 — 补齐 Typert manifest 的字段声明，并加字段级守卫

**核实**

```sh
node -e '…compare contract interface fields with typert declaration…'
# contract fields (19): … diagnostics, diagnosticsTotal, diagnosticsTruncated, …
# missing in manifest: [ 'diagnosticsTotal', 'diagnosticsTruncated' ]
```

`tests/host/typert-manifest.spec.ts` 现有三个 `it` 只检查方法名、类型名和可调用签名；字段增删不会失败。DN-1 把“手写 manifest”的正当性建立在“测试能拦住漂移”上，当前守卫覆盖不到字段。

**步骤**

1. `src/typert.ts:104` 在 `diagnostics: object[];` 之后插入：
   ```ts
   diagnosticsTotal: number;
   diagnosticsTruncated: boolean;
   ```
   顺序与 `src/contract.ts:245-246` 一致。
2. 在 `tests/host/typert-manifest.spec.ts` 新增一个 `it`：用 TypeScript AST 比较 6 个业务类型的属性名。
   - 类型与源文件映射：
     - `TypstScope` → `src/remote.ts`
     - `TypstStateFrame`、`PreviewIdentity`、`PreviewBytes`、`SourceMatch`、`DiscoveryView` → `src/contract.ts`
   - 用 `ts.createSourceFile` 读取源文件，收集 `InterfaceDeclaration.members` 的属性名。
   - 用同一套 AST 解析 manifest 里每个 `declaration` 字符串，收集属性名。
   - 断言排序后的名字集合相等；失败信息输出 `missing` / `extra`。
   - `PreviewBytes` 只比较自身成员（`data`），不解析 `extends`。
3. 跑该 spec：修复前必须失败并点名两个字段；修复后通过。

**验收**

- `npx vitest run tests/host/typert-manifest.spec.ts` 通过。
- 人为在 `contract.ts` 的 `TypstStateFrame` 增一个字段、不改 manifest，该 spec 失败。
- `npm run typecheck` 五套 tsc 通过。

**优先级**：P1；**执行序**：1；**依赖**：无。

### F2 — 让 `docs/tools` 的输出表与工具 schema 一致，并加输出表守卫

**核实**

```sh
# 解析 docs/tools.md 与 docs/tools.en.md 的 Output/输出 表，逐一对比 registered tool schema
typst_check   schema 8  docs 10  doc-only: [diagnosticsTotal, diagnosticsTruncated]
typst_set_main schema 7 docs 5  undocumented: [settled, reason]
# 其余 5 个工具一致；zh/en 表字段集合一致
```

`typst_check` 的模型文本已通过 `compileSummary(..., diagnosticsTotal)` 带出“Showing X of Y”，但 canonical 值没有这两个字段；`typst_set_main` 的代码在 settle 预算耗尽时返回 `settled:false` + `reason`，文档却写“调用后会等待一次 settle”。

**步骤**

1. `src/tools/registration.ts` 的 `typstCheckTool`：
   - schema 在 `diagnostics` 之后加：
     ```ts
     diagnosticsTotal: { type: "integer", required: true },
     diagnosticsTruncated: { type: "boolean", required: true },
     ```
   - `execute` 返回值加：
     ```ts
     diagnosticsTotal: state.diagnosticsTotal,
     diagnosticsTruncated: state.diagnosticsTruncated,
     ```
   - `render` 不改：`summary` 已含截断提示。
2. `docs/tools.md` / `docs/tools.en.md` 的 `typst_set_main` 输出表补两行：
   - `settled`（bool，必返）：新主文件是否在检查预算内完成编译。
   - `reason`（string，可选）：预算耗尽时的原因。
   - “说明 / Notes”改写为：调用会等待新主文件完成一次编译；若预算耗尽，返回 `settled: false` 与 `reason`，`summary` 同时说明未能等到编译结果。删除“因此返回时摘要已经反映…”的绝对表述。
3. 新增 `tests/host/helpers/tool-registry.ts`：用 `registerTypstTools(ctx, {} as never)` 捕获 7 个 `ToolDefinition`（与 `doc-examples.spec.ts` 的 stub 相同，抽成 host lane helper）。
4. 新增 `tests/host/doc-output.spec.ts`：
   - 对每个注册工具，在两份文档中定位 `## <tool>`，取 `### Output` / `### 输出` 之后的表格，抓取首列反引号字段名。
   - 从 `definition.output.schema` 的 `properties` 取顶层字段名。
   - 断言：zh 集合 == en 集合 == schema 集合（排序后比较）；重复字段视为失败。
   - 无 `Output` 小节的工具要求 schema 无顶层属性。
5. 把 `doc-examples.spec.ts` 的本地 `registeredTools()` 改为引用该 helper，删除重复 stub（该 spec 从 197 行降到约 175 行，仍低于 ratchet）。

**验收**

- `npx vitest run tests/host/doc-output.spec.ts`：修复前失败（`typst_check` 多 2、`typst_set_main` 少 2），修复后通过。
- `npx vitest run tests/host/doc-examples.spec.ts` 通过。
- `npm run test:docs` 通过。
- 7 个工具的输出表在 zh/en/schema 三处完全一致。

**优先级**：P1；**执行序**：2；**依赖**：无（与 F1 独立）。

### F3 — 补全 `AGENTS.md` 的 client allowlist

**核实**

- `AGENTS.md:57` 写 ``(`contract`, `constants`, `wire-schemas`)``。
- `scripts/client-graph-authority.mjs:29-30` 的 `CLIENT_SAFE_LOCAL` 已包含 `diagnostic-text`。

**步骤**

把括号内列表改为 ``(`contract`, `constants`, `diagnostic-text`, `wire-schemas`)``，并在同一句里保持“pure modules”表述不变。

**验收**

- `grep -n "allowlisted in" AGENTS.md` 的输出包含四个模块名。
- `node scripts/client-graph-authority.mjs` 通过。
- 文档没有新增与 guard 不一致的名单。

**优先级**：P2；**执行序**：9；**依赖**：无。

### F4 — 修正 `tests/README.md` 的 ratchet 说明

**核实**

- `node scripts/test-lint.mjs`：`largest tests/client/conversation.spec.ts (207 lines)`。
- `tests/README.md:28`：`The current ceiling is tests/host/doc-examples.spec.ts`（`wc -l` 为 197）。
- `MAX_SPEC_LINES = 210`。

**步骤**

把该段改为不写死文件名：

> A spec that grows past the ratchet (`MAX_SPEC_LINES` in `scripts/test-lint.mjs`) is split along its own seams, and the ratchet is lowered in the same commit. `npm run lint:test` prints the largest spec; that one is the next split target.

保留“ratchet 只降不升”的第二段。

**验收**

- 文本不再出现具体 spec 文件名。
- `npm run lint:test` 仍然通过，输出的 largest 与说明一致。
- `npm run format:check` 通过。

**优先级**：P2；**执行序**：9；**依赖**：无。

### F5 — 修正发布检查清单，并加清单与 `release:check` 的一致性守卫

**核实**

```text
release:check order: format:check -> [node scripts/harness-state.mjs --strict] -> lint:test
                     -> tokens:check -> style:check -> typecheck -> test:docs
                     -> test:coverage -> build -> verify:pack
checklist mentions: format:check, lint:test, style:check, harness:check,
                    typecheck, test:coverage, build, verify:pack
missing from checklist: [tokens:check, test:docs]
```

另：zh 第 4 步写 `npm run harness:check`（非严格），en 写 `node scripts/harness-state.mjs --strict`。

**步骤**

1. 把两份文档的“发布检查清单 / Release checklist”改成与 `release:check` 完全一致的 10 步：
   1. `npm run format:check`
   2. `node scripts/harness-state.mjs --strict`
   3. `npm run lint:test`
   4. `npm run tokens:check`
   5. `npm run style:check`
   6. `npm run typecheck`
   7. `npm run test:docs`
   8. `npm run test:coverage`
   9. `npm run build`
   10. `npm run verify:pack`
       每步说明保持一句。zh/en 的步骤顺序与命令逐字一致。
2. 新增 `tests/host/doc-release.spec.ts`：
   - 读取 `package.json.scripts["release:check"]`，按 `&&` 切分并 `trim()`，得到 10 个命令字符串。
   - 在两份文档中定位 `## 发布检查清单` / `## Release checklist`，截到下一个 `##`。
   - 只取 `^\d+\.` 行，抓取每行第一个反引号内容。
   - 断言两个数组与 `release:check` 的 10 段逐项相等。
   - 额外断言 `prepublishOnly` 等于 `npm run release:check`（已有事实，顺手锁住）。

**验收**

- `npx vitest run tests/host/doc-release.spec.ts`：修复前失败（缺 2 步 + zh 第 4 步不一致），修复后通过。
- `npm run test:docs` 通过。
- 改 `release:check` 的任一步而不改文档，该 spec 失败。

**优先级**：P2；**执行序**：10；**依赖**：无。

### F6 — 收紧 README 语言开关测试

**核实**

- 当前 staged 断言：`text.includes('](' + href + ')') || text.includes('href="' + href + '"')`；空锚点 `<a href="README.en.md"></a>` 也会通过。
- 实际 README：
  - `README.md:19`：`<a href="README.en.md"><b>English</b></a> · <b>中文</b>`
  - `README.en.md:19`：`<b>English</b> · <a href="README.md"><b>中文</b></a>`

**步骤**

在 `tests/host/doc-lockstep.spec.ts` 的 “gives both READMEs a language switch” 中，把 `hasSwitch` 改为：

```ts
function hasSwitch(text: string, href: string, label: string): boolean {
  const anchor = new RegExp(
    `<a\\s+href="${href}"[^>]*>([\\s\\S]*?)</a>`,
    "i",
  ).exec(text);
  const anchorLabel = anchor?.[1].replace(/<[^>]+>/g, "").trim();
  if (anchorLabel !== undefined && anchorLabel.length > 0)
    return anchorLabel === label;
  const markdown = new RegExp(`\\[([^\\]]+)\\]\\(${href}\\)`).exec(text);
  return markdown?.[1].trim() === label;
}
```

断言改为：

```ts
expect(
  hasSwitch(
    readFileSync(join(root, "README.md"), "utf8"),
    "README.en.md",
    "English",
  ),
).toBe(true);
expect(
  hasSwitch(
    readFileSync(join(root, "README.en.md"), "utf8"),
    "README.md",
    "中文",
  ),
).toBe(true);
```

同一 `it` 里加一条自检，证明空标签不通过：

```ts
expect(
  hasSwitch('<a href="README.en.md"></a>', "README.en.md", "English"),
).toBe(false);
```

**验收**

- `npx vitest run tests/host/doc-lockstep.spec.ts` 通过。
- 把 README 开关改成空锚点或错误标签，该 spec 失败。
- `npm run test:docs` 通过。

**优先级**：P3；**执行序**：11；**依赖**：无。

### F7 — 删除 `seed` 约定：`bucket()` 惰性建桶，去掉 45 处写前 seed

**核实**

- `src/client/view-state.ts:133-137`：`bucket()` 找不到就抛 `dsh-typst: no preview state for tab`。
- `seed` 是幂等写（`if (d.byTab[tabId] === undefined)`）。
- `PreviewTab.tsx:144`（mount effect）与 `:155`（`set` wrapper）各 seed 一次；`FeedbackPanel.tsx:67` 每写一次 seed。
- `grep -c "set((a)"`：`PreviewTab.tsx` 33，`FeedbackPanel.tsx` 12。
- 因为每次写前都 seed，“写后抛错”永远不会触发；`forget` 之后的一次写也会被 seed 重建桶，所以抛错没有保护任何真实路径。

**步骤**

1. `view-state.ts`：

   ```ts
   function bucket(state: PreviewState, tabId: TabId): TabState {
     return (state.byTab[tabId] ??= initialTabState());
   }
   ```

   删除 `seed` action 及手写 `PreviewActions` 里的 `seed` 签名。

2. `PreviewTab.tsx`：
   - 删除 mount effect 里的 `actions.seed(tabId)`，effect 只保留 abort → `forget`。
   - 删除 `set` 回调；33 处 `set((a) => a.xxx(...))` 改为直接 `actions.xxx(...)`。多行回调保留原有参数，去掉 `(a)` 层。
3. `FeedbackPanel.tsx`：
   - 删除 `set` 回调；12 处同样改为直接 `actions.xxx(...)`。
4. 测试：
   - `tests/client/view-state.spec.ts`：删除 `actions.seed(...)`；第一个用例改为“首个写动作创建桶，两个 tab 隔离”；第三个用例的 action key 列表删除 `"seed"`。
   - `tests/client/feedback.interaction.spec.tsx`：删除 `instance.actions.seed(TAB)`。
   - 新增两个用例：
     - “a write creates the tab bucket”：未 seed 直接 `setMain`，快照出现该桶。
     - “forget drops the bucket and a later write starts from initial state”：`setFeedback` → `forget` → 再 `setMain`，断言桶存在且 `main` 为新值、`feedback` 为 null（不会被旧状态污染）。

**验收**

- `grep -R "actions.seed" src tests` 无结果；`grep -R "set((a)" src/client` 无结果。
- `npx vitest run tests/client` 全部通过。
- `npm run typecheck` 的 node/test/client/client-test/scripts 五套通过。

**优先级**：P2；**执行序**：3；**依赖**：无。

### F9 — 用自动比较替代硬编码 key 列表

**核实**

- `TabState` 14 个字段：`main, positions, histories, auxiliary, auxiliaryHeight, feedback, feedbackExpanded, sending, feedbackError, progress, notice, requests, seenRequest, outlineCollapsed`。
- `PreviewTab.tsx:101-118` 的 `keys` 列表 13 个（排除 `positions`），今天完整；新增字段不会自动进入比较，面板会静默保留旧值。
- `positions[main]` 使用当前 `frame.main`，不是 `a.main`；当前因为 `main` 本身在 keys 里，切换主文件仍会重渲染，不是 bug。

**步骤**

1. 在 `view-state.ts` 导出纯函数：

   ```ts
   export function sameTabView(
     a: TabState | undefined,
     b: TabState | undefined,
     main: string,
   ): boolean {
     if (a === b) return true;
     if (a === undefined || b === undefined) return false;
     const aKeys = Object.keys(a) as (keyof TabState)[];
     const bKeys = Object.keys(b) as (keyof TabState)[];
     if (aKeys.length !== bKeys.length) return false;
     for (const key of aKeys) {
       if (key === "positions") continue;
       if (a[key] !== b[key]) return false;
     }
     return a.positions[main] === b.positions[main];
   }
   ```

2. `PreviewTab.tsx` 删除 keys 列表，改为：

   ```ts
   useStore(
     (value) => value.byTab[tabId],
     (a, b) => sameTabView(a, b, main),
   );
   ```

3. `tests/client/view-state.spec.ts` 新增：
   - 相同字段（深拷贝但同引用值）→ true。
   - `{...base, futureField: 1} as TabState` → false，证明比较不是固定 key 列表。
   - 改 `main` / `feedback` / `sending` 任一非 positions 字段 → false。
   - 改当前 `main` 的 position → false；改另一个 main 的 position → true。
   - 一个 tab 为 `undefined` → false。

**验收**

- `npx vitest run tests/client/view-state.spec.ts` 通过。
- 人为在 `TabState` 加字段但不改 selector，`sameTabView` 仍会比较它（用临时字段验证后删除）。
- `npm run typecheck` 通过。

**优先级**：P2；**执行序**：4；**依赖**：F7（bucket 语义已定）。

### F10 — `FeedbackPanel` 改用三个窄 selector

**核实**

- `FeedbackPanel.tsx:61`：`useStore((value) => value.byTab[tabId]) ?? initialTabState()`，订阅整桶。
- 面板只在 `view.feedback && view.feedbackExpanded` 时挂载（`PreviewTab.tsx:689-690`）。
- `Reader.tsx:435-444` 在滚动时每 100ms 写一次 `positions`，immer 会替换 tab 桶，整桶 selector 触发重渲染。
- 面板实际只读 `sending`、`feedbackError`、`progress` 三个字段（第 62 行解构；其余是 props 的 `draft`/`frame`）。

**步骤**

1. 把三行订阅改为：

   ```ts
   const busy = useStore((value) => value.byTab[tabId]?.sending ?? false);
   const error = useStore((value) => value.byTab[tabId]?.feedbackError ?? null);
   const progress = useStore((value) => value.byTab[tabId]?.progress ?? "");
   ```

2. 删除 `TabState`、`initialTabState` 的导入；删除 `const state …` 与解构。
3. 不改 `set`/action 调用（F7 已处理）。

**验收**

- `npx vitest run tests/client/feedback.interaction.spec.tsx` 通过。
- 在 `tests/client/view-state.spec.ts` 加一个用例：先创建一个有反馈的桶，调用 `setPosition` 写当前 main 的位置；断言 `sending`、`feedbackError`、`progress` 三个值不变，而桶对象引用变化（证明整桶订阅会重渲染、窄 selector 不会）。
- `npm run typecheck` 通过。

**优先级**：P2；**执行序**：5；**依赖**：F7。

### F11 — 抽出 typst 参数组装，watcher 与 oneshot 共用

**核实**

- `watcher.ts:105-108`：`rootArgs/fontArgs/packageArgs`。
- `oneshot.ts:48-58`：同样三组参数，顺序不同（oneshot 在 `extra` 之后）。
- 两处都直接写 `"--root"`、`"--font-path"`、`"--package-path"`。

**步骤**

1. 新增 `src/typst/flags.ts`：

   ```ts
   export interface TypstFlagOptions {
     root?: string;
     fontPaths?: string[];
     packagePath?: string;
   }

   export function typstFlags(options: TypstFlagOptions): string[] {
     return [
       ...(options.root ? ["--root", options.root] : []),
       ...(options.fontPaths ?? []).flatMap((dir) => ["--font-path", dir]),
       ...(options.packagePath ? ["--package-path", options.packagePath] : []),
     ];
   }
   ```

2. `watcher.ts`：删除三个 `*Args`，`args()` 改为 `...typstFlags(this.options)`；保持 `watch`、`main`、`pdfPath`、`...deps`、`...flags` 的顺序。
3. `oneshot.ts`：删除三个 `*Args`，argv 改为 `[typst, "compile", main, output, ...extra, ...typstFlags(options)]`。
4. 新增 `tests/typst/flags.spec.ts`：断言空选项为空数组；三个选项齐全；多 font path 逐个展开；顺序为 root → font → package。

**验收**

- `npx vitest run tests/typst/flags.spec.ts` 通过。
- `grep -R '"--root"\|"--font-path"\|"--package-path"' src` 只命中 `src/typst/flags.ts`。
- `npx vitest run tests/typst` 全部通过；`npm run typecheck` 通过。

**优先级**：P2；**执行序**：6；**依赖**：无。

### F12 — 删除 `/client` 入口的 `TYPST_TOOL_NAMES` 导出

**核实**

- `src/client/index.ts:50` 从 `../constants.js` 导入，`:208` 再导出；文件内无其他使用。
- 仓库内无任何消费者（`tests/skills/typst.spec.ts` 从 `src/constants.ts` 直接导入）。
- 上游 `docs/defensive-patterns/package-surface.md` 把“`/client` 入口导出实现值”列为应判失败的条件。

**步骤**

1. 删除 `src/client/index.ts:50` 的 `TYPST_TOOL_NAMES` 导入项。
2. 删除 `:208` 的 `export { TYPST_TOOL_NAMES };`。
3. 在 `tests/client/assembly.spec.ts` 新增：

   ```ts
   import * as clientEntry from "../../src/client/index.js";
   it("exports only the client plugin entry points", () => {
     expect(Object.keys(clientEntry).sort()).toEqual(["apply", "inject"]);
   });
   ```

   该用例修复前失败（多一个 key），修复后通过。

**验收**

- `npx vitest run tests/client/assembly.spec.ts` 通过。
- `npm run build:client` 通过。
- `grep -R "TYPST_TOOL_NAMES" src/client` 无结果；`src/constants.ts` 的导出保留给测试与 skills。

**优先级**：P2；**执行序**：7；**依赖**：无。

### F13 — 收敛 `typst_clear_highlights` 的重复返回

**核实**：`src/tools/registration.ts:753-755` 两个分支的返回只差 `ids` / `undefined`，而 `ids` 在 `!== undefined` 分支内已通过校验。

**步骤**

```ts
async execute(args, exec) {
  const session = await sessionOfExec(ctx, exec, service);
  const ids = args.ids;
  if (ids !== undefined) {
    // …existing validation unchanged…
  }
  return { removed: session.clearHighlights(ids) };
}
```

**验收**

- `npx vitest run tests/workspace/session.spec.ts` 通过（该 spec 已有 `clearHighlights` 用例）。
- `npm run typecheck` 通过。

**优先级**：P3；**执行序**：8；**依赖**：无。

### F14 — `oneshot.ts` 使用 `TYPST_TIMEOUT` 常量

**核实**：`src/typst/oneshot.ts:78` 传字符串 `"TYPST_TIMEOUT"`；`src/errors.ts:29` 已导出同名常量，文件已从 `../errors.js` 导入 `TypstError`。

**步骤**

1. 改为 `import { TYPST_TIMEOUT, TypstError } from "../errors.js";`
2. `throw new TypstError(…, TYPST_TIMEOUT)`。

**验收**

- `npm run typecheck` 通过。
- `grep -n '"TYPST_TIMEOUT"' src/typst/oneshot.ts` 无结果。
- `npx vitest run tests/typst` 通过。

**优先级**：P3；**执行序**：8；**依赖**：无。

### F15 — 更新 `remote.ts` 的过期注释

**核实**：`src/remote.ts:147` 仍写 “the plugin's one code”，而 `rethrowRemote` 已经按 `TYPST_REMOTE_CODES` 每错误一码。

**步骤**

把注释改为：

```ts
// A domain failure raised inside the stream must cross the wire as its
// own `typst/<reason>` code, not as the Gateway's generic internal error.
```

**验收**

- `grep -n "one code" src/remote.ts` 无结果。
- `npm run typecheck` 通过（注释改动不影响）。

**优先级**：P3；**执行序**：8；**依赖**：无。

### F16 — 删除 `host/facts.ts` 的未使用 `_env` 形参

**核实**：`src/host/facts.ts:20` 定义 `_env`；函数体只用 `command`/`args`/`timeout`；3 个调用点（42、70、162 行）都把 `env` 传进来。

**步骤**

1. 签名改为 `function output(command: string, args: string[], timeout = 5_000)`。
2. 三个调用点删掉第三个 `env` 实参；`osName`/`archName`/`packageManagers` 自身的 `env` 形参保留（它们还用于 platform 分支）。
3. 检查 `output` 内部没有遗漏 `env` 使用。

**验收**

- `grep -n "_env" src/host/facts.ts` 无结果。
- `npm run typecheck` 通过。
- `npx vitest run tests/host` 通过（无 facts 专项 spec，类型与 host 组合 spec 覆盖）。

**优先级**：P3；**执行序**：8；**依赖**：无。

## 4. 执行顺序

| 批次 | 内容                                | 命令（最小验证）                                                                                   |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0    | 索引快照；确认 `git diff` 为空      | `git diff --cached > /Volumes/Work/tmp/dsh-typst-review/index-2026-11-24.patch`；`git diff --stat` |
| 1    | F1 契约声明 + 字段守卫              | `npx vitest run tests/host/typert-manifest.spec.ts`                                                |
| 2    | F2 工具输出/文档 + 输出表守卫       | `npx vitest run tests/host/doc-output.spec.ts tests/host/doc-examples.spec.ts`                     |
| 3    | F7 惰性 bucket、删 seed/wrapper     | `npx vitest run tests/client`；`npx tsc -p tsconfig.client-test.json --noEmit`                     |
| 4    | F9 `sameTabView`                    | `npx vitest run tests/client/view-state.spec.ts`                                                   |
| 5    | F10 FeedbackPanel 窄 selector       | `npx vitest run tests/client/feedback.interaction.spec.tsx`                                        |
| 6    | F11 typst flags 抽取                | `npx vitest run tests/typst`                                                                       |
| 7    | F12 client 入口导出 + assembly 守卫 | `npx vitest run tests/client/assembly.spec.ts`；`npm run build:client`                             |
| 8    | F13–F16 小修                        | `npx vitest run tests/workspace/session.spec.ts tests/typst tests/host`                            |
| 9    | F3 / F4 文档修正                    | `node scripts/client-graph-authority.mjs`；`npm run lint:test`；`npm run format:check`             |
| 10   | F5 发布清单 + 守卫                  | `npx vitest run tests/host/doc-release.spec.ts`                                                    |
| 11   | F6 README 开关测试收紧              | `npx vitest run tests/host/doc-lockstep.spec.ts`                                                   |
| 12   | 全量门禁                            | 见第 5 节                                                                                          |

批次 3–5 都改 `view-state.ts` / `PreviewTab.tsx` / `FeedbackPanel.tsx`，必须按顺序执行，不要并行编辑同一文件。批次 1–2 与 3–11 可并行，但最终统一跑全量。

## 5. 全量验收（Definition of Done）

在 Node **24.22.3** 上依次执行，全部通过：

```sh
npm run format:check
npm run lint:test
npm run tokens:check
npm run style:check
npm run typecheck
npm run test:docs
npm run test:coverage
npm run build
npm run verify:pack
node scripts/harness-state.mjs --strict
node scripts/client-graph-authority.mjs
npm run release:check
npm run smoke:discovery
npm run smoke:web-composition   # 有浏览器时
```

附加验收：

- `npx vitest run`：62 个 spec 全部通过；test-lint 最大 spec 仍为 `conversation.spec.ts` 207 行，helper 数从 5 变 6（新增 host 工具注册 helper），没有越过任何 ratchet。
- `git diff --check` 无空白错误。
- `grep -R "actions.seed" src tests` 无结果；`grep -R "set((a)" src/client` 无结果。
- `grep -R '"TYPST_TIMEOUT"' src/typst/oneshot.ts` 无结果；`grep -n "one code" src/remote.ts` 无结果。
- 7 个工具的输出表在 zh/en/schema 三处一致；`TypstStateFrame` 的 19 个字段全部出现在 manifest 声明中。
- 发布检查清单的 10 个命令与 `release:check` 逐项一致。
- 最终 `git diff` 只含本计划列出的文件；没有新增 TODO/FIXME，没有兼容别名。

## 6. 风险与回滚

- F2 给 `typst_check` 增加两个必返字段：schema 是 `additionalProperties: false`，已同步增加；客户端没有该工具输出的消费者，风险低。
- F7 触碰 45 个调用点：全部是机械替换 `set((a) => a.x(...))` → `actions.x(...)`；用 `tsc` 和 client lane 兜底。行为差异只有“未写过的 tab 在首次写时建桶”，与旧 `seed` 等价。
- F9 的自适应比较会读取 `Object.keys`：`TabState` 是普通对象，无原型污染风险；`positions` 仍按当前 main 比较，保持滚动不重渲染。
- F10 的窄 selector 只影响反馈面板的订阅面，不改变 UI 行为。
- 每一批都是独立可回滚的编辑；回滚使用第 0 节的 index patch 或按批次 `git restore` 对应文件（不要动用户已暂存的其他改动）。
- 若 24.22.3 环境不可用，`release:check` 的结论不能由 22.23.2 替代；以 CI 的 tag/upstream-health 运行结果为准，并在交付说明中明确标注未在本地 24.22.3 上执行。

## 7. 完成定义

所有已确认项（F1–F7、F9–F16）的“验收”项逐一通过，第 5 节全量门禁在 24.22.3 上绿，且没有撤回项被重新引入。完成后本计划文件可删除或移出仓库；它不属于产品文档，不进入 `docs/**` 的 zh/en 对。
