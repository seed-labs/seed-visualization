export interface EmulatorNode {
    Id: string;
    Names: string[];
    Image?: string;
    ImageID?: string;
    Command?: string;
    Created?: string | number;
    Ports?: any[];
    HostConfig?: any;
    Mounts?: any[];
    State?: string;
    Status?: string;
    Labels?: Record<string, string>;
    NetworkSettings: {
        Networks: {
            [name: string]: {
                NetworkID: string,
                MacAddress: string,
                IPAddress?: string
            }
        }
    };
    meta: {
        emulatorInfo: {
            nets: {
                name: string,
                address: string
            }[],
            asn: number,
            name: string,
            role: string,
            custom?: string,
            description?: string,
            displayname?: string,
            latitude?: string,
            longitude?: string,
            lat?: number,
            lon?: number
        };
        relation?: {
            parent: Set<string>,
        };
    };
}

export interface EmulatorNetwork {
    Id: string;
    Name?: string;
    Created?: string;
    Scope?: string;
    Driver?: string;
    EnableIPv4?: boolean;
    EnableIPv6?: boolean;
    IPAM?: any;
    Internal?: boolean;
    Attachable?: boolean;
    Ingress?: boolean;
    ConfigFrom?: any;
    ConfigOnly?: boolean;
    Containers?: any;
    Options?: Record<string, string>;
    Labels?: Record<string, string>;
    meta: {
        emulatorInfo: {
            type: string,
            scope: string,
            name: string,
            prefix: string,
            description?: string,
            displayname?: string,
            lat?: number,
            lon?: number
        },
        relation?: {
            parent: Set<string>,
        },
    }
}

export interface BgpPeer {
    name: string;
    protocolState: string;
    bgpState: string;
}

export interface EmulatorNodeInfo {
    nets: {
        name: string,
        address: string
    }[],
    asn: number,
    name: string,
    role: string,
    custom?: string,
    description?: string,
    displayname?: string
}

export interface TransitsEmulatorNodeInfo {
    asn: number;
    info: EmulatorNodeInfo[]
}

export interface Response {
    ok: boolean,
    result?: any
}

export interface VisData {
    nodes: EmulatorNode[],
    nets: EmulatorNetwork[]
}
