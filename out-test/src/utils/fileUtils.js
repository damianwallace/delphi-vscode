"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highestVersion = highestVersion;
exports.fileExists = fileExists;
const fs_1 = require("fs");
const semver_1 = require("semver");
const vscode_1 = require("vscode");
/**
 * Function to find the highest semver folder from a path. Intended to work with only Delphi and MSFramework folders.
 *
 * @param path path to directory to traverse
 * @returns folder name with highest semver
 */
function highestVersion(path) {
    const ver = (0, fs_1.readdirSync)(path, { withFileTypes: true })
        .filter((name) => name.isDirectory() && (0, semver_1.valid)((0, semver_1.coerce)(name.name)))
        .map((el) => el.name)
        .reduce((highest, current) => {
        return (0, semver_1.gt)((0, semver_1.coerce)(current), (0, semver_1.coerce)(highest)) ? current : highest;
    }, '0.0.0');
    if (ver === '0.0.0')
        throw "Couldn't find suitable installations in " + path;
    return ver;
}
/**
 * Checks if a file exists in a path
 *
 * @param uri File path as URI
 * @returns boolean of if file exists
 */
async function fileExists(uri) {
    if (uri.path === '/')
        return false;
    try {
        await vscode_1.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=fileUtils.js.map