<p align="right"><a href="development-notes.en.md"><b>English</b></a></p>

# 开发留意

当前宿主契约复核：2026-11-24，pin `0.2.2-rc.5`。本文只保留上游补丁；每条已对照当前实现与测试复核。

## 定位

本文只记录一种情况：我们使用了上游（`deepseek-harness` 或其依赖）的能力，但上游当前的不完善、缺陷或缺失迫使我们在本仓库打补丁，并等待上游提供更好的替换。上游破坏性变更适配后直接归档；内部架构约束、测试与发布门禁分别由 `architecture.md`、`tests/README.md` 和 `development.md` 拥有，本文只做指路。

## 记录要求

- **上游**：能力来自哪个宿主包，当前 pin 或版本。
- **上游特性**：我们使用了什么能力。
- **上游缺陷**：为什么不能按上游公开契约直接使用；写现象和影响。
- **本地补丁**：本仓库怎么绕行，涉及哪些符号。
- **为什么是妥协**：补丁依赖的假设、代价、不能做的事。
- **上游期望**：上游提供什么能力后可以删除补丁；写成可判定的条件。
- **复核触发**：何时重新检查，检查哪个上游文件、符号或命令。
- **验证**：当前补丁如何被测试证明。
- **后续处理**：上游满足期望后的删除或迁移步骤。

## 升级复核

每次 harness pin 变更都逐条核对“上游期望”：已提供就同一次改动完成迁移并删除本条；没有提供就只更新 pin 与复核日期。已适配的破坏性变更不新增条目。

## DN-1：手写 Typert manifest

- **上游**：`@deepseek-ai/dsh-typert-registry` 与上游 Typert 生成器（pin `0.2.2-rc.5`）。
- **上游特性**：Typert 为插件生成 host manifest，声明 wire 服务、方法签名与业务类型，Loader 据此装载 Remote。
- **上游缺陷**：上游公开契约要求从 monorepo 工作区根运行生成器，同目录须同时存在 `tsconfig.host.json` 与 `packages/`；本仓库是独立 checkout，两项都缺，生成产物无法作为发布入口。
- **本地补丁**：`src/typert.ts` 手写 `TYPERT_MANIFEST`，由 `src/service.ts` 调用 `ctx.typert.register()` 注册，`./typert` 包导出保持关闭。方法清单来自 `src/status-codec.ts` 的 `TYPST_INVOCATIONS_HOST`，两半共享的 wire 形状仍由 `src/wire-schemas.ts` 持有。
- **为什么是妥协**：签名由人手维护，生成器提供的静态一致性检查改由测试接手；方法或业务类型漂移靠测试拦截。注册路径依赖 `ctx.typert.register()` 的公开契约，生成产物的装载路径暂不使用。
- **上游期望**：生成器支持独立包布局，或导出一个可从单包 `tsconfig` 生成 manifest 的公开构造器；任一即可生成本文件并删除手写实现。
- **复核触发**：每次 `npm run harness:pin` 后；查看上游 Typert 生成器的帮助与 README 是否出现 standalone/单包模式，并确认 `ctx.typert.register()` 仍是手写 schema 的公开路径。
- **验证**：`tests/host/typert-manifest.spec.ts` 断言 manifest 的方法逐项等于 `TYPST_INVOCATIONS`，每个引用的业务类型都有声明，每个方法都有可调用签名。
- **后续处理**：切换到生成产物，删除 `src/typert.ts` 与 `TYPERT_MANIFEST`；同步 `architecture.md` 的端侧契约与根 `AGENTS.md` 的 harness 约束，并删除本条。
