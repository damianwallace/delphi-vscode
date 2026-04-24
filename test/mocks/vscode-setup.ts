/**
 * Intercepts require('vscode') and 'vscode-languageclient/node' before any source
 * module loads them, redirecting to our stubs. Must be loaded before any test
 * files via --require in .mocharc.json.
 */
import Module = require('module');

const orig = (Module as any)._load;
(Module as any)._load = function (name: string, ...args: any[]) {
    if (name === 'vscode') return require('./vscode');
    if (name === 'vscode-languageclient/node' || name === 'vscode-languageclient') {
        return require('./vscode-languageclient');
    }
    return orig.call(this, name, ...args);
};
