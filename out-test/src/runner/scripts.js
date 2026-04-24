"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRunScript = initRunScript;
const path = require("path");
const fs_1 = require("fs");
const configFile_1 = require("../client/configFile");
const vscode_1 = require("vscode");
const constantUtils_1 = require("../utils/constantUtils");
/**
 * Wraps a Windows path in a PowerShell single-quoted string literal.
 *
 * PowerShell single-quoted strings are completely literal — no variable
 * expansion and no escape-sequence processing — so backslash sequences like
 * \t or \n are never misinterpreted, and a path containing $ will never be
 * silently expanded. Any single quotes already present in the value are
 * escaped by doubling them (''), which is the only escape mechanism in
 * PowerShell single-quoted strings.
 */
function psSingleQuote(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
/**
 * Parses the -U (unit search path) flag from a DCC32 options string and
 * returns a semicolon-joined list of filesystem paths suitable for
 * MSBuild's DCC_UnitSearchPath property.
 *
 * browsingPaths in .delphilsp.json are file:// URIs intended for the LSP
 * language server — NOT filesystem paths.  dccOptions, on the other hand,
 * contains the exact DCC32 command line the IDE used, including -U with real
 * Windows paths, so those are the correct source for MSBuild search paths.
 *
 * @param dccOptions - Raw DCC32 options string from the .delphilsp.json config.
 * @param tmLib      - Absolute path to the repo's lib/ directory; always
 *                     prepended so that {$I TMProjectDirectives.inc} is found
 *                     even when it is absent from dccOptions.
 */
function buildDccUnitSearchPath(dccOptions, tmLib) {
    // Extract everything after the -U flag up to the first unquoted whitespace
    // that precedes another flag.  The regex alternates between "quoted segment"
    // and "non-whitespace char" so it stops naturally at any unquoted space.
    const m = dccOptions.match(/-U((?:"[^"]*"|[^\s])*)/);
    const paths = [];
    if (m) {
        let cur = '', inQ = false;
        for (const ch of m[1]) {
            if (ch === '"') {
                inQ = !inQ;
            }
            else if (ch === ';' && !inQ) {
                if (cur)
                    paths.push(cur);
                cur = '';
            }
            else {
                cur += ch;
            }
        }
        if (cur)
            paths.push(cur);
    }
    // Guarantee tmLib is present so {$I TMProjectDirectives.inc} is always found.
    const tmLibNorm = tmLib.replace(/\//g, '\\').toLowerCase();
    if (!paths.some((p) => p.replace(/\//g, '\\').toLowerCase() === tmLibNorm)) {
        paths.unshift(tmLib);
    }
    return paths.filter(Boolean).join(';');
}
/**
 * Inits the run script for the current project.
 * Creates a .bat file in the .vscode directory of current workspace.
 *
 * @returns undefined
 */
async function initRunScript(config) {
    const json = await (0, configFile_1.loadConfigFileJson)(config);
    if (json === false)
        return; // No config file has been set
    const projectDir = path.dirname(json.settings.project);
    const projectName = path.basename(json.settings.project).split('.')[0];
    const exePath = json.settings.dccOptions
        .split(' ')
        .find((s) => s.startsWith('-E'))
        ?.replace('-E', '') || '';
    // Use single backslashes for the .dproj path — psSingleQuote() wraps it in
    // single-quoted PS strings where backslash is always literal.
    const projectDproj = json.settings.project.replace(/\.dpr$/i, '.dproj').replace(/\//g, '\\');
    const resolvedExe = path.resolve(projectDir, exePath, projectName + '.exe');
    const resolvedExeDir = path.dirname(resolvedExe);
    // Compute TMROOT as two levels up from the project directory (src/[project]/ → repo root).
    const tmRoot = path.resolve(projectDir, '..', '..').replace(/\//g, '\\');
    const tmLib = path.join(tmRoot, 'lib');
    // Inject DCC_UnitSearchPath only for projects that don't already define it in their
    // .dproj.  We set it as an env var rather than a /p: arg because the semicolon-
    // separated path list causes PowerShell to split it into multiple MSBuild switches.
    // MSBuild automatically imports environment variables as properties.
    const dprojFsPath = json.settings.project.replace(/\.dpr$/i, '.dproj').replace(/\//g, '\\');
    let dprojContent = '';
    try {
        dprojContent = (0, fs_1.readFileSync)(dprojFsPath, 'utf8');
    }
    catch { /* file unreadable */ }
    const needsSearchPath = !dprojContent.includes('DCC_UnitSearchPath');
    // When the .dproj has no DCC_UnitSearchPath we build one from the -U flag
    // inside dccOptions.  Those are real Windows filesystem paths (the exact
    // paths DCC32 used when the IDE last compiled the project), unlike
    // browsingPaths which are file:// URI-encoded strings for LSP navigation only.
    const searchPathEnv = needsSearchPath
        ? `$env:DCC_UnitSearchPath = ${psSingleQuote(buildDccUnitSearchPath(json.settings.dccOptions, tmLib))}`
        : '';
    const wsPath = vscode_1.workspace.workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder
    const filePath = vscode_1.Uri.file(`${wsPath}/.vscode/delphi/scripts/${projectName}_run.ps1`);
    const starterPath = vscode_1.Uri.file(`${wsPath}/.vscode/delphi/scripts/run.bat`);
    const script = `
$PROJECT = ${psSingleQuote(projectDproj)}
$TMROOT = ${psSingleQuote(tmRoot)}
$TMLIB  = ${psSingleQuote(tmLib)}
$env:TMROOT = $TMROOT
$env:TMLIB  = $TMLIB
${searchPathEnv}
$MSBUILD_DIR = [System.Environment]::GetEnvironmentVariable('FrameworkDir', [System.EnvironmentVariableTarget]::Process)

& $MSBUILD_DIR\\MSBuild.exe $PROJECT "/t:Clean,Make"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host ""

# Check if an argument is provided
if ($args.Count -eq 0) {
    exit 0
}


Write-Host "Running ${projectName}..."
$exePath = ${psSingleQuote(resolvedExe)}
$process = Start-Process -FilePath $exePath -WorkingDirectory ${psSingleQuote(resolvedExeDir)} -PassThru

Wait-Process -Id $process.Id
`;
    const wsedit = new vscode_1.WorkspaceEdit();
    wsedit.createFile(filePath, {
        overwrite: true,
        contents: Buffer.from(script),
    });
    wsedit.createFile(starterPath, {
        overwrite: true,
        contents: Buffer.from(`
@echo off
if "%1"=="" (
    echo No PowerShell script specified.
    exit /b 1
)
call "${(0, constantUtils_1.getDelphiBinDirectory)()}\\rsvars.bat"
set PSScript=%1
shift
powershell -File "%PSScript%" %*
      `),
    });
    vscode_1.workspace.applyEdit(wsedit);
}
//# sourceMappingURL=scripts.js.map