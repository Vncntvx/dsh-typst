<p align="right"><a href="configuration.md"><b>中文</b></a></p>

# Configuration reference

dsh-typst has exactly one settings namespace, `typst`, defined in `src/config.ts`, with 1 field. Every field is volatile: a settings commit lands in the running fiber without remounting the plugin.

## Settings tab and field ownership

| Tab           | Settings namespace | Field count | Grouping and fields     |
| ------------- | ------------------ | ----------- | ----------------------- |
| **dsh-typst** | `typst`            | 1           | Typst path: `typstPath` |

The plugin renders this form on the **dsh-typst** detail page of the plugin manager.

## Core fields (`typst`, 1)

| Field       | Default | Meaning                                                                                                           |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `typstPath` | `""`    | The full path of the typst executable. Empty means "look it up"; fill it in only when Typst lives somewhere else. |

## Lookup order

When `typstPath` is empty, the plugin locates typst in this order and stops at the first hit:

1. **PATH**: the `typst` in the executable directories.
2. **Common install locations**: Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), Cargo (`~/.cargo/bin`), `~/.local/bin`, Nix, Snap, WinGet, Scoop.
3. **The login shell**: version managers such as mise and asdf place typst in a directory that only exists after the shell initializes, so the plugin queries the login shell once.

The located result carries its source (`setting`/`path`/`common`/`shell`), visible in the toolchain state. The located version must be 0.12.0 or later; below that the state is `too_old` rather than `ready`.

The panel's setup page lists the facts it detected, the folders it searched and the package managers it found.

## Configuration precedence

```text
Schema defaults → Composition entry config → the current profile's Cordis patch overlay
```

A commit from the plugin settings page writes the last layer.

## The plugin settings page

Configuration has three entry points:

1. **The plugin manager**: open the **dsh-typst** detail page, fill in _Typst path_ and save.
2. **The Composition entry**: write `typst: { typstPath: "/path/to/typst" }` in the configuration that loads the plugin.
3. **The configuration file**: the Cordis profile's patch overlay.

## Hot-reload behaviour

| Field       | When it takes effect                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typstPath` | Immediately. After the commit, every live session looks the typst executable up once more; the watch restarts with it and the sessions converge. |

A change neither remounts the plugin nor invalidates a session that is already running.
