import * as vscode from 'vscode';
import * as cli from './cli/api';

export function activate(context: vscode.ExtensionContext): void {
    cli.activate(context);
}
