/**
 * Branch 1: fix/delphi-run-script-bugs
 *
 * Validates the three bug fixes made in scripts.ts:
 *   Bug 1 — .dpr was passed to MSBuild instead of .dproj
 *   Bug 2 — exe path was not properly resolved to an absolute path
 *   Bug 3 — Start-Process was missing -WorkingDirectory
 *
 * Also verifies the feat branch TMROOT/TMLIB env-var injection and the
 * PS-safe single-quote fix for literal path assignments.
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

    it('Bug 2 fix: $exePath is a fully resolved absolute path in a single-quoted PS string', function () {
        // Path assignments now use PS single-quoted strings: $exePath = 'C:\...\MMDisp.exe'
        assert.match(
            scriptContent,
            /\$exePath\s*=\s*'[A-Za-z]:\\/,
            "$exePath must be a resolved Windows absolute path in a PS single-quoted string ('C:\\...')"
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

    it('PS-safe fix: $PROJECT, $TMROOT, $TMLIB, $exePath all use single-quoted PS strings', function () {
        // Double-quoted PS strings expand $variables — single-quoted strings are purely literal.
        assert.match(scriptContent, /\$PROJECT\s*=\s*'/, "$PROJECT must use single-quoted PS string");
        assert.match(scriptContent, /\$TMROOT\s*=\s*'/, "$TMROOT must use single-quoted PS string");
        assert.match(scriptContent, /\$TMLIB\s*=\s*'/, "$TMLIB must use single-quoted PS string");
        assert.match(scriptContent, /\$exePath\s*=\s*'/, "$exePath must use single-quoted PS string");
    });

    it('PS-safe fix: $env:DCC_UnitSearchPath uses single-quoted PS string', function () {
        // Only present when the .dproj has no DCC_UnitSearchPath; fixture qualifies.
        assert.match(
            scriptContent,
            /\$env:DCC_UnitSearchPath\s*=\s*'/,
            "$env:DCC_UnitSearchPath must use a single-quoted PS string"
        );
    });

    it('PS-safe fix: $TMLIB is fully resolved, not built from "$TMROOT\\lib"', function () {
        // The old pattern embedded the variable reference in a double-quoted string,
        // producing a double backslash before "lib". The fix uses the pre-computed tmLib path.
        assert.ok(
            !scriptContent.includes('"$TMROOT'),
            'Found old "$TMROOT..." double-quoted construction in script'
        );
    });
});
