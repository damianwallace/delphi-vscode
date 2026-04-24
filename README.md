# delphi-vscode (fork)

> This is a personal fork of [adventune/delphi-vscode](https://github.com/Adventune/delphi-vscode), modified to support development workflows for a large, multi-project Delphi codebase. Changes have been made to improve reliability when working with complex project structures and shared library dependencies.

Delphi extension to allow full developer tooling for Delphi in VSCode.

## What's different in this fork

### Bug fixes

- **Run script generation** — Fixed three bugs in the PowerShell script generation that caused builds to fail silently or produce corrupted paths.
- **Single-quoted PowerShell strings** — All literal path assignments in generated scripts now use single-quoted strings so paths containing special characters (e.g. `$`) are never expanded by PowerShell.
- **Active file guard** — The run command now uses the active editor's project instead of always defaulting to the first workspace project, so running works correctly in multi-project workspaces.
- **`no_config_available` sentinel handling** — When no `.delphilsp.json` existed at activation, the extension wrote a sentinel value that later caused the FileSystemWatcher to route into the wrong error branch. The sentinel is now treated as empty so auto-discovery works correctly.
- **Unit search path injection** — Parses the `-U` flag from `dccOptions` in the LSP config (the real DCC32 filesystem paths written by the IDE) and injects them into the generated build script as `DCC_UnitSearchPath`, so shared include files like project-wide directive files are always resolvable by MSBuild.

### New features

- **`delphi.projectReady` context flag** — Set to `false` immediately on activation so a loading spinner appears in the title bar before the async config check completes. Flips to `true`/`false` as the user selects or clears a project. Replaces the play button with a spinning icon when no project is loaded.
- **LSP config file watcher** — Registers a `FileSystemWatcher` for `**/*.delphilsp.json` so the extension automatically detects and loads a config the moment the Delphi IDE saves one, without requiring a manual reload.
- **Delphi IDE auto-launch** — When a Pascal file is opened and no LSP config exists for its project, the extension opens the Delphi IDE with the nearest `.dproj` pre-loaded and guides the user through enabling LSP config generation.

## Features

- Building and running projects
- Syntax highlighting
- LSP Integration
- Snippets

## Requirements

- Delphi 11 (RAD Studio) installed
- `TMLIB` environment variable set to your shared library path (if your project uses a `$(TMLIB)` search path variable in `.dproj` files)
- Project LSP config generated with Delphi
  - In Delphi: **Tools > Options > User Interface > Editor > Language** (pick Delphi from the dropdown) > **Code Insight** > enable **Generate LSP Config**, then close and reopen your project

## Extension Settings

- `delphi.bin` — Path to Delphi `bin` folder. Defaults to newest installation.
- `delphi.serverType` — Defines the operation mode (`controller`, `agent`, or `linter`)
- `delphi.agentCount` — Number of sub-processes when `serverType` is `controller`. If `agentCount > 1`, one process is dedicated to Error Insight.
- `delphi.logModes` — Bit mask for logging modes: 1 (RawInputMessage), 2 (RawOutputMessage), 4 (Queue), 8 (Processor), 16 (Server), 32 (AgentFacade), 64 (DCC related), 128 (LSP Inspector traces)
- `delphi.configFile` — File URI of the current LSP config (`.delphilsp.json`)

## Release Notes

Check out [CHANGELOG](./CHANGELOG.md).

## Credits

- [adventune/delphi-vscode](https://github.com/Adventune/delphi-vscode) — upstream project this fork is based on
- [Pascal for VSCode](https://github.com/alefragnani/vscode-language-pascal/blob/master/snippets/pascal.json) — syntax and snippets
- [DelphiLSP for VSCode](https://marketplace.visualstudio.com/items?itemName=EmbarcaderoTechnologies.delphilsp) — reference for custom LSP notification handling
