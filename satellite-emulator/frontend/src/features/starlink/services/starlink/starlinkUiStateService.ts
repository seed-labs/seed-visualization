import { getSatelliteShellId } from '@/features/starlink/services/satelliteShellStyle';
import type { TrafficPacketMessage } from '@/features/starlink/types';

export function isIngressTrafficPacket(message: TrafficPacketMessage) {
  return message.direction === undefined || message.direction === 'ingress';
}

export function normalizeContainerNodeType(role: string | undefined) {
  const normalizedRole = role?.toLowerCase() ?? '';

  if (normalizedRole.includes('host')) {
    return 'host';
  }

  if (normalizedRole.includes('router')) {
    return 'router';
  }

  return role || 'container';
}

export function sanitizeOrbitPlaneIdsForHiddenShells(
  planeIds: string[],
  hiddenShellIdsSnapshot: string[],
) {
  const hiddenShellSet = new Set(hiddenShellIdsSnapshot);

  return planeIds.filter((planeId) => !hiddenShellSet.has(getSatelliteShellId(planeId)));
}
