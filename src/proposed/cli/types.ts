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
    readonly Boards: Board[];
}
export namespace Core {
    export interface Installed extends Core {
        readonly Installed: string;
    }
    export namespace Installed {
        export function is(core: Core & Partial<Installed>): core is Installed {
            return !!core.Installed;
        }
    }
}

export interface Board {
    readonly name: string;
    readonly fqbn?: string;
}
