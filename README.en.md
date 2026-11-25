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
  <b>English</b> · <a href="README.md"><b>中文</b></a>
</p>

dsh-typst brings your local Typst installation into DeepSeek Harness. The agent writes and fixes `.typ` documents in conversation while the right sidebar shows the same live layout; after each save the visible page redraws in place and keeps its scroll position. The agent reads compile diagnostics with `file:line`, the source line, `hint:` lines and the call trace, looks at rendered pages, marks places in the preview, and exports PDFs. You can select text in the preview and hand it to the agent together with its source location.

## Features

- **Document work in conversation**
  - **Orient and compile**: `typst_status` reports the Typst version, path, main file, and latest compile. `typst_check` waits until every saved change has compiled, then returns location, source line, Typst `hint:`, and the call trace.
  - **Repair loop**: after editing `.typ`, the agent runs `typst_check` until diagnostics clear; a failed compile keeps the last successful preview in the panel.
  - **Inspect layout**: `typst_render_pages` renders up to 4 pages to PNG for checking overflow, image placement, and pagination.
  - **Mark and export**: `typst_show` asks the user to view a page or highlights rendered text/source lines with a comment; `typst_clear_highlights` removes the marks; `typst_export_pdf` writes a PDF into the workspace with optional PDF standard and page selection.
- **Preview panel**
  - **Live preview**: each save recompiles incrementally through `typst watch`, redraws the visible page in place, and keeps the scroll position; a sidebar resize refits the page and preserves the reading position.
  - **Status and problems**: the toolbar shows compile phase, duration, and diagnostic counts. The Problems drawer filters by level, selects one or several diagnostics, opens the source or call-trace location, and puts a repair request into an editable draft.
  - **Main file**: the menu groups the current main file, other Typst files, and fragments referenced by the current document; fragments come from Typst's own dependency report. The index skips hidden directories and `node_modules`, `target`, `__pycache__`, `venv`, `build`, `dist` by default, with an option to include them.
  - **Setup guide**: when Typst is missing or too old, the guide lists detected facts, searched directories, and platform commands. Review a setup request before submitting; manual recheck and preview restart stay available.
- **Runtime**
  - **Your compiler**: the plugin calls the Typst you installed, with the same fonts, packages, and version. Font directories, a `@local` package directory, and excluded directories are adjustable in settings.
  - **Read and write boundary**: the agent edits `.typ` sources with its file tools, and the plugin reads them. Preview PDFs and rendered images live in the plugin cache `~/.dsh/cache/typst`; the export tool writes the workspace deliverable.
  - **Network**: the plugin itself makes no network requests; Typst downloads `@preview` packages on first use as it does in a terminal.

## Install

### Desktop (plugin manager)

In DeepSeek Harness, open **Plugins** in the sidebar, click **Add plugin**, and enter one of:

- Latest (recommended): `dsh-typst-plugin`
- A specific version: `dsh-typst-plugin@0.1.0`
- GitHub prebuilt branch: `github:Vncntvx/dsh-typst#release`

### Command line

```sh
# latest from npm (recommended)
dsh plugin --profile <name> add dsh-typst-plugin

# a specific version
dsh plugin --profile <name> add dsh-typst-plugin@<version>

# the prebuilt GitHub branch
dsh plugin --profile <name> add github:Vncntvx/dsh-typst#release
```

The npm package and the `#release` branch both ship built output, so a new session can use the plugin immediately. The **dsh-typst-plugin** detail page in the plugin manager exposes Typst path, font directories, package directory, and excluded directories.

## Prerequisites

1. Node.js 24.9 or later, and a DeepSeek Harness interface with the right docking sidebar; the plugin requires dsh 0.2.2-rc.5 or later.
2. **Typst 0.12 or later** installed locally, for example `brew install typst` (macOS), `winget install --id Typst.Typst` (Windows), `cargo install --locked typst-cli`, or a release from <https://github.com/typst/typst/releases>.
3. A workspace containing `.typ` files.

The plugin searches for `typst` in this order: the plugin settings path → PATH → common install locations (Homebrew, Cargo, `~/.local/bin`, Nix, Snap, WinGet, Scoop) → the login shell (for version managers such as mise or asdf). If Typst lives elsewhere, set **Typst path** in the plugin settings to an absolute path or a workspace-relative path.

## Tools

| Tool                     | Purpose                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `typst_status`           | Typst version and path, main file, other `.typ` files, latest compile result                                       |
| `typst_set_main`         | Choose the main `.typ` file, remembered per workspace                                                              |
| `typst_check`            | Wait until every saved change has compiled, then report errors and warnings: location, source line, `hint:`, trace |
| `typst_render_pages`     | Render up to 4 pages to PNG for the agent to inspect layout                                                        |
| `typst_show`             | Ask the user to view a page, or highlight rendered text/source lines with a comment                                |
| `typst_clear_highlights` | Remove agent highlights                                                                                            |
| `typst_export_pdf`       | Compile a PDF into the workspace, with optional PDF standard and page selection                                    |

The `typst` skill ships with the plugin and guides the agent through orient, edit, check, inspect, point, and export. Parameters, return shapes, and error codes are in the [tool reference](docs/tools.en.md).

## Documentation

### Usage

| Document                                      | Content                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.en.md) | Installation, connection check and the first task                                             |
| [Product model](docs/product-model.en.md)     | How the workbench, the panel and the agent tools divide the work, and the system's boundaries |
| [Features](docs/features.en.md)               | Live preview, the Problems drawer, selection-to-source, agent highlights and export           |
| [Troubleshooting](docs/troubleshooting.en.md) | Common symptoms, likely causes and what to do about them                                      |

### Maintenance

| Document                                            | Content                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Architecture](docs/architecture.en.md)             | Component topology, data flow, state, concurrency, security and client contracts |
| [Tool reference](docs/tools.en.md)                  | The parameters and error codes of the 7 tools and of the panel's wire methods    |
| [Configuration reference](docs/configuration.en.md) | Settings fields, the lookup order and the hot-reload behaviour                   |
| [Development guide](docs/development.en.md)         | Build, debug, test and release                                                   |
| [Typst skill](docs/skills.en.md)                    | Four phases, budgets and evidence boundaries                                     |
| [Development notes](docs/development-notes.en.md)   | Upstream patches, compromises and exit conditions                                |

## Development

```sh
npm install          # also builds lib/ through prepare
npm test             # the test-lint guards + the full suite (including the session integration against a simulated typst CLI)
npm run typecheck    # harness pin + the node, test, client, client-test and scripts tsc
npm run release:check
```

## License

MIT — see [LICENSE](./LICENSE).
