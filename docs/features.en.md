<p align="right"><a href="features.md"><b>中文</b></a></p>

# Features

dsh-typst has two entry points. The agent works with the workbench through 7 tools, while you read the same typeset result in the right-sidebar preview panel. Each entry point handles its own interactions.

## Typesetting and fixing in a conversation

One responsibility per tool:

- `typst_status`: the Typst version and path, the main file, the other `.typ` files, the latest compile result. Call it first when working on a Typst document.
- `typst_set_main`: choose the main `.typ` file (remembered per workspace). With several candidates and no obvious one, you or the agent pick it.
- `typst_check`: wait until every change already on disk has compiled, then report errors and warnings with location, source line, `hint:` lines and call trace. Call it right after editing.
- `typst_render_pages`: render at most 4 pages to PNG for the agent to look at the layout. Compile errors do not catch overfull lines, figure placement or page breaks.
- `typst_show`: request a page location, or highlight rendered text or source lines with a comment.
- `typst_clear_highlights`: remove the agent's highlights.
- `typst_export_pdf`: compile a PDF into the workspace (optionally with a PDF standard and a page selection).

The `typst` skill guides the agent through orienting, editing, checking, looking at the rendered pages, pointing and exporting. It also says to use the panel for previews instead of running `typst compile` or `typst watch` in a shell.

### The order to solve a layout problem

Compile errors and layout errors are two different kinds of problem: the first is caught by `typst_check`, the second is only visible in the image. The typical order is therefore "confirm there are no compile errors with `typst_check` → look at the affected pages with `typst_render_pages` → change → look again".

### Export

The PDF written by `typst_export_pdf` lands in the workspace, with an optional PDF standard (`a-2b` and the others) and an optional page selection. The preview's own PDF is not in the workspace — it lives in the plugin's private cache.

## Reading the result in the preview panel

- **Live preview**: continuous scrolling by default, with a single-page option, page navigation, fit width, fit page and fixed zoom. Resizing refits pages while preserving the reading position within the page.
- **Snapshot state**: PDFs are read by exact main-file generation, sequence and hash. A replacement commits after its first page and text layer are ready. Compilation and failures label the retained successful preview with its time and main file. Read, Worker and rendering errors are visible and retryable.
- **Bottom auxiliary pane**: Outline, Problems and Annotations share a resizable pane with pointer and keyboard controls and an expanded view. Each tab retains its reading position, zoom, history, auxiliary view and feedback draft.
- **Diagnostics**: filter by severity, select one or several diagnostics, and open source or trace locations. Repairs first enter an editable draft and reach the conversation only after explicit submission. Changed diagnostics mark the draft as outdated, with an action to replace its context.

### Which file gets compiled

Click **Preview main file** to choose a `.typ` file. Search indexed paths or enter a workspace-relative path directly. Switching recompiles, with visible results and errors; the choice is remembered per workspace.

The index has no fixed depth or entry cutoff. Hidden directories and node_modules, target, **pycache**, venv, build and dist are excluded by default and can be included explicitly. Progress and read errors are visible. Refresh checks the selected file on disk instead of treating its absence from the index as deletion.

The menu separates the current main file, other Typst files and dependencies of the current document. Dependencies come from Typst's own report. “Other” does not claim that a file compiles independently.

### The outline

The outline comes from the current PDF bookmarks, preserving hierarchy and complete destinations. Different headings on the same page navigate to their actual positions. Collapse state follows the main file; arrows, Home, End and Enter support keyboard navigation. No headings, no destination and a read failure are distinct states; failures can be retried.

After text selection, **Add to chat** appends to the existing main composer draft and focuses it without sending. **Ask** opens an editable request with the selected text and approximate source candidates; leaving the source unspecified is supported.

**Ask about a region** captures text, equations, figures or blank space. Drag or use the keyboard to move and resize the rectangle. The plugin draft shows the actual screenshot, an editable question, image removal and additional regions from other pages. Explicit submission uses the host's public upload and session APIs. Upload or admission failures retain the draft and images; acceptance is reported.

Agent `typst_show` calls first produce a location notification. Navigation requires a click; back and forward restore reading positions. Annotations display the full quote, comment and source. Quotes that cannot be relocated after compilation remain listed as stale.

When Typst is missing or too old, setup keeps manual commands, recheck, restart and errors available. Setup requests are reviewed before submission. An unknown operating system never defaults to a macOS command.

## Capabilities against surfaces

| Capability          | Conversation (agent tools)       | Preview panel (you)                                                          |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Compile diagnostics | `typst_check`                    | Filter, select, open source, review repairs                                  |
| Inspect layout      | `typst_render_pages`             | Continuous or single-page PDF, zoom, outline                                 |
| Point at a location | `typst_show`                     | Notify, navigate on demand, quote and comment                                |
| Edit source         | Agent file tools                 | Read-only, opens host source views                                           |
| Export              | `typst_export_pdf`               | Request export through the conversation                                      |
| Feedback            | Receives normal session messages | Append text to the main draft; explicitly submit text or screenshot requests |
| Install Typst       | Act on the submitted request     | Facts, commands, recheck and restart                                         |

## How approximate the locations are

Text-to-source matching may be ambiguous for math, numbering, outlines, bibliographies and generated text. Drafts expose candidates and their match scores; the agent should check the excerpt. Screenshots and annotation coordinates remain associated with their original snapshot. Older feedback preserves its content and is clearly labeled.
