import * as vscode from 'vscode';
import { ArduinoContext } from '../context';

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
            arduinoContext.onPortDidChange(() => this.update(arduinoContext)),
            arduinoContext.onDiscoveredPortsDidChange(() => this.update(arduinoContext))
        );
        this.update(arduinoContext);
    }

    private update(arduinoContext: ArduinoContext): void {
        const { board, port, discoveredPorts } = arduinoContext;
        if (board) {
            if (port) {
                let icon = '';
                if (discoveredPorts.some(({ address, fqbn }) => port.address === address && !!board.fqbn && board.fqbn === fqbn)) {
                    icon = '$(plug)';
                }
                this.board.text = `${icon} ${board.name}`;
                this.port.text = `on ${port.address}`;
            } else {
                this.board.text = board.name;
                this.port.text = 'not connected';
            }
            this.port.show();
        } else {
            this.board.text = '$(close) no board selected';
            this.port.hide();
        }
        this.board.show();
    }

}
