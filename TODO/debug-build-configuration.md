# TODO: Debug / Release Build Configuration

## Summary

Add a `delphi.buildConfiguration` setting (Debug/Release) so the extension explicitly passes `/p:Config=<value>` to MSBuild in the generated run script, rather than relying on the project default. Include a Command Palette toggle to switch between the two without opening settings.

---

## Background

In [`src/runner/scripts.ts`](../src/runner/scripts.ts), the generated PowerShell script currently calls MSBuild with no configuration flag:

```powershell
& $MSBUILD_DIR\MSBuild.exe $PROJECT "/t:Clean,Make"
```

Delphi `.dproj` files define named configurations (`Debug|Win32`, `Release|Win32`). When no `/p:Config` is passed, MSBuild uses the project's default — which is usually `Debug` but is not guaranteed. Making the configuration explicit removes ambiguity and enables Release builds from Cursor.

---

## Files to Change

### 1. [`package.json`](../package.json)

Add to `contributes.configuration.properties`:

```json
"delphi.buildConfiguration": {
    "type": "string",
    "default": "Debug",
    "enum": ["Debug", "Release"],
    "description": "MSBuild configuration passed to the Delphi compiler (Debug or Release)."
}
```

Add to `contributes.commands`:

```json
{
    "command": "delphi.toggleBuildConfiguration",
    "title": "Delphi: Toggle Build Configuration (Debug/Release)"
}
```

---

### 2. [`src/runner/scripts.ts`](../src/runner/scripts.ts)

Read the setting at the top of `initRunScript()`:

```typescript
const buildConfig = workspace.getConfiguration('delphi').get<string>('buildConfiguration') ?? 'Debug';
```

Change the MSBuild line in the generated script from:

```powershell
& $MSBUILD_DIR\MSBuild.exe $PROJECT "/t:Clean,Make"
```

to:

```powershell
& $MSBUILD_DIR\MSBuild.exe $PROJECT "/t:Clean,Make" "/p:Config=Debug"
```

(substituting the actual `buildConfig` value.)

The script regenerates automatically whenever any `delphi.*` setting changes, so switching configurations via the toggle will immediately produce a fresh script — no extra wiring needed.

---

### 3. [`src/runner/commands.ts`](../src/runner/commands.ts)

Register the toggle command inside `registerRunnerCommands()`:

```typescript
context.subscriptions.push(
    commands.registerCommand('delphi.toggleBuildConfiguration', () => {
        const config = workspace.getConfiguration('delphi');
        const current = config.get<string>('buildConfiguration') ?? 'Debug';
        const next = current === 'Debug' ? 'Release' : 'Debug';
        config.update('buildConfiguration', next, true);
        window.showInformationMessage(`Delphi: Build configuration set to ${next}`);
    })
);
```

---

## Acceptance Criteria

- [ ] `delphi.buildConfiguration` appears in VSCode settings with a `Debug` / `Release` dropdown
- [ ] Generated `_run.ps1` contains `/p:Config=Debug` or `/p:Config=Release` matching the setting
- [ ] Changing the setting (via settings UI or toggle command) regenerates the script automatically
- [ ] `Delphi: Toggle Build Configuration` is available in the Command Palette and shows a confirmation toast
- [ ] Default is `Debug` so existing behaviour is unchanged for users who do not touch the setting
