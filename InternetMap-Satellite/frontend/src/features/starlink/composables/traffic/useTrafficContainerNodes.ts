import { computed, nextTick, ref, type Ref } from 'vue';
import {
  TRAFFIC_FALLBACK_MIN_DISTANCE_KM,
  TRAFFIC_NODE_FLASH_MS,
} from '@/features/starlink/constants/trafficReplay';
import {
  fetchEmulatorContainers,
  type EmulatorContainerInfo,
} from '@/features/starlink/services/emulatorContainerService';
import {
  getContainerGeoLocation,
  getFallbackTrafficNodeLocation,
  getNearestLocationDistanceKm,
  getOccupiedTrafficNodeLocations,
  getTrafficLocationCity,
  pickFallbackTrafficNodeLocation,
  type TrafficFallbackLocationMap,
} from '@/features/starlink/services/traffic/trafficContainerLocationService';
import {
  normalizeContainerNodeType,
} from '@/features/starlink/services/starlink/starlinkUiStateService';
import type {
  NetworkNodeLocation,
  TrafficContainerNodeDetail,
  TrafficPacketMessage,
} from '@/features/starlink/types';

type UseTrafficContainerNodesOptions = {
  closeAllSelectionDetails: () => void;
  statusTrafficContainerId: Ref<string | undefined>;
  trafficNodeSearchInput: Ref<string>;
};

type TrafficContainerLocation = {
  city?: string;
  latitude: number;
  longitude: number;
  source?: TrafficContainerNodeDetail['locationSource'];
};

export function useTrafficContainerNodes(options: UseTrafficContainerNodesOptions) {
  const emulatorContainers = ref<EmulatorContainerInfo[]>([]);
  const fallbackTrafficNodeLocations = ref<TrafficFallbackLocationMap>({});
  const focusedTrafficContainerNodeId = ref<string>();
  const trafficContainerActiveUntil = ref<Record<string, number>>({});
  const trafficContainerDetails = ref<Record<string, TrafficContainerNodeDetail>>({});

  const containerNodes = computed<NetworkNodeLocation[]>(() => {
    const nodes = emulatorContainers.value
      .map((container) => {
        const emulatorInfo = container.meta?.emulatorInfo;
        const detail = getTrafficContainerDetail(container.Id);

        if (!emulatorInfo?.name) {
          return undefined;
        }

        const location = getTrafficContainerLocation(container, detail);
        if (!location) {
          return undefined;
        }

        return {
          id: container.Id,
          type: normalizeContainerNodeType(emulatorInfo.role),
          name:
            detail?.nodeLabel ||
            detail?.nodeName ||
            getContainerNodeLabel(container) ||
            getTrafficLocationCity(location) ||
            emulatorInfo.name,
          longitude: location.longitude,
          latitude: location.latitude,
        };
      })
      .filter((node): node is NetworkNodeLocation => Boolean(node));

    const existingIds = new Set(nodes.map((node) => node.id));
    Object.values(trafficContainerDetails.value).forEach((detail) => {
      if (existingIds.has(detail.containerId)) {
        return;
      }

      const fallbackLocation = getFallbackTrafficNodeLocation(
        fallbackTrafficNodeLocations.value,
        detail.containerId,
      );
      if (!fallbackLocation && (detail.longitude === undefined || detail.latitude === undefined)) {
        return;
      }

      nodes.push({
        id: detail.containerId,
        type: normalizeContainerNodeType(detail.nodeType),
        name: detail.nodeLabel || detail.nodeName || detail.shortContainerId,
        longitude: detail.longitude ?? fallbackLocation!.longitude,
        latitude: detail.latitude ?? fallbackLocation!.latitude,
      });
    });

    return nodes;
  });

  const containerNodeIdByContainerId = computed(() => {
    const idMap = new Map<string, string>();

    emulatorContainers.value.forEach((container) => {
      const nodeId = container.meta?.emulatorInfo?.name;
      if (!nodeId) {
        return;
      }

      idMap.set(container.Id, nodeId);
      idMap.set(container.Id.slice(0, 12), nodeId);
    });

    return idMap;
  });

  const activeTrafficNodeIds = computed(() => Object.keys(trafficContainerActiveUntil.value));

  const trafficNodeSearchKeyword = computed(() =>
    options.trafficNodeSearchInput.value.trim().toLowerCase(),
  );

  const trafficSearchableContainerNodes = computed<TrafficContainerNodeDetail[]>(() => {
    const nodesByContainerId = new Map<string, TrafficContainerNodeDetail>();

    emulatorContainers.value.forEach((container) => {
      const detail = getTrafficContainerDetail(container.Id);
      if (detail) {
        nodesByContainerId.set(detail.containerId, detail);
      }
    });

    Object.values(trafficContainerDetails.value).forEach((detail) => {
      nodesByContainerId.set(detail.containerId, detail);
    });

    return Array.from(nodesByContainerId.values()).sort((left, right) =>
      left.nodeName.localeCompare(right.nodeName, undefined, { numeric: true }),
    );
  });

  const trafficNodeSearchResults = computed(() => {
    const keyword = trafficNodeSearchKeyword.value;
    if (!keyword) {
      return [];
    }

    return trafficSearchableContainerNodes.value.filter((node) =>
      [
        node.nodeName,
        node.nodeLabel,
        node.nodeIp,
        node.containerName,
        node.containerId,
        node.shortContainerId,
        node.nodeType,
      ].some((value) => value?.toLowerCase().includes(keyword)),
    );
  });

  const visibleTrafficNodeSearchResults = computed(() => trafficNodeSearchResults.value.slice(0, 8));

  function rememberTrafficPacketNodes(message: TrafficPacketMessage) {
    rememberTrafficContainerDetail(getMessageContainerIdentifier(message), {
      nodeLabel: message.nodeLabel,
      nodeName: message.nodeName,
      nodeIp: message.nodeIp,
    });
  }

  function triggerTrafficPacket(message: TrafficPacketMessage) {
    rememberTrafficPacketNodes(message);
    markTrafficContainerActive(getMessageContainerIdentifier(message));
  }

  function getMessageContainerIdentifier(message: TrafficPacketMessage) {
    return message.containerName || message.containerId || '';
  }

  function rememberTrafficContainerDetail(
    containerId: string,
    detail: { nodeLabel?: string; nodeName?: string; nodeIp?: string },
  ) {
    if (!containerId) {
      return;
    }

    const container = findEmulatorContainer(containerId);
    const emulatorInfo = container?.meta?.emulatorInfo;
    const normalizedContainerId = container?.Id ?? containerId;
    const previous = getTrafficContainerDetail(normalizedContainerId);
    const location = container
      ? getTrafficContainerLocation(container, previous)
      : getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, normalizedContainerId);
    const nodeName =
      detail.nodeName ||
      previous?.nodeName ||
      emulatorInfo?.displayname ||
      emulatorInfo?.name ||
      normalizedContainerId.slice(0, 12);

    trafficContainerDetails.value = {
      ...trafficContainerDetails.value,
      [normalizedContainerId]: {
        containerId: normalizedContainerId,
        shortContainerId: normalizedContainerId.slice(0, 12),
        nodeLabel: detail.nodeLabel || previous?.nodeLabel || getContainerNodeLabel(container),
        nodeName,
        nodeIp: detail.nodeIp || previous?.nodeIp,
        nodeType: previous?.nodeType || emulatorInfo?.role,
        containerName: previous?.containerName || getContainerName(container) || containerId,
        longitude: location?.longitude ?? previous?.longitude,
        latitude: location?.latitude ?? previous?.latitude,
        locationSource: getTrafficLocationSource(location) ?? previous?.locationSource,
      },
    };
  }

  function getTrafficContainerDetail(containerId: string): TrafficContainerNodeDetail | undefined {
    const container = findEmulatorContainer(containerId);
    const normalizedContainerId = container?.Id ?? containerId;
    const stored =
      trafficContainerDetails.value[normalizedContainerId] ??
      trafficContainerDetails.value[normalizedContainerId.slice(0, 12)] ??
      Object.values(trafficContainerDetails.value).find((item) =>
        item.containerId.startsWith(containerId) || containerId.startsWith(item.containerId),
      );

    const emulatorInfo = container?.meta?.emulatorInfo;
    const location = container
      ? getTrafficContainerLocation(container, stored)
      : (
          stored?.longitude !== undefined && stored.latitude !== undefined
            ? { longitude: stored.longitude, latitude: stored.latitude, source: stored.locationSource }
            : getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, normalizedContainerId)
              ? {
                  ...getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, normalizedContainerId)!,
                  source: 'generated' as const,
                }
              : undefined
        );

    if (stored) {
      return {
        ...stored,
        longitude: location?.longitude ?? stored.longitude,
        latitude: location?.latitude ?? stored.latitude,
        locationSource: location?.source ?? stored.locationSource,
      };
    }

    if (!container || !emulatorInfo?.name) {
      return undefined;
    }

    return {
      containerId: container.Id,
      shortContainerId: container.Id.slice(0, 12),
      nodeName: emulatorInfo.displayname || emulatorInfo.name,
      nodeLabel: getContainerNodeLabel(container),
      nodeType: emulatorInfo.role,
      containerName: getContainerName(container),
      longitude: location?.longitude,
      latitude: location?.latitude,
      locationSource: location?.source,
    };
  }

  function getTrafficContainerLocation(
    container: EmulatorContainerInfo,
    detail?: TrafficContainerNodeDetail,
  ): TrafficContainerLocation | undefined {
    const metadataLocation = getContainerGeoLocation(container);
    if (metadataLocation) {
      return {
        ...metadataLocation,
        source: 'metadata' as const,
      };
    }

    const fallbackLocation =
      getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, container.Id) ??
      getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, container.meta?.emulatorInfo?.name) ??
      (
        detail?.longitude !== undefined && detail.latitude !== undefined
          ? { longitude: detail.longitude, latitude: detail.latitude, city: undefined }
          : undefined
      );

    if (!fallbackLocation) {
      return undefined;
    }

    return {
      ...fallbackLocation,
      source: 'generated' as const,
    };
  }

  function getTrafficLocationSource(location: unknown): TrafficContainerNodeDetail['locationSource'] {
    return typeof location === 'object' &&
      location !== null &&
      'source' in location &&
      (location.source === 'metadata' || location.source === 'generated')
      ? location.source
      : undefined;
  }

  function rememberTrafficContainerLocation(
    containerId: string,
    location: { longitude: number; latitude: number },
    source: TrafficContainerNodeDetail['locationSource'],
  ) {
    const previous = getTrafficContainerDetail(containerId);
    const container = findEmulatorContainer(containerId);
    const emulatorInfo = container?.meta?.emulatorInfo;
    const normalizedContainerId = container?.Id ?? containerId;

    trafficContainerDetails.value = {
      ...trafficContainerDetails.value,
      [normalizedContainerId]: {
        containerId: normalizedContainerId,
        shortContainerId: normalizedContainerId.slice(0, 12),
        nodeLabel: previous?.nodeLabel || getContainerNodeLabel(container),
        nodeName:
          previous?.nodeName ||
          emulatorInfo?.displayname ||
          emulatorInfo?.name ||
          normalizedContainerId.slice(0, 12),
        nodeIp: previous?.nodeIp,
        nodeType: previous?.nodeType || emulatorInfo?.role,
        containerName: previous?.containerName || getContainerName(container),
        longitude: location.longitude,
        latitude: location.latitude,
        locationSource: source,
      },
    };
  }

  function findEmulatorContainer(containerId: string) {
    const normalized = normalizeContainerIdentifier(containerId);
    return emulatorContainers.value.find((container) =>
      container.Id === containerId ||
      container.Id.startsWith(containerId) ||
      containerId.startsWith(container.Id) ||
      normalizeContainerIdentifier(getContainerName(container)) === normalized ||
      (container.Names ?? []).some((name) => normalizeContainerIdentifier(name) === normalized),
    );
  }

  function getContainerName(container: EmulatorContainerInfo | undefined) {
    return container?.Names?.[0]?.replace(/^\//, '');
  }

  function getContainerNodeLabel(container: EmulatorContainerInfo | undefined) {
    const emulatorInfo = container?.meta?.emulatorInfo;
    if (!emulatorInfo) {
      return undefined;
    }
    if (emulatorInfo.displayname) {
      return emulatorInfo.displayname;
    }
    if (emulatorInfo.asn !== undefined && emulatorInfo.name) {
      return `${emulatorInfo.asn}/${emulatorInfo.name}`;
    }
    return emulatorInfo.name;
  }

  async function selectTrafficNodeSearchResult(containerId: string) {
    const detail = getTrafficContainerDetail(containerId);
    const container = findEmulatorContainer(containerId);
    const normalizedContainerId = container?.Id ?? containerId;

    rememberTrafficContainerDetail(containerId, {
      nodeName: detail?.nodeName,
      nodeIp: detail?.nodeIp,
    });
    ensureTrafficContainerVisible(containerId);
    focusedTrafficContainerNodeId.value = undefined;
    await nextTick();
    focusedTrafficContainerNodeId.value = normalizedContainerId;
    markTrafficContainerActive(containerId);
    options.statusTrafficContainerId.value = containerId;
    options.closeAllSelectionDetails();
  }

  function markTrafficContainerActive(containerId: string) {
    if (!containerId) {
      return;
    }

    ensureTrafficContainerVisible(containerId);
    const normalizedContainerId = findEmulatorContainer(containerId)?.Id ?? containerId;
    const activeUntil = Date.now() + TRAFFIC_NODE_FLASH_MS;
    trafficContainerActiveUntil.value = {
      ...trafficContainerActiveUntil.value,
      [normalizedContainerId]: activeUntil,
    };
  }

  function cleanupInactiveTrafficContainers() {
    const nowMs = Date.now();
    const activeEntries = Object.entries(trafficContainerActiveUntil.value).filter(
      ([, activeUntil]) => activeUntil > nowMs,
    );
    const nextActiveUntil = Object.fromEntries(activeEntries);

    if (activeEntries.length !== Object.keys(trafficContainerActiveUntil.value).length) {
      trafficContainerActiveUntil.value = nextActiveUntil;
    }
  }

  async function refreshEmulatorContainers() {
    try {
      emulatorContainers.value = await fetchEmulatorContainers();
      Object.keys(trafficContainerActiveUntil.value).forEach((containerId) => {
        ensureTrafficContainerVisible(containerId);
      });
    } catch (error) {
      console.warn('Failed to load emulator containers.', error);
    }
  }

  function findContainerNodeId(containerId: string) {
    return (
      containerNodeIdByContainerId.value.get(containerId) ??
      Array.from(containerNodeIdByContainerId.value.entries()).find(([knownContainerId]) =>
        knownContainerId.startsWith(containerId) || containerId.startsWith(knownContainerId),
      )?.[1]
    );
  }

  function ensureTrafficContainerVisible(containerId: string) {
    const container = findEmulatorContainer(containerId);
    if (!container || getContainerGeoLocation(container)) {
      return;
    }

    const nodeName = container.meta?.emulatorInfo?.name;
    const existingLocation =
      getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, container.Id) ??
      getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, nodeName);
    if (existingLocation) {
      const occupiedLocations = getOccupiedTrafficNodeLocations(
        emulatorContainers.value,
        fallbackTrafficNodeLocations.value,
        container.Id,
      );
      const nearestDistanceKm = getNearestLocationDistanceKm(existingLocation, occupiedLocations);
      if (nearestDistanceKm >= TRAFFIC_FALLBACK_MIN_DISTANCE_KM || !occupiedLocations.length) {
        if (!getFallbackTrafficNodeLocation(fallbackTrafficNodeLocations.value, container.Id)) {
          fallbackTrafficNodeLocations.value = {
            ...fallbackTrafficNodeLocations.value,
            [container.Id]: existingLocation,
          };
        }
        rememberTrafficContainerLocation(container.Id, existingLocation, 'generated');
        return;
      }
    }

    const fallbackLocation = pickFallbackTrafficNodeLocation(
      container.Id,
      emulatorContainers.value,
      fallbackTrafficNodeLocations.value,
      TRAFFIC_FALLBACK_MIN_DISTANCE_KM,
    );
    fallbackTrafficNodeLocations.value = {
      ...fallbackTrafficNodeLocations.value,
      [container.Id]: fallbackLocation,
    };
    rememberTrafficContainerLocation(container.Id, fallbackLocation, 'generated');
  }

  function normalizeContainerIdentifier(value: string | undefined) {
    return value?.replace(/^\//, '').trim().toLowerCase() ?? '';
  }

  function clearActiveTrafficContainers() {
    trafficContainerActiveUntil.value = {};
  }

  return {
    activeTrafficNodeIds,
    cleanupInactiveTrafficContainers,
    clearActiveTrafficContainers,
    containerNodes,
    emulatorContainers,
    findContainerNodeId,
    focusedTrafficContainerNodeId,
    getTrafficContainerDetail,
    markTrafficContainerActive,
    refreshEmulatorContainers,
    rememberTrafficPacketNodes,
    selectTrafficNodeSearchResult,
    trafficNodeSearchKeyword,
    trafficNodeSearchResults,
    triggerTrafficPacket,
    visibleTrafficNodeSearchResults,
  };
}
