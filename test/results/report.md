# Delphi VSCode Extension — Test Results

**Run:** 2026-04-23 16:10:58  
**Branch:** test/validate-all-fixes

## findNearestDproj

| Test | Result | ms | Error |
|------|--------|----|-------|
| finds .dproj in the same directory | ✅ PASS | 6 |  |
| finds .dproj in a parent directory | ✅ PASS | 6 |  |
| returns undefined when no .dproj exists in the tree | ✅ PASS | 3 |  |

## findNearestLSPConfig

| Test | Result | ms | Error |
|------|--------|----|-------|
| finds .delphilsp.json in the same directory | ✅ PASS | 4 |  |
| finds .delphilsp.json in a parent directory | ✅ PASS | 5 |  |
| returns undefined when no .delphilsp.json exists in the tree | ✅ PASS | 2 |  |

## _idelaunchedForDirs deduplication

| Test | Result | ms | Error |
|------|--------|----|-------|
| _idelaunchedForDirs: IDE launched once for a dir, not twice on repeated initConfig call | ✅ PASS | 118 |  |

## sentinel value fix — no_config_available treated as empty on re-scan

| Test | Result | ms | Error |
|------|--------|----|-------|
| sentinel: re-scans and auto-loads when one new config exists | ✅ PASS | 9 |  |
| sentinel: re-scans and shows picker when multiple new configs exist | ✅ PASS | 1 |  |

## Branch 2 — fix/delphi-active-file-guard

| Test | Result | ms | Error |
|------|--------|----|-------|
| Guard 1: no resourceUri + no activeTextEditor → showErrorMessage, no executeTask | ✅ PASS | 1 |  |
| Guard 2: active file dir has no .delphilsp.json → showErrorMessage, no executeTask | ✅ PASS | 1 |  |
| Guard 3: active file config ≠ configured project → showWarningMessage, no executeTask | ✅ PASS | 3 |  |
| Guard 4 (happy path): matching config → executeTask is called | ✅ PASS | 8 |  |
| findConfigInDir: returns path when .delphilsp.json exists in dir | ✅ PASS | 3 |  |
| findConfigInDir: returns undefined for an empty directory | ✅ PASS | 1 |  |

## Branch 1 — fix/delphi-run-script-bugs

| Test | Result | ms | Error |
|------|--------|----|-------|
| Bug 1 fix: $PROJECT line ends with .dproj, not original .dpr | ✅ PASS | 0 |  |
| Bug 1 regression: $PROJECT does not contain .dproj twice (no double-convert) | ✅ PASS | 0 |  |
| Bug 2 fix: $exePath is a fully resolved absolute path in a single-quoted PS string | ✅ PASS | 0 |  |
| Bug 3 fix: Start-Process includes -WorkingDirectory | ✅ PASS | 0 |  |
| feat: script injects $env:TMROOT and $env:TMLIB | ✅ PASS | 0 |  |
| PS-safe fix: $PROJECT, $TMROOT, $TMLIB, $exePath all use single-quoted PS strings | ✅ PASS | 0 |  |
| PS-safe fix: $env:DCC_UnitSearchPath uses single-quoted PS string | ✅ PASS | 0 |  |
| PS-safe fix: $TMLIB is fully resolved, not built from "$TMROOT\lib" | ✅ PASS | 0 |  |

## dccOptions -U parsing — ArFc-style config

| Test | Result | ms | Error |
|------|--------|----|-------|
| injects $env:DCC_UnitSearchPath from -U paths, not from file:// browsingPaths URIs | ✅ PASS | 0 |  |
| DCC_UnitSearchPath includes all -U paths (tmLib, dunitx, indy10\core) | ✅ PASS | 1 |  |
| DCC_UnitSearchPath includes quoted -U path (program files with spaces) | ✅ PASS | 0 |  |

## Summary

| Total | Passed | Failed | Pending |
|-------|--------|--------|----------|
| 26 | 26 | 0 | 0 |

**Overall: PASS**
