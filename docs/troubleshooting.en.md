<p align="right"><a href="troubleshooting.md"><b>中文</b></a></p>

# Troubleshooting

This document lists the common problems of using dsh-typst, their likely causes and what to do about them.

## 1. The panel stays on the setup page

- **Symptom**: opening the Typst panel shows only the setup guide, no preview.
- **Cause**: the plugin found no typst on this computer, or found one older than 0.12.0. The search covers PATH, the common install locations and the login shell.
- **Fix**: install typst with the command the setup page lists; the plugin re-checks every few seconds by itself, so no restart is needed. If Typst lives outside the search, fill in the full path under **Typst path** in the plugin settings.

## 2. Typst is reported as too old

- **Symptom**: the panel shows `too_old` and the tools return `TYPST_TOO_OLD`.
- **Cause**: the located typst is below 0.12.0, the lowest version the plugin supports.
- **Fix**: upgrade it with the tool that installed it (Homebrew: `brew upgrade typst`; cargo: `cargo install --locked typst-cli`), or point **Typst path** at another installation.

## 3. Typst is found but does not run

- **Symptom**: the panel shows `error` and the tools return `TYPST_UNUSABLE`.
- **Cause**: the executable was found but `--version` failed — usually a broken installation, a missing execute permission, or a mismatched architecture.
- **Fix**: run `typst --version` in a terminal and see what it reports; reinstall if the installation is repairable, and use a build matching your machine if the architecture is wrong.

## 4. No main file can be found

- **Symptom**: the tools return `TYPST_NO_MAIN` and the preview is empty.
- **Cause**: the workspace has no `.typ` file, or it has several candidates and the plugin cannot tell which is the main one.
- **Fix**: make sure the workspace really contains `.typ` files; with several candidates, name the one you would hand to `typst compile` with `typst_set_main`, or switch it from the panel's toolbar.

## 5. The preview stays empty

- **Symptom**: the tools return `TYPST_NO_PREVIEW`.
- **Cause**: no compile has succeeded yet — the document has compile errors, or the main file is not chosen.
- **Fix**: read `typst_status` for the `phase` and the error count; when there are errors, run `typst_check` and fix them.

## 6. `typst_check` waits and never returns

- **Symptom**: the tool fails after the default 60 seconds with `TYPST_TIMEOUT`.
- **Cause**: the changes on disk never finish compiling — most often because the watch process did not notice the save.
- **Fix**: check that the file really reached the disk (some editors write a temporary file and rename it); `typst_check` restarts the watch in that case, so one retry usually works. The panel's toolbar has a restart button too.

## 7. The watch process exited

- **Symptom**: the tools return `TYPST_WATCH_FAILED` and the panel stops updating.
- **Cause**: `typst watch` crashed or was killed by the system.
- **Fix**: look for the lines prefixed `[dsh-typst]` in the host log and read the last one before the crash; restarting the session or switching the main file rebuilds the watch.

## 8. A highlight does not land where expected

- **Symptom**: an agent highlight appears in the wrong place, or turns grey (stale).
- **Cause**: a highlight is located by its quote in the rendered text. For math, numbering, outlines, bibliographies and function-generated text, the quote usually does not appear verbatim in the rendered result.
- **Fix**: have the agent point with `file` and `line` instead of a quote; a source line is located independently of the rendered text's approximation.

## 9. The quote cannot be found

- **Symptom**: the tool returns `TYPST_QUOTE_NOT_FOUND`.
- **Cause**: the quote has to be copied as it appears after rendering; markup (`#`, backticks) copied along with it, or words copied from the source rather than the rendered result, will not match.
- **Fix**: copy the words straight out of the preview and drop the markup, then try again.

## 10. The export path is refused

- **Symptom**: the tool returns `TYPST_PATH_OUTSIDE_WORKSPACE`.
- **Cause**: the path resolves outside the workspace, for example `../outside.pdf` or an absolute path elsewhere on the disk.
- **Fix**: use a workspace-relative path such as `out/paper.pdf`. The plugin only writes inside the workspace and cannot export elsewhere.

## 11. The export fails to compile

- **Symptom**: the tool fails with the error name `TYPST_COMPILE_FAILED` and the full diagnostics in its message.
- **Cause**: the document has compile errors, and the export runs a real compile.
- **Fix**: fix the errors at the reported locations and try again. A preview that renders does not mean the document compiles — the preview keeps the last version that did.

## 12. The panel does not update after a save

- **Symptom**: a file changed and the preview did not recompile.
- **Cause**: the watch did not notice the change, or the change has not reached the disk yet.
- **Fix**: confirm the editor has written the file to disk rather than only its in-memory buffer; restart the watch once from the panel's toolbar. If it still does not update after the write, read the `[dsh-typst]` lines in the host log.

## 13. The selected text does not match a source location

- **Symptom**: the message the panel sends carries the selected text but no source location.
- **Cause**: the text match found no candidate — the selection came from generated text (an outline, numbering, a bibliography), or the file is over the matching size limit.
- **Fix**: select running prose and try again; when an exact location is needed, ask the agent for the `file` and `line` form of `typst_show`.

## 14. The preview page is blank

- **Symptom**: no page content is visible in the panel.
- **Cause**: no PDF has compiled successfully yet, or the previous snapshot has been dropped (the plugin keeps only the newest 3 snapshots, for highlight relocation).
- **Fix**: read the phase indicator in the toolbar; if it says `error`, the problem is the compile, not the display.

## 15. A settings change does not take effect

- **Symptom**: a new **Typst path** was filled in and the plugin still uses the old typst.
- **Cause**: the path was not saved, or the session of that workspace has not been rebuilt yet.
- **Fix**: reopen the settings and confirm the value was saved. The setting is volatile: after the commit every live session looks the executable up once more and the watch restarts with it, which normally takes effect within seconds.

## 16. The Typst panel is nowhere to be found

- **Symptom**: the right sidebar has no Typst entry.
- **Cause**: the plugin is not enabled, or the host UI has no right docking sidebar.
- **Fix**: confirm **dsh-typst** is enabled in the plugin manager; the UI has to be the web build with the right sidebar. The guide page opens the panel as well.
