"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunManager = void 0;
const path = require("path");
const configFile_1 = require("../client/configFile");
const vscode_1 = require("vscode");
const fs_1 = require("fs");
class RunManager {
    /**
     * Runs the project that owns the currently active editor file.
     *
     * resourceUri is passed automatically by VS Code when the command is
     * invoked from the editor/title/run button. Falls back to
     * window.activeTextEditor if not provided.
     *
     * Errors and stops if:
     *   - no active file can be determined
     *   - no .delphilsp.json exists in the active file's directory
     *   - the .delphilsp.json found does not match the configured project
     *
     * Never silently builds a different project than the one the user is editing.
     */
    async run(resourceUri) {
        // Resolve the active file: prefer the URI passed by VS Code from the
        // title bar button, fall back to the focused editor.
        const activeUri = resourceUri ?? vscode_1.window.activeTextEditor?.document.uri;
        if (!activeUri) {
            vscode_1.window.showErrorMessage('Delphi: Open a Pascal file from the project you want to build, then press Run.');
            return;
        }
        const activeDir = path.dirname(activeUri.fsPath);
        // Look for a .delphilsp.json in the same folder as the active file.
        const configInActiveDir = this.findConfigInDir(activeDir);
        if (!configInActiveDir) {
            vscode_1.window.showErrorMessage(`Delphi: No .delphilsp.json found in "${activeDir}". ` +
                `Generate one from the Delphi IDE (Tools > Options > Editor > Language > Delphi > ` +
                `Code Insight > Generate LSP Config) and add it to the repo.`);
            return;
        }
        // If the found config doesn't match the configured project, warn and stop.
        // The user must switch manually via "Delphi: Select Config File".
        const storedConfig = vscode_1.workspace.getConfiguration('delphi').get('configFile') ?? '';
        const storedConfigPath = (0, configFile_1.uriOrPathToFsPath)(storedConfig);
        const normalizedStored = storedConfigPath.replace(/\//g, '\\').toLowerCase();
        const normalizedFound = configInActiveDir.replace(/\//g, '\\').toLowerCase();
        if (normalizedStored !== normalizedFound) {
            const foundName = path.basename(configInActiveDir);
            const storedName = path.basename(storedConfigPath);
            vscode_1.window.showWarningMessage(`Delphi: Active file belongs to "${foundName}" but the configured project is "${storedName}". ` +
                `Use "Delphi: Select Config File" to switch projects.`);
            return;
        }
        // Active file's project matches the configured project — proceed.
        const json = await (0, configFile_1.loadConfigFileJson)(storedConfig);
        if (json === false) {
            vscode_1.window.showWarningMessage('Delphi: No config file has been set. Use "Delphi: Select Config File" to choose a project.');
            return;
        }
        const dccSettings = json.settings;
        const projectDir = path.dirname(dccSettings.project);
        const projectName = path.basename(dccSettings.project).split('.')[0];
        const wsPath = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        const compileProcess = new vscode_1.ProcessExecution(`${wsPath}/.vscode/delphi/scripts/run.bat`, [`${wsPath}/.vscode/delphi/scripts/${projectName}_run.ps1`, 'run'], { cwd: projectDir });
        const task = new vscode_1.Task({ type: 'Run' }, vscode_1.TaskScope.Workspace, 'Delphi: Run', 'Delphi', compileProcess);
        const execution = await vscode_1.tasks.executeTask(task);
        vscode_1.tasks.onDidEndTaskProcess(async (e) => {
            if (e.execution === execution) {
                if (e.exitCode === 0) {
                    vscode_1.window.showInformationMessage('Delphi: Exited successfully!');
                }
                else {
                    vscode_1.window.showErrorMessage('Delphi: Error running!');
                }
            }
        });
    }
    /**
     * Looks for a .delphilsp.json file in the given directory.
     * Returns the full path if found, undefined otherwise.
     */
    findConfigInDir(dir) {
        try {
            const entries = (0, fs_1.readdirSync)(dir);
            const config = entries.find((f) => f.toLowerCase().endsWith('.delphilsp.json'));
            return config ? path.join(dir, config) : undefined;
        }
        catch {
            return undefined;
        }
    }
}
exports.RunManager = RunManager;
//# sourceMappingURL=runManager.js.map