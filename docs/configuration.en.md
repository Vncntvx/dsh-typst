<p align="right"><a href="configuration.md"><b>中文</b></a></p>

# Configuration reference

dsh-typst has exactly one settings namespace, `typst`, defined in `src/config.ts`, with 4 fields. Every field is volatile: a settings commit lands in the running fiber without remounting the plugin.

## Settings tab and field ownership

| Tab           | Settings namespace | Field count | Grouping and fields                                                           |
| ------------- | ------------------ | ----------- | ----------------------------------------------------------------------------- |
| **dsh-typst** | `typst`            | 4           | Toolchain: `typstPath`, `fontPaths`, `packagePath`; scan scope: `excludeDirs` |

The plugin renders this form on the **dsh-typst** detail page of the plugin manager.

## Core fields (`typst`, 4)

| Field         | Default | Meaning                                                                                                                                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typstPath`   | `""`    | The full path of the typst executable. Empty means "look it up"; fill it in only when Typst lives somewhere else.                                                                           |
| `fontPaths`   | `[]`    | Extra font directories, each passed to typst as `--font-path` after the workspace's `fonts/` and `assets/fonts/`. Covers brand font libraries and CJK fonts outside the system directories. |
| `packagePath` | `""`    | typst's local package directory, passed as `--package-path`. Use it for private `@local` packages or an offline mirror of `@preview`. Empty uses typst's default location.                  |
| `excludeDirs` | `[]`    | Extra directory names skipped while scanning for the main file, on top of `node_modules`, `target`, `__pycache__`, `venv`, `build` and `dist`. Discovery only; compilation is untouched.    |

## Path and name rules

- **`~` expansion**: all three path fields accept a leading `~/` (and `~\` on Windows), expanded to the current user's home directory when read; typst receives the expanded path.
- **Relative paths**: relative entries in `typstPath`, `fontPaths` and `packagePath` resolve against the workspace. A typst child runs with the workspace as its working directory, so a relative path means what it would mean if you ran `typst` there.
- **Font order**: the workspace's `fonts/` and `assets/fonts/` come first, then the configured directories; duplicates are kept once. Project fonts therefore win a name clash. A configured directory may not exist yet; typst receives it and ignores it.
- **Lists in the settings page**: `fontPaths` and `excludeDirs` are entered comma-separated there (semicolons are accepted too); wrap an entry in double quotes when it contains a comma, and a doubled quote inside those quotes is one literal quote. The configuration file still uses YAML arrays.
- **Exclusion names only**: `excludeDirs` matches directory names and accepts no `/` or `\` path spellings. It matches at any depth and compares without case on Windows, macOS and Linux alike. Hidden directories keep their existing rule. The panel's "include hidden and build directories" toggle reveals the configured names together with the built-in list.
- **Cross-platform**: Windows drive paths and paths with spaces are passed as one argument unchanged; macOS and Linux use their own absolute paths. Write separators the way your platform does, `\` or `/`.

## Lookup order

When `typstPath` is empty, the plugin locates typst in this order and stops at the first hit:

1. **PATH**: the `typst` in the executable directories.
2. **Common install locations**: Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), Cargo (`~/.cargo/bin`), `~/.local/bin`, Nix, Snap, WinGet, Scoop.
3. **The login shell**: version managers such as mise and asdf place typst in a directory that only exists after the shell initializes, so the plugin queries the login shell once.

The located result carries its source (`setting`/`path`/`common`/`shell`), visible in the toolchain state. The located version must be 0.12.0 or later; below that the state is `too_old` rather than `ready`.

The panel's setup page lists the facts it detected, the folders it searched and the package managers it found.

## Configuration precedence

```text
Schema defaults → Composition entry config → the current profile's Cordis patch overlay → home patch → `--patch` overlay
```

A commit from the plugin settings page writes the running entry (volatile) for the current profile; the overlay files stay unchanged.

## The plugin settings page

Configuration has three entry points:

1. **The plugin manager**: open the **dsh-typst** detail page, fill in _Typst path_, _Font directories_, _Package directory_ and _Excluded directories_, then save.
2. **The Composition entry**: write this in the configuration that loads the plugin:

   ```yaml
   typst:
     typstPath: "/path/to/typst"
     fontPaths: ["~/Fonts/zh", "/Library/Fonts/Brand"]
     packagePath: "~/typst-packages"
     excludeDirs: ["vendor", "generated"]
   ```

3. **The configuration file**: the Cordis profile's patch overlay.

## Hot-reload behaviour

| Field                       | When it takes effect                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typstPath`                 | Immediately. After the commit, every live session looks the typst executable up once more; the watch restarts with it and the sessions converge.                      |
| `fontPaths` / `packagePath` | Immediately. Live sessions restart their watch with the new `--font-path` / `--package-path`; one-shot renders and exports pick the new values up on their next call. |
| `excludeDirs`               | Immediately. Live sessions re-scan their main-file candidates; the running watch is untouched, because exclusion belongs to discovery only.                           |

A change updates the running entry; a session that is already running stays valid.
