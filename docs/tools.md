<p align="right"><a href="tools.en.md"><b>English</b></a></p>

# 工具参考

dsh-typst 向 Agent 注册 7 个工具，全部是读操作：它们读取工作台状态、编译文档、渲染页面、放置高亮，并把 PDF 写进工作区。工具从不编辑 `.typ` 文件。

每个工具有两份输出：**canonical JSON** 是无损的事实（可选事实直接省略），**模型侧 render** 是一段给人看的文本。工具卡另有自己的展示数据。

工具的返回值一律是「已经发生的事实」：没有待确认的写入，没有需要回滚的部分成功。

---

## typst_status

报告工作台现状：正在使用的 Typst 安装（版本与路径）、主 `.typ` 文件、工作区里其余的 `.typ` 文件，以及最近一次编译的结果。处理 Typst 文档时先调用它。

### 参数

无。

### 输出

| 字段         | 类型     | 说明                                                                                                                                    |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `toolchain`  | object   | 工具链状态：`state` 为 `ready`/`missing`/`too_old`/`error`，就绪时含 `version`、`path` 与 `source`（`setting`/`path`/`common`/`shell`） |
| `main`       | string   | 主 `.typ` 文件（工作区相对路径）；未选定时不出现                                                                                        |
| `candidates` | string[] | 工作区里的 `.typ` 文件                                                                                                                  |
| `phase`      | string   | 最近一次编译阶段：`idle`/`starting`/`compiling`/`ok`/`warnings`/`error`/`crashed`                                                       |
| `errors`     | int      | 错误数                                                                                                                                  |
| `warnings`   | int      | 警告数                                                                                                                                  |
| `pages`      | int      | 预览页数；尚无成功编译时不出现                                                                                                          |
| `summary`    | string   | 一行编译摘要                                                                                                                            |

### 说明

`toolchain.state` 为 `missing` 时，插件在本机找不到 typst；为 `too_old` 时版本低于 0.12.0。两种情况下后面的工具都不能用，插件会给出安装指引。

### 示例

```text
typst_status()
```

---

## typst_set_main

选定主 `.typ` 文件，也就是你会传给 `typst compile` 的那一个。预览会以它重启，选择按工作区记忆。

### 参数

| 参数   | 类型   | 默认值 | 说明                             |
| ------ | ------ | ------ | -------------------------------- |
| `path` | string | —      | 工作区相对路径，须以 `.typ` 结尾 |

### 输出

| 字段       | 类型   | 说明               |
| ---------- | ------ | ------------------ |
| `main`     | string | 选定的主文件       |
| `phase`    | string | 编译阶段           |
| `errors`   | int    | 错误数             |
| `warnings` | int    | 警告数             |
| `summary`  | string | 编译摘要与问题清单 |

### 说明

路径必须落在工作区内，越界以 `TYPST_PATH_OUTSIDE_WORKSPACE` 拒绝。调用后会等待一次 settle，因此返回时摘要已经反映了新主文件的编译结果。

### 示例

```text
typst_set_main(path="paper.typ")
```

---

## typst_check

用用户的 Typst 编译文档，报告错误与警告，含 `file:line:column`、源码行与 Typst 的 `hint:`。

它等待磁盘上已有的改动全部编译完成才返回，所以编辑之后立刻调用它。

### 参数

| 参数        | 类型 | 默认值 | 说明                                      |
| ----------- | ---- | ------ | ----------------------------------------- |
| `timeoutMs` | int  | 60000  | 等待编译的毫秒数，钳制在 1000–600000 之间 |

### 输出

| 字段          | 类型     | 说明                                          |
| ------------- | -------- | --------------------------------------------- |
| `main`        | string   | 主文件；未选定时不出现                        |
| `phase`       | string   | 编译阶段                                      |
| `errors`      | int      | 错误数                                        |
| `warnings`    | int      | 警告数                                        |
| `pages`       | int      | 预览页数；尚无成功编译时不出现                |
| `durationMs`  | int      | 编译耗时                                      |
| `summary`     | string   | 一行编译摘要                                  |
| `diagnostics` | object[] | 完整的诊断视图：位置、源码行、`hint:`、调用链 |

### 说明

诊断列表按 `LIMITS.diagnostics`（30 条）截断，超出部分不返回。`trace` 字段是 Typst 的调用链（`from …`），指出错误真正来自哪个文件。

### 示例

```text
typst_check()
```

---

## typst_render_pages

把文档的若干页渲染成 PNG 图片，供 Agent 看排版：溢出的行、图片与表格的位置、分页、标题页、间距。

编译错误抓不到排版问题：遇到这类问题就渲染受影响的页并看图。

### 参数

| 参数    | 类型   | 默认值 | 说明                                         |
| ------- | ------ | ------ | -------------------------------------------- |
| `pages` | string | —      | 1 起的页码选择，如 `"1"`、`"2-3"`、`"1,5"`   |
| `ppi`   | int    | 110    | 每英寸像素，钳制在 36–300 之间；看细节时调高 |

### 输出

| 字段     | 类型     | 说明                                     |
| -------- | -------- | ---------------------------------------- |
| `pages`  | int[]    | 实际渲染的页码                           |
| `total`  | int      | 文档总页数                               |
| `images` | object[] | 每项含 `page` 与 `dataUrl`（base64 PNG） |

### 说明

每次调用至多 4 页（`LIMITS.renderPages`）。文档编译不通过时以 `TYPST_COMPILE_FAILED` 失败，并在错误里附上诊断——此时没有页面可渲染。

`images` 的内容同时进入工具卡的数据通道；超过 6 MB 时工具卡不携带图片，只显示页码。

### 示例

```text
typst_render_pages(pages="2-3", ppi=150)
```

---

## typst_show

在实时预览里给用户指出某个位置：请求查看某一页，或高亮渲染出来的文字。面板先通知，用户点击才导航。

三种目标恰好给一种：`page`；`quote`（按渲染后的原样抄写，忽略标记语言）；或 `file` 加 `line`（可选 `endLine`），高亮这些源码行产出的内容。

加一句 `comment` 说明为什么。高亮会随文档变化跟随文字，本次会话内有效。

### 参数

| 参数      | 类型   | 默认值 | 说明                     |
| --------- | ------ | ------ | ------------------------ |
| `page`    | int    | —      | 1 起的目标页码           |
| `quote`   | string | —      | 要高亮的渲染文字         |
| `file`    | string | —      | 工作区相对的 `.typ` 文件 |
| `line`    | int    | —      | 该文件的 1 起行号        |
| `endLine` | int    | `line` | 行区间的末行             |
| `comment` | string | —      | 随高亮显示的备注         |

### 输出

| 字段          | 类型   | 说明                               |
| ------------- | ------ | ---------------------------------- |
| `highlighted` | bool   | 是否创建了高亮（给页码时为 false） |
| `exact`       | bool   | 引文是否精确匹配                   |
| `id`          | string | 高亮 id                            |
| `page`        | int    | 请求查看的 1 起页码                |

### 说明

高亮通过引文在渲染文本中定位，所以对散文可靠，对数学、编号、目录、参考文献与函数生成的文本是近似的。定位不到时以 `TYPST_QUOTE_NOT_FOUND` 失败。

### 示例

```text
typst_show(quote="the experimental setup", comment="这段是实验设置")
```

---

## typst_clear_highlights

移除预览里的高亮：全部移除，或按 id 移除指定的几个。

### 参数

| 参数  | 类型     | 默认值 | 说明                            |
| ----- | -------- | ------ | ------------------------------- |
| `ids` | string[] | —      | 要移除的高亮 id；省略则全部移除 |

### 输出

| 字段      | 类型 | 说明           |
| --------- | ---- | -------------- |
| `removed` | int  | 移除的高亮数量 |

### 示例

```text
typst_clear_highlights()
```

---

## typst_export_pdf

用用户的 Typst 编译文档，把 PDF 写进工作区。可选 PDF 标准与页选择。

预览自己的 PDF 不在工作区里；这个工具才是产出物的方式。

### 参数

| 参数          | 类型   | 默认值 | 说明                                                            |
| ------------- | ------ | ------ | --------------------------------------------------------------- |
| `path`        | string | —      | 工作区相对路径，以 `.pdf` 结尾                                  |
| `pdfStandard` | string | —      | PDF 标准：`a-1b`、`a-2b`、`a-2u`、`a-3b`、`a-3u`、`a-4`、`a-4f` |
| `pages`       | string | —      | 1 起的页选择，如 `"1-3"`                                        |

### 输出

| 字段      | 类型   | 说明                 |
| --------- | ------ | -------------------- |
| `path`    | string | 写出的工作区相对路径 |
| `bytes`   | int    | PDF 字节数           |
| `pages`   | int    | 导出 PDF 的页数      |
| `summary` | string | 一行摘要             |

### 说明

路径必须落在工作区内，越界以 `TYPST_PATH_OUTSIDE_WORKSPACE` 拒绝。编译不通过时以 `TYPST_COMPILE_FAILED` 失败，并附上诊断。

### 示例

```text
typst_export_pdf(path="paper.pdf", pdfStandard="a-2b")
```

---

## 面板 wire 方法

面板不通过 Agent 工具读状态，而是走 `typst` wire 命名空间的 host 服务（服务键 `typstStatus`）。每个方法都带 `typstScope` 参数，服务端据此把 SessionId 解析为工作区根。

| 方法           | 返回                                | 说明                                                             |
| -------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `status`       | `TypstStateFrame`                   | 当前状态帧，同时激活会话                                         |
| `setMain`      | `{ main }`                          | 选定主文件                                                       |
| `watch`        | `AsyncIterable<TypstStateFrame>`    | 状态流：首帧是当前状态，之后每帧一次变化                         |
| `readPreview`  | `{ generation, seq, sha256, data }` | 精确读取请求身份的保留快照（`data` 走附件通道）                  |
| `locateSource` | `{ matches }`                       | 渲染文字到源码的候选匹配                                         |
| `recheck`      | `TypstStateFrame`                   | 重新定位 typst 后返回新状态帧                                    |
| `restart`      | `TypstStateFrame`                   | 停 watch、换主文件、重扫、重启后返回新帧                         |
| `discover`     | `{}`                                | 完整索引工作区，可显式包含默认排除目录；进度与错误在状态流中显示 |

`readPreview` 必须传入 `{ generation, seq, sha256 }`，过期身份返回 `TYPST_NOT_FOUND`。文字追加、图片上传与请求提交通过宿主公开客户端 API 完成，不再由插件 wire 代理。

`watch` 是流方法：manifest 的 signature 前缀 `@Remote({ mode: 'stream' })`，descriptor 带 `mode: 'stream'`。

## 错误码

插件自有域的错误在 wire 上只有一个码 `typst/domain`，稳定域码放在 `details.code`；消费方按 `details.code` 判别，而不是按 `instanceof`。

| 错误码                         | 说明                                               |
| ------------------------------ | -------------------------------------------------- |
| `TYPST_MISSING`                | 本机查找范围内没有 typst                           |
| `TYPST_TOO_OLD`                | 已安装的 typst 低于支持的最低版本（0.12.0）        |
| `TYPST_UNUSABLE`               | typst 存在但跑不起来（`--version` 失败、损坏安装） |
| `TYPST_NO_MAIN`                | 未选定主 `.typ` 文件，也无法自动选出               |
| `TYPST_NO_PREVIEW`             | 请求的预览不存在（还没有一次成功编译）             |
| `TYPST_NOT_FOUND`              | 请求的快照、页码或高亮已不存在                     |
| `TYPST_INVALID_ARGUMENT`       | 参数违反 schema 表达不了的领域约束                 |
| `TYPST_PATH_OUTSIDE_WORKSPACE` | 路径解析后落在工作区之外                           |
| `TYPST_TIMEOUT`                | 编译未在调用方的预算内 settle                      |
| `TYPST_WATCH_FAILED`           | `typst watch` 退出或无法启动                       |
| `TYPST_QUOTE_NOT_FOUND`        | 引文在渲染预览中找不到                             |
| `TYPST_NOT_COMPOSED`           | Typst 工作台服务未组合                             |
| `TYPST_UNEXPECTED`             | 未预期的情况，消息里带着领域事实                   |

`typst_render_pages` 与 `typst_export_pdf` 在编译不通过时抛出的错误名为 `TYPST_COMPILE_FAILED`，消息里附上完整诊断。
