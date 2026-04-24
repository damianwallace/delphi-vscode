"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode_1 = require("vscode");
const languageClient_1 = require("./client/languageClient");
const configFile_1 = require("./client/configFile");
const commands_1 = require("./runner/commands");
/**
 * Activate the extension
 *
 * @param context Context for the extension
 */
async function activate(context) {
    // Mark project as not ready immediately so the loading icon shows
    // before the async config check completes.
    vscode_1.commands.executeCommand('setContext', 'delphi.projectReady', false);
    (0, languageClient_1.registerLSPCommands)(context);
    await (0, languageClient_1.activateLSPClient)(context);
    (0, commands_1.default)(context);
    (0, configFile_1.setupLSPConfigWatcher)(context);
}
/**
 * Deactivate the extension
 *
 * @returns LSP deactivate
 */
function deactivate() {
    // Only LSP to stop currently
    return (0, languageClient_1.deactivateLSPClient)();
}
//# sourceMappingURL=main.js.map