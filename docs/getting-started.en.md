<p align="right"><a href="getting-started.md"><b>中文</b></a></p>

# Getting started

dsh-typst adds a live Typst preview to DeepSeek Harness's right sidebar. The agent compiles your document with the Typst installed on your machine, the preview updates after each save, and you and the agent work from the same typeset result.

## Prerequisites

- **Node.js 24 or later**, and a DeepSeek Harness web UI with the right docking sidebar.
- **Typst 0.12 or later** installed locally, for example `brew install typst` (macOS), `winget install --id Typst.Typst` (Windows), `cargo install --locked typst-cli`, or a release from <https://github.com/typst/typst/releases>.
- A workspace that contains `.typ` files.

The plugin looks for typst in this order: the path in the plugin settings → PATH → the common install locations (Homebrew, Cargo, `~/.local/bin`, Nix, Snap, WinGet, Scoop) → the login shell. If Typst lives somewhere else, fill in the full path under **Typst path** in the plugin settings.

## Installing the plugin

### Desktop installation (the plugin manager)

Open **Plugins** in the sidebar of the DeepSeek Harness desktop app, click **Add plugin**, and enter one of these identifiers:

- Latest release (recommended): `dsh-typst-plugin`
- A specific version: `dsh-typst-plugin@0.1.0-alpha.0`
- The GitHub prebuilt branch: `github:Vncntvx/dsh-typst#release`

### Command-line installation

```sh
# npm, latest release (recommended)
dsh plugin --profile <name> add dsh-typst-plugin

# a specific version
dsh plugin --profile <name> add dsh-typst-plugin@<version>

# from the GitHub prebuilt branch
dsh plugin --profile <name> add github:Vncntvx/dsh-typst#release
```

Once installed, create a session and the plugin is available.

> Tip: installing straight from the `main` source branch needs a local build; the `#release` branch already carries the build output and installs without one.

## Checking that it works

Create a session, put a `main.typ` in the workspace, then:

1. Open the **Typst** panel from the sidebar's "+" menu or from the guide page.
2. Watch the toolbar: it shows _compiling_, and after a few seconds the compile duration or the error and warning count.
3. When the compile fails, the panel keeps the last version that compiled; open the **Problems** pane for each error's file:line:column, source line, Typst's `hint:` lines and call trace.

If the panel does not open or stays on the setup page, install typst as it asks — the setup page lists the facts it detected, the folders it searched and the install command for your platform, and offers an editable setup request for explicit submission. Once Typst is ready, the panel starts the preview by itself.

## Your first task: fixing an error

Put a document that fails to compile in the workspace, for example:

```typst
#set page(width: 10cm)
= Title

#undefined_function()
```

Then ask the agent to handle it:

> Fix the errors in my paper and show me what changed.

The agent calls `typst_status` to orient, reads the diagnostics with `typst_check` — location, source line, `hint:` lines and call trace — edits the file, and calls `typst_check` again to confirm. Check these things:

- The preview in the panel is re-typeset after each save, without flicker and without losing your place.
- The entries in the **Problems** pane disappear as the errors are fixed.
- The locations the agent reports are the ones you see in the drawer.

## Opening the preview panel

The panel is available in three ways: from the sidebar's "+" menu, from the guide page, or automatically when the agent mentions Typst during a session.

Three entry points in the panel are worth knowing:

- **Zoom and the page box**: fit width, fit page or a percentage, with a page box showing the current page.
- **Text and region feedback**: selected text can be appended to the existing main composer draft. Ask opens an editable request with optional source candidates and explicit submission. Region feedback supports real screenshots, multiple pages, review, removal and retry.
- **Agent annotations**: location requests notify before navigation, with back and forward history. Full quotes and comments remain available, including stale annotations.

Next: the [product model](product-model.en.md) explains how the workbench and the agent tools divide the work, and [features](features.en.md) lists what each surface can do.
