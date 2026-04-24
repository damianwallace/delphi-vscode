import { commands, ExtensionContext } from 'vscode';
import {
    activateLSPClient,
    deactivateLSPClient,
    registerLSPCommands,
} from './client/languageClient';
import { setupLSPConfigWatcher } from './client/configFile';
import registerRunnerCommands from './runner/commands';

/**
 * Activate the extension
 *
 * @param context Context for the extension
 */
export async function activate(context: ExtensionContext) {
    // Mark project as not ready immediately so the loading icon shows
    // before the async config check completes.
    commands.executeCommand('setContext', 'delphi.projectReady', false);

    registerLSPCommands(context);
    await activateLSPClient(context);
    registerRunnerCommands(context);
    setupLSPConfigWatcher(context);
}

/**
 * Deactivate the extension
 *
 * @returns LSP deactivate
 */
export function deactivate(): Thenable<void> | undefined {
    // Only LSP to stop currently
    return deactivateLSPClient();
}
