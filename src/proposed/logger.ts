import * as vscode from 'vscode';

export namespace Logger {
    export type Level = 'info' | 'warn' | 'error';
}

export interface Logger {
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    log(level: Logger.Level, message: string, data: any): void
}

export abstract class LoggerImpl implements Logger {
    info(message: string, data?: any): void {
        this.log('info', message, data);
    }
    warn(message: string, data?: any): void {
        this.log('warn', message, data);
    }
    error(message: string, data?: any): void {
        this.log('error', message, data);
    }
    abstract log(level: Logger.Level, message: string, data: any): void;
}

export class ConsoleLogger extends LoggerImpl {
    log(level: Logger.Level, message: string, data: any): void {
        console.log(`[${level.toUpperCase()}] ${message}`);
    }
}

export class CompositeLogger extends LoggerImpl {
    constructor(protected readonly children: Logger[]) { super(); }
    log(level: Logger.Level, message: string, data: any): void {
        for (const child of this.children) {
            child.log(level, message, data);
        }
    }
    addChild(logger: Logger): vscode.Disposable {
        this.children.push(logger);
        return new vscode.Disposable(() => {
            const index = this.children.indexOf(logger);
            if (index !== -1) {
                this.children.splice(index, 1);
            }
        });
    }
}

export class OutputChannelLogger extends LoggerImpl {

    private readonly outputChannel: vscode.OutputChannel;

    constructor(channelName: string, context: vscode.ExtensionContext) {
        super();
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        context.subscriptions.push(this.outputChannel);
    }

    log(level: Logger.Level, message: string, data?: any): void {
        this.outputChannel.appendLine(`[${level.toUpperCase()}] ${message}`);
        // TODO: `data`.
    }

}
