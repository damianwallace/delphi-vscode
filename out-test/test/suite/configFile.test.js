"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Branch 3: feat/delphi-project-ready-watcher
 *
 * Validates:
 *   1. findNearestDproj — walks up dirs to find the nearest .dproj
 *   2. findNearestLSPConfig — walks up dirs to find the nearest .delphilsp.json
 *   3. _idelaunchedForDirs deduplication fix — initConfig's "no configs" path
 *      records the active directory so a second call for the same dir does not
 *      spawn the Delphi IDE again.
 *   4. Sentinel fix — when configFile === 'no_config_available' and a new
 *      .delphilsp.json has been created, initConfig() must re-scan and
 *      auto-load rather than falling into the "file no longer exists" branch.
 *
 * Tests that require real filesystem use mkdtempSync.
 * Tests that need child_process.spawn to be observed use Module._load interception.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const url_1 = require("url");
const vscode_1 = require("../mocks/vscode");
require("../mocks/vscode-setup");
const configFile_1 = require("../../src/client/configFile");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-cfg-test-'));
}
// Create a nested directory tree:
//   root/
//     sub/
//       subsub/
// Returns { root, sub, subsub }
function makeNestedDirs() {
    const root = makeTempDir();
    const sub = path.join(root, 'sub');
    const subsub = path.join(sub, 'subsub');
    fs.mkdirSync(subsub, { recursive: true });
    return { root, sub, subsub };
}
const dirsToClean = [];
// ---------------------------------------------------------------------------
// findNearestDproj
// ---------------------------------------------------------------------------
describe('Branch 3 — feat/delphi-project-ready-watcher', function () {
    beforeEach(function () {
        (0, vscode_1.resetMocks)();
    });
    after(function () {
        for (const d of dirsToClean) {
            try {
                fs.rmSync(d, { recursive: true, force: true });
            }
            catch { /* ignore */ }
        }
    });
    describe('findNearestDproj', function () {
        it('finds .dproj in the same directory', function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);
            fs.writeFileSync(path.join(dir, 'MyApp.dproj'), '<xml/>');
            // Set workspace root below this dir so walk-up stops before reaching OS root.
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            const result = (0, configFile_1.findNearestDproj)(dir);
            assert.ok(result, 'Expected a .dproj path');
            assert.ok(result.endsWith('MyApp.dproj'), `Got: ${result}`);
        });
        it('finds .dproj in a parent directory', function () {
            const { root, sub, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            fs.writeFileSync(path.join(sub, 'Parent.dproj'), '<xml/>');
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = (0, configFile_1.findNearestDproj)(subsub);
            assert.ok(result, 'Expected to walk up and find .dproj in parent');
            assert.ok(result.endsWith('Parent.dproj'), `Got: ${result}`);
        });
        it('returns undefined when no .dproj exists in the tree', function () {
            const { root, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            // workspace root IS root, so the walk stops there and never escapes.
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = (0, configFile_1.findNearestDproj)(subsub);
            assert.strictEqual(result, undefined);
        });
    });
    // ---------------------------------------------------------------------------
    // findNearestLSPConfig
    // ---------------------------------------------------------------------------
    describe('findNearestLSPConfig', function () {
        it('finds .delphilsp.json in the same directory', function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);
            fs.writeFileSync(path.join(dir, 'App.delphilsp.json'), '{}');
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            const result = (0, configFile_1.findNearestLSPConfig)(dir);
            assert.ok(result, 'Expected a .delphilsp.json path');
            assert.ok(result.endsWith('App.delphilsp.json'), `Got: ${result}`);
        });
        it('finds .delphilsp.json in a parent directory', function () {
            const { root, sub, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            fs.writeFileSync(path.join(sub, 'Proj.delphilsp.json'), '{}');
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = (0, configFile_1.findNearestLSPConfig)(subsub);
            assert.ok(result, 'Expected to walk up and find .delphilsp.json');
            assert.ok(result.endsWith('Proj.delphilsp.json'), `Got: ${result}`);
        });
        it('returns undefined when no .delphilsp.json exists in the tree', function () {
            const { root, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = (0, configFile_1.findNearestLSPConfig)(subsub);
            assert.strictEqual(result, undefined);
        });
    });
    // ---------------------------------------------------------------------------
    // _idelaunchedForDirs deduplication fix
    //
    // Strategy: intercept child_process.spawn via Module._load so we can count
    // calls without needing bds.exe to actually exist.
    // ---------------------------------------------------------------------------
    describe('_idelaunchedForDirs deduplication', function () {
        let spawnCallCount = 0;
        let origLoad;
        before(function () {
            // Intercept child_process.spawn calls by wrapping Module._load.
            origLoad = Module._load;
            Module._load = function (name, ...args) {
                if (name === 'child_process') {
                    const real = origLoad.call(this, name, ...args);
                    return {
                        ...real,
                        spawn: (...spawnArgs) => {
                            spawnCallCount++;
                            // Return a no-op ChildProcess stub so the code doesn't throw.
                            return { unref: () => { } };
                        },
                    };
                }
                return origLoad.call(this, name, ...args);
            };
        });
        after(function () {
            Module._load = origLoad;
        });
        beforeEach(function () {
            spawnCallCount = 0;
            (0, vscode_1.resetMocks)();
        });
        it('_idelaunchedForDirs: IDE launched once for a dir, not twice on repeated initConfig call', async function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);
            // Simulate a .dproj so findNearestDproj returns something (less interesting here,
            // but prevents the function from walking past the temp dir).
            fs.writeFileSync(path.join(dir, 'Dummy.dproj'), '<xml/>');
            // Active editor points into dir; workspace root is dir's parent so walk stops.
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            // configFile is empty → triggers the "no configs found" path in initConfig.
            vscode_1.mockState.configFile = '';
            vscode_1.mockState.activeTextEditor = { document: { uri: { fsPath: path.join(dir, 'Unit1.pas') } } };
            // findFiles returns empty so collectLSPConfigFiles returns [].
            vscode_1.mockState.findFilesResult = [];
            // Import initConfig here (after Module._load is patched).
            // Use a fresh require to ensure we're using the patched module cache.
            const { initConfig } = await Promise.resolve().then(() => require('../../src/client/configFile'));
            // First call — should launch IDE once.
            await initConfig();
            const countAfterFirst = spawnCallCount;
            // Second call for the same active dir — must NOT spawn again.
            await initConfig();
            const countAfterSecond = spawnCallCount;
            assert.ok(countAfterFirst <= 1, `Expected at most 1 spawn after first initConfig call, got ${countAfterFirst}`);
            assert.strictEqual(countAfterFirst, countAfterSecond, `Spawn was called again on the second initConfig for the same dir (count went from ${countAfterFirst} to ${countAfterSecond})`);
        });
    });
    // ---------------------------------------------------------------------------
    // Sentinel fix: 'no_config_available' must re-scan, not show "file missing"
    //
    // Scenario:
    //   1. Extension activates — no .delphilsp.json found — stores sentinel.
    //   2. User generates a config in the Delphi IDE.
    //   3. FileSystemWatcher fires → initConfig() is called again.
    //   4. configFile === 'no_config_available' (non-empty, but not a real URI)
    //
    // BUG: The old code fell into the `else if (!fileExists(...))` branch because
    //      the sentinel is non-empty and stat('no_config_available') fails.
    //      It showed "project config file no longer exists" and required manual
    //      re-selection, breaking the "VS Code will load it automatically" promise.
    //
    // FIX: The sentinel is now treated the same as an empty string, routing
    //      back through collectLSPConfigFiles() so the new config is auto-loaded.
    // ---------------------------------------------------------------------------
    describe('sentinel value fix — no_config_available treated as empty on re-scan', function () {
        beforeEach(function () {
            (0, vscode_1.resetMocks)();
        });
        it('sentinel: re-scans and auto-loads when one new config exists', async function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);
            // Write a real .delphilsp.json and matching .dpr so loadConfigFileJson succeeds.
            const configPath = path.join(dir, 'Auto.delphilsp.json');
            const dprPath = path.join(dir, 'Auto.dpr').replace(/\\/g, '/');
            fs.writeFileSync(configPath, JSON.stringify({
                settings: {
                    project: dprPath,
                    dccOptions: `-E${dir}`,
                    browsingPaths: [],
                    projectFiles: [],
                    dllname: '',
                    includeDCUsInUsesCompletion: false,
                },
            }));
            fs.writeFileSync(path.join(dir, 'Auto.dpr'), 'program Auto; begin end.');
            // State after IDE launch: sentinel stored, now a config has been created.
            vscode_1.mockState.configFile = 'no_config_available';
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: dir } }];
            // Simulate findFiles returning the newly-created config.
            const configUri = 'file:///' + configPath.replace(/\\/g, '/');
            vscode_1.mockState.findFilesResult = [{ fsPath: configPath, toString: () => configUri }];
            const { initConfig } = await Promise.resolve().then(() => require('../../src/client/configFile'));
            await initConfig();
            // Must NOT have shown the "no longer exists" error.
            const errorMessages = (vscode_1.calls['window.showErrorMessage'] ?? []).map((c) => c[0]);
            assert.ok(!errorMessages.some((m) => m.includes('no longer exists')), 'Should not show "no longer exists" error when sentinel is stored — should re-scan instead');
            // Must have called config.update with the new file URI (auto-loaded).
            const configUpdates = (vscode_1.calls['config.update'] ?? []).filter((c) => c[0] === 'configFile');
            const autoLoaded = configUpdates.some((c) => typeof c[1] === 'string' && c[1].includes('Auto.delphilsp.json'));
            assert.ok(autoLoaded, 'config.update should have been called with the new config file URI');
        });
        it('sentinel: re-scans and shows picker when multiple new configs exist', async function () {
            (0, vscode_1.resetMocks)();
            vscode_1.mockState.configFile = 'no_config_available';
            vscode_1.mockState.workspaceFolders = [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }];
            // Simulate two configs found (should open picker, not "no longer exists").
            vscode_1.mockState.findFilesResult = [
                { fsPath: 'C:\\tmwin\\src\\a\\A.delphilsp.json', toString: () => 'file:///C:/tmwin/src/a/A.delphilsp.json' },
                { fsPath: 'C:\\tmwin\\src\\b\\B.delphilsp.json', toString: () => 'file:///C:/tmwin/src/b/B.delphilsp.json' },
            ];
            const { initConfig } = await Promise.resolve().then(() => require('../../src/client/configFile'));
            await initConfig();
            const errorMessages = (vscode_1.calls['window.showErrorMessage'] ?? []).map((c) => c[0]);
            assert.ok(!errorMessages.some((m) => m.includes('no longer exists')), 'Should not show "no longer exists" for sentinel — should show multi-config picker prompt instead');
            // Should have shown the "Multiple configs found" picker prompt.
            const multiConfigPrompt = errorMessages.some((m) => m.includes('Multiple'));
            assert.ok(multiConfigPrompt, 'Should prompt user to select from multiple configs');
        });
    });
});
/**
 * Post–PR#1 regression: `delphi.configFile` / `settings.project` often arrive as `file:///c%3A/...`.
 * Ad-hoc decodeURI + string replace produced bogus paths (e.g. `...\\c%3A\\...`) and broke Run cwd.
 */
describe('April 2025 — uriOrPathToFsPath and loadConfigFileJson', function () {
    const dirsToClean = [];
    after(function () {
        for (const d of dirsToClean) {
            try {
                fs.rmSync(d, { recursive: true, force: true });
            }
            catch { /* ignore */ }
        }
    });
    /** Simulates workspace / Delphi storing the drive colon as `%3A` after `file:///`. */
    function toPercentEncodedDriveFileUrl(absPath) {
        const norm = path.resolve(absPath).replace(/\\/g, '/');
        const encoded = norm.replace(/^([A-Za-z]):/, '$1%3A');
        return 'file:///' + encoded;
    }
    describe('uriOrPathToFsPath', function () {
        it('round-trips pathToFileURL → uriOrPathToFsPath to the same normalized path', function () {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-uri-test-'));
            dirsToClean.push(dir);
            const filePath = path.join(dir, 'x.delphilsp.json');
            fs.writeFileSync(filePath, '{}');
            const href = (0, url_1.pathToFileURL)(filePath).href;
            const out = (0, configFile_1.uriOrPathToFsPath)(href);
            assert.strictEqual(path.normalize(out), path.normalize(filePath), `Got: ${out}`);
        });
        it('decodes file URL with percent-encoded drive letter (Windows)', function () {
            if (process.platform !== 'win32') {
                this.skip();
            }
            const input = 'file:///c%3A/tmwin/tmwincur/src/app.delphilsp.json';
            const out = (0, configFile_1.uriOrPathToFsPath)(input);
            assert.match(out, /^c:\\/i, `Expected drive path, got: ${out}`);
            assert.ok(out.toLowerCase().includes('tmwin'), out);
        });
        it('decodes path fragment with %3A but no file: scheme (Windows)', function () {
            if (process.platform !== 'win32') {
                this.skip();
            }
            const out = (0, configFile_1.uriOrPathToFsPath)('c%3A\\tmwin\\repo\\x.dpr');
            assert.match(out, /^c:\\/i, `Got: ${out}`);
        });
        it('returns plain paths unchanged when no file: scheme and no percent escapes', function () {
            assert.strictEqual((0, configFile_1.uriOrPathToFsPath)('relative\\x.dpr'), 'relative\\x.dpr');
        });
    });
    describe('loadConfigFileJson', function () {
        it('reads config file and project when both use percent-encoded drive in file: URL', async function () {
            if (process.platform !== 'win32') {
                this.skip();
            }
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-lsp-load-'));
            dirsToClean.push(dir);
            const dprPath = path.join(dir, 'Enc.dpr');
            const cfgPath = path.join(dir, 'Enc.delphilsp.json');
            fs.writeFileSync(dprPath, 'program Enc; begin end.');
            const dprUrl = toPercentEncodedDriveFileUrl(dprPath);
            fs.writeFileSync(cfgPath, JSON.stringify({
                settings: {
                    project: dprUrl,
                    dccOptions: `-E${dir}`,
                    browsingPaths: [],
                    projectFiles: [],
                    dllname: '',
                    includeDCUsInUsesCompletion: false,
                },
            }));
            const cfgUrl = toPercentEncodedDriveFileUrl(cfgPath);
            const json = await (0, configFile_1.loadConfigFileJson)(cfgUrl);
            if (!json) {
                assert.fail('loadConfigFileJson should succeed for encoded config path');
            }
            assert.strictEqual(path.normalize(json.settings.project), path.normalize(dprPath), `project field should decode to real .dpr path; got: ${json.settings.project}`);
        });
    });
});
//# sourceMappingURL=configFile.test.js.map