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

export interface MockState {
    activeTextEditor: any;
    configFile: string;
    workspaceFolders: any[];
    executeTaskResult: any;
    showErrorMessageResult: string | undefined;
    showWarningMessageResult: string | undefined;
    showInfoMessageResult: string | undefined;
    findFilesResult: any[];
    fileExistsResult: boolean;
}

export const mockState: MockState = {
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

export const calls: Record<string, any[][]> = {};

function recordCall(name: string, args: any[]) {
    if (!calls[name]) calls[name] = [];
    calls[name].push(args);
}

export function resetMocks() {
    mockState.activeTextEditor = undefined;
    mockState.configFile = '';
    mockState.workspaceFolders = [{ uri: { fsPath: 'C:\\tmwin\\tmwincur' } }];
    mockState.executeTaskResult = {};
    mockState.showErrorMessageResult = undefined;
    mockState.showWarningMessageResult = undefined;
    mockState.showInfoMessageResult = undefined;
    mockState.findFilesResult = [];
    mockState.fileExistsResult = true;
    for (const key of Object.keys(calls)) delete calls[key];
}

// --- Uri ---
export class Uri {
    fsPath: string;
    private _scheme: string;

    private constructor(scheme: string, fsPath: string) {
        this._scheme = scheme;
        this.fsPath = fsPath;
    }

    static file(p: string): Uri {
        return new Uri('file', p);
    }

    static parse(s: string): Uri {
        const stripped = s.replace(/^file:\/\/\//, '').replace(/^\//, '');
        return new Uri('file', stripped);
    }

    toString(): string {
        return `file:///${this.fsPath.replace(/\\/g, '/')}`;
    }
}

// --- WorkspaceEdit ---
export class WorkspaceEdit {
    private _edits: Array<{ uri: Uri; contents: Buffer }> = [];

    createFile(uri: Uri, options?: { overwrite?: boolean; contents?: Buffer }) {
        recordCall('WorkspaceEdit.createFile', [uri, options]);
        this._edits.push({ uri, contents: options?.contents ?? Buffer.alloc(0) });
    }

    getCreatedFiles(): Array<{ uri: Uri; contents: Buffer }> {
        return this._edits;
    }

    getScriptContent(index = 0): string {
        return this._edits[index]?.contents.toString('utf8') ?? '';
    }
}

// --- workspace ---
export const workspace = {
    get workspaceFolders(): any[] {
        return mockState.workspaceFolders;
    },
    getConfiguration(_section?: string) {
        return {
            get<T>(key: string): T {
                if (key === 'configFile') return mockState.configFile as unknown as T;
                return undefined as unknown as T;
            },
            update(_key: string, _value: any) {
                recordCall('config.update', [_key, _value]);
            },
        };
    },
    applyEdit(edit: WorkspaceEdit) {
        recordCall('workspace.applyEdit', [edit]);
    },
    findFiles(_pattern: string): Promise<any[]> {
        return Promise.resolve(mockState.findFilesResult);
    },
    createFileSystemWatcher(_pattern: string) {
        return {
            onDidCreate: (_cb: any) => ({ dispose: () => {} }),
            dispose: () => {},
        };
    },
    fs: {
        stat(_uri: any): Promise<any> {
            if (mockState.fileExistsResult) return Promise.resolve({});
            return Promise.reject(new Error('File not found'));
        },
    },
};

// --- window ---
export const window = {
    get activeTextEditor(): any {
        return mockState.activeTextEditor;
    },
    showErrorMessage(msg: string, ...items: string[]): Promise<string | undefined> {
        recordCall('window.showErrorMessage', [msg, ...items]);
        return Promise.resolve(mockState.showErrorMessageResult);
    },
    showWarningMessage(msg: string, ...items: string[]): Promise<string | undefined> {
        recordCall('window.showWarningMessage', [msg, ...items]);
        return Promise.resolve(mockState.showWarningMessageResult);
    },
    showInformationMessage(msg: string, ...items: string[]): Promise<string | undefined> {
        recordCall('window.showInformationMessage', [msg, ...items]);
        return Promise.resolve(mockState.showInfoMessageResult);
    },
    showQuickPick(_items: any[], _options?: any): Promise<any> {
        return Promise.resolve(undefined);
    },
    onDidChangeActiveTextEditor(_cb: any) {
        return { dispose: () => {} };
    },
};

// --- tasks ---
export const tasks = {
    executeTask(_task: any): Promise<any> {
        recordCall('tasks.executeTask', [_task]);
        return Promise.resolve(mockState.executeTaskResult);
    },
    onDidEndTaskProcess(_cb: any) {
        return { dispose: () => {} };
    },
};

// --- commands ---
export const commands = {
    executeCommand(cmd: string, ...args: any[]): Promise<any> {
        recordCall('commands.executeCommand', [cmd, ...args]);
        return Promise.resolve(undefined);
    },
    registerCommand(cmd: string, _handler: any) {
        recordCall('commands.registerCommand', [cmd]);
        return { dispose: () => {} };
    },
};

// --- ProcessExecution / Task / TaskScope ---
export class ProcessExecution {
    constructor(
        public readonly process: string,
        public readonly args: string[],
        public readonly options?: any
    ) {}
}

export class Task {
    constructor(
        public readonly definition: any,
        public readonly scope: any,
        public readonly name: string,
        public readonly source: string,
        public readonly execution?: any
    ) {}
}

export const TaskScope = { Workspace: 1 };

// --- ExtensionContext stub ---
export class ExtensionContext {
    subscriptions: Array<{ dispose(): any }> = [];
}

// --- ConfigurationChangeEvent stub ---
export class ConfigurationChangeEvent {
    affectsConfiguration(_section: string): boolean {
        return true;
    }
}
