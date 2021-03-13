import * as vscode from 'vscode';
import { ArduinoContext, Port, Board } from '../context';

export class StatusBar {

    private board = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    private port = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 201);

    constructor(arduinoContext: ArduinoContext) {
        const { extensionContext } = arduinoContext;
        this.board.command = 'arduinoTools.setBoard';
        extensionContext.subscriptions.push(
            this.board,
            this.port,
            arduinoContext.onBoardDidChange(this.updateBoard.bind(this)),
            arduinoContext.onPortDidChange(this.updatePort.bind(this))
        );
        this.updateBoard(arduinoContext.board);
        this.updatePort(arduinoContext.port);
    }

    private updatePort(port: Port | undefined): void {
        if (port) {
            this.port.text = `connected on ${port.address}`;
            this.port.show();
        } else {
            this.port.hide();
        }
    }

    private updateBoard(board: Board | undefined): void {
        if (board) {
            this.board.text = board.name;
            this.board.show();
        } else {
            this.board.hide();
        }
    }

}
