# dsh-typst

English · [简体中文](README.md)

The Typst plugin for DeepSeek Harness: a live typesetting preview in a right-sidebar panel while the agent writes and fixes your document, driven by **the Typst installed on your computer** — your fonts, your downloaded packages, your Typst version — so the preview matches what `typst compile` produces in your terminal. Each save (yours or the agent's) recompiles incrementally and redraws the visible pages in place, without flicker and without losing your place. The agent reads errors with file:line, the source line, `hint:` lines and the call trace, looks at rendered pages as images, points at places in the preview, and exports PDFs; you can select text in the preview and send it to the agent together with its source location.

The package ships built; nothing needs to be compiled at install time. It needs:

- Node.js 24+ and a DeepSeek Harness Web UI with the right docking sidebar;
- **Typst 0.12 or later** installed locally, for example `brew install typst` (macOS), `winget install --id Typst.Typst` (Windows), `cargo install --locked typst-cli`, or a release from <https://github.com/typst/typst/releases>.

The plugin looks for `typst` in this order: the path configured in the plugin settings → PATH → common install locations (Homebrew, Cargo, `~/.local/bin`, Nix, Snap, WinGet, Scoop) → your login shell (for version managers such as mise or asdf). If Typst lives somewhere else, set **Typst path** in the plugin settings.

## Use

Install and enable `dsh-typst-plugin`, then ask for example:

- "Start a two-column paper in Typst with a title block and an abstract."
- "Fix the errors in my thesis and show me what changed."
- "The table on page 3 overflows — make it fit."
- "Export `paper.pdf` as PDF/A-2b."

You can also open the **Typst** panel from the sidebar's "+" menu or the guide page.

### Panel

- **Live preview** of the main file. Each save recompiles incrementally with `typst watch` and the visible page is redrawn in place — no flicker. Zoom (fit width, fit page, or a percentage) and a page box.
- **Main file**: choose it explicitly using Preview main file, search indexed files or enter a relative path. The complete index can include hidden and build directories. Switching recompiles and the choice is remembered per workspace.
- **Status and problems**: compile phase, duration and diagnostic counts. Failures label the retained successful preview. The bottom Problems pane supports filtering, selection, source opening and repair review.
- **Text and region feedback**: selected text can be appended to the existing main composer draft. Ask opens an editable request with optional source candidates and explicit submission. Region feedback supports real screenshots, multiple pages, review, removal and retry.
- **Agent annotations**: location requests notify before navigation, with back and forward history. Full quotes and comments remain available, including stale annotations.
- **Setup**: detected facts, searched directories and platform-specific commands. Review setup requests before submitting; manual recheck and restart remain available.

### Tools

| Tool                     | Purpose                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `typst_status`           | Typst version and path, main file, other `.typ` files, latest compile result                                            |
| `typst_set_main`         | Choose the main `.typ` file (remembered per workspace)                                                                  |
| `typst_check`            | Wait until every saved change has compiled, then report errors and warnings with location, source line, hints and trace |
| `typst_render_pages`     | Render up to 4 pages to PNG images for the agent to look at                                                             |
| `typst_show`             | Request a page location, or highlight rendered text or source lines, with a comment                                     |
| `typst_clear_highlights` | Remove agent highlights                                                                                                 |
| `typst_export_pdf`       | Compile a PDF into the workspace (optional PDF standard and page selection)                                             |

The `typst` skill (model-invocable) teaches the agent the full loop: `typst_status` first, `typst_check` right after editing, `typst_render_pages` for layout, `typst_show` to point at things.

### Permissions, privacy and network

- The plugin runs your `typst` with the workspace as the working directory, exactly as you would in a terminal.
- The plugin never edits `.typ` files; only `typst_export_pdf` writes into the workspace, and only inside it. The preview PDF and rendered images live in the plugin's private cache directory (`~/.dsh/cache/typst`).
- The plugin itself makes no network requests; Typst downloads `@preview` packages on first use, as it does in a terminal.

## Documentation

### Usage

| Document                                      | Content                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.en.md) | Installation, prerequisites and the first task                                                |
| [Product model](docs/product-model.en.md)     | How the workbench, the panel and the agent tools divide the work, and the system's boundaries |
| [Features](docs/features.en.md)               | Live preview, the bottom Problems pane, selection-to-source, agent highlights and export      |
| [Troubleshooting](docs/troubleshooting.en.md) | Common symptoms, likely causes and what to do about them                                      |

### Maintenance

| Document                                            | Content                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Architecture](docs/architecture.en.md)             | Layer responsibilities, data flow, processes and lifecycle                    |
| [Tool reference](docs/tools.en.md)                  | The parameters and error codes of the 7 tools and of the panel's wire methods |
| [Configuration reference](docs/configuration.en.md) | Settings fields, the lookup order and the hot-reload behaviour                |
| [Development guide](docs/development.en.md)         | Build, debug, test and release                                                |

## Development

```sh
npm install          # also builds lib/ through prepare
npm test             # the test-lint guards + the full suite (including the session integration against a simulated typst CLI)
npm run typecheck    # harness pin + node/test/client tsc
npm run release:check
```

Developed as a sibling checkout of `../deepseek-harness`: mount a local harness with `dev.cordis.yml.example`, and run `npm run link:local-harness` when the sibling is ahead of the registry. See [AGENTS.md](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
