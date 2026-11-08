<p align="right"><a href="tools.md"><b>中文</b></a></p>

# Tool reference

dsh-typst registers 7 tools with the agent, all of them reads: they read the workbench state, compile the document, render pages, place highlights and write a PDF into the workspace. No tool edits a `.typ` file.

Every tool has two outputs: the **canonical JSON** is the lossless set of facts (an absent optional fact is omitted), and the **model-facing render** is a piece of text to read. The tool card carries its own display data.

A tool's return value is always a fact that already happened: there is no pending write and no partially applied state that would need a rollback.

---

## typst_status

Reports the state of the workbench: the Typst installation in use (version and path), the main `.typ` file, the other `.typ` files in the workspace, and the latest compile result. Call it first when working on a Typst document.

### Parameters

None.

### Output

| Field        | Type     | Meaning                                                                                                                                                       |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolchain`  | object   | The toolchain state: `state` is `ready`/`missing`/`too_old`/`error`; when ready it carries `version`, `path` and `source` (`setting`/`path`/`common`/`shell`) |
| `main`       | string   | The main `.typ` file (workspace-relative); absent when none is chosen                                                                                         |
| `candidates` | string[] | The `.typ` files of the workspace                                                                                                                             |
| `phase`      | string   | The latest compile phase: `idle`/`starting`/`compiling`/`ok`/`warnings`/`error`/`crashed`                                                                     |
| `errors`     | int      | The error count                                                                                                                                               |
| `warnings`   | int      | The warning count                                                                                                                                             |
| `pages`      | int      | The preview page count; absent until a compile succeeded                                                                                                      |
| `summary`    | string   | A one-line compile summary                                                                                                                                    |

### Notes

When `toolchain.state` is `missing`, the plugin found no typst on this computer; when it is `too_old`, the version is below 0.12.0. In both cases the remaining tools are unusable and the plugin carries installation guidance.

### Example

```text
typst_status()
```

---

## typst_set_main

Chooses the main `.typ` file, the one you would hand to `typst compile`. The preview restarts with it, and the choice is remembered for this workspace.

### Parameters

| Parameter | Type   | Default | Meaning                                    |
| --------- | ------ | ------- | ------------------------------------------ |
| `path`    | string | —       | A workspace-relative path ending in `.typ` |

### Output

| Field      | Type   | Meaning                              |
| ---------- | ------ | ------------------------------------ |
| `main`     | string | The chosen main file                 |
| `phase`    | string | The compile phase                    |
| `errors`   | int    | The error count                      |
| `warnings` | int    | The warning count                    |
| `summary`  | string | The compile summary and the problems |

### Notes

The path must stay inside the workspace; an escaping path is refused with `TYPST_PATH_OUTSIDE_WORKSPACE`. The call waits for one settle, so the summary already reflects the compile of the new main file.

### Example

```text
typst_set_main(path="paper.typ")
```

---

## typst_check

Compiles the document with the user's Typst and reports errors and warnings with `file:line:column`, the source line and Typst's `hint:` lines.

It waits until every change already on disk has compiled before returning, so call it right after editing.

### Parameters

| Parameter   | Type | Default | Meaning                                                                  |
| ----------- | ---- | ------- | ------------------------------------------------------------------------ |
| `timeoutMs` | int  | 60000   | How long to wait for the compile in milliseconds, clamped to 1000–600000 |

### Output

| Field         | Type     | Meaning                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `main`        | string   | The main file; absent when none is chosen                                      |
| `phase`       | string   | The compile phase                                                              |
| `errors`      | int      | The error count                                                                |
| `warnings`    | int      | The warning count                                                              |
| `pages`       | int      | The preview page count; absent until a compile succeeded                       |
| `durationMs`  | int      | The compile duration                                                           |
| `summary`     | string   | A one-line compile summary                                                     |
| `diagnostics` | object[] | The full diagnostic views: locations, source lines, `hint:` lines, call traces |

### Notes

The diagnostic list is truncated at `LIMITS.diagnostics` (30 entries); the rest is not returned. The `trace` field is Typst's call trace (`from …`), which names the file the error really came from.

### Example

```text
typst_check()
```

---

## typst_render_pages

Renders pages of the document to PNG images so the agent can look at the layout: overfull lines, figure and table placement, page breaks, title pages, spacing.

Compile errors do not catch layout problems: render the affected pages and look at them.

### Parameters

| Parameter | Type   | Default | Meaning                                                         |
| --------- | ------ | ------- | --------------------------------------------------------------- |
| `pages`   | string | —       | 1-based page selection, e.g. `"1"`, `"2-3"`, `"1,5"`            |
| `ppi`     | int    | 110     | Pixels per inch, clamped to 36–300; raise it to inspect details |

### Output

| Field    | Type     | Meaning                                                   |
| -------- | -------- | --------------------------------------------------------- |
| `pages`  | int[]    | The pages that were rendered                              |
| `total`  | int      | The total page count of the document                      |
| `images` | object[] | One item per page, with `page` and `dataUrl` (base64 PNG) |

### Notes

At most 4 pages per call (`LIMITS.renderPages`). When the document does not compile the call fails with `TYPST_COMPILE_FAILED` and the error carries the diagnostics — there is no page to render in that case.

The contents of `images` also enter the tool card's data channel; above 6 MB the card carries no images and shows the page numbers only.

### Example

```text
typst_render_pages(pages="2-3", ppi=150)
```

---

## typst_show

Points the user at something in the live preview: request a page location, or highlight rendered text. The user chooses when to navigate.

Give exactly one target: `page`; `quote` (copy the words as they appear in the rendered document, markup ignored); or `file` plus `line` (with an optional `endLine`) to highlight what those source lines produce.

Add a short `comment` explaining why. Highlights follow the text as the document changes and last for this session.

### Parameters

| Parameter | Type   | Default | Meaning                              |
| --------- | ------ | ------- | ------------------------------------ |
| `page`    | int    | —       | 1-based page to request              |
| `quote`   | string | —       | The rendered words to highlight      |
| `file`    | string | —       | A workspace-relative `.typ` file     |
| `line`    | int    | —       | 1-based line in that file            |
| `endLine` | int    | `line`  | The last line of the range           |
| `comment` | string | —       | The comment shown with the highlight |

### Output

| Field         | Type   | Meaning                                            |
| ------------- | ------ | -------------------------------------------------- |
| `highlighted` | bool   | Whether a highlight was created (false for a page) |
| `exact`       | bool   | Whether the quote matched exactly                  |
| `id`          | string | The highlight id                                   |
| `page`        | int    | The 1-based page requested                         |

### Notes

A highlight is located by its quote in the rendered text, so it is reliable for prose and approximate for math, numbering, outlines, bibliographies and function-generated text. When nothing matches, the call fails with `TYPST_QUOTE_NOT_FOUND`.

### Example

```text
typst_show(quote="the experimental setup", comment="This is the experimental setup")
```

---

## typst_clear_highlights

Removes the highlights in the preview: all of them, or the named ones.

### Parameters

| Parameter | Type     | Default | Meaning                                         |
| --------- | -------- | ------- | ----------------------------------------------- |
| `ids`     | string[] | —       | The highlight ids to remove; omit to remove all |

### Output

| Field     | Type | Meaning                          |
| --------- | ---- | -------------------------------- |
| `removed` | int  | The number of removed highlights |

### Example

```text
typst_clear_highlights()
```

---

## typst_export_pdf

Compiles the document with the user's Typst and writes a PDF into the workspace. Optionally a PDF standard and a page selection.

The preview's own PDF is not in the workspace; this is how you produce the deliverable.

### Parameters

| Parameter     | Type   | Default | Meaning                                                                 |
| ------------- | ------ | ------- | ----------------------------------------------------------------------- |
| `path`        | string | —       | A workspace-relative path ending in `.pdf`                              |
| `pdfStandard` | string | —       | The PDF standard: `a-1b`, `a-2b`, `a-2u`, `a-3b`, `a-3u`, `a-4`, `a-4f` |
| `pages`       | string | —       | A 1-based page selection, e.g. `"1-3"`                                  |

### Output

| Field     | Type   | Meaning                                      |
| --------- | ------ | -------------------------------------------- |
| `path`    | string | The workspace-relative path that was written |
| `bytes`   | int    | The PDF byte size                            |
| `pages`   | int    | The page count of the exported PDF           |
| `summary` | string | A one-line summary                           |

### Notes

The path must stay inside the workspace; an escaping path is refused with `TYPST_PATH_OUTSIDE_WORKSPACE`. When the document does not compile the call fails with `TYPST_COMPILE_FAILED` and the error carries the diagnostics.

### Example

```text
typst_export_pdf(path="paper.pdf", pdfStandard="a-2b")
```

---

## The panel's wire methods

The panel does not read the state through the agent tools. It goes through the host service of the `typst` wire namespace (service key `typstStatus`). Every method takes a `typstScope` parameter, and the server resolves the SessionId into a workspace root through it.

| Method         | Returns                             | Meaning                                                                                                           |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `status`       | `TypstStateFrame`                   | The current state frame; also activates the session                                                               |
| `setMain`      | `{ main }`                          | Choose the main file                                                                                              |
| `watch`        | `AsyncIterable<TypstStateFrame>`    | The state stream: the first frame is the current state, every later frame follows one change                      |
| `readPreview`  | `{ generation, seq, sha256, data }` | Read the exact retained snapshot identity (`data` rides as an attachment)                                         |
| `locateSource` | `{ matches }`                       | The candidate source matches for a rendered text                                                                  |
| `recheck`      | `TypstStateFrame`                   | Look typst up again and answer with the new frame                                                                 |
| `restart`      | `TypstStateFrame`                   | Stop the watch, change the main file, rescan, restart, and answer with the new frame                              |
| `discover`     | `{}`                                | Completely index the workspace, optionally including excluded directories; state frames carry progress and errors |

`readPreview` requires `{ generation, seq, sha256 }`; expired identities return `TYPST_NOT_FOUND`. Draft append, image upload and request submission use public host client APIs without a plugin wire proxy.

`watch` is a stream method: its manifest signature carries the prefix `@Remote({ mode: 'stream' })` and its descriptor carries `mode: 'stream'`.

## Error codes

A domain error of the plugin's own crosses the wire under exactly one code, `typst/domain`, with the stable domain code in `details.code`; consumers discriminate by `details.code`, never by `instanceof`.

| Error code                     | Meaning                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| `TYPST_MISSING`                | No typst was found in this computer's search                        |
| `TYPST_TOO_OLD`                | The installed typst is below the supported minimum (0.12.0)         |
| `TYPST_UNUSABLE`               | Typst exists but does not run (`--version` failed, broken install)  |
| `TYPST_NO_MAIN`                | No main `.typ` file is chosen and none could be picked              |
| `TYPST_NO_PREVIEW`             | The requested preview does not exist (nothing compiled yet)         |
| `TYPST_NOT_FOUND`              | The requested snapshot, page or highlight is gone                   |
| `TYPST_INVALID_ARGUMENT`       | An argument violates a domain constraint the schemas cannot express |
| `TYPST_PATH_OUTSIDE_WORKSPACE` | The path resolves outside the workspace                             |
| `TYPST_TIMEOUT`                | The compile did not settle within the caller's budget               |
| `TYPST_WATCH_FAILED`           | `typst watch` died or could not start                               |
| `TYPST_QUOTE_NOT_FOUND`        | The quote was not found in the rendered preview                     |
| `TYPST_NOT_COMPOSED`           | The Typst workbench service is not composed                         |
| `TYPST_UNEXPECTED`             | Something unexpected; the message carries the domain fact           |

When `typst_render_pages` and `typst_export_pdf` fail because the document does not compile, the error's name is `TYPST_COMPILE_FAILED` and its message carries the full diagnostics.
