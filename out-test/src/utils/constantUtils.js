"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelphiBinDirectory = getDelphiBinDirectory;
const vscode_1 = require("vscode");
const fileUtils_1 = require("./fileUtils");
const constants_1 = require("../constants");
/**
 * Get delphi binary path. Tries to load delphi.bin config value. Defaults to newest installation.
 *
 * @returns string
 */
function getDelphiBinDirectory() {
    const config = vscode_1.workspace.getConfiguration('delphi');
    let binPath = config.get('bin');
    try {
        (0, fileUtils_1.fileExists)(vscode_1.Uri.parse(binPath, true)) ? binPath : constants_1.DELPHI_BIN_PATH;
    }
    catch {
        binPath = constants_1.DELPHI_BIN_PATH;
    }
    return binPath;
}
//# sourceMappingURL=constantUtils.js.map