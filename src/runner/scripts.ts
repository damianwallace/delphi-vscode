import path = require('path');
import { readFileSync } from 'fs';
import { loadConfigFileJson } from '../client/configFile';
import { Uri, workspace, WorkspaceEdit } from 'vscode';
import { getDelphiBinDirectory } from '../utils/constantUtils';

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
function psSingleQuote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Inits the run script for the current project.
 * Creates a .bat file in the .vscode directory of current workspace.
 *
 * @returns undefined
 */
export async function initRunScript(config?: string) {
    const json = await loadConfigFileJson(config);
    if (json === false) return; // No config file has been set

    const projectDir = path.dirname(json.settings.project);
    const projectName = path.basename(json.settings.project).split('.')[0];
    const exePath =
        json.settings.dccOptions
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
    const tmLib  = path.join(tmRoot, 'lib');

    // Inject DCC_UnitSearchPath only for projects that don't already define it in their
    // .dproj.  We set it as an env var rather than a /p: arg because the semicolon-
    // separated path list causes PowerShell to split it into multiple MSBuild switches.
    // MSBuild automatically imports environment variables as properties.
    const dprojFsPath = json.settings.project.replace(/\.dpr$/i, '.dproj').replace(/\//g, '\\');
    let dprojContent = '';
    try { dprojContent = readFileSync(dprojFsPath, 'utf8'); } catch { /* file unreadable */ }
    const needsSearchPath = !dprojContent.includes('DCC_UnitSearchPath');
    // Escape any single quotes in browsing paths (PowerShell '' is the only escape in single-quoted strings).
    const escapedBrowsingPaths = json.settings.browsingPaths.map((p) => p.replace(/'/g, "''")).join(';');
    const searchPathEnv = needsSearchPath
        ? `$env:DCC_UnitSearchPath = '${escapedBrowsingPaths}'`
        : '';

    const wsPath = workspace.workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder
    const filePath = Uri.file(`${wsPath}/.vscode/delphi/scripts/${projectName}_run.ps1`);
    const starterPath = Uri.file(`${wsPath}/.vscode/delphi/scripts/run.bat`);

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

    const wsedit = new WorkspaceEdit();
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
call "${getDelphiBinDirectory()}\\rsvars.bat"
set PSScript=%1
shift
powershell -File "%PSScript%" %*
      `),
    });
    workspace.applyEdit(wsedit);
}
