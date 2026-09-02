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
