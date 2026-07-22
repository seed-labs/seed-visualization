export type PlannedOrbitRecord = {
  id: string;
  name: string;
  noradId: number;
  orbitPlaneId: string;
  epochUtc: string;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  raanDeg: number;
  argumentOfPerigeeDeg: number;
  meanAnomalyDeg: number;
  line1: string;
  line2: string;
};

export type SatellitePoint = PlannedOrbitRecord & {
  longitude: number;
  latitude: number;
  altitudeKm: number;
  velocityKmS: number;
};

export type GroundStation = {
  id: string;
  name: string;
  city: string;
  longitude: number;
  latitude: number;
  altitudeMeters: number;
};

export type SatelliteGroundLink = {
  satelliteId: string;
  stationId: string;
  distanceKm: number;
};

export type SatelliteGroundLinkFrame = {
  links: SatelliteGroundLink[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};

export type InterSatelliteLink = {
  satelliteAId: string;
  satelliteBId: string;
};

export type SatelliteLinkFrame = {
  links: InterSatelliteLink[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};

export type GroundLinkState = {
  groundStationId: string;
  satelliteId: string;
};

export type LinkUpdateState = {
  groundLinks: GroundLinkState[];
  satelliteLinks: InterSatelliteLink[];
};

export type SatelliteLinksRequest = {
  interval: string;
  links: LinkUpdateState[];
  timestamp: string;
  type?: 'satellite';
};

export type NetworkNodeType = 'satellite' | 'groundStation' | 'ground-station' | 'base-station' | 'router' | 'host' | string;

export type NetworkNodeRef = {
  id: string;
  type: NetworkNodeType;
  latencyMs?: number;
  packetLoss?: number;
};

export type NetworkNodeLocation = NetworkNodeRef & {
  name: string;
  longitude: number;
  latitude: number;
  altitudeMeters?: number;
};

export type TrafficPacketMessage = {
  type: 'packet';
  timestamp: string;
  timestampNs?: number | string;
  containerId: string;
  direction?: 'ingress' | 'egress';
  nodeName?: string;
  nodeIp?: string;
  sourceIp?: string;
  destIp?: string;
  ipProtocol?: string;
  sourcePort?: number;
  destPort?: number;
  sourceContainerId?: string;
  sourceNodeName?: string;
  sourceNodeIp?: string;
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
  nodeIp?: string;
  nodeType?: string;
  containerName?: string;
  longitude?: number;
  latitude?: number;
  locationSource?: 'metadata' | 'generated';
};

export type NetworkPathUpdateState = {
  id?: string;
  forwardPath: NetworkNodeRef[];
  returnPath: NetworkNodeRef[];
};

export type NetworkLinksRequest = {
  interval: string;
  links: NetworkPathUpdateState[];
  timestamp: string;
  type: 'network';
};

export type LinksRequest = SatelliteLinksRequest | NetworkLinksRequest;

export type NetworkLinkFrame = {
  links: NetworkPathUpdateState[];
  sampleTime: Date;
  requestIndex: number;
  groupIndex: number;
  completed?: boolean;
};

export type SimulationSettings = {
  speed: number;
  paused: boolean;
  customTimeEnabled: boolean;
  showSatellites: boolean;
  showGroundStations: boolean;
  showOrbits: boolean;
  showLabels: boolean;
  showSelectionDetails: boolean;
  useLocalGroundLinks: boolean;
  hideLinksForFilteredSatellites: boolean;
  search: string;
  invertSearch: boolean;
  altitudeMinKm?: number;
  altitudeMaxKm?: number;
  invertAltitude: boolean;
  selectedOrbitPlaneIds: string[];
  invertOrbitPlanes: boolean;
};

export type SatelliteDetailRow = {
  label: string;
  value: string;
};

export type ScreenAnchor = {
  x: number;
  y: number;
};
