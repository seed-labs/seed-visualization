import { nextTick, ref, type Ref } from 'vue';
import type {
  GroundStation,
  InterSatelliteLink,
  SatelliteGroundLink,
  SatellitePoint,
} from '@/features/starlink/types';

type UseStarlinkSelectionOptions = {
  backendGroundLinks: Ref<SatelliteGroundLink[]>;
  backendLinkedSatelliteIds: Ref<string[]>;
  backendSatelliteLinks: Ref<InterSatelliteLink[]>;
  closeGroundStationDetail: () => void;
  closeSatelliteDetail: () => void;
  closeTrafficContainerDetail: () => void;
  flashFocusedSatellite: (satelliteId: string) => Promise<void>;
  flashFocusedStation: (stationId: string) => Promise<void>;
  groundStations: Ref<GroundStation[]>;
  hiddenBackendGroundStationIds: Ref<string[]>;
  hiddenBackendSatelliteIds: Ref<string[]>;
  hiddenBackendSatelliteLinkIds: Ref<string[]>;
};

export function useStarlinkSelection(options: UseStarlinkSelectionOptions) {
  const selectedSatelliteId = ref<string>();
  const selectedStationId = ref<string>();
  const selectedGroundStationIds = ref<string[]>([]);
  const visibleOrbitIds = ref<string[]>([]);
  const frontSatelliteId = ref<string>();
  const frontStationId = ref<string>();

  function toggleSatelliteOrbit(satellite: SatellitePoint) {
    options.closeGroundStationDetail();
    options.closeTrafficContainerDetail();
    selectedSatelliteId.value = satellite.id;
    void options.flashFocusedSatellite(satellite.id);
    void turnSatelliteToFront(satellite.id);
    toggleSatelliteOrbitState(satellite);
  }

  function toggleSatelliteOrbitFromGlobe(satellite: SatellitePoint) {
    options.closeGroundStationDetail();
    options.closeTrafficContainerDetail();
    selectedSatelliteId.value = satellite.id;
    void options.flashFocusedSatellite(satellite.id);
    toggleSatelliteOrbitState(satellite);
  }

  function focusSelectedSatellite(satellite: SatellitePoint) {
    options.closeGroundStationDetail();
    options.closeTrafficContainerDetail();
    selectedSatelliteId.value = satellite.id;
    void options.flashFocusedSatellite(satellite.id);
    void turnSatelliteToFront(satellite.id);
  }

  function toggleSatelliteOrbitState(satellite: SatellitePoint) {
    selectedSatelliteId.value = satellite.id;
    const orbitVisible = visibleOrbitIds.value.includes(satellite.id);
    if (orbitVisible) {
      removeSatelliteOrbit(satellite);
      return;
    }

    visibleOrbitIds.value = [...visibleOrbitIds.value, satellite.id];
  }

  function removeSatelliteOrbit(satellite: SatellitePoint) {
    visibleOrbitIds.value = visibleOrbitIds.value.filter((id) => id !== satellite.id);
    removeBackendSatellite(satellite.id);
    if (selectedSatelliteId.value === satellite.id) {
      selectedSatelliteId.value = undefined;
      options.closeSatelliteDetail();
    }
  }

  function removeAllSatelliteOrbits() {
    visibleOrbitIds.value = [];
    hideBackendSatellites(options.backendLinkedSatelliteIds.value);
    hideBackendSatelliteLinks(
      options.backendSatelliteLinks.value.flatMap((link) => [link.satelliteAId, link.satelliteBId]),
    );
    options.backendGroundLinks.value = [];
    options.backendSatelliteLinks.value = [];
    options.backendLinkedSatelliteIds.value = [];
    selectedSatelliteId.value = undefined;
    options.closeSatelliteDetail();
  }

  function removeBackendSatellite(satelliteId: string) {
    if (options.backendLinkedSatelliteIds.value.includes(satelliteId)) {
      hideBackendSatellites([satelliteId]);
      options.backendGroundLinks.value = options.backendGroundLinks.value.filter(
        (link) => link.satelliteId !== satelliteId,
      );
      options.backendLinkedSatelliteIds.value = options.backendLinkedSatelliteIds.value.filter(
        (id) => id !== satelliteId,
      );
    }

    const hasSatelliteLink = options.backendSatelliteLinks.value.some(
      (link) => link.satelliteAId === satelliteId || link.satelliteBId === satelliteId,
    );
    if (hasSatelliteLink) {
      hideBackendSatelliteLinks([satelliteId]);
      options.backendSatelliteLinks.value = options.backendSatelliteLinks.value.filter(
        (link) => link.satelliteAId !== satelliteId && link.satelliteBId !== satelliteId,
      );
    }
  }

  function hideBackendSatellites(satelliteIds: string[]) {
    if (!satelliteIds.length) {
      return;
    }

    options.hiddenBackendSatelliteIds.value = Array.from(
      new Set([...options.hiddenBackendSatelliteIds.value, ...satelliteIds]),
    );
  }

  function hideBackendSatelliteLinks(satelliteIds: string[]) {
    if (!satelliteIds.length) {
      return;
    }

    options.hiddenBackendSatelliteLinkIds.value = Array.from(
      new Set([...options.hiddenBackendSatelliteLinkIds.value, ...satelliteIds]),
    );
  }

  function focusGroundStation(station: GroundStation) {
    selectedStationId.value = station.id;
    void options.flashFocusedStation(station.id);
    void turnStationToFront(station.id);
    options.closeSatelliteDetail();
  }

  function focusGroundStationFromGlobe(station: GroundStation) {
    selectedStationId.value = station.id;
    void options.flashFocusedStation(station.id);
    options.closeSatelliteDetail();
  }

  async function turnSatelliteToFront(satelliteId: string) {
    frontSatelliteId.value = undefined;
    await nextTick();
    frontSatelliteId.value = satelliteId;
  }

  async function turnStationToFront(stationId: string) {
    frontStationId.value = undefined;
    await nextTick();
    frontStationId.value = stationId;
  }

  function updateGroundStationSelection(stationIds: string[]) {
    const validStationIds = new Set(options.groundStations.value.map((station) => station.id));
    const nextStationIds = Array.from(
      new Set(stationIds.filter((stationId) => validStationIds.has(stationId))),
    );
    const nextStationIdSet = new Set(nextStationIds);
    const removedStationIds = selectedGroundStationIds.value.filter(
      (stationId) => !nextStationIdSet.has(stationId),
    );

    options.hiddenBackendGroundStationIds.value = Array.from(
      new Set([...options.hiddenBackendGroundStationIds.value, ...removedStationIds]),
    ).filter((stationId) => !nextStationIdSet.has(stationId));
    selectedGroundStationIds.value = nextStationIds;

    if (selectedStationId.value && !nextStationIdSet.has(selectedStationId.value)) {
      selectedStationId.value = undefined;
      options.closeGroundStationDetail();
    }
  }

  return {
    focusGroundStation,
    focusGroundStationFromGlobe,
    focusSelectedSatellite,
    frontSatelliteId,
    frontStationId,
    hideBackendSatelliteLinks,
    hideBackendSatellites,
    removeAllSatelliteOrbits,
    removeSatelliteOrbit,
    selectedGroundStationIds,
    selectedSatelliteId,
    selectedStationId,
    toggleSatelliteOrbit,
    toggleSatelliteOrbitFromGlobe,
    updateGroundStationSelection,
    visibleOrbitIds,
  };
}
