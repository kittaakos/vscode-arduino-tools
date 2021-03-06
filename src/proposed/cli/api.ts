import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Logger, ConsoleLogger, OutputChannelLogger } from '../logger';
import { Core, Version } from './types';

export interface Cli {
    readonly cliPath: string;
    coreSearch({ query, all }: { query?: string, all?: boolean }): Promise<Core[]>;
    coreList({ all }: { all?: boolean }): Promise<Core.Installed[]>;
    version(): Promise<Version>;
}


export class CpCli implements Cli {

    constructor(readonly cliPath: string, private readonly logger: Logger = new ConsoleLogger()) { }

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

    async coreList({ all }: { all?: boolean }): Promise<Core.Installed[]> {
        const flags = ['core', 'list'];
        if (all === true) {
            flags.push('--all');
        }
        return this.run<Core.Installed[]>(flags);
    }

    private async run<T>(flags: string[]): Promise<T> {
        this.logger.info(`${flags.join(' ')}`);
        const process = child_process.spawn(`${this.cliPath}`, [...flags, '--format', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] });
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
    const logger = new OutputChannelLogger('Arduino CLI', context);
    const cliPath = context.globalState.get<string>('vscode.arduinoTools.cliPath') || /* TODO: `which` + offer download install */ 'arduino-cli';
    context.subscriptions.push(vscode.commands.registerCommand('vscode.arduinoTools.coreSearch', async () => {
        const cli = new CpCli(cliPath, logger);
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
                description: `${core.Maintainer ? ` by ${core.Maintainer}` : ''}${Core.Installed.is(core) ? ` version ${core.Installed} installed` : ''}`,
                detail: core.Boards.length ? `Boards: ${core.Boards.map(({ name }) => name).join(', ')}` : undefined
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
    context.subscriptions.push(vscode.commands.registerCommand('vscode.arduinoTools.cliVersion', async () => {
        const version = await new CpCli(cliPath, logger).version();
        vscode.window.showInformationMessage(`CLI: ${version.VersionString}`);
    }));
}
