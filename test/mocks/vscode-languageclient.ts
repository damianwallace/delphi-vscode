/**
 * Minimal stub of vscode-languageclient/node.
 * Only the symbols actually imported by configFile.ts are needed:
 *   - DidChangeConfigurationNotification
 *   - LanguageClient
 */
export const DidChangeConfigurationNotification = {
    type: 'workspace/didChangeConfiguration',
};

export class LanguageClient {
    sendNotification(_type: any, _params?: any): Promise<void> {
        return Promise.resolve();
    }
}
