"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Intercepts require('vscode') and 'vscode-languageclient/node' before any source
 * module loads them, redirecting to our stubs. Must be loaded before any test
 * files via --require in .mocharc.json.
 */
const Module = require("module");
const orig = Module._load;
Module._load = function (name, ...args) {
    if (name === 'vscode')
        return require('./vscode');
    if (name === 'vscode-languageclient/node' || name === 'vscode-languageclient') {
        return require('./vscode-languageclient');
    }
    return orig.call(this, name, ...args);
};
//# sourceMappingURL=vscode-setup.js.map