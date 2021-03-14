import * as vscode from 'vscode';
import { Cli, CpCli } from './cli/api';
import { Port as CliPort, PortDidAddEvent } from './cli/types';

export interface Port {
    readonly address: string;
    readonly protocol: Port.Protocol;
}
export namespace Port {
    export type Protocol = CliPort.Protocol;
}
export interface Board {
    readonly name: string;
    readonly fqbn?: string;
}

export class ArduinoContext {

    private _cli: Cli;
    private _port: Port | undefined;
    private _board: Board | undefined;
    private readonly _discoveredPorts = new Map<string, (Port & Partial<Board>)[]>(); // TODO: keys should be `Port` objects!
    private readonly onPortDidChangeEmitter = new vscode.EventEmitter<Port | undefined>();
    private readonly onBoardDidChangeEmitter = new vscode.EventEmitter<Board | undefined>();
    private readonly onDiscoveredPortsDidChangeEmitter = new vscode.EventEmitter<void>();

    readonly onPortDidChange = this.onPortDidChangeEmitter.event;
    readonly onBoardDidChange = this.onBoardDidChangeEmitter.event;
    readonly onDiscoveredPortsDidChange = this.onDiscoveredPortsDidChangeEmitter.event;

    constructor(readonly extensionContext: vscode.ExtensionContext) {
        const { workspaceState } = extensionContext;
        this.port = workspaceState.get<Port>('arduinoTools.context.port');
        this.board = workspaceState.get<Board>('arduinoTools.context.board');
        this._cli = new CpCli(extensionContext);
        extensionContext.subscriptions.push(
            this.onPortDidChangeEmitter,
            this.onBoardDidChangeEmitter,
            this.onPortDidChange(port => workspaceState.update('arduinoTools.context.port', port)),
            this.onBoardDidChange(board => workspaceState.update('arduinoTools.context.board', board)),
            this._cli.onPortDidChange(event => {
                if (PortDidAddEvent.is(event)) {
                    const port = event;
                    if (port.boards?.length) {
                        port.boards.forEach(board => this.registerPort({ ...port, ...board }));
                    } else {
                        this.registerPort(port);
                    }
                } else {
                    this.unregisterPort(event);
                }
            })
        );
    }

    async cli(): Promise<Cli> {
        return this._cli;
    }

    get port(): Port | undefined {
        return this._port;
    }

    set port(port: Port | undefined) {
        this._port = port;
        this.onPortDidChangeEmitter.fire(this._port);
    }

    get board(): Board | undefined {
        return this._board;
    }

    set board(board: Board | undefined) {
        this._board = board;
        this.onBoardDidChangeEmitter.fire(this._board);
    }

    get discoveredPorts(): (Port & Partial<Board>)[] {
        // TODO: sort
        return Array.from(this._discoveredPorts.values()).reduce((prev, curr) => prev.concat(curr), []);
    }

    private registerPort(port: Port & Partial<Board>): void {
        const key = port.address;
        const values = this._discoveredPorts.get(key);
        if (values) {
            values.push(port);
        } else {
            this._discoveredPorts.set(key, [port]);
        }
        this.onDiscoveredPortsDidChangeEmitter.fire();
    }

    // TODO: arg should be a `Port` object, but `protocol` is not available from `board list --watch`,
    private unregisterPort({ address }: { address: string }): void {
        if (this._discoveredPorts.delete(address)) {
            this.onDiscoveredPortsDidChangeEmitter.fire();
            return;
        }
        console.log(`Could not unregister address: '${address}'. It was not registered.`);
    }

}
