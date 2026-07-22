export type SatelliteShellStyle = {
  id: string;
  label: string;
  color: string;
};

export const SATELLITE_SHELL_STYLES: SatelliteShellStyle[] = [
  { id: 'S1', label: 'Shell S1', color: '#2f9bff' },
  { id: 'S2', label: 'Shell S2', color: '#2ee37f' },
  { id: 'S3', label: 'Shell S3', color: '#ff8a2a' },
  { id: 'S4', label: 'Shell S4', color: '#c83cff' },
  { id: 'S5', label: 'Shell S5', color: '#ff3f7f' },
  { id: 'other', label: 'Other', color: '#858585' },
];

const shellStyleById = new Map(SATELLITE_SHELL_STYLES.map((style) => [style.id, style]));

export function getSatelliteShellId(orbitPlaneId: string) {
  const shellId = orbitPlaneId.match(/^S\d+/i)?.[0]?.toUpperCase();

  return shellStyleById.has(shellId ?? '') ? shellId! : 'other';
}

export function getSatelliteShellStyle(orbitPlaneId: string) {
  return shellStyleById.get(getSatelliteShellId(orbitPlaneId)) ?? SATELLITE_SHELL_STYLES[SATELLITE_SHELL_STYLES.length - 1];
}
