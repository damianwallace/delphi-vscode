/**
 * Branch 3: feat/delphi-project-ready-watcher
 *
 * Validates:
 *   1. findNearestDproj — walks up dirs to find the nearest .dproj
 *   2. findNearestLSPConfig — walks up dirs to find the nearest .delphilsp.json
 *   3. _idelaunchedForDirs deduplication fix — initConfig's "no configs" path
 *      records the active directory so a second call for the same dir does not
 *      spawn the Delphi IDE again.
 *
 * Tests that require real filesystem use mkdtempSync.
 * Tests that need child_process.spawn to be observed use Module._load interception.
 */
import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');
import Module = require('module');

import { resetMocks, mockState } from '../mocks/vscode';
import '../mocks/vscode-setup';
import { findNearestDproj, findNearestLSPConfig } from '../../src/client/configFile';

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
});
