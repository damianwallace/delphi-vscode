import { spawn } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import path = require('path');
import { fileURLToPath } from 'url';
import {
    commands,
    ConfigurationChangeEvent,
    ExtensionContext,
    QuickPickItem,
    QuickPickOptions,
    Uri,
    window,
    workspace,
} from 'vscode';
import { DidChangeConfigurationNotification, LanguageClient } from 'vscode-languageclient/node';
import { initRunScript } from '../runner/scripts';
import { fileExists } from '../utils/fileUtils';
import { getDelphiBinDirectory } from '../utils/constantUtils';

// Tracks project dirs for which the IDE has already been launched this session.
const _idelaunchedForDirs = new Set<string>();

/**
 * Normalises `delphi.configFile` / `.delphilsp.json` `settings.project` values to a real
 * filesystem path. Workspace settings and Delphi often store `file:///c%3A/...` URIs;
 * ad‑hoc `decodeURI` + string replaces mishandle those and can yield paths like
 * `C:\\repo\\c%3A\\...` after `path.resolve`, breaking run cwd and MSBuild.
 */
export function uriOrPathToFsPath(value: string): string {
    const v = value.trim();
    if (!v) return v;
    if (/^file:/i.test(v)) {
        try {
            return fileURLToPath(v);
        } catch {
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
                return fileURLToPath(c);
            } catch {
                /* try next */
            }
        }
        try {
            return decodeURIComponent(normalized);
        } catch {
            return v;
        }
    }
    return v;
}

/**
 * Init configuration file. Loads an existing config file or propmts user to pick one.
 */
export async function initConfig() {
    // Get config for the extension
    const config = workspace.getConfiguration('delphi');
    // Get current config file
    const configFile = config.get<string>('configFile');
    // Treat the sentinel value identically to an empty string so that when
    // setupLSPConfigWatcher fires initConfig() after a new .delphilsp.json is
    // created, we re-scan via collectLSPConfigFiles() rather than falling into
    // the "previously set config that no longer exists" branch.
    if (configFile.length == 0 || configFile === 'no_config_available') {
        // Get config file
        const configFiles = await collectLSPConfigFiles();
        if (configFiles.length == 0) {
            commands.executeCommand('setContext', 'delphi.projectReady', false);
            updateConfigWithSelectedItem('no_config_available');
            const activeFile = window.activeTextEditor?.document.uri.fsPath;
            const activeDir = activeFile ? path.dirname(activeFile) : undefined;
            const dprojPath = activeDir ? findNearestDproj(activeDir) : undefined;
            if (activeDir) {
                _idelaunchedForDirs.add(activeDir.toLowerCase());
            }
            launchDelphiIDE(dprojPath);
            window.showWarningMessage(
                'Delphi: No .delphilsp.json found — Delphi IDE opened. Enable "Generate LSP Config" in ' +
                    'Tools › Options › Editor › Language › Delphi › Code Insight, then close and reopen the project. ' +
                    'VS Code will load the config automatically.',
                'Browse for existing config…'
            ).then((selection) => {
                if (selection === 'Browse for existing config…') {
                    commands.executeCommand('delphi.selectConfigFile');
                }
            });
        } else if (configFiles.length == 1) {
            updateConfigWithSelectedItem(configFiles[0]);
        } else {
            // Multiple configs: open the picker directly
            commands.executeCommand('setContext', 'delphi.projectReady', false);
            window.showErrorMessage(
                'Delphi: Multiple .delphilsp.json files found — select the active project.',
                'Select project config'
            ).then((selection) => {
                if (selection === 'Select project config') {
                    commands.executeCommand('delphi.selectConfigFile');
                }
            });
        }
    } else if (!(await fileExists(Uri.parse(configFile)))) {
        // If previously set LSP config file doesn't exist any more, open picker immediately
        commands.executeCommand('setContext', 'delphi.projectReady', false);
        updateConfigWithSelectedItem('no_config_available');
        window.showErrorMessage(
            'Delphi: Project config file no longer exists — select a new one.',
            'Select project config'
        ).then((selection) => {
            if (selection === 'Select project config') {
                commands.executeCommand('delphi.selectConfigFile');
            }
        });
    } else {
        // If everything good already, display load message to the user
        commands.executeCommand('setContext', 'delphi.projectReady', true);
        window.showInformationMessage(
            'Delphi: Loaded configured project ' + path.basename(configFile)
        );
        initRunScript(); // Make sure the run script has been created
    }
}

/**
 * Updates the LSP config file path in workspace settings and notifies of the loading of the LSP config
 *
 * @param configFile URI of the config file
 */
export function updateConfigWithSelectedItem(configFile: UriItem | string) {
    const config = workspace.getConfiguration('delphi');
    if (typeof configFile === 'string') {
        commands.executeCommand('setContext', 'delphi.projectReady', false);
        config.update('configFile', configFile); // No config file was found
    } else {
        commands.executeCommand('setContext', 'delphi.projectReady', true);
        config.update('configFile', configFile.uri);
        window.showInformationMessage('Loaded project ' + path.basename(configFile.label));
        initRunScript(configFile.uri); // Init run script for the new project
    }
}

/**
 * Lists all Delphi LSP config files that are present in the currently open folder
 *
 * @returns List of delphi LSP config files from the folder
 */
export async function collectLSPConfigFiles(): Promise<UriItem[]> {
    const fileUris = await workspace.findFiles('**/*.delphilsp.json');

    return fileUris.map<UriItem>((uri) => ({
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
export function handleDidChangeConfiguration(
    event: ConfigurationChangeEvent,
    client: LanguageClient
) {
    if (event.affectsConfiguration('delphi')) {
        initRunScript();
        sendDidChangeConfiguration(client);
    }
}

/**
 * Send config change to the client
 */
export async function sendDidChangeConfiguration(client: LanguageClient) {
    const config = workspace.getConfiguration('delphi');

    const settings = {
        settings: {
            settingsFile: config.get<string>('configFile'),
        },
    };

    client.sendNotification(DidChangeConfigurationNotification.type, settings);
}

/**
 * Display the config picker
 */
export async function pickConfig() {
    // Quick-pick select for LSP config file
    const pickerItems = await collectLSPConfigFiles();
    const pickOptions: QuickPickOptions = {
        placeHolder: "Select the project's .delphilsp.json file",
    };

    window.showQuickPick<UriItem>(pickerItems, pickOptions).then((selectedPickerItem) => {
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
export function getConfigFilePath(): string {
    const config = workspace.getConfiguration('delphi');
    const path = config.get<string>('configFile');
    return path;
}

/**
 * Load config file as JSON
 *
 * @returns json containing the config file
 */
export async function loadConfigFileJson(config?: string) {
    if (!config) {
        const storedValue = getConfigFilePath();
        if (storedValue === 'no_config_available') {
            return false;
        }
        config = storedValue;
    }
    const configFsPath = uriOrPathToFsPath(config);
    const data = readFileSync(configFsPath, 'utf8');
    const json: DelphiLSPConfig = await JSON.parse(data);
    json.settings.project = uriOrPathToFsPath(json.settings.project);
    return json as DelphiLSPConfig;
}

/**
 * Walk up from startDir to the workspace root looking for the nearest .dproj file.
 */
export function findNearestDproj(startDir: string): string | undefined {
    const wsRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
    let dir = startDir;
    while (true) {
        try {
            const entries = readdirSync(dir);
            const dproj = entries.find((f) => f.toLowerCase().endsWith('.dproj'));
            if (dproj) return path.join(dir, dproj);
        } catch { /* skip unreadable dirs */ }
        const parent = path.dirname(dir);
        if (parent === dir || (wsRoot && dir.toLowerCase() === wsRoot.toLowerCase())) break;
        dir = parent;
    }
    return undefined;
}

/**
 * Walk up from startDir looking for the nearest .delphilsp.json file.
 */
export function findNearestLSPConfig(startDir: string): string | undefined {
    const wsRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
    let dir = startDir;
    while (true) {
        try {
            const entries = readdirSync(dir);
            const config = entries.find((f) => f.toLowerCase().endsWith('.delphilsp.json'));
            if (config) return path.join(dir, config);
        } catch { /* skip unreadable dirs */ }
        const parent = path.dirname(dir);
        if (parent === dir || (wsRoot && dir.toLowerCase() === wsRoot.toLowerCase())) break;
        dir = parent;
    }
    return undefined;
}

/**
 * Launch the Delphi IDE (bds.exe) with the given project pre-loaded.
 * The process is detached so closing VS Code does not kill the IDE.
 */
function launchDelphiIDE(dprojPath?: string): void {
    const bdsExe = path.join(getDelphiBinDirectory(), 'bds.exe');
    const args = ['-pDelphi'];
    if (dprojPath) args.push(dprojPath);
    try {
        const proc = spawn(bdsExe, args, { detached: true, stdio: 'ignore' });
        proc.unref();
    } catch { /* bds.exe not found — the toast still guides the user */ }
}

/**
 * Register a FileSystemWatcher for .delphilsp.json files so the extension
 * auto-loads a config the moment the user saves one from the Delphi IDE.
 *
 * Also listens for active editor changes to detect when the user switches to
 * a Pascal file whose project has no LSP config yet, and opens the IDE for them.
 */
export function setupLSPConfigWatcher(context: ExtensionContext): void {
    // Auto-reload when any .delphilsp.json is created in the workspace.
    const watcher = workspace.createFileSystemWatcher('**/*.delphilsp.json');
    watcher.onDidCreate(() => initConfig());
    context.subscriptions.push(watcher);

    // Per-project check: when the active editor changes to a Pascal file,
    // see if that project already has a config. If not, open the IDE once.
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) return;
            if (!editor.document.uri.fsPath.match(/\.(pas|dpr|dpk|inc)$/i)) return;

            const fileDir = path.dirname(editor.document.uri.fsPath);
            const key = fileDir.toLowerCase();

            // Only offer once per project dir per session.
            if (_idelaunchedForDirs.has(key)) return;
            if (findNearestLSPConfig(fileDir)) return; // already has a config

            _idelaunchedForDirs.add(key);
            const dprojPath = findNearestDproj(fileDir);
            launchDelphiIDE(dprojPath);
            window.showWarningMessage(
                'Delphi: No LSP config for this project — Delphi IDE opened. ' +
                    'Enable "Generate LSP Config" in Tools › Options › Editor › Language › Delphi › Code Insight, ' +
                    'then close and reopen the project. VS Code will load the config automatically.'
            );
        })
    );
}

class UriItem implements QuickPickItem {
    label: string;
    detail?: string;
    uri: string;
}

export interface DelphiLSPConfig {
    settings: Settings;
}

export interface Settings {
    project: string;
    dllname: string;
    dccOptions: string;
    projectFiles: ProjectFile[];
    includeDCUsInUsesCompletion: boolean;
    browsingPaths: string[];
}

export interface ProjectFile {
    name: string;
    file: string;
}
