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
- **Config / project path decoding** — Workspace `delphi.configFile` and `settings.project` values are often stored as `file:` URLs with a percent-encoded drive (for example `file:///c%3A/...`). Those strings are normalized with Node `fileURLToPath` so `loadConfigFileJson` and the Run task see real filesystem paths instead of broken segments such as `...\c%3A\...` under `path.resolve`.

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

- Delphi 11 Alexandria (RAD Studio 22.0) or later — `DelphiLSP.exe` was introduced in version 11 and is required for LSP features. The extension auto-detects the newest installed version.
  > **Note:** This fork is only tested and validated against **RAD Studio 23.0 (Delphi 12 Athens)**. Higher or lower versions may work but are untested.
- `TMLIB` environment variable set to your shared library path (if your project uses a `$(TMLIB)` search path variable in `.dproj` files)
- Project LSP config generated with Delphi
  - In Delphi: **Tools > Options > User Interface > Editor > Language** (pick Delphi from the dropdown) > **Code Insight** > enable **Generate LSP Config**, then close and reopen your project

## Building and Installing the Extension

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (v18 is the minimum; v22 is recommended)
- npm v8 or later (included with Node.js 18+)
- [vsce](https://github.com/microsoft/vscode-vsce) — the VS Code extension packaging tool

Install `vsce` globally if you don't have it:

```bash
npm install -g @vscode/vsce
```

### Steps

1. **Clone the repo**

   ```bash
   git clone https://github.com/damianwallace/delphi-vscode.git
   cd delphi-vscode
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Compile the TypeScript**

   ```bash
   npm run compile
   ```

4. **Package the extension into a `.vsix` file**

   ```bash
   npm run package
   ```

   This produces a file like `delphi-1.0.1.vsix` in the project root.

5. **Install the `.vsix` into Cursor / VS Code**

   Open the Command Palette (`Ctrl+Shift+P`) and run:

   ```
   Extensions: Install from VSIX...
   ```

   Select the generated `.vsix` file. Reload when prompted.

   Alternatively, install from the terminal:

   ```bash
   code --install-extension delphi-1.0.1.vsix
   ```

6. **Copy a new build into your running Cursor session (quick update)**

   If you are actively developing the extension and want to test a new build without going through the full install flow each time:

   1. Run `npm run compile` to recompile
   2. Run `npm run package` to produce a new `.vsix`
   3. Install via the Command Palette as above — Cursor will replace the existing version in place
   4. Open the Command Palette and run **Developer: Reload Window** (`Ctrl+Shift+P` → `Reload Window`) to apply the changes

   > **Important:** You must reload the window after every install. Simply recompiling is not enough — Cursor loads the extension once at startup and will continue running the old version until the window is reloaded.

## Automated tests

The repo ships a **Mocha** suite that exercises extension logic through **VS Code API mocks**. Tests compile with **`tsconfig.test.json`** into **`out-test/`** (this is separate from **`out/`**, which is what `npm run compile` / the packaged extension use).

### What the suites cover

| Suite | File | Focus |
|--------|------|--------|
| Run script / `-U` parsing | `test/suite/scripts.test.ts` | Generated `_run.ps1`: `.dproj` target, PowerShell single-quoted paths, `WorkingDirectory`, `TMROOT` / `TMLIB`, `DCC_UnitSearchPath` from `dccOptions` `-U`; ArFc-style configs (quoted `-U` paths; `browsingPaths` must not appear in `DCC_UnitSearchPath`). |
| Run command guards | `test/suite/runManager.test.ts` | No active file, no `.delphilsp.json`, configured project mismatch; happy path when the on-disk config matches (including **percent-encoded `file:`** `delphi.configFile` on **Windows** — skipped on other platforms). |
| Config / paths / sentinel | `test/suite/configFile.test.ts` | `findNearestDproj` / `findNearestLSPConfig`, `no_config_available` re-scan behaviour, **`uriOrPathToFsPath`** / **`loadConfigFileJson`** for `file:` and `%3A`-encoded paths (Windows-only cases skip elsewhere). |

Fixtures live under **`test/fixtures/`** (for example `test.delphilsp.json`, `test-arfc-style.delphilsp.json`). Mocha is configured in **`.mocharc.json`** (spec glob, `vscode-setup` preload, custom reporter).

### Run all tests

From the repo root:

```bash
npm install
npm test
```

This runs **`tsc -p tsconfig.test.json`** (refreshes `out-test/…`) then **`mocha`** using **`.mocharc.json`**.

### Update or add tests

1. Change **`test/suite/*.test.ts`** and/or add JSON under **`test/fixtures/`** as needed.
2. Run **`npm test`** again so TypeScript recompiles into `out-test` and Mocha picks up the new output.

After each run, a Markdown summary is written to **`test/results/report.md`** (see `test/reporter.ts`).

### Run a single compiled suite (optional)

```bash
npx mocha out-test/test/suite/configFile.test.js
```

Use other filenames under `out-test/test/suite/` the same way. You still need a current `out-test` tree (`npm test` once, or `npx tsc -p tsconfig.test.json` before `npx mocha`).

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
