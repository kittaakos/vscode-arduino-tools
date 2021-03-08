export interface Version {
    readonly Application: string;
    readonly VersionString: string;
    readonly Commit: string;
    readonly Status: string;
    readonly Date: string;
}

export interface Core {
    readonly ID: string;
    readonly Latest: string;
    readonly Name: string;
    readonly Maintainer: string;
    readonly Website: string;
    readonly Email: string;
    readonly Installed?: string;
    readonly Boards?: ReadonlyArray<Board>;
}

export interface Board {
    readonly name: string;
    readonly fqbn?: string;
    readonly VID?: string;
    readonly PID?: string;
}
export namespace Board {
    export function is(arg: any): arg is Board {
        return !!arg && 'name' in arg && typeof arg.name === 'string';
    }
}

export interface Port {
    readonly address: string;
    readonly protocol: Port.Protocol;
    readonly protocol_label?: string;
    readonly boards?: ReadonlyArray<Board>;
}
export namespace Port {
    export type Protocol = 'serial' | 'network' | 'unknown';
}
