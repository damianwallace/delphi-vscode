"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Branch 2: fix/delphi-active-file-guard
 *
 * Validates the active-file project guard in RunManager.run():
 *   - Errors when there is no active file to determine context
 *   - Errors when the active file's directory has no .delphilsp.json
 *   - Warns (and stops) when the found config does not match the configured project
 *   - Calls tasks.executeTask when the active file's config matches the configured one
 *
 * Also tests findConfigInDir directly (now public) using real temp directories.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode_1 = require("../mocks/vscode");
/** Same encoding shape as VS Code / Delphi sometimes persist for `delphi.configFile`. */
function toPercentEncodedDriveFileUrl(absPath) {
    const norm = path.resolve(absPath).replace(/\\/g, '/');
    const encoded = norm.replace(/^([A-Za-z]):/, '$1%3A');
    return 'file:///' + encoded;
}
require("../mocks/vscode-setup");
const runManager_1 = require("../../src/runner/runManager");
// Helper: create a temporary directory, optionally write a fixture file, return the path.
function makeTempDir(withConfig) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-test-'));
    if (withConfig) {
        fs.writeFileSync(path.join(dir, 'Fixture.delphilsp.json'), JSON.stringify({ settings: { project: withConfig, dccOptions: '', browsingPaths: [], projectFiles: [], dllname: '', includeDCUsInUsesCompletion: false } }));
    }
    return dir;
}
describe('Branch 2 — fix/delphi-active-file-guard', function () {
    let manager;
    const dirsToClean = [];
    beforeEach(function () {
        (0, vscode_1.resetMocks)();
        manager = new runManager_1.RunManager();
    });
    after(function () {
        for (const d of dirsToClean) {
            try {
                fs.rmSync(d, { recursive: true, force: true });
            }
            catch { /* ignore */ }
        }
    });
    it('Guard 1: no resourceUri + no activeTextEditor → showErrorMessage, no executeTask', async function () {
        vscode_1.mockState.activeTextEditor = undefined;
        await manager.run(undefined);
        assert.ok(vscode_1.calls['window.showErrorMessage']?.length > 0, 'Expected showErrorMessage to be called');
        assert.ok(!vscode_1.calls['tasks.executeTask'], 'executeTask must NOT be called');
    });
    it('Guard 2: active file dir has no .delphilsp.json → showErrorMessage, no executeTask', async function () {
        const emptyDir = makeTempDir();
        dirsToClean.push(emptyDir);
        vscode_1.mockState.activeTextEditor = { document: { uri: vscode_1.Uri.file(path.join(emptyDir, 'Test.pas')) } };
        await manager.run(undefined);
        assert.ok(vscode_1.calls['window.showErrorMessage']?.length > 0, 'Expected showErrorMessage (no config)');
        assert.ok(!vscode_1.calls['tasks.executeTask'], 'executeTask must NOT be called');
    });
    it('Guard 3: active file config ≠ configured project → showWarningMessage, no executeTask', async function () {
        const projectDir = makeTempDir('C:\\other\\project\\Other.dpr');
        dirsToClean.push(projectDir);
        // The dir has a config for "Other.dpr" but workspace is configured for "MMDisp.dpr"
        vscode_1.mockState.configFile = 'file:///C:/tmwin/tmwincur/src/mmdisp/MMDisp.delphilsp.json';
        vscode_1.mockState.activeTextEditor = { document: { uri: vscode_1.Uri.file(path.join(projectDir, 'Unit1.pas')) } };
        await manager.run(undefined);
        assert.ok(vscode_1.calls['window.showWarningMessage']?.length > 0, 'Expected showWarningMessage (mismatch)');
        assert.ok(!vscode_1.calls['tasks.executeTask'], 'executeTask must NOT be called');
    });
    it('Guard 4 (happy path): matching config → executeTask is called', async function () {
        const projectDir = makeTempDir();
        dirsToClean.push(projectDir);
        const configPath = path.join(projectDir, 'MyProject.delphilsp.json');
        // Write a proper config with a real dpr path so loadConfigFileJson won't throw.
        const dprPath = path.join(projectDir, 'MyProject.dpr').replace(/\\/g, '/');
        fs.writeFileSync(configPath, JSON.stringify({
            settings: {
                project: dprPath,
                dccOptions: `-E${path.join(projectDir, 'bin')}`,
                browsingPaths: [],
                projectFiles: [],
                dllname: '',
                includeDCUsInUsesCompletion: false,
            },
        }));
        // Create a dummy .dpr so loadConfigFileJson can read it without error.
        fs.writeFileSync(path.join(projectDir, 'MyProject.dpr'), 'program MyProject;\nbegin end.');
        const configUri = 'file:///' + configPath.replace(/\\/g, '/');
        vscode_1.mockState.configFile = configUri;
        vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: projectDir } }];
        vscode_1.mockState.activeTextEditor = { document: { uri: vscode_1.Uri.file(path.join(projectDir, 'Unit1.pas')) } };
        await manager.run(undefined);
        assert.ok(vscode_1.calls['tasks.executeTask']?.length > 0, 'Expected executeTask to be called on happy path');
    });
    it('Guard 4b (happy path): percent-encoded drive in stored file: URI still matches → executeTask', async function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        const projectDir = makeTempDir();
        dirsToClean.push(projectDir);
        const configPath = path.join(projectDir, 'Enc.delphilsp.json');
        const dprPath = path.join(projectDir, 'Enc.dpr').replace(/\\/g, '/');
        fs.writeFileSync(configPath, JSON.stringify({
            settings: {
                project: dprPath,
                dccOptions: `-E${path.join(projectDir, 'bin')}`,
                browsingPaths: [],
                projectFiles: [],
                dllname: '',
                includeDCUsInUsesCompletion: false,
            },
        }));
        fs.writeFileSync(path.join(projectDir, 'Enc.dpr'), 'program Enc;\nbegin end.');
        vscode_1.mockState.configFile = toPercentEncodedDriveFileUrl(configPath);
        vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: projectDir } }];
        vscode_1.mockState.activeTextEditor = { document: { uri: vscode_1.Uri.file(path.join(projectDir, 'Unit1.pas')) } };
        await manager.run(undefined);
        assert.ok(vscode_1.calls['tasks.executeTask']?.length > 0, 'executeTask should run when encoded URI matches disk path');
    });
    it('findConfigInDir: returns path when .delphilsp.json exists in dir', function () {
        const dir = makeTempDir('C:/foo/bar.dpr');
        dirsToClean.push(dir);
        const result = manager.findConfigInDir(dir);
        assert.ok(result, 'Expected a path to be returned');
        assert.ok(result.endsWith('.delphilsp.json'), `Expected .delphilsp.json extension, got: ${result}`);
    });
    it('findConfigInDir: returns undefined for an empty directory', function () {
        const dir = makeTempDir();
        dirsToClean.push(dir);
        const result = manager.findConfigInDir(dir);
        assert.strictEqual(result, undefined);
    });
});
//# sourceMappingURL=runManager.test.js.map