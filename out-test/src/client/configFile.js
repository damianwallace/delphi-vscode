"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uriOrPathToFsPath = uriOrPathToFsPath;
exports.initConfig = initConfig;
exports.updateConfigWithSelectedItem = updateConfigWithSelectedItem;
exports.collectLSPConfigFiles = collectLSPConfigFiles;
exports.handleDidChangeConfiguration = handleDidChangeConfiguration;
exports.sendDidChangeConfiguration = sendDidChangeConfiguration;
exports.pickConfig = pickConfig;
exports.getConfigFilePath = getConfigFilePath;
exports.loadConfigFileJson = loadConfigFileJson;
exports.findNearestDproj = findNearestDproj;
exports.findNearestLSPConfig = findNearestLSPConfig;
exports.setupLSPConfigWatcher = setupLSPConfigWatcher;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path = require("path");
const url_1 = require("url");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const scripts_1 = require("../runner/scripts");
const fileUtils_1 = require("../utils/fileUtils");
const constantUtils_1 = require("../utils/constantUtils");
// Tracks project dirs for which the IDE has already been launched this session.
const _idelaunchedForDirs = new Set();
/**
 * Normalises `delphi.configFile` / `.delphilsp.json` `settings.project` values to a real
 * filesystem path. Workspace settings and Delphi often store `file:///c%3A/...` URIs;
 * ad‑hoc `decodeURI` + string replaces mishandle those and can yield paths like
 * `C:\\repo\\c%3A\\...` after `path.resolve`, breaking run cwd and MSBuild.
 */
function uriOrPathToFsPath(value) {
    const v = value.trim();
    if (!v)
        return v;
    if (/^file:/i.test(v)) {
        try {
            return (0, url_1.fileURLToPath)(v);
        }
        catch {
            /* fall through */
        }
    }
    // Percent-encoded path without a scheme (e.g. `c%3A\\tmwin\\...` from tooling).
    if (/%[0-9A-Fa-f]{2}/.test(v)) {
        const normalized = v.replace(/\\/g, '/');
        const candidates = normalized.startsWith('/')
            ? [`file://${normalized}`]
            : [`file:///${normalized}`];
        for (const c of candidates) {
            try {
                return (0, url_1.fileURLToPath)(c);
            }
            catch {
                /* try next */
            }
        }
        try {
            return decodeURIComponent(normalized);
        }
        catch {
            return v;
        }
    }
    return v;
}
/**
 * Init configuration file. Loads an existing config file or propmts user to pick one.
 */
async function initConfig() {
    // Get config for the extension
    const config = vscode_1.workspace.getConfiguration('delphi');
    // Get current config file
    const configFile = config.get('configFile');
    // Treat the sentinel value identically to an empty string so that when
    // setupLSPConfigWatcher fires initConfig() after a new .delphilsp.json is
    // created, we re-scan via collectLSPConfigFiles() rather than falling into
    // the "previously set config that no longer exists" branch.
    if (configFile.length == 0 || configFile === 'no_config_available') {
        // Get config file
        const configFiles = await collectLSPConfigFiles();
        if (configFiles.length == 0) {
            vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', false);
            updateConfigWithSelectedItem('no_config_available');
            const activeFile = vscode_1.window.activeTextEditor?.document.uri.fsPath;
            const activeDir = activeFile ? path.dirname(activeFile) : undefined;
            const dprojPath = activeDir ? findNearestDproj(activeDir) : undefined;
            if (activeDir) {
                _idelaunchedForDirs.add(activeDir.toLowerCase());
            }
            launchDelphiIDE(dprojPath);
            vscode_1.window.showWarningMessage('Delphi: No .delphilsp.json found — Delphi IDE opened. Enable "Generate LSP Config" in ' +
                'Tools › Options › Editor › Language › Delphi › Code Insight, then close and reopen the project. ' +
                'VS Code will load the config automatically.', 'Browse for existing config…').then((selection) => {
                if (selection === 'Browse for existing config…') {
                    vscode_1.commands.executeCommand('delphi.selectConfigFile');
                }
            });
        }
        else if (configFiles.length == 1) {
            updateConfigWithSelectedItem(configFiles[0]);
        }
        else {
            // Multiple configs: open the picker directly
            vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', false);
            vscode_1.window.showErrorMessage('Delphi: Multiple .delphilsp.json files found — select the active project.', 'Select project config').then((selection) => {
                if (selection === 'Select project config') {
                    vscode_1.commands.executeCommand('delphi.selectConfigFile');
                }
            });
        }
    }
    else if (!(await (0, fileUtils_1.fileExists)(vscode_1.Uri.parse(configFile)))) {
        // If previously set LSP config file doesn't exist any more, open picker immediately
        vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', false);
        updateConfigWithSelectedItem('no_config_available');
        vscode_1.window.showErrorMessage('Delphi: Project config file no longer exists — select a new one.', 'Select project config').then((selection) => {
            if (selection === 'Select project config') {
                vscode_1.commands.executeCommand('delphi.selectConfigFile');
            }
        });
    }
    else {
        // If everything good already, display load message to the user
        vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', true);
        vscode_1.window.showInformationMessage('Delphi: Loaded configured project ' + path.basename(configFile));
        (0, scripts_1.initRunScript)(); // Make sure the run script has been created
    }
}
/**
 * Updates the LSP config file path in workspace settings and notifies of the loading of the LSP config
 *
 * @param configFile URI of the config file
 */
function updateConfigWithSelectedItem(configFile) {
    const config = vscode_1.workspace.getConfiguration('delphi');
    if (typeof configFile === 'string') {
        vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', false);
        config.update('configFile', configFile); // No config file was found
    }
    else {
        vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', true);
        config.update('configFile', configFile.uri);
        vscode_1.window.showInformationMessage('Loaded project ' + path.basename(configFile.label));
        (0, scripts_1.initRunScript)(configFile.uri); // Init run script for the new project
    }
}
/**
 * Lists all Delphi LSP config files that are present in the currently open folder
 *
 * @returns List of delphi LSP config files from the folder
 */
async function collectLSPConfigFiles() {
    const fileUris = await vscode_1.workspace.findFiles('**/*.delphilsp.json');
    return fileUris.map((uri) => ({
        label: path.basename(uri.fsPath),
        detail: path.dirname(uri.fsPath),
        uri: uri.toString(),
    }));
}
/**
 * Handle config changes if changed from the workspace settings.
 * Sends the new file to the client and inits a new run script.
 *
 * @param event Configuration change event
 */
function handleDidChangeConfiguration(event, client) {
    if (event.affectsConfiguration('delphi')) {
        (0, scripts_1.initRunScript)();
        sendDidChangeConfiguration(client);
    }
}
/**
 * Send config change to the client
 */
async function sendDidChangeConfiguration(client) {
    const config = vscode_1.workspace.getConfiguration('delphi');
    const settings = {
        settings: {
            settingsFile: config.get('configFile'),
        },
    };
    client.sendNotification(node_1.DidChangeConfigurationNotification.type, settings);
}
/**
 * Display the config picker
 */
async function pickConfig() {
    // Quick-pick select for LSP config file
    const pickerItems = await collectLSPConfigFiles();
    const pickOptions = {
        placeHolder: "Select the project's .delphilsp.json file",
    };
    vscode_1.window.showQuickPick(pickerItems, pickOptions).then((selectedPickerItem) => {
        if (selectedPickerItem !== undefined) {
            updateConfigWithSelectedItem(selectedPickerItem);
        }
    });
}
/**
 * Get current config file path
 *
 * @returns current path of the config file from workspace settings
 */
function getConfigFilePath() {
    const config = vscode_1.workspace.getConfiguration('delphi');
    const path = config.get('configFile');
    return path;
}
/**
 * Load config file as JSON
 *
 * @returns json containing the config file
 */
async function loadConfigFileJson(config) {
    if (!config) {
        const storedValue = getConfigFilePath();
        if (storedValue === 'no_config_available') {
            return false;
        }
        config = storedValue;
    }
    const configFsPath = uriOrPathToFsPath(config);
    const data = (0, fs_1.readFileSync)(configFsPath, 'utf8');
    const json = await JSON.parse(data);
    json.settings.project = uriOrPathToFsPath(json.settings.project);
    return json;
}
/**
 * Walk up from startDir to the workspace root looking for the nearest .dproj file.
 */
function findNearestDproj(startDir) {
    const wsRoot = vscode_1.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let dir = startDir;
    while (true) {
        try {
            const entries = (0, fs_1.readdirSync)(dir);
            const dproj = entries.find((f) => f.toLowerCase().endsWith('.dproj'));
            if (dproj)
                return path.join(dir, dproj);
        }
        catch { /* skip unreadable dirs */ }
        const parent = path.dirname(dir);
        if (parent === dir || (wsRoot && dir.toLowerCase() === wsRoot.toLowerCase()))
            break;
        dir = parent;
    }
    return undefined;
}
/**
 * Walk up from startDir looking for the nearest .delphilsp.json file.
 */
function findNearestLSPConfig(startDir) {
    const wsRoot = vscode_1.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let dir = startDir;
    while (true) {
        try {
            const entries = (0, fs_1.readdirSync)(dir);
            const config = entries.find((f) => f.toLowerCase().endsWith('.delphilsp.json'));
            if (config)
                return path.join(dir, config);
        }
        catch { /* skip unreadable dirs */ }
        const parent = path.dirname(dir);
        if (parent === dir || (wsRoot && dir.toLowerCase() === wsRoot.toLowerCase()))
            break;
        dir = parent;
    }
    return undefined;
}
/**
 * Launch the Delphi IDE (bds.exe) with the given project pre-loaded.
 * The process is detached so closing VS Code does not kill the IDE.
 */
function launchDelphiIDE(dprojPath) {
    const bdsExe = path.join((0, constantUtils_1.getDelphiBinDirectory)(), 'bds.exe');
    const args = ['-pDelphi'];
    if (dprojPath)
        args.push(dprojPath);
    try {
        const proc = (0, child_process_1.spawn)(bdsExe, args, { detached: true, stdio: 'ignore' });
        proc.unref();
    }
    catch { /* bds.exe not found — the toast still guides the user */ }
}
/**
 * Register a FileSystemWatcher for .delphilsp.json files so the extension
 * auto-loads a config the moment the user saves one from the Delphi IDE.
 *
 * Also listens for active editor changes to detect when the user switches to
 * a Pascal file whose project has no LSP config yet, and opens the IDE for them.
 */
function setupLSPConfigWatcher(context) {
    // Auto-reload when any .delphilsp.json is created in the workspace.
    const watcher = vscode_1.workspace.createFileSystemWatcher('**/*.delphilsp.json');
    watcher.onDidCreate(() => initConfig());
    context.subscriptions.push(watcher);
    // Per-project check: when the active editor changes to a Pascal file,
    // see if that project already has a config. If not, open the IDE once.
    context.subscriptions.push(vscode_1.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor)
            return;
        if (!editor.document.uri.fsPath.match(/\.(pas|dpr|dpk|inc)$/i))
            return;
        const fileDir = path.dirname(editor.document.uri.fsPath);
        const key = fileDir.toLowerCase();
        // Only offer once per project dir per session.
        if (_idelaunchedForDirs.has(key))
            return;
        if (findNearestLSPConfig(fileDir))
            return; // already has a config
        _idelaunchedForDirs.add(key);
        const dprojPath = findNearestDproj(fileDir);
        launchDelphiIDE(dprojPath);
        vscode_1.window.showWarningMessage('Delphi: No LSP config for this project — Delphi IDE opened. ' +
            'Enable "Generate LSP Config" in Tools › Options › Editor › Language › Delphi › Code Insight, ' +
            'then close and reopen the project. VS Code will load the config automatically.');
    }));
}
class UriItem {
}
//# sourceMappingURL=configFile.js.map