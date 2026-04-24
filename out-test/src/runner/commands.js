"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerRunnerCommands;
const vscode_1 = require("vscode");
const runManager_1 = require("./runManager");
const scripts_1 = require("./scripts");
/**
 * Register code running related commands for the extenstion
 *
 * @param context extension context
 */
function registerRunnerCommands(context) {
    const manager = new runManager_1.RunManager();
    context.subscriptions.push(
    // VS Code passes the current document URI as the first argument when the
    // command is invoked from editor/title/run context.
    vscode_1.commands.registerCommand('delphi.run', async (resourceUri) => {
        await manager.run(resourceUri);
    }));
    context.subscriptions.push(vscode_1.commands.registerCommand('delphi.regenRunScript', async () => {
        await (0, scripts_1.initRunScript)();
    }));
    context.subscriptions.push(vscode_1.commands.registerCommand('delphi.configNotReady', () => {
        vscode_1.commands.executeCommand('delphi.selectConfigFile');
    }));
}
//# sourceMappingURL=commands.js.map