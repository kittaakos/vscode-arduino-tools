import * as vscode from 'vscode';
import { ArduinoContext, Port, Board } from '../context';

export class StatusBar {

    private readonly board: vscode.StatusBarItem;
    private readonly port: vscode.StatusBarItem;

    constructor(arduinoContext: ArduinoContext) {
        const { extensionContext } = arduinoContext;
        this.board = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 201);
        this.board.command = 'arduinoTools.configureBoard';
        this.port = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
        this.port.command = 'arduinoTools.configurePort';
        extensionContext.subscriptions.push(
            this.board,
            this.port,
            arduinoContext.onBoardDidChange(() => this.update(arduinoContext)),
            arduinoContext.onPortDidChange(() => this.update(arduinoContext))
        );
        this.update(arduinoContext);
    }

    private update({ board, port }: { port: Port | undefined, board: Board | undefined }): void {
        if (!board) {
            this.board.text = '$(close) no board selected';
            this.board.show();
            this.port.hide();
            return;
        }
        if (board && port) {
            this.board.text = `$(plug) ${board.name}`;
            this.port.text = `on ${port.address}`;
            this.board.show();
            this.port.show();
            return;
        }
        if (board) {
            this.board.text = board.name;
            this.port.text = 'not connected';
            this.board.show();
            this.port.show();
            return;
        }
    }

}
