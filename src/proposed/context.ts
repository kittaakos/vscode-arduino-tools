import * as vscode from 'vscode';
import { Port as CliPort } from './cli/types';

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

    private _port: Port | undefined;
    private _board: Board | undefined;
    private readonly onPortDidChangeEmitter = new vscode.EventEmitter<Port | undefined>();
    private readonly onBoardDidChangeEmitter = new vscode.EventEmitter<Board | undefined>();

    readonly onPortDidChange = this.onPortDidChangeEmitter.event;
    readonly onBoardDidChange = this.onBoardDidChangeEmitter.event;

    constructor(readonly extensionContext: vscode.ExtensionContext) {
        const { workspaceState } = extensionContext;
        extensionContext.subscriptions.push(
            this.onPortDidChangeEmitter,
            this.onBoardDidChangeEmitter,
            this.onPortDidChange(port => workspaceState.update('arduinoTools.context.port', port)),
            this.onBoardDidChange(board => workspaceState.update('arduinoTools.context.board', board))
        );
        this.port = workspaceState.get<Port>('arduinoTools.context.port');
        this.board = workspaceState.get<Board>('arduinoTools.context.board');
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

}
