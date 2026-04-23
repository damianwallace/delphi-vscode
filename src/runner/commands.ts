import { commands, ExtensionContext, Uri } from 'vscode';
import { RunManager } from './runManager';
import { initRunScript } from './scripts';

/**
 * Register code running related commands for the extenstion
 *
 * @param context extension context
 */
export default function registerRunnerCommands(context: ExtensionContext) {
    const manager = new RunManager();

    context.subscriptions.push(
        // VS Code passes the current document URI as the first argument when the
        // command is invoked from editor/title/run context.
        commands.registerCommand('delphi.run', async (resourceUri?: Uri) => {
            await manager.run(resourceUri);
        })
    );

    context.subscriptions.push(
        commands.registerCommand('delphi.regenRunScript', async () => {
            await initRunScript();
        })
    );

    context.subscriptions.push(
        commands.registerCommand('delphi.configNotReady', () => {
            commands.executeCommand('delphi.selectConfigFile');
        })
    );
}
