export type NetworkNodeType =
  | 'satellite'
  | 'groundStation'
  | 'ground-station'
  | 'base-station'
  | 'router'
  | 'host'
  | string;

export type NetworkNodeRef = {
  id: string;
  type: NetworkNodeType;
};

export type NetworkNodeLocation = NetworkNodeRef & {
  name: string;
  longitude: number;
  latitude: number;
  altitudeMeters?: number;
};
