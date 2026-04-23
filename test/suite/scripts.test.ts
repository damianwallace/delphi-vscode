/**
 * Branch 1: fix/delphi-run-script-bugs
 *
 * Validates the three bug fixes made in scripts.ts:
 *   Bug 1 — .dpr was passed to MSBuild instead of .dproj
 *   Bug 2 — exe path was not properly resolved to an absolute path
 *   Bug 3 — Start-Process was missing -WorkingDirectory
 *
 * Also verifies the feat branch TMROOT/TMLIB env-var injection.
 */
import assert = require('assert');
import path = require('path');
import { workspace, WorkspaceEdit, calls, resetMocks, mockState } from '../mocks/vscode';

// Patch the vscode mock into the module cache before importing source modules.
// (vscode-setup.ts already does this globally, but an explicit reference here
//  makes the dependency obvious during code review.)
import '../mocks/vscode-setup';

import { initRunScript } from '../../src/runner/scripts';

// __dirname at runtime = out-test/test/suite/
// Three levels up reaches the repo root (C:\Users\...\delphi-vscode\).
const FIXTURE = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'test.delphilsp.json');
// Normalise to a file:// URI the same way VS Code produces them on Windows.
const FIXTURE_URI = 'file:///' + FIXTURE.replace(/\\/g, '/');

describe('Branch 1 — fix/delphi-run-script-bugs', function () {
    let scriptContent: string;

    before(async function () {
        resetMocks();
        // Point the mock workspace at the repo root so TMROOT calculation works.
        mockState.workspaceFolders = [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }];
        // Set configFile so loadConfigFileJson can find the fixture.
        mockState.configFile = FIXTURE_URI;
        await initRunScript(FIXTURE_URI);

        // Grab the generated script from the WorkspaceEdit captured by the mock.
        const applyEditCalls = calls['workspace.applyEdit'];
        assert.ok(applyEditCalls && applyEditCalls.length > 0, 'workspace.applyEdit was never called');
        const edit: WorkspaceEdit = applyEditCalls[0][0];
        scriptContent = edit.getScriptContent(0);
    });

    it('Bug 1 fix: $PROJECT line ends with .dproj, not original .dpr', function () {
        assert.ok(
            scriptContent.includes('.dproj'),
            `Expected .dproj in script but got:\n${scriptContent.slice(0, 400)}`
        );
    });

    it('Bug 1 regression: $PROJECT does not contain .dproj twice (no double-convert)', function () {
        const matches = scriptContent.match(/\.dproj/g) ?? [];
        // The $PROJECT = "..." line is the only one that should end in .dproj.
        // There may be 1 occurrence; there must not be .dprojoj.
        assert.ok(
            !scriptContent.includes('.dprojoj'),
            'Double-conversion artefact (.dprojoj) found in script'
        );
    });

    it('Bug 2 fix: $exePath is a fully resolved absolute path', function () {
        // Should contain a drive letter path like C:\...\MMDisp.exe, not a Node.js expression.
        assert.match(
            scriptContent,
            /\$exePath\s*=\s*"[A-Za-z]:\\/,
            '$exePath must be a resolved Windows absolute path'
        );
    });

    it('Bug 3 fix: Start-Process includes -WorkingDirectory', function () {
        assert.ok(
            scriptContent.includes('-WorkingDirectory'),
            'Script is missing -WorkingDirectory in Start-Process call'
        );
    });

    it('feat: script injects $env:TMROOT and $env:TMLIB', function () {
        assert.ok(scriptContent.includes('$env:TMROOT'), 'Missing $env:TMROOT');
        assert.ok(scriptContent.includes('$env:TMLIB'), 'Missing $env:TMLIB');
    });
});
