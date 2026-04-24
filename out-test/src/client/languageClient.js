"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateLSPClient = activateLSPClient;
exports.deactivateLSPClient = deactivateLSPClient;
exports.registerLSPCommands = registerLSPCommands;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const constants_1 = require("../constants");
const configFile_1 = require("./configFile");
const constantUtils_1 = require("../utils/constantUtils");
let client;
/**
 * Activate LSP Client
 *
 * @param context Extension context
 */
async function activateLSPClient(context) {
    // Get config for the extension
    const config = vscode_1.workspace.getConfiguration('delphi');
    const binPath = config.get('bin');
    // Get full path for the LSP executable
    const delphiLSP = path.join((0, constantUtils_1.getDelphiBinDirectory)(), constants_1.LSP_BIN);
    // Get current folder
    let folder = 'nofolderOpened';
    if (vscode_1.workspace.workspaceFolders) {
        folder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
    }
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: {
            command: delphiLSP,
            args: ['-LogModes', config.get('logModes'), '-LSPLogging', folder],
        },
        debug: {
            command: delphiLSP,
            args: ['-LogModes', config.get('logModes'), '-LSPLogging', folder],
        },
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ language: 'objectpascal' }],
        revealOutputChannelOn: node_1.RevealOutputChannelOn.Never,
        initializationOptions: {
            serverType: config.get('serverType'),
            agentCount: config.get('agentCount'),
        },
    };
    // Create the language client and start it.
    client = new node_1.LanguageClient('delphi-lsp', 'Delphi Language Server', serverOptions, clientOptions);
    client.start();
    // Send LSP config to the client initially and on update
    (0, configFile_1.sendDidChangeConfiguration)(client);
    context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration((e) => (0, configFile_1.handleDidChangeConfiguration)(e, client)));
    (0, configFile_1.initConfig)();
}
/**
 * Deactivate the LSP client
 *
 * @returns Undefined if no client is set, else stop promise
 */
function deactivateLSPClient() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
/**
 * Registers all LSP related commands for the extension
 *
 * @param context Extension context
 */
function registerLSPCommands(context) {
    // Register selectConfigFile command
    context.subscriptions.push(vscode_1.commands.registerCommand('delphi.selectConfigFile', async () => {
        (0, configFile_1.pickConfig)();
    }));
}
//# sourceMappingURL=languageClient.js.map