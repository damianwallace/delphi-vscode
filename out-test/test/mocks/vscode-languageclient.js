"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageClient = exports.DidChangeConfigurationNotification = void 0;
/**
 * Minimal stub of vscode-languageclient/node.
 * Only the symbols actually imported by configFile.ts are needed:
 *   - DidChangeConfigurationNotification
 *   - LanguageClient
 */
exports.DidChangeConfigurationNotification = {
    type: 'workspace/didChangeConfiguration',
};
class LanguageClient {
    sendNotification(_type, _params) {
        return Promise.resolve();
    }
}
exports.LanguageClient = LanguageClient;
//# sourceMappingURL=vscode-languageclient.js.map