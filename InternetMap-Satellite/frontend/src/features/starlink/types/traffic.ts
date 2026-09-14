export type TrafficPacketMessage = {
  type: 'packet';
  timestamp: string;
  timestampNs?: number | string;
  containerName: string;
  containerId?: string;
  ifName?: string;
  nodeLabel?: string;
  direction?: 'ingress' | 'egress';
  nodeName?: string;
  nodeIp?: string;
  networkId?: string;
  networkName?: string;
  networkLabel?: string;
  sourceIp?: string;
  destIp?: string;
  ipProtocol?: string;
  ipProtocolNumber?: number;
  sourcePort?: number;
  destPort?: number;
  sourceContainerName?: string;
  sourceContainerId?: string;
  sourceNodeName?: string;
  sourceNodeIp?: string;
  destContainerName?: string;
  destContainerId?: string;
  destNodeName?: string;
  destNodeIp?: string;
};

export type TrafficPacketReplayEvent = TrafficPacketMessage & {
  id: string;
  timestampMs: number;
  receivedAtMs: number;
};

export type TrafficContainerNodeDetail = {
  containerId: string;
  shortContainerId: string;
  nodeName: string;
  nodeLabel?: string;
  nodeIp?: string;
  nodeType?: string;
  containerName?: string;
  longitude?: number;
  latitude?: number;
  locationSource?: 'metadata' | 'generated';
};
