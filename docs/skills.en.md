<p align="right"><a href="skills.md"><b>中文</b></a></p>

# Typst workflow skill reference

Skills are phased instructions. The model selects a skill from a short catalog and loads the full Markdown SOP with the Harness `skill` tool. Full bodies stay out of the standing system prompt; names and short descriptions remain in the catalog, which still uses some tokens.

The plugin registers exactly one skill, `typst`; its name and description are English, and the model matches Chinese-language requests cross-lingually.

## Selecting a skill

| Skill   | Component | Input → output                                                                                                                  | Boundary                                                                                                            |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `typst` | Core      | A `.typ` document or typesetting request → edited sources, compile diagnostics, rendered pages, preview locations, exported PDF | Typesets through the workbench; installation follows an explicit user request, and previews use the workbench tools |

The skill uses conditional setup guidance and Zotero citation recipes when their tools are available. Without the Zotero plugin it delivers the local result and the missing citation step; citation generation stays with the Zotero tools when they are available.

## Phases, batching and termination

The skill has four ordered phases: orient, edit loop, point and feedback, export and citations. Phase state lives in the model's task context; reuse the main file, snapshots and diagnostics already obtained instead of rescanning.

| Phase                | Order                                                    | Default budget and termination                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orient               | `typst_status` → main file → project conventions         | Read status first. On `TYPST_NO_MAIN`, choose a file that compiles on its own and ask if it is unclear; with no `.typ` files, create `main.typ`. If the version is unusable, switch to setup guidance instead of guessing syntax.                     |
| Edit loop            | Edit source → `typst_check` → fix → render when needed   | Check immediately after every edit and wait until every change already on disk has compiled; render the affected pages when layout matters, at most 4 pages per call, 110 ppi by default. Stop when diagnostics are clear and the layout is verified. |
| Point and feedback   | `typst_show` / `typst_clear_highlights` → panel feedback | Quote visible document text; use `file` + `line` for a source location. Mark only what the user should look at, with one reason. Highlights follow text across recompiles and turn stale when the target disappears.                                  |
| Export and citations | `typst_export_pdf` → citation files → setup guidance     | Export once to a path inside the workspace, optionally with a PDF standard and a page selection. Prefer a generated `.bib` and its returned keys. Install only on an explicit request and confirm `typst --version` ≥ 0.12.                           |

Do not run `typst compile` or `typst watch` in a shell for previewing. Shell `typst` is fine for one-off queries such as `typst fonts` or `typst query`. Correct a parameter name once against the schema.

## Evidence and safety boundaries

- Diagnostics are authoritative through `file:line:column`, the source line, Typst's `hint:` lines and the call trace. A successful `typst_check` proves compilation, not layout.
- Preview feedback carries the main file, snapshot identity, selected text or screenshots, and an optional approximate source excerpt. Check the excerpt and snapshot age before editing; matching is approximate for math, numbering, bibliographies and generated text.
- A location notification only points; the user clicks to navigate and can return to the previous reading position. Highlights follow text and are marked stale when the target is gone.
- The export path is confined by `insideWorkspace`; an escape is refused with `TYPST_PATH_OUTSIDE_WORKSPACE`. The preview's own PDF lives in the plugin's private cache, not in the workspace.
- Installing, updating, `sudo`, adding a package manager or editing a shell profile needs an explicit user request; a setup request submitted from the panel counts as one. The plugin itself makes no network request.

## Registration and maintenance

`src/skills/typst.ts` is a Host-only module. `typstSkill()` returns a `SkillRegistration`, and `registerTypstSkill()` registers it through optional `ctx.inject(["skills"])`; the source is `runtime`, both the model and the user can invoke it, and `metadata.component` is `typst`. The body is a TypeScript string compiled directly, with no Markdown asset to copy; the fiber removes the registration.

Test ownership: `tests/skills/typst.spec.ts` asserts the skill name, invocation modes, the presence of every `TYPST_TOOL_NAMES` entry in the body, and registration through `ctx.skills.register`. Documented examples are checked against the real tool schemas by `tests/host/doc-examples.spec.ts`. Before release run the focused spec, `npm run typecheck`, `npm test` and `npm run release:check`.
