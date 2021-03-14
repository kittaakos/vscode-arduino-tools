import execa from 'execa';
import { debounce } from 'debounce';
import * as vscode from 'vscode';
import { Logger, OutputChannelLogger } from '../logger';
import { Core, Version, Port, Board, PortDidChangeEvent } from './types';
import { ArduinoContext } from '../context';
import { StatusBar } from './statusBar';

const { parse: parseJsonStream } = require('JSONStream') as { parse: () => NodeJS.WritableStream };

export interface Cli {
    readonly cliPath: string;
    version(token?: vscode.CancellationToken): Promise<Version>;
    coreSearch({ query, all }: { query?: string, all?: boolean }, token?: vscode.CancellationToken): Promise<ReadonlyArray<Core>>;
    coreList({ all }: { all?: boolean }, token?: vscode.CancellationToken): Promise<ReadonlyArray<Core>>;
    boardSearch({ query, all }: { query?: string, all?: boolean }, token?: vscode.CancellationToken): Promise<ReadonlyArray<Board & { platform: Core }>>;
    boardList(token?: vscode.CancellationToken): Promise<ReadonlyArray<Port>>;
    onPortDidChange: vscode.Event<PortDidChangeEvent>;
}
export class OperationCanceledError extends Error {
    constructor(readonly token: vscode.CancellationToken, message: string = 'Operation canceled') {
        super(message);
        Object.setPrototypeOf(this, OperationCanceledError.prototype);
    }
}

export class CpCli implements Cli {

    readonly cliPath: string;
    private readonly cliConfigPath?: string;
    private readonly logger: Logger;
    private readonly onPortDidChangeEmitter = new vscode.EventEmitter<PortDidChangeEvent>();

    constructor(context: vscode.ExtensionContext) {
        this.logger = new OutputChannelLogger('Arduino CLI', context);
        const configuration = vscode.workspace.getConfiguration();
        this.cliPath = configuration.get<string>('arduinoTools.cliPath')!;
        // TODO: handle relative paths
        this.cliConfigPath = configuration.get<string>('arduinoTools.cliConfigPath');
        context.subscriptions.push(
            this.onPortDidChangeEmitter,
            this.onPortDidChange(event => vscode.window.showInformationMessage(JSON.stringify(event)))
        );
        this.watchPorts();
    }

    async version(token?: vscode.CancellationToken): Promise<Version> {
        return this.run<Version>(['version'], token);
    }

    async coreSearch({ query, all }: { query?: string, all?: boolean }, token?: vscode.CancellationToken): Promise<Core[]> {
        const flags = ['core', 'search'];
        if (query) {
            flags.push(`"${query}"`);
        }
        if (all === true) {
            flags.push('--all');
        }
        return this.run<Core[]>(flags, token);
    }

    async coreList({ all }: { all?: boolean }, token?: vscode.CancellationToken): Promise<Core[]> {
        const flags = ['core', 'list'];
        if (all === true) {
            flags.push('--all');
        }
        return this.run<Core[]>(flags, token);
    }

    async coreUpdateIndex(token?: vscode.CancellationToken): Promise<void> {
        return this.run(['core', 'update-index'], token);
    }

    async boardList(token?: vscode.CancellationToken): Promise<Port[]> {
        return this.run<Port[]>(['board', 'list'], token);
    }

    async boardSearch({ query, all }: { query?: string, all?: boolean }, token?: vscode.CancellationToken): Promise<(Board & { platform: Core })[]> {
        const flags = ['board', 'search'];
        if (query) {
            flags.push(`"${query}"`);
        }
        if (all === true) {
            flags.push('--show-hidden'); // Same as `-a` -> `all`.
        }
        return this.run<(Board & { platform: Core })[]>(flags, token);
    }

    get onPortDidChange(): vscode.Event<PortDidChangeEvent> {
        return this.onPortDidChangeEmitter.event;
    }

    private async run<T>(flags: string[], token?: vscode.CancellationToken): Promise<T> {
        if (this.cliConfigPath) {
            flags.push('--config-file', `"${this.cliConfigPath}"`);
        }
        flags.push('--format', 'json');
        const toDispose: vscode.Disposable[] = [];
        const process = execa(this.cliPath, flags, { shell: true });
        if (token) {
            toDispose.push(token.onCancellationRequested(() => {
                // console.log('process.cancel()');
                process.cancel();
            }));
        }
        try {
            const start = Date.now();
            const { stdout } = await process;
            this.logger.info(`${flags.join(' ')} [${Date.now() - start}ms]`);
            // TODO: add config to toggle result on/off
            // this.logger.info(raw);
            return JSON.parse(stdout);
        } catch (error) {
            this.logger.info('canceled');
            if (token && process.killed && 'isCanceled' in error && error.isCanceled) {
                throw new OperationCanceledError(token);
            }
            throw error;
        } finally {
            toDispose.forEach(disposable => disposable.dispose());
        }
    }

    private async watchPorts(): Promise<void> {
        const flags = ['board', 'list', '--watch'];
        if (this.cliConfigPath) {
            flags.push('--config-file', `"${this.cliConfigPath}"`);
        }
        flags.push('--format', 'json');
        const process = execa(this.cliPath, flags, { shell: true, encoding: 'utf8' });
        process.stdout.pipe(parseJsonStream()).on('data', (candidate: any) => {
            if (PortDidChangeEvent.is(candidate)) {
                this.onPortDidChangeEmitter.fire(candidate);
            }
        });
        await process;
    }

}

export function activate(context: vscode.ExtensionContext): void {
    const cli = new CpCli(context);
    const arduinoContext = new ArduinoContext(context);
    new StatusBar(arduinoContext);
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.coreSearch', async () => {
        const core = await quickPick({
            itemsProvider: async (query, token) => {
                const [
                    allCores,
                    installedCores
                ] = await Promise.all([
                    cli.coreSearch({ query }, token),
                    cli.coreList({ all: true }, token)
                ]);
                allCores.sort((left, right) => left.Name.localeCompare(right.Name));
                for (const installed of installedCores) {
                    const index = allCores.findIndex(({ ID }) => ID === installed.ID);
                    if (index !== -1) {
                        allCores.splice(index, 1, installed);
                    }
                }
                return allCores.map(core => new CoreItem(core));
            },
            selectionResolver: ([head,]) => {
                if (head instanceof CoreItem) {
                    return head.core;
                }
                return undefined;
            }
        });
        if (core) {
            vscode.window.showInformationMessage(`Selected Platform: ${core.Name}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.cliVersion', async () => {
        const version = await cli.version();
        vscode.window.showInformationMessage(`CLI: ${version.VersionString}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.configureBoard', async () => {
        const board = await quickPick({
            itemsProvider: async (query, token) => {
                const boards = await cli.boardSearch({ query }, token);
                return boards.map(board => new BoardItem(board, board.platform));
            },
            selectionResolver: ([head,]) => {
                if (head instanceof BoardItem) {
                    return head.board;
                }
                return undefined;
            }
        });
        if (board) {
            arduinoContext.board = board;
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.configurePort', async () => {
        const ports = await cli.boardList();
        const items: PortItem[] = [];
        for (const port of ports) {
            if (port.boards) {
                items.push(...port.boards.map(board => new PortItem(port, board)));
            } else {
                items.push(new PortItem(port));
            }
        }
        const item = await vscode.window.showQuickPick(items);
        if (item) {
            if (item.board) {
                arduinoContext.board = item.board;
            }
            arduinoContext.port = item.port;
        }
    }));
}

class BoardItem implements vscode.QuickPickItem {
    label: string;
    description: string;
    constructor(readonly board: Board, readonly platform: Core) {
        this.label = board.name;
        this.description = platform.Installed
            ? `Installed with ${platform.Name}@${platform.Installed}`
            : `Select to install with ${platform.Name}@${platform.Latest}`;
    }
}
class CoreItem implements vscode.QuickPickItem {
    label: string;
    description: string;
    detail?: string;
    constructor(readonly core: Core) {
        this.label = `${core.Name}`;
        this.description = `${core.Maintainer ? ` by ${core.Maintainer}` : ''}${core.Installed ? ` version ${core.Installed} installed` : ''}`;
        this.detail = core.Boards?.length ? `Boards: ${core.Boards.map(({ name }) => name).join(', ')}` : undefined;
    }
}
class PortItem implements vscode.QuickPickItem {
    label: string;
    description?: string;
    constructor(readonly port: Port, readonly board?: Board) {
        this.label = `on ${port.address}`;
        this.description = board ? `connected to ${board.name}` : undefined;
    }
}

async function quickPick<T>({ itemsProvider, selectionResolver }: {
    itemsProvider: (query: string, token: vscode.CancellationToken) => Promise<vscode.QuickPickItem[]>,
    selectionResolver: (items: vscode.QuickPickItem[]) => T | undefined
}): Promise<T | undefined> {

    const toDispose: vscode.Disposable[] = [];
    const toDisposeOnDidValueChange: vscode.Disposable[] = [];
    try {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = "Type to search for a board. Press 'Enter' to select board, 'Esc' to cancel.";
        const run = async (query: string) => {
            // console.log('new query: ' + query);
            quickPick.busy = true;
            toDisposeOnDidValueChange.forEach(disposable => disposable.dispose());
            const tokenSource = new vscode.CancellationTokenSource();
            toDispose.push(tokenSource);
            toDisposeOnDidValueChange.push(new vscode.Disposable(() => {
                // console.log('tokenSource.cancel()');
                tokenSource.cancel();
            }));
            try {
                // console.log('>> start query: ' + query);
                // const boards = await cli.boardSearch({ query }, tokenSource.token);
                // console.log('<< query done: ' + query + ' hit: ' + boards.length);
                const items = await itemsProvider(query, tokenSource.token);
                quickPick.items = items;
            } catch (error) {
                // console.log('error', error);
                if (error instanceof OperationCanceledError && error.token === tokenSource.token) {
                    quickPick.items = [];
                    return;
                }
                throw error;
            } finally {
                quickPick.busy = false;
            }
        };
        const picked = await new Promise<T | undefined>(resolve => {
            toDispose.push(quickPick.onDidChangeValue(debounce(run, 200)));
            toDispose.push(quickPick.onDidChangeSelection(items => {
                const resolved = selectionResolver(items);
                if (resolved) {
                    resolve(resolved);
                    quickPick.hide();
                }
            }));
            toDispose.push(quickPick.onDidHide(() => {
                resolve(undefined);
                quickPick.dispose();
            }));
            quickPick.show();
        });
        return picked;
    } finally {
        toDispose.forEach(toDispose => toDispose.dispose());
    }
}
