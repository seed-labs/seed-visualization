<template>
  <main class="starlink-shell">
    <CesiumGlobe
      :satellites="displayedSatellites"
      :orbit-records="visibleOrbitRecords"
      :selected-id="selectedSatelliteId"
      :highlighted-ids="highlightedSatelliteIds"
      :ground-stations="groundStations"
      :ground-links="groundLinks"
      :focused-satellite-id="focusedSatelliteId"
      :focused-station-id="focusedStationId"
      :focus-satellite-zoom="effectiveFocusSatelliteZoom"
      :show-labels="settings.showLabels"
      :current-time="now"
      @select="toggleSatelliteOrbitFromGlobe"
      @select-station="focusGroundStation"
    />

    <section class="overview-panel">
      <span class="panel-kicker">STARLINK SIMULATION</span>
      <h1>Starlink Satellite 3D Globe Simulation</h1>
      <p>{{ isoTime }} UTC</p>
    </section>

    <SatelliteList
      :satellites="displayedSatellites"
      :selected-satellites="selectedOrbitSatellites"
      :ground-stations="groundStations"
      :settings="settings"
      :selected-id="selectedSatelliteId"
      @select="toggleSatelliteOrbit"
      @focus-selected="focusSelectedSatellite"
      @remove="removeSatelliteOrbit"
      @remove-all="removeAllSatelliteOrbits"
      @station-select="focusGroundStation"
      @station-focus="focusGroundStation"
      @update-settings="updateSettings"
    />

    <SatelliteDetailPanel
      :visible="detailVisible"
      :satellite="selectedSatellite"
      @close="detailVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import CesiumGlobe from '@/features/starlink/components/CesiumGlobe.vue';
import SatelliteDetailPanel from '@/features/starlink/components/SatelliteDetailPanel.vue';
import SatelliteList from '@/features/starlink/components/SatelliteList.vue';
import { useSimulationClock } from '@/features/starlink/composables/useSimulationClock';
import {
  createNearestGroundLinks,
  mockGroundStations,
} from '@/features/starlink/services/groundStationService';
import { propagateMany } from '@/features/starlink/services/orbitService';
import { parseTleRecords } from '@/features/starlink/services/tleService';
import type { GroundStation, SatellitePoint, SimulationSettings } from '@/features/starlink/types';

const records = parseTleRecords();
const settings = reactive<SimulationSettings>({
  speed: 1,
  showOrbits: true,
  showLabels: true,
  focusSatelliteZoom: true,
  showSatelliteStatus: true,
  search: '',
});
const selectedSatelliteId = ref<string>();
const selectedStationId = ref<string>();
const focusedSatelliteOverrideId = ref<string>();
const frontOnlySatelliteFocus = ref(false);
const detailVisible = ref(false);
const visibleOrbitIds = ref<string[]>([]);
const groundStations = mockGroundStations;
const { now, isoTime } = useSimulationClock(() => settings.speed);

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
const displayedSatellites = computed(() => propagateMany(visibleRecords.value, now.value));
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

  return Array.from(ids);
});
const groundLinks = computed(() =>
  createNearestGroundLinks(displayedSatellites.value, groundStations, highlightedSatelliteIds.value),
);
const selectedSatellite = computed(() =>
  displayedSatellites.value.find((satellite) => satellite.id === selectedSatelliteId.value),
);
const selectedOrbitSatellites = computed(() =>
  visibleOrbitIds.value
    .map((id) => displayedSatellites.value.find((satellite) => satellite.id === id))
    .filter((satellite): satellite is SatellitePoint => Boolean(satellite)),
);
const visibleOrbitRecords = computed(() =>
  settings.showOrbits
    ? visibleOrbitIds.value
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
  if (selectedSatelliteId.value === satellite.id) {
    selectedSatelliteId.value = undefined;
    focusedSatelliteOverrideId.value = undefined;
    frontOnlySatelliteFocus.value = false;
    detailVisible.value = false;
  }
}

function removeAllSatelliteOrbits() {
  visibleOrbitIds.value = [];
  selectedSatelliteId.value = undefined;
  focusedSatelliteOverrideId.value = undefined;
  frontOnlySatelliteFocus.value = false;
  detailVisible.value = false;
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

function focusGroundStation(station: GroundStation) {
  selectedStationId.value = station.id;
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-dashboard.scss"></style>
