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
import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');

import { Uri, calls, resetMocks, mockState } from '../mocks/vscode';
import '../mocks/vscode-setup';
import { RunManager } from '../../src/runner/runManager';

// Helper: create a temporary directory, optionally write a fixture file, return the path.
function makeTempDir(withConfig?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delphi-test-'));
    if (withConfig) {
        fs.writeFileSync(
            path.join(dir, 'Fixture.delphilsp.json'),
            JSON.stringify({ settings: { project: withConfig, dccOptions: '', browsingPaths: [], projectFiles: [], dllname: '', includeDCUsInUsesCompletion: false } })
        );
    }
    return dir;
}

describe('Branch 2 — fix/delphi-active-file-guard', function () {
    let manager: RunManager;
    const dirsToClean: string[] = [];

    beforeEach(function () {
        resetMocks();
        manager = new RunManager();
    });

    after(function () {
        for (const d of dirsToClean) {
            try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    });

    it('Guard 1: no resourceUri + no activeTextEditor → showErrorMessage, no executeTask', async function () {
        mockState.activeTextEditor = undefined;
        await manager.run(undefined);
        assert.ok(calls['window.showErrorMessage']?.length > 0, 'Expected showErrorMessage to be called');
        assert.ok(!calls['tasks.executeTask'], 'executeTask must NOT be called');
    });

    it('Guard 2: active file dir has no .delphilsp.json → showErrorMessage, no executeTask', async function () {
        const emptyDir = makeTempDir();
        dirsToClean.push(emptyDir);
        mockState.activeTextEditor = { document: { uri: Uri.file(path.join(emptyDir, 'Test.pas')) } };
        await manager.run(undefined);
        assert.ok(calls['window.showErrorMessage']?.length > 0, 'Expected showErrorMessage (no config)');
        assert.ok(!calls['tasks.executeTask'], 'executeTask must NOT be called');
    });

    it('Guard 3: active file config ≠ configured project → showWarningMessage, no executeTask', async function () {
        const projectDir = makeTempDir('C:\\other\\project\\Other.dpr');
        dirsToClean.push(projectDir);
        // The dir has a config for "Other.dpr" but workspace is configured for "MMDisp.dpr"
        mockState.configFile = 'file:///C:/tmwin/tmwincur/src/mmdisp/MMDisp.delphilsp.json';
        mockState.activeTextEditor = { document: { uri: Uri.file(path.join(projectDir, 'Unit1.pas')) } };
        await manager.run(undefined);
        assert.ok(calls['window.showWarningMessage']?.length > 0, 'Expected showWarningMessage (mismatch)');
        assert.ok(!calls['tasks.executeTask'], 'executeTask must NOT be called');
    });

    it('Guard 4 (happy path): matching config → executeTask is called', async function () {
        const projectDir = makeTempDir();
        dirsToClean.push(projectDir);
        const configPath = path.join(projectDir, 'MyProject.delphilsp.json');
        // Write a proper config with a real dpr path so loadConfigFileJson won't throw.
        const dprPath = path.join(projectDir, 'MyProject.dpr').replace(/\\/g, '/');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                settings: {
                    project: dprPath,
                    dccOptions: `-E${path.join(projectDir, 'bin')}`,
                    browsingPaths: [],
                    projectFiles: [],
                    dllname: '',
                    includeDCUsInUsesCompletion: false,
                },
            })
        );
        // Create a dummy .dpr so loadConfigFileJson can read it without error.
        fs.writeFileSync(path.join(projectDir, 'MyProject.dpr'), 'program MyProject;\nbegin end.');

        const configUri = 'file:///' + configPath.replace(/\\/g, '/');
        mockState.configFile = configUri;
        mockState.workspaceFolders = [{ uri: { fsPath: projectDir } }];
        mockState.activeTextEditor = { document: { uri: Uri.file(path.join(projectDir, 'Unit1.pas')) } };
        await manager.run(undefined);
        assert.ok(calls['tasks.executeTask']?.length > 0, 'Expected executeTask to be called on happy path');
    });

    it('findConfigInDir: returns path when .delphilsp.json exists in dir', function () {
        const dir = makeTempDir('C:/foo/bar.dpr');
        dirsToClean.push(dir);
        const result = manager.findConfigInDir(dir);
        assert.ok(result, 'Expected a path to be returned');
        assert.ok(result!.endsWith('.delphilsp.json'), `Expected .delphilsp.json extension, got: ${result}`);
    });

    it('findConfigInDir: returns undefined for an empty directory', function () {
        const dir = makeTempDir();
        dirsToClean.push(dir);
        const result = manager.findConfigInDir(dir);
        assert.strictEqual(result, undefined);
    });
});
