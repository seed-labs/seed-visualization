<template>
  <main class="starlink-shell">
    <CesiumGlobe
      :satellites="displayedSatellites"
      :orbit-records="visibleOrbitRecords"
      :selected-id="selectedSatelliteId"
      :highlighted-ids="highlightedSatelliteIds"
      :ground-stations="groundStations"
      :ground-links="groundLinks"
      :satellite-links="backendSatelliteLinks"
      :focused-satellite-id="focusedSatelliteId"
      :focused-station-id="focusedStationId"
      :focus-satellite-zoom="effectiveFocusSatelliteZoom"
      :show-labels="settings.showLabels"
      :current-time="renderTime"
      @select="toggleSatelliteOrbitFromGlobe"
      @select-station="focusGroundStation"
    />

    <section class="overview-panel">
      <span class="panel-kicker">STARLINK SIMULATION</span>
      <h1>Starlink Satellite 3D Globe Simulation</h1>
      <p>{{ renderIsoTime }} UTC</p>
    </section>

    <SatelliteList
      :satellites="displayedSatellites"
      :selected-satellites="selectedOrbitSatellites"
      :ground-stations="groundStations"
      :settings="settings"
      :current-time="renderTime"
      :selected-id="selectedSatelliteId"
      @select="toggleSatelliteOrbit"
      @focus-selected="focusSelectedSatellite"
      @remove="removeSatelliteOrbit"
      @remove-all="removeAllSatelliteOrbits"
      @station-select="focusGroundStation"
      @station-focus="focusGroundStation"
      @update-settings="updateSettings"
      @set-system-time="setSystemTime"
      @reset-system-time="resetSystemTime"
    />

    <SatelliteDetailPanel
      :visible="detailVisible"
      :satellite="selectedSatellite"
      @close="detailVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import CesiumGlobe from '@/features/starlink/components/CesiumGlobe.vue';
import SatelliteDetailPanel from '@/features/starlink/components/SatelliteDetailPanel.vue';
import SatelliteList from '@/features/starlink/components/SatelliteList.vue';
import { useSimulationClock } from '@/features/starlink/composables/useSimulationClock';
import { SatelliteDataSource } from '@/features/starlink/services/satelliteDataSource';
import {
  createNearestGroundLinks,
  fetchGroundStationsFromEmulator,
  mockGroundStations,
} from '@/features/starlink/services/groundStationService';
import { propagateMany } from '@/features/starlink/services/orbitService';
import { parsePlannedOrbitRecords } from '@/features/starlink/services/tleService';
import type {
  GroundStation,
  InterSatelliteLink,
  SatelliteGroundLink,
  SatellitePoint,
  SimulationSettings,
} from '@/features/starlink/types';

const records = parsePlannedOrbitRecords();
const settings = reactive<SimulationSettings>({
  speed: 1,
  customTimeEnabled: false,
  showOrbits: true,
  showLabels: true,
  focusSatelliteZoom: true,
  showSatelliteStatus: true,
  useLocalGroundLinks: false,
  search: '',
});
const selectedSatelliteId = ref<string>();
const selectedStationId = ref<string>();
const focusedSatelliteOverrideId = ref<string>();
const frontOnlySatelliteFocus = ref(false);
const detailVisible = ref(false);
const visibleOrbitIds = ref<string[]>([]);
const groundStations = ref<GroundStation[]>(mockGroundStations);
const backendGroundLinks = ref<SatelliteGroundLink[]>([]);
const backendSatelliteLinks = ref<InterSatelliteLink[]>([]);
const backendLinkedSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteLinkIds = ref<string[]>([]);
const satelliteDataSource = new SatelliteDataSource(() => settings.speed);
const backendGroundLinkTime = ref<Date>();
const backendSatelliteLinkTime = ref<Date>();
const { now, setTime } = useSimulationClock(() => settings.speed);

onMounted(async () => {
  try {
    const stations = await fetchGroundStationsFromEmulator();
    if (stations.length) {
      groundStations.value = stations;
    }
  } catch (error) {
    console.warn('Failed to load emulator star nodes as ground stations.', error);
  }

  satelliteDataSource.on('ground-links', (frame) => {
    if (frame.completed) {
      backendGroundLinks.value = [];
      backendGroundLinkTime.value = undefined;
      backendLinkedSatelliteIds.value = [];
      hiddenBackendSatelliteIds.value = [];
      return;
    }

    if (frame.requestIndex === 0 && frame.groupIndex === 0) {
      hiddenBackendSatelliteIds.value = [];
    }

    const hiddenIds = new Set(hiddenBackendSatelliteIds.value);
    backendGroundLinks.value = frame.links.filter((link) => !hiddenIds.has(link.satelliteId));
    backendGroundLinkTime.value = frame.sampleTime;
    backendLinkedSatelliteIds.value = Array.from(new Set(backendGroundLinks.value.map((link) => link.satelliteId)));
  });
  satelliteDataSource.on('satellite-links', (frame) => {
    if (frame.completed) {
      backendSatelliteLinks.value = [];
      backendSatelliteLinkTime.value = undefined;
      hiddenBackendSatelliteLinkIds.value = [];
      return;
    }

    if (frame.requestIndex === 0 && frame.groupIndex === 0) {
      hiddenBackendSatelliteLinkIds.value = [];
    }

    const hiddenIds = new Set(hiddenBackendSatelliteLinkIds.value);
    backendSatelliteLinks.value = frame.links.filter(
      (link) => !hiddenIds.has(link.satelliteAId) && !hiddenIds.has(link.satelliteBId),
    );
    backendSatelliteLinkTime.value = frame.sampleTime;
  });
  satelliteDataSource.on('dead', (error) => {
    console.warn('Satellite ground-link websocket disconnected.', error);
  });
  satelliteDataSource.connect();
});

onUnmounted(() => {
  satelliteDataSource.disconnect();
});

const filteredRecords = computed(() => {
  const search = settings.search.trim().toLowerCase();
  if (!search) {
    return records;
  }

  return records.filter(
    (record) => record.name.toLowerCase().includes(search) || record.id.includes(search),
  );
});

const visibleRecords = computed(() => filteredRecords.value);
const renderTime = computed(() => {
  if (settings.customTimeEnabled) {
    return now.value;
  }

  if (settings.useLocalGroundLinks) {
    return backendSatelliteLinkTime.value ?? now.value;
  }

  const linkTimes = [backendGroundLinkTime.value, backendSatelliteLinkTime.value].filter(
    (value): value is Date => Boolean(value),
  );
  return linkTimes.length
    ? new Date(Math.max(...linkTimes.map((value) => value.getTime())))
    : now.value;
});
const renderIsoTime = computed(() => renderTime.value.toISOString().replace(/\.\d{3}Z$/, ''));
const displayedSatellites = computed(() => propagateMany(visibleRecords.value, renderTime.value));
const displayedSatelliteById = computed(() =>
  new Map(displayedSatellites.value.map((satellite) => [satellite.id, satellite])),
);
const focusedSatelliteId = computed(() =>
  focusedSatelliteOverrideId.value ??
  (settings.search.trim() ? displayedSatellites.value[0]?.id : undefined),
);
const effectiveFocusSatelliteZoom = computed(
  () => settings.focusSatelliteZoom && !frontOnlySatelliteFocus.value,
);
const focusedStationId = computed(() => selectedStationId.value);
const highlightedSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (settings.search.trim()) {
    displayedSatellites.value.forEach((satellite) => ids.add(satellite.id));
  }

  if (!settings.useLocalGroundLinks) {
    backendLinkedSatelliteIds.value.forEach((id) => ids.add(id));
  }

  backendSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });

  return Array.from(ids);
});
const fallbackGroundLinks = computed(() =>
  createNearestGroundLinks(displayedSatellites.value, groundStations.value, highlightedSatelliteIds.value),
);
const groundLinks = computed(() =>
  settings.useLocalGroundLinks ? fallbackGroundLinks.value : backendGroundLinks.value,
);
const selectedOrbitSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (!settings.useLocalGroundLinks) {
    backendLinkedSatelliteIds.value.forEach((id) => ids.add(id));
  }

  backendSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });

  return Array.from(ids);
});
const selectedSatellite = computed(() =>
  selectedSatelliteId.value ? displayedSatelliteById.value.get(selectedSatelliteId.value) : undefined,
);
const selectedOrbitSatellites = computed(() =>
  selectedOrbitSatelliteIds.value
    .map((id) => displayedSatelliteById.value.get(id))
    .filter((satellite): satellite is SatellitePoint => Boolean(satellite)),
);
const visibleOrbitRecordIds = computed(() => {
  return selectedOrbitSatelliteIds.value;
});
const visibleOrbitRecords = computed(() =>
  settings.showOrbits
    ? visibleOrbitRecordIds.value
        .map((id) => records.find((record) => record.id === id))
        .filter((record): record is (typeof records)[number] => Boolean(record))
    : [],
);
function toggleSatelliteOrbit(satellite: SatellitePoint) {
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = satellite.id;
  frontOnlySatelliteFocus.value = false;
  toggleSatelliteOrbitState(satellite);
}

function toggleSatelliteOrbitFromGlobe(satellite: SatellitePoint) {
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = undefined;
  frontOnlySatelliteFocus.value = false;
  toggleSatelliteOrbitState(satellite);
}

function focusSelectedSatellite(satellite: SatellitePoint) {
  selectedSatelliteId.value = satellite.id;
  focusedSatelliteOverrideId.value = satellite.id;
  frontOnlySatelliteFocus.value = true;
  detailVisible.value = settings.showSatelliteStatus;
}

function toggleSatelliteOrbitState(satellite: SatellitePoint) {
  selectedSatelliteId.value = satellite.id;
  const orbitVisible = visibleOrbitIds.value.includes(satellite.id);
  if (orbitVisible) {
    removeSatelliteOrbit(satellite);
    return;
  }

  visibleOrbitIds.value = [...visibleOrbitIds.value, satellite.id];
  detailVisible.value = settings.showSatelliteStatus;
}

function removeSatelliteOrbit(satellite: SatellitePoint) {
  visibleOrbitIds.value = visibleOrbitIds.value.filter((id) => id !== satellite.id);
  removeBackendSatellite(satellite.id);
  if (selectedSatelliteId.value === satellite.id) {
    selectedSatelliteId.value = undefined;
    focusedSatelliteOverrideId.value = undefined;
    frontOnlySatelliteFocus.value = false;
    detailVisible.value = false;
  }
}

function removeAllSatelliteOrbits() {
  visibleOrbitIds.value = [];
  hideBackendSatellites(backendLinkedSatelliteIds.value);
  hideBackendSatelliteLinks(
    backendSatelliteLinks.value.flatMap((link) => [link.satelliteAId, link.satelliteBId]),
  );
  backendGroundLinks.value = [];
  backendSatelliteLinks.value = [];
  backendLinkedSatelliteIds.value = [];
  selectedSatelliteId.value = undefined;
  focusedSatelliteOverrideId.value = undefined;
  frontOnlySatelliteFocus.value = false;
  detailVisible.value = false;
}

function removeBackendSatellite(satelliteId: string) {
  if (backendLinkedSatelliteIds.value.includes(satelliteId)) {
    hideBackendSatellites([satelliteId]);
    backendGroundLinks.value = backendGroundLinks.value.filter(
      (link) => link.satelliteId !== satelliteId,
    );
    backendLinkedSatelliteIds.value = backendLinkedSatelliteIds.value.filter(
      (id) => id !== satelliteId,
    );
  }

  const hasSatelliteLink = backendSatelliteLinks.value.some(
    (link) => link.satelliteAId === satelliteId || link.satelliteBId === satelliteId,
  );
  if (hasSatelliteLink) {
    hideBackendSatelliteLinks([satelliteId]);
    backendSatelliteLinks.value = backendSatelliteLinks.value.filter(
      (link) => link.satelliteAId !== satelliteId && link.satelliteBId !== satelliteId,
    );
  }
}

function hideBackendSatellites(satelliteIds: string[]) {
  if (!satelliteIds.length) {
    return;
  }

  hiddenBackendSatelliteIds.value = Array.from(
    new Set([...hiddenBackendSatelliteIds.value, ...satelliteIds]),
  );
}

function hideBackendSatelliteLinks(satelliteIds: string[]) {
  if (!satelliteIds.length) {
    return;
  }

  hiddenBackendSatelliteLinkIds.value = Array.from(
    new Set([...hiddenBackendSatelliteLinkIds.value, ...satelliteIds]),
  );
}

function updateSettings(nextSettings: SimulationSettings) {
  if (nextSettings.search !== settings.search) {
    frontOnlySatelliteFocus.value = false;
  }
  Object.assign(settings, nextSettings);
  if (!settings.showSatelliteStatus) {
    detailVisible.value = false;
  }
}

function setSystemTime(timestampMs: number) {
  setTime(timestampMs);
  settings.customTimeEnabled = true;
}

function resetSystemTime() {
  setTime(Date.now());
  settings.customTimeEnabled = false;
}

function focusGroundStation(station: GroundStation) {
  selectedStationId.value = station.id;
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-dashboard.scss"></style>
