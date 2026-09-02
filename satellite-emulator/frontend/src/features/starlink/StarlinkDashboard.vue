<template>
  <main class="starlink-shell">
    <CesiumGlobe
      :satellites="displayedSatellites"
      :orbit-records="visibleOrbitRecords"
      :selected-id="selectedSatelliteId"
      :highlighted-ids="highlightedSatelliteIds"
      :ground-stations="groundStations"
      :ground-links="groundLinks"
      :satellite-links="visibleSatelliteLinks"
      :container-nodes="containerNodes"
      :active-traffic-node-ids="activeTrafficNodeIds"
      :focused-satellite-id="focusedSatelliteId"
      :focused-station-id="focusedStationId"
      :focused-container-node-id="focusedTrafficContainerNodeId"
      :front-satellite-id="frontSatelliteId"
      :front-station-id="frontStationId"
      :show-satellites="settings.showSatellites"
      :show-ground-stations="settings.showGroundStations"
      :show-labels="settings.showLabels"
      :current-time="renderTime"
      @select="toggleSatelliteOrbitFromGlobe"
      @select-station="focusGroundStationFromGlobe"
      @hover-satellite="showSatelliteStatus"
      @hover-station="showGroundStationStatus"
      @hover-container-node="showTrafficContainerStatus"
    />

    <section class="overview-panel">
      <span class="panel-kicker">STARLINK SIMULATION</span>
      <h1>Starlink Satellite 3D Globe Simulation</h1>
      <p>{{ renderIsoTime }} UTC</p>
    </section>

    <StarlinkRightDock
      v-model:filter-input="trafficFilterInput"
      v-model:node-search-input="trafficNodeSearchInput"
      v-model:playback-timing-mode="trafficPlaybackTimingMode"
      v-model:playback-interval-ms="trafficPlaybackIntervalMs"
      v-model:timeline-window-ms="trafficPlaybackTimelineWindowMs"
      v-model:timeline-speed="trafficPlaybackTimelineSpeed"
      :shell-legend-items="shellLegendItems"
      :total-satellite-count="totalSatelliteCount"
      :hidden-shell-ids="hiddenShellIds"
      :satellites="filteredSatellites"
      :selected-satellites="selectedOrbitSatellites"
      :orbit-plane-options="orbitPlaneOptions"
      :ground-stations="groundStations"
      :selected-station-ids="selectedGroundStationIds"
      :connected-station-ids="connectedGroundStationIds"
      :settings="settings"
      :current-time="renderTime"
      :speed-disabled="trafficCaptureActive"
      :packet-count="trafficPacketEvents.length"
      :node-search-keyword="trafficNodeSearchKeyword"
      :node-search-results-count="trafficNodeSearchResults.length"
      :visible-node-search-results="visibleTrafficNodeSearchResults"
      :filter-submitting="trafficFilterSubmitting"
      :traffic-panel-disabled="trafficReplayPanelDisabled"
      :filter-error="trafficFilterError"
      :filter-status-text="trafficFilterStatusText"
      :filter-disabled-by-import="trafficImportedFileActive && !trafficReplayOfflineFilterAvailable"
      :import-submitting="trafficReplayImportSubmitting"
      :import-error="trafficReplayImportError"
      :import-status-text="trafficReplayImportStatusText"
      :import-disabled-by-filter="trafficCaptureActive"
      :import-file-active="trafficImportedFileActive"
      :recording-enabled="trafficRecordingEnabled"
      :playback-enabled="trafficPlaybackEnabled"
      :playback-paused="trafficPlaybackPaused"
      :seek-position="trafficReplaySeekPosition"
      :seek-max="trafficReplaySeekMax"
      :range-label="trafficReplayRangeLabel"
      :format-seek-tooltip="formatTrafficReplaySeekTooltip"
      :starlink-actions="starlinkDockActions"
      :traffic-actions="trafficReplayDockActions"
    />

    <TimelineEvents
      :collapsed="timelineCollapsed"
      :list-visible="timelineEventListVisible"
      :sort-descending="timelineSortDescending"
      :current-time-left-percent="currentTimeLeftPercent"
      :visible-events="visibleTimelineEvents"
      :sorted-events="sortedTimelineEvents"
      :ticks="timelineTicks"
      @toggle-list="toggleTimelineEventList"
      @close-list="closeTimelineEventList"
      @toggle-collapsed="toggleTimelineCollapsed"
      @shift-window="shiftTimelineWindow"
      @toggle-sort="toggleTimelineSort"
      @select-marker="selectTimelineMarker"
      @select-event="selectTimelineEventFromList"
    />

    <SatelliteDetailPanel
      :visible="satelliteDetailVisible"
      :satellite="statusSatellite"
      :anchor="detailPanelAnchor"
      @close="closeSatelliteDetail"
    />

    <GroundStationDetailPanel
      :visible="stationDetailVisible"
      :station="statusStation"
      :anchor="detailPanelAnchor"
      @close="closeGroundStationDetail"
    />

    <TrafficContainerDetailPanel
      :visible="containerDetailVisible"
      :detail="statusTrafficContainer"
      :anchor="detailPanelAnchor"
      @close="closeTrafficContainerDetail"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import CesiumGlobe from '@/features/starlink/components/CesiumGlobe.vue';
import GroundStationDetailPanel from '@/features/starlink/components/GroundStationDetailPanel.vue';
import SatelliteDetailPanel from '@/features/starlink/components/SatelliteDetailPanel.vue';
import StarlinkRightDock from '@/features/starlink/components/StarlinkRightDock.vue';
import TimelineEvents from '@/features/starlink/components/TimelineEvents.vue';
import TrafficContainerDetailPanel from '@/features/starlink/components/TrafficContainerDetailPanel.vue';
import {
  GROUND_STATION_FOCUS_FLASH_MS,
  TRAFFIC_NODE_FLASH_MS,
} from '@/features/starlink/constants/trafficReplay';
import { useSimulationClock } from '@/features/starlink/composables/useSimulationClock';
import { useTrafficPlaybackController } from '@/features/starlink/composables/traffic/useTrafficPlaybackController';
import { useTrafficContainerNodes } from '@/features/starlink/composables/traffic/useTrafficContainerNodes';
import { useTrafficObserverConnection } from '@/features/starlink/composables/traffic/useTrafficObserverConnection';
import { useStarlinkDataBootstrap } from '@/features/starlink/composables/starlink/useStarlinkDataBootstrap';
import { useStarlinkSettingsController } from '@/features/starlink/composables/starlink/useStarlinkSettingsController';
import {
  useTimelineController,
} from '@/features/starlink/composables/useTimelineController';
import { useTemporaryFocus } from '@/features/starlink/composables/useTemporaryFocus';
import { useSelectionDetailPanels } from '@/features/starlink/composables/useSelectionDetailPanels';
import { useStarlinkSelection } from '@/features/starlink/composables/starlink/useStarlinkSelection';
import {
  createNearestGroundLinks,
  mockGroundStations,
} from '@/features/starlink/services/groundStationService';
import { propagateMany } from '@/features/starlink/services/orbitService';
import {
  getSatelliteShellId,
  SATELLITE_SHELL_STYLES,
} from '@/features/starlink/services/satelliteShellStyle';
import {
  type TrafficReplayPcapPacket,
} from '@/features/starlink/services/traffic/trafficReplayImportService';
import { TrafficReplayWorkerClient } from '@/features/starlink/services/traffic/trafficReplayWorkerClient';
import type {
  GroundStation,
  InterSatelliteLink,
  PlannedOrbitRecord,
  SatelliteGroundLink,
  SatellitePoint,
  SimulationSettings,
  TrafficPacketReplayEvent,
} from '@/features/starlink/types';

const records = ref<PlannedOrbitRecord[]>([]);
const settings = reactive<SimulationSettings>({
  speed: 1,
  paused: false,
  customTimeEnabled: false,
  showSatellites: true,
  showGroundStations: true,
  showOrbits: false,
  showLabels: false,
  showSelectionDetails: false,
  useLocalGroundLinks: false,
  hideLinksForFilteredSatellites: true,
  search: '',
  invertSearch: false,
  altitudeMinKm: undefined,
  altitudeMaxKm: undefined,
  invertAltitude: false,
  selectedOrbitPlaneIds: [],
  invertOrbitPlanes: false,
});
const {
  statusSatelliteId,
  statusStationId,
  statusTrafficContainerId,
  detailPanelAnchor,
  satelliteDetailVisible,
  stationDetailVisible,
  containerDetailVisible,
  showSatelliteStatus,
  showGroundStationStatus,
  showTrafficContainerStatus,
  closeSatelliteDetail,
  closeGroundStationDetail,
  closeTrafficContainerDetail,
  closeAllSelectionDetails,
} = useSelectionDetailPanels(computed(() => settings.showSelectionDetails));
const {
  focusedSatelliteId,
  focusedStationId,
  flashFocusedSatellite,
  flashFocusedStation,
  disposeTemporaryFocus,
} = useTemporaryFocus(TRAFFIC_NODE_FLASH_MS, GROUND_STATION_FOCUS_FLASH_MS);
const groundStations = ref<GroundStation[]>(mockGroundStations);
const backendGroundLinks = ref<SatelliteGroundLink[]>([]);
const backendSatelliteLinks = ref<InterSatelliteLink[]>([]);
const trafficPlaybackEnabled = ref(false);
const trafficCaptureActive = ref(false);
const trafficNodeSearchInput = ref('');
const trafficReplayImportSubmitting = ref(false);
const trafficReplayImportError = ref('');
const trafficReplayImportStatusText = ref('Click to select collector JSON, optionally with matching PCAP');
const trafficReplayJsonEvents = ref<TrafficPacketReplayEvent[]>([]);
const trafficReplayPcapPackets = ref<TrafficReplayPcapPacket[]>([]);
const trafficReplayWorker = new TrafficReplayWorkerClient();
const lastGroundTimelineSignature = ref('');
const lastSatelliteTimelineSignature = ref('');
const backendLinkedSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteLinkIds = ref<string[]>([]);
const hiddenBackendGroundStationIds = ref<string[]>([]);
const {
  focusGroundStation,
  focusGroundStationFromGlobe,
  focusSelectedSatellite,
  frontSatelliteId,
  frontStationId,
  removeAllSatelliteOrbits,
  removeSatelliteOrbit,
  selectedGroundStationIds,
  selectedSatelliteId,
  toggleSatelliteOrbit,
  toggleSatelliteOrbitFromGlobe,
  updateGroundStationSelection,
  visibleOrbitIds,
} = useStarlinkSelection({
  backendGroundLinks,
  backendLinkedSatelliteIds,
  backendSatelliteLinks,
  closeGroundStationDetail,
  closeSatelliteDetail,
  closeTrafficContainerDetail,
  flashFocusedSatellite,
  flashFocusedStation,
  groundStations,
  hiddenBackendGroundStationIds,
  hiddenBackendSatelliteIds,
  hiddenBackendSatelliteLinkIds,
});
const { now, setTime, commitElapsedTime } = useSimulationClock(
  () => settings.speed,
  () => settings.paused || trafficPlaybackEnabled.value,
);
let containerRefreshTimerId: number | undefined;

onMounted(async () => {
  await refreshEmulatorContainers();
  // containerRefreshTimerId = window.setInterval(refreshEmulatorContainers, CONTAINER_REFRESH_MS);
});

onUnmounted(() => {
  if (containerRefreshTimerId !== undefined) {
    window.clearInterval(containerRefreshTimerId);
  }
  disposeTemporaryFocus();
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();
  trafficReplayWorker.terminate();
});

const renderTime = computed(() => now.value);
const renderIsoTime = computed(() => renderTime.value.toISOString().replace(/\.\d{3}Z$/, ''));
const {
  timelineWindowOffsetMs,
  timelineEventListVisible,
  timelineSortDescending,
  timelineCollapsed,
  timelineFollowCurrentTime,
  currentTimeLeftPercent,
  visibleTimelineEvents,
  sortedTimelineEvents,
  timelineTicks,
  shiftTimelineWindow,
  syncTimelineToTime,
  toggleTimelineCollapsed,
  recordFrameTimelineEvent,
  recordTimelineEvent,
  toggleTimelineSort,
  toggleTimelineEventList,
  closeTimelineEventList,
  selectTimelineEventFromList,
  selectTimelineMarker,
  formatTimelineDateTime,
} = useTimelineController(
  renderTime,
  setTime,
  (enabled) => {
    settings.customTimeEnabled = enabled;
  },
);
const {
  hiddenShellIds,
  resetSystemTime,
  setSystemTime,
  toggleShellVisibility,
  updateSettings,
} = useStarlinkSettingsController({
  closeAllSelectionDetails,
  closeGroundStationDetail,
  closeSatelliteDetail,
  commitElapsedTime,
  formatTimelineDateTime,
  isTrafficCaptureActive: () => trafficCaptureActive.value,
  recordTimelineEvent,
  resetStatusSatellite: () => {
    statusSatelliteId.value = undefined;
  },
  resetStatusStation: () => {
    statusStationId.value = undefined;
  },
  settings,
  setTime,
  syncTimelineToTime,
});
useStarlinkDataBootstrap({
  backendGroundLinks,
  backendLinkedSatelliteIds,
  backendSatelliteLinks,
  groundStations,
  hiddenBackendGroundStationIds,
  hiddenBackendSatelliteIds,
  hiddenBackendSatelliteLinkIds,
  lastGroundTimelineSignature,
  lastSatelliteTimelineSignature,
  now,
  recordFrameTimelineEvent,
  records,
  selectedGroundStationIds,
  setTime,
  timelineFollowCurrentTime,
  timelineWindowOffsetMs,
});
const trafficReplayBlockedBySimulationSpeed = computed(() =>
  !trafficCaptureActive.value && settings.speed !== 1,
);
const trafficReplayPanelDisabled = computed(() => trafficReplayBlockedBySimulationSpeed.value);
const trafficReplayOfflineFilterAvailable = computed(() =>
  trafficImportedFileActive.value &&
  trafficReplayJsonEvents.value.length > 0 &&
  trafficReplayPcapPackets.value.length > 0,
);
const {
  activeTrafficNodeIds,
  cleanupInactiveTrafficContainers,
  clearActiveTrafficContainers,
  containerNodes,
  emulatorContainers,
  focusedTrafficContainerNodeId,
  getTrafficContainerDetail,
  refreshEmulatorContainers,
  rememberTrafficPacketNodes,
  selectTrafficNodeSearchResult,
  trafficNodeSearchKeyword,
  trafficNodeSearchResults,
  triggerTrafficPacket,
  visibleTrafficNodeSearchResults,
} = useTrafficContainerNodes({
  closeAllSelectionDetails,
  statusTrafficContainerId,
  trafficNodeSearchInput,
});
const {
  clearTrafficPlaybackClock,
  clearTrafficPlaybackTimer,
  clearTrafficRecording,
  formatTrafficReplaySeekTooltip,
  importTrafficReplayEvents,
  jumpTrafficPlayback,
  recordTrafficPacket,
  setRecordingEnabled: setTrafficRecordingEnabled,
  seekTrafficPlaybackPosition,
  stopTrafficPlayback,
  toggleTrafficPlayback,
  toggleTrafficRecording,
  trafficPacketEvents,
  trafficImportedFileActive,
  trafficPlaybackIntervalMs,
  trafficPlaybackPaused,
  trafficPlaybackTimingMode,
  trafficPlaybackTimelineSpeed,
  trafficPlaybackTimelineWindowMs,
  trafficRecordingEnabled,
  trafficReplayRangeLabel,
  trafficReplaySeekMax,
  trafficReplaySeekPosition,
  updateTrafficReplaySeekPosition,
} = useTrafficPlaybackController({
  clearActiveTrafficContainers,
  formatTime: formatTimelineDateTime,
  isCaptureActive: trafficCaptureActive,
  isPanelDisabled: trafficReplayPanelDisabled,
  playbackEnabled: trafficPlaybackEnabled,
  renderTime,
  settings,
  setTime,
  syncTimelineToTime,
  timelineFollowCurrentTime,
  timelineWindowOffsetMs,
  triggerTrafficPacket,
});
const {
  submitTrafficFilter,
  trafficFilterError,
  trafficFilterInput,
  trafficFilterStatusText,
  trafficFilterSubmitting,
} = useTrafficObserverConnection({
  captureActive: trafficCaptureActive,
  cleanupInactiveTrafficContainers,
  filterBlocked: trafficImportedFileActive,
  isPanelDisabled: trafficReplayPanelDisabled,
  playbackEnabled: trafficPlaybackEnabled,
  recordTrafficPacket,
  recordingEnabled: trafficRecordingEnabled,
  rememberTrafficPacketNodes,
  setRecordingEnabled: setTrafficRecordingEnabled,
  settings,
  stopTrafficPlayback,
  triggerTrafficPacket,
});
const totalSatelliteCount = computed(() => records.value.length);
const orbitPlaneOptions = computed(() =>
  Array.from(
    new Set(
      records.value
        .filter(
          (record) =>
            visibleShellIds.value.has(getSatelliteShellId(record.orbitPlaneId)),
        )
        .map((record) => record.orbitPlaneId),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
);

const allDisplayedSatellites = computed(() => propagateMany(records.value, renderTime.value));
const visibleShellIds = computed(() => new Set(
  SATELLITE_SHELL_STYLES
    .map((shell) => shell.id)
    .filter((shellId) => !hiddenShellIds.value.includes(shellId)),
));
const shellLegendItems = computed(() => {
  const counts = new Map<string, number>();
  records.value.forEach((record) => {
    const shellId = getSatelliteShellId(record.orbitPlaneId);
    counts.set(shellId, (counts.get(shellId) ?? 0) + 1);
  });

  return SATELLITE_SHELL_STYLES
    .map((style) => ({
      ...style,
      count: counts.get(style.id) ?? 0,
    }))
    .filter((style) => style.count > 0);
});
const filteredSatellites = computed(() => {
  const search = settings.search.trim().toLowerCase();
  const selectedPlanes = new Set(settings.selectedOrbitPlaneIds);
  const hasAltitudeFilter =
    Number.isFinite(settings.altitudeMinKm) || Number.isFinite(settings.altitudeMaxKm);

  return allDisplayedSatellites.value.filter((satellite) => {
    if (!visibleShellIds.value.has(getSatelliteShellId(satellite.orbitPlaneId))) {
      return false;
    }

    const textMatches =
      !search ||
      satellite.name.toLowerCase().includes(search) ||
      satellite.id.toLowerCase().includes(search);
    if (search && (settings.invertSearch ? textMatches : !textMatches)) {
      return false;
    }

    const altitudeMatches =
      (!Number.isFinite(settings.altitudeMinKm) ||
        satellite.altitudeKm >= settings.altitudeMinKm!) &&
      (!Number.isFinite(settings.altitudeMaxKm) ||
        satellite.altitudeKm <= settings.altitudeMaxKm!);
    if (
      hasAltitudeFilter &&
      (settings.invertAltitude ? altitudeMatches : !altitudeMatches)
    ) {
      return false;
    }

    const orbitMatches = selectedPlanes.has(satellite.orbitPlaneId);
    if (
      selectedPlanes.size > 0 &&
      (settings.invertOrbitPlanes ? orbitMatches : !orbitMatches)
    ) {
      return false;
    }

    return true;
  });
});
const filteredSatelliteIds = computed(
  () => new Set(filteredSatellites.value.map((satellite) => satellite.id)),
);
const connectedSatelliteIds = computed(() => {
  const ids = new Set(backendGroundLinks.value.map((link) => link.satelliteId));
  backendSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });
  return ids;
});
const displayedSatellites = computed(() => {
  if (settings.hideLinksForFilteredSatellites) {
    return filteredSatellites.value;
  }

  return allDisplayedSatellites.value.filter(
    (satellite) =>
      filteredSatelliteIds.value.has(satellite.id) || connectedSatelliteIds.value.has(satellite.id),
  );
});
const displayedSatelliteById = computed(() =>
  new Map(displayedSatellites.value.map((satellite) => [satellite.id, satellite])),
);
const highlightedSatelliteIds = computed(() => {
  return Array.from(new Set(visibleOrbitIds.value));
});
const fallbackGroundLinks = computed(() =>
  createNearestGroundLinks(displayedSatellites.value, groundStations.value, highlightedSatelliteIds.value),
);
const candidateGroundLinks = computed(() =>
  settings.useLocalGroundLinks
    ? fallbackGroundLinks.value
    : settings.hideLinksForFilteredSatellites
      ? backendGroundLinks.value.filter((link) => filteredSatelliteIds.value.has(link.satelliteId))
      : backendGroundLinks.value,
);
const connectedGroundStationIds = computed(() =>
  Array.from(new Set(candidateGroundLinks.value.map((link) => link.stationId))),
);
const groundLinks = computed(() => {
  const selectedStationIds = new Set(selectedGroundStationIds.value);

  return candidateGroundLinks.value.filter((link) => selectedStationIds.has(link.stationId));
});
const visibleSatelliteLinks = computed(() =>
  settings.hideLinksForFilteredSatellites
    ? backendSatelliteLinks.value.filter(
        (link) =>
          filteredSatelliteIds.value.has(link.satelliteAId) &&
          filteredSatelliteIds.value.has(link.satelliteBId),
      )
    : backendSatelliteLinks.value,
);
const selectedOrbitSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (!settings.useLocalGroundLinks) {
    groundLinks.value.forEach((link) => ids.add(link.satelliteId));
  }

  visibleSatelliteLinks.value.forEach((link) => {
    ids.add(link.satelliteAId);
    ids.add(link.satelliteBId);
  });

  return Array.from(ids);
});

const statusSatellite = computed(() =>
  statusSatelliteId.value ? displayedSatelliteById.value.get(statusSatelliteId.value) : undefined,
);
const statusStation = computed(() =>
  statusStationId.value
    ? groundStations.value.find((station) => station.id === statusStationId.value)
    : undefined,
);
const statusTrafficContainer = computed(() =>
  statusTrafficContainerId.value
    ? getTrafficContainerDetail(statusTrafficContainerId.value)
    : undefined,
);
const selectedOrbitSatellites = computed(() =>
  selectedOrbitSatelliteIds.value
    .map((id) => displayedSatelliteById.value.get(id))
    .filter((satellite): satellite is SatellitePoint => Boolean(satellite)),
);
const visibleOrbitRecordIds = computed(() => {
  return selectedOrbitSatelliteIds.value.filter((id) => displayedSatelliteById.value.has(id));
});
const visibleOrbitRecords = computed(() =>
  settings.showOrbits
    ? visibleOrbitRecordIds.value
        .map((id) => records.value.find((record) => record.id === id))
        .filter((record): record is PlannedOrbitRecord => Boolean(record))
    : [],
);
const starlinkDockActions = {
  toggleShell: toggleShellVisibility,
  selectSatellite: toggleSatelliteOrbit,
  focusSelectedSatellite,
  removeSatellite: removeSatelliteOrbit,
  removeAllSatellites: removeAllSatelliteOrbits,
  stationFocus: focusGroundStation,
  stationSelectionChange: updateGroundStationSelection,
  updateSettings,
  setSystemTime,
  resetSystemTime,
};
const trafficReplayDockActions = {
  submitFilter: submitTrafficFilterFromReplayPanel,
  importReplayFile: importTrafficReplayFileFromDisk,
  selectNodeSearchResult: selectTrafficNodeSearchResult,
  toggleRecording: toggleTrafficRecording,
  togglePlayback: toggleTrafficPlayback,
  stopPlayback: stopTrafficPlayback,
  jumpPlayback: jumpTrafficPlayback,
  clearRecording: clearTrafficReplayPackets,
  updateSeekPosition: updateTrafficReplaySeekPosition,
  seekPosition: seekTrafficPlaybackPosition,
};

function submitTrafficFilterFromReplayPanel() {
  if (trafficReplayOfflineFilterAvailable.value) {
    void applyTrafficReplayOfflineFilter();
    return;
  }

  void submitTrafficFilter();
}

async function applyTrafficReplayOfflineFilter() {
  trafficReplayImportError.value = '';
  trafficFilterError.value = '';
  trafficFilterSubmitting.value = true;
  try {
    const filter = trafficFilterInput.value.trim();
    const result = filter
      ? await trafficReplayWorker.filterPackets(
          trafficReplayJsonEvents.value,
          trafficReplayPcapPackets.value,
          filter,
          (message) => {
            trafficReplayImportStatusText.value = message;
          },
        )
      : {
          events: trafficReplayJsonEvents.value,
          matchedPacketCount: trafficReplayJsonEvents.value.length,
          skippedPacketCount: 0,
        };

    importTrafficReplayEvents(result.events);
    result.events.forEach((event) => rememberTrafficPacketNodes(event));
    trafficReplayImportStatusText.value = filter
      ? `Offline filter matched ${result.events.length.toLocaleString()} packets.`
      : `Offline filter cleared. ${result.events.length.toLocaleString()} packets selected.`;
  } catch (error) {
    trafficFilterError.value = error instanceof Error ? error.message : String(error);
    trafficReplayImportStatusText.value = 'Offline filter failed.';
  } finally {
    trafficFilterSubmitting.value = false;
  }
}

async function importTrafficReplayFileFromDisk(files: File[]) {
  if (trafficCaptureActive.value || trafficRecordingEnabled.value || trafficPlaybackEnabled.value) {
    return;
  }

  const jsonFile = files.find((file) => file.name.toLowerCase().endsWith('.json'));
  const pcapFile = files.find((file) => file.name.toLowerCase().endsWith('.pcap'));
  if (!jsonFile) {
    trafficReplayImportError.value = 'Import a collector JSON file. PCAP can only be used together with JSON.';
    trafficReplayImportStatusText.value = 'Import failed.';
    return;
  }

  trafficReplayImportSubmitting.value = true;
  trafficReplayImportError.value = '';
  try {
    await refreshEmulatorContainers();
    const result = await trafficReplayWorker.importFiles(
      jsonFile,
      pcapFile,
      emulatorContainers.value,
      (message) => {
        trafficReplayImportStatusText.value = message;
      },
    );
    if (!result.events.length) {
      trafficReplayImportError.value = 'No playable packets were found in this file.';
      trafficReplayImportStatusText.value = 'Import failed.';
      return;
    }

    trafficReplayJsonEvents.value = result.jsonEvents;
    trafficReplayPcapPackets.value = result.pcapPackets;
    importTrafficReplayEvents(result.events);
    result.events.forEach((event) => rememberTrafficPacketNodes(event));
    trafficReplayImportStatusText.value =
      pcapFile
        ? `Imported ${result.events.length.toLocaleString()} JSON packets and ${result.pcapPackets.length.toLocaleString()} PCAP packets. Offline filter is available.`
        : `Imported ${result.events.length.toLocaleString()} JSON packets, remapped ${result.jsonRemappedCount.toLocaleString()}, skipped ${result.jsonSkippedCount.toLocaleString()}.`;
  } catch (error) {
    trafficReplayImportError.value = error instanceof Error ? error.message : String(error);
    trafficReplayImportStatusText.value = 'Import failed.';
  } finally {
    trafficReplayImportSubmitting.value = false;
  }
}

function clearTrafficReplayPackets() {
  clearTrafficRecording();
  trafficReplayJsonEvents.value = [];
  trafficReplayPcapPackets.value = [];
  trafficReplayImportError.value = '';
  trafficReplayImportStatusText.value = 'Click to select collector JSON, optionally with matching PCAP';
}

</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-dashboard.scss"></style>
