import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Logger, OutputChannelLogger } from '../logger';
import { Core, Version, Port, Board } from './types';

export interface Cli {
    readonly cliPath: string;
    version(): Promise<Version>;
    coreSearch({ query, all }: { query?: string, all?: boolean }): Promise<ReadonlyArray<Core>>;
    coreList({ all }: { all?: boolean }): Promise<ReadonlyArray<Core>>;
    boardSearch({ query, all }: { query?: string, all?: boolean }): Promise<ReadonlyArray<Core & Board>>;
    boardList(): Promise<ReadonlyArray<Port>>;
}

export class CpCli implements Cli {

    readonly cliPath: string;
    private readonly cliConfigPath?: string;
    private readonly logger: Logger;

    constructor(context: vscode.ExtensionContext) {
        this.logger = new OutputChannelLogger('Arduino CLI', context);
        const configuration = vscode.workspace.getConfiguration();
        this.cliPath = configuration.get<string>('arduinoTools.cliPath')!;
        // TODO: handle relative paths
        this.cliConfigPath = configuration.get<string>('arduinoTools.cliConfigPath');
        vscode.window.showInformationMessage(this.cliPath ?? 'empty');
    }

    async version(): Promise<Version> {
        return this.run<Version>(['version']);
    }

    async coreSearch({ query, all }: { query?: string, all?: boolean }): Promise<Core[]> {
        const flags = ['core', 'search'];
        if (query) {
            flags.push(`"${query}"`);
        }
        if (all === true) {
            flags.push('--all');
        }
        return this.run<Core[]>(flags);
    }

    async coreList({ all }: { all?: boolean }): Promise<Core[]> {
        const flags = ['core', 'list'];
        if (all === true) {
            flags.push('--all');
        }
        return this.run<Core[]>(flags);
    }

    async coreUpdateIndex(): Promise<void> {
        return this.run(['core', 'update-index']);
    }

    async boardList(): Promise<Port[]> {
        return this.run<Port[]>(['board', 'list']);
    }

    async boardSearch({ query, all }: { query?: string, all?: boolean }): Promise<(Core & Board)[]> {
        const flags = ['board', 'search'];
        if (query) {
            flags.push(`"${query}"`);
        }
        if (all === true) {
            flags.push('--show-hidden'); // Same as `-a` -> `all`.
        }
        return this.run<(Core & Board)[]>(flags);
    }

    private async run<T>(flags: string[]): Promise<T> {
        if (this.cliConfigPath) {
            flags.push('--config-file', `"${this.cliConfigPath}"`);
        }
        flags.push('--format', 'json');
        this.logger.info(`${flags.join(' ')}`);
        const process = child_process.spawn(`${this.cliPath}`, flags, { stdio: ['ignore', 'pipe', 'ignore'] });
        let raw = '';
        for await (const chunk of process.stdout) {
            raw += chunk;
        }
        // TODO: add config to toggle result on/off
        // this.logger.info(raw);
        try {
            return JSON.parse(raw);
        } catch (err) {
            if (err instanceof SyntaxError) {
                console.log(err.message, raw);
            }
            throw err;
        }
    }

}

export function activate(context: vscode.ExtensionContext): void {
    const cli = new CpCli(context);
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.coreSearch', async () => {
        const [
            allCores,
            installedCores
        ] = await Promise.all([
            cli.coreSearch({}),
            cli.coreList({})
        ]);
        allCores.sort((left, right) => left.Name.localeCompare(right.Name));
        for (const installed of installedCores) {
            const index = allCores.findIndex(({ ID }) => ID === installed.ID);
            if (index !== -1) {
                allCores.splice(index, 1, installed);
            }
        }
        const items: vscode.QuickPickItem[] = allCores.map(core => {
            return {
                label: `${core.Name}`,
                description: `${core.Maintainer ? ` by ${core.Maintainer}` : ''}${core.Installed ? ` version ${core.Installed} installed` : ''}`,
                detail: core.Boards?.length ? `Boards: ${core.Boards.map(({ name }) => name).join(', ')}` : undefined
            };
        });
        const core = await vscode.window.showQuickPick(items, {
            placeHolder: 'Pick a platform',
            matchOnDescription: true,
            matchOnDetail: true
        });
        if (core) {
            vscode.window.showInformationMessage(`CLI: ${core.label}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.cliVersion', async () => {
        const version = await cli.version();
        vscode.window.showInformationMessage(`CLI: ${version.VersionString}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('arduinoTools.boardSearch', async () => {
        const toDispose: vscode.Disposable[] = [];
        try {
            const quickPick = vscode.window.createQuickPick();
            quickPick.placeholder = "Type to search for a board. Press 'Enter' to select board, 'Esc' to cancel.";
            const board = await new Promise<Board | undefined>(resolve => {
                toDispose.push(quickPick.onDidChangeValue(async query => {
                    quickPick.busy = true;
                    try {
                        const boards = await cli.boardSearch({ query });
                        quickPick.items = boards.map(board => ({
                            label: board.name,
                            description: board.Installed ? `Installed with ${board.Name}@${board.Installed}` : `Select to install with ${board.Name}@${board.Latest}`
                        }));
                    } finally {
                        quickPick.busy = false;
                    }
                }));
                toDispose.push(quickPick.onDidChangeSelection(items => {
                    if (items.length && Board.is(items[0])) {
                        const head = items[0];
                        resolve(Board.is(head) ? head : undefined);
                        quickPick.hide();
                    }
                })),
                    toDispose.push(quickPick.onDidHide(() => {
                        resolve(undefined);
                        quickPick.dispose();
                    }));
                quickPick.show();
            });
            if (board) {
                vscode.window.showInformationMessage(`Selected board: ${board.name}`);
            }
        } finally {
            toDispose.forEach(toDispose => toDispose.dispose());
        }
    }));
}
