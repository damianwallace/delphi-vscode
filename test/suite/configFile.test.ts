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
import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');
import Module = require('module');
import { pathToFileURL } from 'url';

import { resetMocks, mockState, calls } from '../mocks/vscode';
import '../mocks/vscode-setup';
import {
    findNearestDproj,
    findNearestLSPConfig,
    loadConfigFileJson,
    uriOrPathToFsPath,
} from '../../src/client/configFile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-cfg-test-'));
}

// Create a nested directory tree:
//   root/
//     sub/
//       subsub/
// Returns { root, sub, subsub }
function makeNestedDirs(): { root: string; sub: string; subsub: string } {
    const root = makeTempDir();
    const sub = path.join(root, 'sub');
    const subsub = path.join(sub, 'subsub');
    fs.mkdirSync(subsub, { recursive: true });
    return { root, sub, subsub };
}

const dirsToClean: string[] = [];

// ---------------------------------------------------------------------------
// findNearestDproj
// ---------------------------------------------------------------------------

describe('Branch 3 — feat/delphi-project-ready-watcher', function () {
    beforeEach(function () {
        resetMocks();
    });

    after(function () {
        for (const d of dirsToClean) {
            try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    describe('findNearestDproj', function () {
        it('finds .dproj in the same directory', function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);
            fs.writeFileSync(path.join(dir, 'MyApp.dproj'), '<xml/>');
            // Set workspace root below this dir so walk-up stops before reaching OS root.
            mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            const result = findNearestDproj(dir);
            assert.ok(result, 'Expected a .dproj path');
            assert.ok(result!.endsWith('MyApp.dproj'), `Got: ${result}`);
        });

        it('finds .dproj in a parent directory', function () {
            const { root, sub, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            fs.writeFileSync(path.join(sub, 'Parent.dproj'), '<xml/>');
            mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = findNearestDproj(subsub);
            assert.ok(result, 'Expected to walk up and find .dproj in parent');
            assert.ok(result!.endsWith('Parent.dproj'), `Got: ${result}`);
        });

        it('returns undefined when no .dproj exists in the tree', function () {
            const { root, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            // workspace root IS root, so the walk stops there and never escapes.
            mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = findNearestDproj(subsub);
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
            mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            const result = findNearestLSPConfig(dir);
            assert.ok(result, 'Expected a .delphilsp.json path');
            assert.ok(result!.endsWith('App.delphilsp.json'), `Got: ${result}`);
        });

        it('finds .delphilsp.json in a parent directory', function () {
            const { root, sub, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            fs.writeFileSync(path.join(sub, 'Proj.delphilsp.json'), '{}');
            mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = findNearestLSPConfig(subsub);
            assert.ok(result, 'Expected to walk up and find .delphilsp.json');
            assert.ok(result!.endsWith('Proj.delphilsp.json'), `Got: ${result}`);
        });

        it('returns undefined when no .delphilsp.json exists in the tree', function () {
            const { root, subsub } = makeNestedDirs();
            dirsToClean.push(root);
            mockState.workspaceFolders = [{ uri: { fsPath: root } }];
            const result = findNearestLSPConfig(subsub);
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
        let origLoad: Function;

        before(function () {
            // Intercept child_process.spawn calls by wrapping Module._load.
            origLoad = (Module as any)._load;
            (Module as any)._load = function (name: string, ...args: any[]) {
                if (name === 'child_process') {
                    const real = origLoad.call(this, name, ...args);
                    return {
                        ...real,
                        spawn: (...spawnArgs: any[]) => {
                            spawnCallCount++;
                            // Return a no-op ChildProcess stub so the code doesn't throw.
                            return { unref: () => {} };
                        },
                    };
                }
                return origLoad.call(this, name, ...args);
            };
        });

        after(function () {
            (Module as any)._load = origLoad;
        });

        beforeEach(function () {
            spawnCallCount = 0;
            resetMocks();
        });

        it('_idelaunchedForDirs: IDE launched once for a dir, not twice on repeated initConfig call', async function () {
            const dir = makeTempDir();
            dirsToClean.push(dir);

            // Simulate a .dproj so findNearestDproj returns something (less interesting here,
            // but prevents the function from walking past the temp dir).
            fs.writeFileSync(path.join(dir, 'Dummy.dproj'), '<xml/>');

            // Active editor points into dir; workspace root is dir's parent so walk stops.
            mockState.workspaceFolders = [{ uri: { fsPath: path.join(dir, '..') } }];
            // configFile is empty → triggers the "no configs found" path in initConfig.
            mockState.configFile = '';
            mockState.activeTextEditor = { document: { uri: { fsPath: path.join(dir, 'Unit1.pas') } } };
            // findFiles returns empty so collectLSPConfigFiles returns [].
            mockState.findFilesResult = [];

            // Import initConfig here (after Module._load is patched).
            // Use a fresh require to ensure we're using the patched module cache.
            const { initConfig } = await import('../../src/client/configFile');

            // First call — should launch IDE once.
            await initConfig();
            const countAfterFirst = spawnCallCount;

            // Second call for the same active dir — must NOT spawn again.
            await initConfig();
            const countAfterSecond = spawnCallCount;

            assert.ok(countAfterFirst <= 1, `Expected at most 1 spawn after first initConfig call, got ${countAfterFirst}`);
            assert.strictEqual(countAfterFirst, countAfterSecond,
                `Spawn was called again on the second initConfig for the same dir (count went from ${countAfterFirst} to ${countAfterSecond})`);
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
            resetMocks();
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
            mockState.configFile = 'no_config_available';
            mockState.workspaceFolders = [{ uri: { fsPath: dir } }];
            // Simulate findFiles returning the newly-created config.
            const configUri = 'file:///' + configPath.replace(/\\/g, '/');
            mockState.findFilesResult = [{ fsPath: configPath, toString: () => configUri }];

            const { initConfig } = await import('../../src/client/configFile');
            await initConfig();

            // Must NOT have shown the "no longer exists" error.
            const errorMessages = (calls['window.showErrorMessage'] ?? []).map((c: any[]) => c[0] as string);
            assert.ok(
                !errorMessages.some((m) => m.includes('no longer exists')),
                'Should not show "no longer exists" error when sentinel is stored — should re-scan instead'
            );

            // Must have called config.update with the new file URI (auto-loaded).
            const configUpdates = (calls['config.update'] ?? []).filter((c: any[]) => c[0] === 'configFile');
            const autoLoaded = configUpdates.some(
                (c: any[]) => typeof c[1] === 'string' && c[1].includes('Auto.delphilsp.json')
            );
            assert.ok(autoLoaded, 'config.update should have been called with the new config file URI');
        });

        it('sentinel: re-scans and shows picker when multiple new configs exist', async function () {
            resetMocks();
            mockState.configFile = 'no_config_available';
            mockState.workspaceFolders = [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }];
            // Simulate two configs found (should open picker, not "no longer exists").
            mockState.findFilesResult = [
                { fsPath: 'C:\\tmwin\\src\\a\\A.delphilsp.json', toString: () => 'file:///C:/tmwin/src/a/A.delphilsp.json' },
                { fsPath: 'C:\\tmwin\\src\\b\\B.delphilsp.json', toString: () => 'file:///C:/tmwin/src/b/B.delphilsp.json' },
            ];

            const { initConfig } = await import('../../src/client/configFile');
            await initConfig();

            const errorMessages = (calls['window.showErrorMessage'] ?? []).map((c: any[]) => c[0] as string);
            assert.ok(
                !errorMessages.some((m) => m.includes('no longer exists')),
                'Should not show "no longer exists" for sentinel — should show multi-config picker prompt instead'
            );
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
    const dirsToClean: string[] = [];

    after(function () {
        for (const d of dirsToClean) {
            try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    /** Simulates workspace / Delphi storing the drive colon as `%3A` after `file:///`. */
    function toPercentEncodedDriveFileUrl(absPath: string): string {
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
            const href = pathToFileURL(filePath).href;
            const out = uriOrPathToFsPath(href);
            assert.strictEqual(path.normalize(out), path.normalize(filePath), `Got: ${out}`);
        });

        it('decodes file URL with percent-encoded drive letter (Windows)', function () {
            if (process.platform !== 'win32') {
                this.skip();
            }
            const input = 'file:///c%3A/tmwin/tmwincur/src/app.delphilsp.json';
            const out = uriOrPathToFsPath(input);
            assert.match(out, /^c:\\/i, `Expected drive path, got: ${out}`);
            assert.ok(out.toLowerCase().includes('tmwin'), out);
        });

        it('decodes path fragment with %3A but no file: scheme (Windows)', function () {
            if (process.platform !== 'win32') {
                this.skip();
            }
            const out = uriOrPathToFsPath('c%3A\\tmwin\\repo\\x.dpr');
            assert.match(out, /^c:\\/i, `Got: ${out}`);
        });

        it('returns plain paths unchanged when no file: scheme and no percent escapes', function () {
            assert.strictEqual(uriOrPathToFsPath('relative\\x.dpr'), 'relative\\x.dpr');
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
            fs.writeFileSync(
                cfgPath,
                JSON.stringify({
                    settings: {
                        project: dprUrl,
                        dccOptions: `-E${dir}`,
                        browsingPaths: [],
                        projectFiles: [],
                        dllname: '',
                        includeDCUsInUsesCompletion: false,
                    },
                })
            );
            const cfgUrl = toPercentEncodedDriveFileUrl(cfgPath);
            const json = await loadConfigFileJson(cfgUrl);
            if (!json) {
                assert.fail('loadConfigFileJson should succeed for encoded config path');
            }
            assert.strictEqual(
                path.normalize(json.settings.project),
                path.normalize(dprPath),
                `project field should decode to real .dpr path; got: ${json.settings.project}`
            );
        });
    });
});
