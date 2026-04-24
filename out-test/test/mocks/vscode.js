"use strict";
/**
 * Minimal stub of the VS Code extension API.
 *
 * Tests mutate `mockState` before calling into source modules:
 *   mockState.activeTextEditor = { document: { uri: Uri.file('...') } };
 *   mockState.configFile = 'file:///C:/...';
 *   mockState.workspaceFolders = [{ uri: Uri.file('C:/foo') }];
 *
 * Spy counters / call lists are reset by calling resetMocks() in beforeEach.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationChangeEvent = exports.ExtensionContext = exports.TaskScope = exports.Task = exports.ProcessExecution = exports.commands = exports.tasks = exports.window = exports.workspace = exports.WorkspaceEdit = exports.Uri = exports.calls = exports.mockState = void 0;
exports.resetMocks = resetMocks;
exports.mockState = {
    activeTextEditor: undefined,
    configFile: '',
    workspaceFolders: [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }],
    executeTaskResult: {},
    showErrorMessageResult: undefined,
    showWarningMessageResult: undefined,
    showInfoMessageResult: undefined,
    findFilesResult: [],
    fileExistsResult: true,
};
exports.calls = {};
function recordCall(name, args) {
    if (!exports.calls[name])
        exports.calls[name] = [];
    exports.calls[name].push(args);
}
function resetMocks() {
    exports.mockState.activeTextEditor = undefined;
    exports.mockState.configFile = '';
    exports.mockState.workspaceFolders = [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }];
    exports.mockState.executeTaskResult = {};
    exports.mockState.showErrorMessageResult = undefined;
    exports.mockState.showWarningMessageResult = undefined;
    exports.mockState.showInfoMessageResult = undefined;
    exports.mockState.findFilesResult = [];
    exports.mockState.fileExistsResult = true;
    for (const key of Object.keys(exports.calls))
        delete exports.calls[key];
}
// --- Uri ---
class Uri {
    constructor(scheme, fsPath) {
        this._scheme = scheme;
        this.fsPath = fsPath;
    }
    static file(p) {
        return new Uri('file', p);
    }
    static parse(s) {
        const stripped = s.replace(/^file:\/\/\//, '').replace(/^\//, '');
        return new Uri('file', stripped);
    }
    toString() {
        return `file:///${this.fsPath.replace(/\\/g, '/')}`;
    }
}
exports.Uri = Uri;
// --- WorkspaceEdit ---
class WorkspaceEdit {
    constructor() {
        this._edits = [];
    }
    createFile(uri, options) {
        recordCall('WorkspaceEdit.createFile', [uri, options]);
        this._edits.push({ uri, contents: options?.contents ?? Buffer.alloc(0) });
    }
    getCreatedFiles() {
        return this._edits;
    }
    getScriptContent(index = 0) {
        return this._edits[index]?.contents.toString('utf8') ?? '';
    }
}
exports.WorkspaceEdit = WorkspaceEdit;
// --- workspace ---
exports.workspace = {
    get workspaceFolders() {
        return exports.mockState.workspaceFolders;
    },
    getConfiguration(_section) {
        return {
            get(key) {
                if (key === 'configFile')
                    return exports.mockState.configFile;
                return undefined;
            },
            update(_key, _value) {
                recordCall('config.update', [_key, _value]);
            },
        };
    },
    applyEdit(edit) {
        recordCall('workspace.applyEdit', [edit]);
    },
    findFiles(_pattern) {
        return Promise.resolve(exports.mockState.findFilesResult);
    },
    createFileSystemWatcher(_pattern) {
        return {
            onDidCreate: (_cb) => ({ dispose: () => { } }),
            dispose: () => { },
        };
    },
    fs: {
        stat(_uri) {
            if (exports.mockState.fileExistsResult)
                return Promise.resolve({});
            return Promise.reject(new Error('File not found'));
        },
    },
};
// --- window ---
exports.window = {
    get activeTextEditor() {
        return exports.mockState.activeTextEditor;
    },
    showErrorMessage(msg, ...items) {
        recordCall('window.showErrorMessage', [msg, ...items]);
        return Promise.resolve(exports.mockState.showErrorMessageResult);
    },
    showWarningMessage(msg, ...items) {
        recordCall('window.showWarningMessage', [msg, ...items]);
        return Promise.resolve(exports.mockState.showWarningMessageResult);
    },
    showInformationMessage(msg, ...items) {
        recordCall('window.showInformationMessage', [msg, ...items]);
        return Promise.resolve(exports.mockState.showInfoMessageResult);
    },
    showQuickPick(_items, _options) {
        return Promise.resolve(undefined);
    },
    onDidChangeActiveTextEditor(_cb) {
        return { dispose: () => { } };
    },
};
// --- tasks ---
exports.tasks = {
    executeTask(_task) {
        recordCall('tasks.executeTask', [_task]);
        return Promise.resolve(exports.mockState.executeTaskResult);
    },
    onDidEndTaskProcess(_cb) {
        return { dispose: () => { } };
    },
};
// --- commands ---
exports.commands = {
    executeCommand(cmd, ...args) {
        recordCall('commands.executeCommand', [cmd, ...args]);
        return Promise.resolve(undefined);
    },
    registerCommand(cmd, _handler) {
        recordCall('commands.registerCommand', [cmd]);
        return { dispose: () => { } };
    },
};
// --- ProcessExecution / Task / TaskScope ---
class ProcessExecution {
    constructor(process, args, options) {
        this.process = process;
        this.args = args;
        this.options = options;
    }
}
exports.ProcessExecution = ProcessExecution;
class Task {
    constructor(definition, scope, name, source, execution) {
        this.definition = definition;
        this.scope = scope;
        this.name = name;
        this.source = source;
        this.execution = execution;
    }
}
exports.Task = Task;
exports.TaskScope = { Workspace: 1 };
// --- ExtensionContext stub ---
class ExtensionContext {
    constructor() {
        this.subscriptions = [];
    }
}
exports.ExtensionContext = ExtensionContext;
// --- ConfigurationChangeEvent stub ---
class ConfigurationChangeEvent {
    affectsConfiguration(_section) {
        return true;
    }
}
exports.ConfigurationChangeEvent = ConfigurationChangeEvent;
//# sourceMappingURL=vscode.js.map