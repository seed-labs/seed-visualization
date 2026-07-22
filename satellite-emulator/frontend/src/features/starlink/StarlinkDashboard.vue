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
      :network-links="networkLinks"
      :network-nodes="networkNodes"
      :container-nodes="containerNetworkNodes"
      :active-traffic-node-ids="activeTrafficNodeIds"
      :focused-satellite-id="focusedSatelliteId"
      :focused-station-id="focusedStationId"
      :focused-container-node-id="focusedTrafficContainerNodeId"
      :show-satellites="settings.showSatellites"
      :show-ground-stations="settings.showGroundStations"
      :show-labels="settings.showLabels"
      :current-time="renderTime"
      @select="toggleSatelliteOrbitFromGlobe"
      @select-station="focusGroundStation"
      @hover-satellite="showSatelliteStatus"
      @hover-station="showGroundStationStatus"
      @hover-container-node="showTrafficContainerStatus"
    />

    <section class="overview-panel">
      <span class="panel-kicker">STARLINK SIMULATION</span>
      <h1>Starlink Satellite 3D Globe Simulation</h1>
      <p>{{ renderIsoTime }} UTC</p>
    </section>

    <aside class="right-dock" :class="{ collapsed: dockCollapsed, 'menu-open': dockPageMenuVisible }">
      <button class="dock-edge-toggle" type="button" @click="toggleDockCollapsed">
        {{ dockCollapsed ? '<' : '>' }}
      </button>

      <div class="dock-content">
        <StarlinkShellLegend
          v-show="activeDockPage === 'shells'"
          :items="shellLegendItems"
          :total-satellite-count="totalSatelliteCount"
          :hidden-shell-ids="hiddenShellIds"
          @toggle-shell="toggleShellVisibility"
        />

        <section
          v-show="activeDockPage !== 'shells' && activeDockPage !== 'traffic'"
          class="dock-list-page"
          :class="`dock-page-${activeDockPage}`"
        >
          <h2>
            <span>{{ activeDockPageLabel }}</span>
            <em v-if="activeDockPageCount !== undefined">
              {{ activeDockPageCount.toLocaleString() }}
            </em>
          </h2>
          <SatelliteList
            embedded
            hide-header
            :active-tab="activeDockListTab"
            :satellites="filteredSatellites"
            :selected-satellites="selectedOrbitSatellites"
            :orbit-plane-options="orbitPlaneOptions"
            :ground-stations="groundStations"
            :selected-station-ids="selectedGroundStationIds"
            :connected-station-ids="connectedGroundStationIds"
            :settings="settings"
            :current-time="renderTime"
            :selected-id="selectedSatelliteId"
            :speed-disabled="trafficCaptureActive"
            @select="toggleSatelliteOrbit"
            @focus-selected="focusSelectedSatellite"
            @remove="removeSatelliteOrbit"
            @remove-all="removeAllSatelliteOrbits"
            @station-focus="focusGroundStation"
            @station-selection-change="updateGroundStationSelection"
            @update-settings="updateSettings"
            @set-system-time="setSystemTime"
            @reset-system-time="resetSystemTime"
          />
        </section>

        <section v-if="activeDockPage === 'traffic'" class="dock-list-page dock-page-traffic">
          <h2>
            <span>Traffic Replay</span>
            <em>{{ trafficPacketEvents.length.toLocaleString() }}</em>
          </h2>

          <TrafficReplayPanel
            v-model:filter-input="trafficFilterInput"
            v-model:node-search-input="trafficNodeSearchInput"
            v-model:playback-interval-ms="trafficPlaybackIntervalMs"
            :packet-count="trafficPacketEvents.length"
            :node-search-keyword="trafficNodeSearchKeyword"
            :node-search-results-count="trafficNodeSearchResults.length"
            :visible-node-search-results="visibleTrafficNodeSearchResults"
            :filter-submitting="trafficFilterSubmitting"
            :panel-disabled="trafficReplayPanelDisabled"
            :filter-error="trafficFilterError"
            :filter-status-text="trafficFilterStatusText"
            :recording-enabled="trafficRecordingEnabled"
            :playback-enabled="trafficPlaybackEnabled"
            :playback-paused="trafficPlaybackPaused"
            :seek-position="trafficReplaySeekPosition"
            :seek-max="trafficReplaySeekMax"
            :range-label="trafficReplayRangeLabel"
            :format-seek-tooltip="formatTrafficReplaySeekTooltip"
            @submit-filter="submitTrafficFilter"
            @select-node-search-result="selectTrafficNodeSearchResult"
            @toggle-recording="toggleTrafficRecording"
            @toggle-playback="toggleTrafficPlayback"
            @stop-playback="stopTrafficPlayback"
            @jump-playback="jumpTrafficPlayback"
            @clear-recording="clearTrafficRecording"
            @update-seek-position="updateTrafficReplaySeekPosition"
            @seek-position="seekTrafficPlaybackPosition"
          />
        </section>
      </div>

      <nav class="dock-pager" aria-label="Right panel pages">
        <button type="button" @click="switchDockPage(-1)">&lt;</button>
        <button type="button" class="dock-menu-button" @click="toggleDockPageMenu">&#9776;</button>
        <button type="button" @click="switchDockPage(1)">&gt;</button>
      </nav>

      <div v-if="dockPageMenuVisible" class="dock-page-menu">
        <button
          v-for="page in dockPages"
          :key="page.id"
          type="button"
          :class="{ active: activeDockPage === page.id }"
          @click="selectDockPage(page.id)"
        >
          <span>{{ page.label }}</span>
          <em v-if="page.count !== undefined">{{ page.count.toLocaleString() }}</em>
        </button>
      </div>
    </aside>

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
      :visible="detailVisible"
      :satellite="statusSatellite"
      :anchor="detailPanelAnchor"
      @close="detailVisible = false"
    />

    <GroundStationDetailPanel
      :visible="stationDetailVisible"
      :station="statusStation"
      :anchor="detailPanelAnchor"
      @close="stationDetailVisible = false"
    />

    <TrafficContainerDetailPanel
      :visible="containerDetailVisible"
      :detail="statusTrafficContainer"
      :anchor="detailPanelAnchor"
      @close="containerDetailVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import CesiumGlobe from '@/features/starlink/components/CesiumGlobe.vue';
import GroundStationDetailPanel from '@/features/starlink/components/GroundStationDetailPanel.vue';
import SatelliteDetailPanel from '@/features/starlink/components/SatelliteDetailPanel.vue';
import SatelliteList from '@/features/starlink/components/SatelliteList.vue';
import StarlinkShellLegend from '@/features/starlink/components/StarlinkShellLegend.vue';
import TimelineEvents from '@/features/starlink/components/TimelineEvents.vue';
import TrafficReplayPanel from '@/features/starlink/components/TrafficReplayPanel.vue';
import TrafficContainerDetailPanel from '@/features/starlink/components/TrafficContainerDetailPanel.vue';
import {
  TIMELINE_LABEL_LANE_COUNT,
  TIMELINE_LABEL_MIN_GAP_PERCENT,
  TIMELINE_MARKER_MIN_GAP_PERCENT,
  TIMELINE_SHIFT_MS,
  TIMELINE_TICK_MS,
  TIMELINE_WINDOW_MS,
} from '@/features/starlink/constants/timeline';
import {
  FALLBACK_TRAFFIC_NODE_CITIES,
  TRAFFIC_FALLBACK_MIN_DISTANCE_KM,
  TRAFFIC_NODE_FLASH_MS,
  TRAFFIC_REPLAY_MAX_EVENTS,
  TRAFFIC_REPLAY_MAX_STEP_MS,
  TRAFFIC_REPLAY_MIN_STEP_MS,
} from '@/features/starlink/constants/trafficReplay';
import { useSimulationClock } from '@/features/starlink/composables/useSimulationClock';
import { SatelliteDataSource } from '@/features/starlink/services/satelliteDataSource';
import {
  createNearestGroundLinks,
  fetchGroundStationsFromEmulator,
  mockGroundStations,
} from '@/features/starlink/services/groundStationService';
import { propagateMany } from '@/features/starlink/services/orbitService';
import { parsePlannedOrbitRecords } from '@/features/starlink/services/tleService';
import { fetchNetworkNodes } from '@/features/starlink/services/networkNodeService';
import {
  fetchEmulatorContainers,
  type EmulatorContainerInfo,
} from '@/features/starlink/services/emulatorContainerService';
import {
  getSatelliteShellId,
  SATELLITE_SHELL_STYLES,
} from '@/features/starlink/services/satelliteShellStyle';
import {
  createTrafficObserverClient,
  fetchTrafficObserverFilter,
  setTrafficObserverFilter,
  type TrafficObserverClient,
} from '@/features/starlink/services/trafficObserverService';
import type {
  GroundStation,
  InterSatelliteLink,
  NetworkNodeLocation,
  NetworkPathUpdateState,
  SatelliteGroundLink,
  SatellitePoint,
  ScreenAnchor,
  SimulationSettings,
  TrafficContainerNodeDetail,
  TrafficPacketMessage,
  TrafficPacketReplayEvent,
} from '@/features/starlink/types';
import type {
  TimelineDisplayEvent,
  TimelineEvent,
  TimelineEventKind,
  TimelineTick,
} from '@/features/starlink/types/timeline';

const records = parsePlannedOrbitRecords();
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
const selectedSatelliteId = ref<string>();
const selectedStationId = ref<string>();
const statusSatelliteId = ref<string>();
const statusStationId = ref<string>();
const statusTrafficContainerId = ref<string>();
const selectedGroundStationIds = ref<string[]>([]);
const focusedSatelliteOverrideId = ref<string>();
const focusedStationOverrideId = ref<string>();
const focusedTrafficContainerNodeId = ref<string>();
const detailPanelAnchor = ref<ScreenAnchor>();
const detailVisible = ref(false);
const stationDetailVisible = ref(false);
const containerDetailVisible = ref(false);
let satelliteFocusClearTimer: number | undefined;
let stationFocusClearTimer: number | undefined;
const visibleOrbitIds = ref<string[]>([]);
const hiddenShellIds = ref<string[]>([]);
type DockListTab = 'all' | 'selected' | 'stations' | 'settings';
type DockPage = 'shells' | 'traffic' | DockListTab;
const dockPageDefinitions: Array<{ id: DockPage; label: string }> = [
  { id: 'shells', label: 'Starlink Shells' },
  { id: 'all', label: 'Satellites' },
  { id: 'selected', label: 'Selected' },
  { id: 'stations', label: 'Stations' },
  { id: 'traffic', label: 'Traffic Replay' },
  { id: 'settings', label: 'Settings' },
];
const activeDockPage = ref<DockPage>('shells');
const dockCollapsed = ref(false);
const dockPageMenuVisible = ref(false);
const timelineEventListVisible = ref(false);
const timelineSortDescending = ref(true);
const focusedTimelineEventIds = ref<string[]>([]);
const timelineCollapsed = ref(true);
const timelineFollowCurrentTime = ref(true);
const groundStations = ref<GroundStation[]>(mockGroundStations);
const backendGroundLinks = ref<SatelliteGroundLink[]>([]);
const backendSatelliteLinks = ref<InterSatelliteLink[]>([]);
const networkLinks = ref<NetworkPathUpdateState[]>([]);
const networkNodes = ref<NetworkNodeLocation[]>([]);
const emulatorContainers = ref<EmulatorContainerInfo[]>([]);
const fallbackTrafficNodeLocations = ref<Record<string, { city: string; longitude: number; latitude: number }>>({});
const trafficContainerActiveUntil = ref<Record<string, number>>({});
const trafficContainerDetails = ref<Record<string, TrafficContainerNodeDetail>>({});
const trafficRecordingEnabled = ref(false);
const trafficPlaybackEnabled = ref(false);
const trafficCaptureActive = ref(false);
const trafficFilterInput = ref('');
const trafficNodeSearchInput = ref('');
const trafficActiveFilter = ref('');
const trafficFilterSubmitting = ref(false);
const trafficFilterError = ref('');
const trafficPlaybackIndex = ref(0);
const trafficReplaySeekPosition = ref(0);
const trafficPlaybackEvents = ref<TrafficPacketReplayEvent[]>([]);
const trafficPacketEvents = ref<TrafficPacketReplayEvent[]>([]);
const trafficPlaybackPaused = ref(true);
const trafficPlaybackIntervalMs = ref(2000);
const timelineEvents = ref<TimelineEvent[]>([]);
const timelineWindowOffsetMs = ref(0);
const lastGroundTimelineSignature = ref('');
const lastSatelliteTimelineSignature = ref('');
const lastNetworkTimelineSignature = ref('');
const backendLinkedSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteIds = ref<string[]>([]);
const hiddenBackendSatelliteLinkIds = ref<string[]>([]);
const hiddenBackendGroundStationIds = ref<string[]>([]);
const { now, setTime, commitElapsedTime } = useSimulationClock(
  () => settings.speed,
  () => settings.paused || trafficPlaybackEnabled.value,
);
const satelliteDataSource = new SatelliteDataSource(
  () => now.value,
  (time) => setTime(time),
);
let trafficObserverClient: TrafficObserverClient | undefined;
let trafficCleanupTimerId: number | undefined;
let containerRefreshTimerId: number | undefined;
let trafficPlaybackTimerId: number | undefined;
let trafficPlaybackClockFrameId: number | undefined;

watch(now, (simulationTime) => {
  satelliteDataSource.advanceTo(simulationTime);
  if (timelineFollowCurrentTime.value) {
    timelineWindowOffsetMs.value = 0;
  }
});

onMounted(async () => {
  try {
    const stations = await fetchGroundStationsFromEmulator();
    if (stations.length) {
      groundStations.value = stations;
    }
  } catch (error) {
    console.warn('Failed to load emulator star nodes as ground stations.', error);
  }

  try {
    networkNodes.value = await fetchNetworkNodes();
  } catch (error) {
    console.warn('Failed to load network nodes.', error);
  }

  await refreshEmulatorContainers();
  // containerRefreshTimerId = window.setInterval(refreshEmulatorContainers, CONTAINER_REFRESH_MS);

  satelliteDataSource.on('ground-links', (frame) => {
    if (frame.completed) {
      backendGroundLinks.value = [];
      backendLinkedSatelliteIds.value = [];
      hiddenBackendSatelliteIds.value = [];
      return;
    }

    if (frame.requestIndex === 0 && frame.groupIndex === 0) {
      hiddenBackendSatelliteIds.value = [];
      hiddenBackendGroundStationIds.value = [];
    }

    const hiddenIds = new Set(hiddenBackendSatelliteIds.value);
    backendGroundLinks.value = frame.links.filter((link) => !hiddenIds.has(link.satelliteId));
    recordFrameTimelineEvent(
      'ground',
      'Ground link update',
      'Ground',
      frame.sampleTime,
      createGroundTimelineSignature(backendGroundLinks.value),
      lastGroundTimelineSignature,
      'Ground links',
    );
    backendLinkedSatelliteIds.value = Array.from(new Set(backendGroundLinks.value.map((link) => link.satelliteId)));
    const hiddenStationIds = new Set(hiddenBackendGroundStationIds.value);
    selectedGroundStationIds.value = Array.from(
      new Set([
        ...selectedGroundStationIds.value,
        ...backendGroundLinks.value
          .map((link) => link.stationId)
          .filter((stationId) => !hiddenStationIds.has(stationId)),
      ]),
    );
  });
  satelliteDataSource.on('satellite-links', (frame) => {
    if (frame.completed) {
      backendSatelliteLinks.value = [];
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
    recordFrameTimelineEvent(
      'satellite',
      'Inter-satellite link update',
      'ISL',
      frame.sampleTime,
      createSatelliteTimelineSignature(backendSatelliteLinks.value),
      lastSatelliteTimelineSignature,
      'Inter-satellite links',
    );
  });
  satelliteDataSource.on('network-links', (frame) => {
    networkLinks.value = frame.completed ? [] : frame.links;
    if (!frame.completed) {
      recordFrameTimelineEvent(
        'network',
        'Network path update',
        'Network',
        frame.sampleTime,
        createNetworkTimelineSignature(networkLinks.value),
        lastNetworkTimelineSignature,
        'Network paths',
      );
    }
  });
  satelliteDataSource.on('dead', (error) => {
    console.warn('Satellite ground-link websocket disconnected.', error);
  });
  satelliteDataSource.connect();
  void syncTrafficObserverFilter();

  trafficObserverClient = createTrafficObserverClient(
    (message) => {
      if (!isIngressTrafficPacket(message)) {
        return;
      }

      rememberTrafficPacketNodes(message);
      if (trafficRecordingEnabled.value && !trafficPlaybackEnabled.value) {
        recordTrafficPacket(message);
      }
      if (!trafficPlaybackEnabled.value) {
        triggerTrafficPacket(message);
      }
    },
    (error) => {
      console.warn('Traffic observer websocket error.', error);
    },
  );
  trafficObserverClient.connect();
  trafficCleanupTimerId = window.setInterval(cleanupInactiveTrafficContainers, 250);
});

onUnmounted(() => {
  satelliteDataSource.disconnect();
  trafficObserverClient?.disconnect();
  if (trafficCleanupTimerId !== undefined) {
    window.clearInterval(trafficCleanupTimerId);
  }
  if (containerRefreshTimerId !== undefined) {
    window.clearInterval(containerRefreshTimerId);
  }
  if (satelliteFocusClearTimer !== undefined) {
    window.clearTimeout(satelliteFocusClearTimer);
  }
  if (stationFocusClearTimer !== undefined) {
    window.clearTimeout(stationFocusClearTimer);
  }
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();
});

const renderTime = computed(() => now.value);
const renderIsoTime = computed(() => renderTime.value.toISOString().replace(/\.\d{3}Z$/, ''));
const timelineCenterMs = computed(() => renderTime.value.getTime() + timelineWindowOffsetMs.value);
const timelineStartMs = computed(() => timelineCenterMs.value - TIMELINE_WINDOW_MS / 2);
const timelineEndMs = computed(() => timelineCenterMs.value + TIMELINE_WINDOW_MS / 2);
const currentTimeLeftPercent = computed(() =>
  clampPercent(((renderTime.value.getTime() - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100),
);
const visibleTimelineEvents = computed<TimelineDisplayEvent[]>(() =>
  compactTimelineEvents(
    timelineEvents.value.filter(
      (event) =>
        event.timestampMs >= timelineStartMs.value &&
        event.timestampMs <= timelineEndMs.value,
    ),
    timelineEventListVisible.value ? focusedTimelineEventIds.value : [],
  ),
);
const sortedTimelineEvents = computed(() =>
  [...timelineEvents.value].sort((left, right) =>
    timelineSortDescending.value
      ? right.timestampMs - left.timestampMs
      : left.timestampMs - right.timestampMs,
  ),
);
const timelineTicks = computed<TimelineTick[]>(() => {
  const firstTick = Math.ceil(timelineStartMs.value / TIMELINE_TICK_MS) * TIMELINE_TICK_MS;
  const ticks: TimelineTick[] = [];
  for (let timestampMs = firstTick; timestampMs <= timelineEndMs.value; timestampMs += TIMELINE_TICK_MS) {
    ticks.push({
      timestampMs,
      leftPercent: clampPercent(((timestampMs - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100),
      label: formatTimelineHourMinute(new Date(timestampMs)),
    });
  }
  return ticks;
});
const containerNetworkNodes = computed<NetworkNodeLocation[]>(() => {
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
        name: detail?.nodeName || emulatorInfo.displayname || getTrafficLocationCity(location) || emulatorInfo.name,
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

    const fallbackLocation = getFallbackTrafficNodeLocation(detail.containerId);
    if (!fallbackLocation && (detail.longitude === undefined || detail.latitude === undefined)) {
      return;
    }

    nodes.push({
      id: detail.containerId,
      type: normalizeContainerNodeType(detail.nodeType),
      name: detail.nodeName || detail.shortContainerId,
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
const activeTrafficNodeIds = computed(() => {
  return Object.keys(trafficContainerActiveUntil.value);
});
const trafficReplayBlockedBySimulationSpeed = computed(() =>
  !trafficCaptureActive.value && settings.speed !== 1,
);
const trafficReplayPanelDisabled = computed(() => trafficReplayBlockedBySimulationSpeed.value);
const trafficFilterStatusText = computed(() => {
  if (trafficFilterError.value) {
    return trafficFilterError.value;
  }
  if (trafficCaptureActive.value) {
    return `Collector filter active: ${trafficActiveFilter.value}`;
  }
  if (trafficReplayBlockedBySimulationSpeed.value) {
    return 'Set Settings simulation speed to 1x before using Traffic Replay.';
  }
  return 'Submit an empty filter to stop packet capture.';
});
const trafficNodeSearchKeyword = computed(() => trafficNodeSearchInput.value.trim().toLowerCase());
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
      node.nodeIp,
      node.containerName,
      node.containerId,
      node.shortContainerId,
      node.nodeType,
    ].some((value) => value?.toLowerCase().includes(keyword)),
  );
});
const visibleTrafficNodeSearchResults = computed(() => trafficNodeSearchResults.value.slice(0, 8));
const trafficReplaySeekMax = computed(() =>
  Math.max(0, trafficPlaybackEvents.value.length || trafficPacketEvents.value.length),
);
const trafficReplayRangeLabel = computed(() => {
  const events = trafficPlaybackEvents.value.length
    ? trafficPlaybackEvents.value
    : [...trafficPacketEvents.value].sort(compareTrafficReplayEvents);
  const first = events[0];
  const last = events[events.length - 1];

  if (!first || !last) {
    return 'Enable recording to capture incoming traffic packets.';
  }

  return `${formatTimelineDateTime(new Date(first.timestampMs))} -> ${formatTimelineDateTime(new Date(last.timestampMs))}`;
});
watch(
  trafficReplaySeekMax,
  (maxPosition) => {
    trafficReplaySeekPosition.value = Math.min(trafficReplaySeekPosition.value, maxPosition);
  },
);
const totalSatelliteCount = computed(() => records.length);
const dockPages = computed(() =>
  dockPageDefinitions.map((page) => ({
    ...page,
    count: getDockPageCount(page.id),
  })),
);
const activeDockPageLabel = computed(
  () => dockPageDefinitions.find((page) => page.id === activeDockPage.value)?.label ?? 'Menu',
);
const activeDockPageCount = computed(() =>
  activeDockPage.value === 'settings' ? undefined : getDockPageCount(activeDockPage.value),
);
const activeDockListTab = computed<DockListTab>(() =>
  ['all', 'selected', 'stations', 'settings'].includes(activeDockPage.value)
    ? activeDockPage.value as DockListTab
    : 'all',
);
const orbitPlaneOptions = computed(() =>
  Array.from(
    new Set(
      records
        .filter(
          (record) =>
            visibleShellIds.value.has(getSatelliteShellId(record.orbitPlaneId)),
        )
        .map((record) => record.orbitPlaneId),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
);

const allDisplayedSatellites = computed(() => propagateMany(records, renderTime.value));
const visibleShellIds = computed(() => new Set(
  SATELLITE_SHELL_STYLES
    .map((shell) => shell.id)
    .filter((shellId) => !hiddenShellIds.value.includes(shellId)),
));
const shellLegendItems = computed(() => {
  const counts = new Map<string, number>();
  records.forEach((record) => {
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
const focusedSatelliteId = computed(() => focusedSatelliteOverrideId.value);
const focusedStationId = computed(() => focusedStationOverrideId.value);
const highlightedSatelliteIds = computed(() => {
  const ids = new Set(visibleOrbitIds.value);

  if (settings.search.trim()) {
    displayedSatellites.value.forEach((satellite) => ids.add(satellite.id));
  }

  return Array.from(ids);
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
        .map((id) => records.find((record) => record.id === id))
        .filter((record): record is (typeof records)[number] => Boolean(record))
    : [],
);

function toggleShellVisibility(shellId: string) {
  if (hiddenShellIds.value.includes(shellId)) {
    hiddenShellIds.value = hiddenShellIds.value.filter((id) => id !== shellId);
    sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIds.value);
    return;
  }

  hiddenShellIds.value = [...hiddenShellIds.value, shellId];
  sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIds.value);
}

function toggleSatelliteOrbit(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  flashFocusedSatellite(satellite.id);
  toggleSatelliteOrbitState(satellite);
}

function toggleSatelliteOrbitFromGlobe(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  flashFocusedSatellite(satellite.id);
  toggleSatelliteOrbitState(satellite);
}

function focusSelectedSatellite(satellite: SatellitePoint) {
  stationDetailVisible.value = false;
  selectedSatelliteId.value = satellite.id;
  flashFocusedSatellite(satellite.id);
}

async function flashFocusedSatellite(satelliteId: string) {
  if (satelliteFocusClearTimer !== undefined) {
    window.clearTimeout(satelliteFocusClearTimer);
  }

  focusedSatelliteOverrideId.value = undefined;
  await nextTick();
  focusedSatelliteOverrideId.value = satelliteId;
  satelliteFocusClearTimer = window.setTimeout(() => {
    if (focusedSatelliteOverrideId.value === satelliteId) {
      focusedSatelliteOverrideId.value = undefined;
    }
    satelliteFocusClearTimer = undefined;
  }, TRAFFIC_NODE_FLASH_MS);
}

async function flashFocusedStation(stationId: string) {
  if (stationFocusClearTimer !== undefined) {
    window.clearTimeout(stationFocusClearTimer);
  }

  focusedStationOverrideId.value = undefined;
  await nextTick();
  focusedStationOverrideId.value = stationId;
  stationFocusClearTimer = window.setTimeout(() => {
    if (focusedStationOverrideId.value === stationId) {
      focusedStationOverrideId.value = undefined;
    }
    stationFocusClearTimer = undefined;
  }, TRAFFIC_NODE_FLASH_MS);
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
    focusedSatelliteOverrideId.value = undefined;
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
  if (nextSettings.speed !== settings.speed || nextSettings.paused !== settings.paused) {
    commitElapsedTime();
  }
  const sanitizedSettings = { ...nextSettings };
  if (trafficCaptureActive.value) {
    sanitizedSettings.speed = 1;
  }
  sanitizedSettings.selectedOrbitPlaneIds = sanitizeOrbitPlaneIdsForHiddenShells(
    sanitizedSettings.selectedOrbitPlaneIds,
    hiddenShellIds.value,
  );
  Object.assign(settings, sanitizedSettings);
  if (!settings.showSelectionDetails) {
    detailVisible.value = false;
    stationDetailVisible.value = false;
    containerDetailVisible.value = false;
  }
  if (!settings.showSatellites) {
    detailVisible.value = false;
    statusSatelliteId.value = undefined;
  }
  if (!settings.showGroundStations) {
    stationDetailVisible.value = false;
    statusStationId.value = undefined;
  }
}

function sanitizeOrbitPlaneIdsForHiddenShells(planeIds: string[], hiddenShellIdsSnapshot: string[]) {
  const hiddenShellSet = new Set(hiddenShellIdsSnapshot);

  return planeIds.filter((planeId) => !hiddenShellSet.has(getSatelliteShellId(planeId)));
}

function sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIdsSnapshot: string[]) {
  const nextPlaneIds = sanitizeOrbitPlaneIdsForHiddenShells(
    settings.selectedOrbitPlaneIds,
    hiddenShellIdsSnapshot,
  );

  if (nextPlaneIds.length !== settings.selectedOrbitPlaneIds.length) {
    settings.selectedOrbitPlaneIds = nextPlaneIds;
  }
}

function toggleDockCollapsed() {
  dockCollapsed.value = !dockCollapsed.value;
  if (dockCollapsed.value) {
    dockPageMenuVisible.value = false;
  }
}

function getDockPageCount(page: DockPage) {
  if (page === 'shells') {
    return totalSatelliteCount.value;
  }

  if (page === 'all') {
    return filteredSatellites.value.length;
  }

  if (page === 'selected') {
    return selectedOrbitSatellites.value.length;
  }

  if (page === 'stations') {
    return groundStations.value.length;
  }

  if (page === 'traffic') {
    return trafficPacketEvents.value.length;
  }

  return undefined;
}

function toggleDockPageMenu() {
  dockPageMenuVisible.value = !dockPageMenuVisible.value;
  dockCollapsed.value = false;
}

function selectDockPage(page: DockPage) {
  activeDockPage.value = page;
  dockPageMenuVisible.value = false;
  dockCollapsed.value = false;
}

function switchDockPage(direction: -1 | 1) {
  const currentIndex = dockPageDefinitions.findIndex((page) => page.id === activeDockPage.value);
  const nextIndex = (currentIndex + direction + dockPageDefinitions.length) % dockPageDefinitions.length;
  activeDockPage.value = dockPageDefinitions[nextIndex].id;
  dockPageMenuVisible.value = false;
  dockCollapsed.value = false;
}

function shiftTimelineWindow(direction: -1 | 1) {
  timelineFollowCurrentTime.value = false;
  timelineWindowOffsetMs.value += direction * TIMELINE_SHIFT_MS;
}

function syncTimelineToTime(timestampMs: number) {
  timelineFollowCurrentTime.value = false;
  timelineWindowOffsetMs.value = timestampMs - renderTime.value.getTime();
}

function toggleTimelineCollapsed() {
  timelineCollapsed.value = !timelineCollapsed.value;
  if (timelineCollapsed.value) {
    closeTimelineEventList();
  }
}

function compactTimelineEvents(events: TimelineEvent[], focusedEventIds: string[]) {
  const focusedEventIdSet = new Set(focusedEventIds);
  const eventsByTimestamp = new Map<number, TimelineEvent[]>();
  events.forEach((event) => {
    eventsByTimestamp.set(event.timestampMs, [
      ...(eventsByTimestamp.get(event.timestampMs) ?? []),
      event,
    ]);
  });

  const timestampEvents = Array.from(eventsByTimestamp.values()).map((timestampGroup) => {
    const displayEvent =
      timestampGroup.find((event) => focusedEventIdSet.has(event.id)) ??
      timestampGroup[timestampGroup.length - 1];
    return {
      ...displayEvent,
      clusterCount: timestampGroup.length,
      groupedEventIds: timestampGroup.map((event) => event.id),
      isCluster: timestampGroup.length > 1,
      leftPercent: clampPercent(
        ((displayEvent.timestampMs - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100,
      ),
      clusterWidthPercent: 0,
      labelLane: 0,
      timeLabel: formatTimelineClock(new Date(displayEvent.timestampMs)),
      showLabel: false,
    };
    })
    .sort((left, right) => left.leftPercent - right.leftPercent);

  if (focusedEventIds.length) {
    return assignTimelineLabelLanes(
      timestampEvents
      .filter((event) => event.groupedEventIds.some((eventId) => focusedEventIdSet.has(eventId)))
      .map((event) => ({
        ...event,
        showLabel: true,
      })),
      true,
    );
  }

  const markerGroups = groupTimelineMarkersByDistance(timestampEvents);
  const displayEvents = markerGroups
    .map((group) => {
      const displayEvent = [...group].sort((left, right) => right.timestampMs - left.timestampMs)[0];
      const groupedEventIds = group.flatMap((event) => event.groupedEventIds);
      const clusterCount = group.reduce((total, event) => total + event.clusterCount, 0);
      const clusterStartPercent = Math.min(...group.map((event) => event.leftPercent));
      const clusterEndPercent = Math.max(...group.map((event) => event.leftPercent));
      return {
        ...displayEvent,
        clusterCount,
        groupedEventIds,
        isCluster: clusterCount > 1,
        leftPercent: clusterStartPercent,
        clusterWidthPercent: clusterEndPercent - clusterStartPercent,
        showLabel: false,
      };
    })
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .map((event) => ({ ...event, showLabel: true }));

  return assignTimelineLabelLanes(displayEvents)
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function assignTimelineLabelLanes(events: TimelineDisplayEvent[], forceShow = false) {
  const laneSlots: number[][] = Array.from({ length: TIMELINE_LABEL_LANE_COUNT }, () => []);

  return events.map((event) => {
    const labelAnchorPercent = getTimelineLabelAnchorPercent(event);
    const laneIndex = laneSlots.findIndex((slots) =>
      slots.every((leftPercent) => Math.abs(leftPercent - labelAnchorPercent) >= TIMELINE_LABEL_MIN_GAP_PERCENT),
    );

    if (laneIndex === -1) {
      return {
        ...event,
        labelLane: TIMELINE_LABEL_LANE_COUNT - 1,
        showLabel: forceShow ? event.showLabel : false,
      };
    }

    laneSlots[laneIndex].push(labelAnchorPercent);
    return {
      ...event,
      labelLane: laneIndex,
      showLabel: event.showLabel,
    };
  });
}

function getTimelineLabelAnchorPercent(event: TimelineDisplayEvent) {
  return event.isCluster
    ? clampPercent(event.leftPercent + event.clusterWidthPercent + 1)
    : event.leftPercent;
}

function groupTimelineMarkersByDistance(events: TimelineDisplayEvent[]) {
  const groups: TimelineDisplayEvent[][] = [];

  events.forEach((event) => {
    const lastGroup = groups[groups.length - 1];
    const lastEvent = lastGroup?.[lastGroup.length - 1];
    if (lastGroup && lastEvent && Math.abs(event.leftPercent - lastEvent.leftPercent) < TIMELINE_MARKER_MIN_GAP_PERCENT) {
      lastGroup.push(event);
      return;
    }

    groups.push([event]);
  });

  return groups;
}

function formatTimelineClock(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimelineHourMinute(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimelineDateTime(date: Date) {
  const datePart = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
  return `${datePart} ${formatTimelineClock(date)}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function rememberTrafficPacketNodes(message: TrafficPacketMessage) {
  rememberTrafficContainerDetail(message.containerId, {
    nodeName: message.nodeName,
    nodeIp: message.nodeIp,
  });

  // if (message.sourceContainerId) {
  //   rememberTrafficContainerDetail(message.sourceContainerId, {
  //     nodeName: message.sourceNodeName,
  //     nodeIp: message.sourceNodeIp,
  //   });
  // }

  // if (message.destContainerId) {
  //   rememberTrafficContainerDetail(message.destContainerId, {
  //     nodeName: message.destNodeName,
  //     nodeIp: message.destNodeIp,
  //   });
  // }
}

function isIngressTrafficPacket(message: TrafficPacketMessage) {
  return message.direction === undefined || message.direction === 'ingress';
}

function triggerTrafficPacket(message: TrafficPacketMessage) {
  rememberTrafficPacketNodes(message);
  markTrafficContainerActive(message.containerId);
}

function recordTrafficPacket(message: TrafficPacketMessage) {
  const timestampMs = normalizePacketTimestamp(message.timestamp);
  const replayEvent: TrafficPacketReplayEvent = {
    ...message,
    id: `packet:${timestampMs}:${Math.random().toString(36).slice(2, 8)}`,
    timestampMs,
    receivedAtMs: Date.now(),
  };
  trafficPacketEvents.value = [...trafficPacketEvents.value, replayEvent].slice(-TRAFFIC_REPLAY_MAX_EVENTS);
}

function compareTrafficReplayEvents(left: TrafficPacketReplayEvent, right: TrafficPacketReplayEvent) {
  const leftTimestampNs = normalizePacketTimestampNs(left.timestampNs);
  const rightTimestampNs = normalizePacketTimestampNs(right.timestampNs);

  if (leftTimestampNs !== undefined && rightTimestampNs !== undefined) {
    if (leftTimestampNs < rightTimestampNs) {
      return -1;
    }
    if (leftTimestampNs > rightTimestampNs) {
      return 1;
    }
  }

  return left.timestampMs - right.timestampMs;
}

function normalizePacketTimestamp(timestamp: string) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) ? timestampMs : Date.now();
}

function normalizePacketTimestampNs(timestampNs: TrafficPacketMessage['timestampNs']) {
  if (timestampNs === undefined || timestampNs === '') {
    return undefined;
  }

  try {
    return BigInt(timestampNs);
  } catch {
    return undefined;
  }
}

async function syncTrafficObserverFilter() {
  trafficFilterError.value = '';

  try {
    const response = await fetchTrafficObserverFilter();
    const filter = response.filter.trim();
    trafficFilterInput.value = filter;
    trafficActiveFilter.value = filter;
    trafficCaptureActive.value = Boolean(filter);

    if (trafficCaptureActive.value) {
      settings.speed = 1;
    } else {
      trafficRecordingEnabled.value = false;
    }
  } catch (error) {
    trafficFilterError.value = error instanceof Error
      ? error.message
      : 'Failed to load traffic filter.';
  }
}

async function submitTrafficFilter() {
  if (trafficReplayPanelDisabled.value || trafficFilterSubmitting.value) {
    return;
  }

  const nextFilter = trafficFilterInput.value.trim();
  trafficFilterSubmitting.value = true;
  trafficFilterError.value = '';

  try {
    const response = await setTrafficObserverFilter(nextFilter);
    trafficActiveFilter.value = response.filter.trim();
    trafficCaptureActive.value = Boolean(trafficActiveFilter.value);

    if (trafficCaptureActive.value) {
      stopTrafficPlayback();
      settings.speed = 1;
      return;
    }

    trafficRecordingEnabled.value = false;
    stopTrafficPlayback();
  } catch (error) {
    trafficFilterError.value = error instanceof Error ? error.message : 'Failed to update traffic filter.';
  } finally {
    trafficFilterSubmitting.value = false;
  }
}

function toggleTrafficRecording() {
  if (trafficReplayPanelDisabled.value || trafficPlaybackEnabled.value || !trafficCaptureActive.value) {
    return;
  }

  trafficRecordingEnabled.value = !trafficRecordingEnabled.value;
  if (trafficRecordingEnabled.value) {
    stopTrafficPlayback();
  }
}

function toggleTrafficPlayback() {
  if (trafficReplayPanelDisabled.value || !trafficPacketEvents.value.length) {
    return;
  }

  if (!trafficPlaybackEnabled.value) {
    startTrafficPlayback();
    return;
  }

  trafficPlaybackPaused.value = !trafficPlaybackPaused.value;
  if (trafficPlaybackPaused.value) {
    clearTrafficPlaybackTimer();
    clearTrafficPlaybackClock();
    return;
  }

  const delayMs = getTrafficPlaybackDelayMs();
  startTrafficPlaybackClockToNextEvent(delayMs);
  scheduleNextTrafficPlaybackEvent(delayMs);
}

function startTrafficPlayback() {
  const sortedEvents = [...trafficPacketEvents.value].sort(compareTrafficReplayEvents);
  const firstEvent = sortedEvents[0];
  if (!firstEvent) {
    return;
  }

  trafficRecordingEnabled.value = false;
  trafficPlaybackEnabled.value = true;
  trafficPlaybackEvents.value = sortedEvents;
  trafficPlaybackIndex.value = 0;
  trafficReplaySeekPosition.value = 0;
  trafficPlaybackPaused.value = false;
  settings.customTimeEnabled = true;
  playCurrentTrafficPlaybackEvent();
}

function stopTrafficPlayback() {
  const realTimeMs = Date.now();
  trafficPlaybackEnabled.value = false;
  trafficPlaybackPaused.value = true;
  trafficPlaybackIndex.value = 0;
  trafficReplaySeekPosition.value = 0;
  trafficPlaybackEvents.value = [];
  settings.customTimeEnabled = false;
  timelineFollowCurrentTime.value = true;
  timelineWindowOffsetMs.value = 0;
  setTime(realTimeMs);
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();
}

function clearTrafficRecording() {
  if (trafficRecordingEnabled.value || trafficPlaybackEnabled.value) {
    return;
  }

  trafficPacketEvents.value = [];
  trafficPlaybackEvents.value = [];
  trafficPlaybackIndex.value = 0;
  trafficReplaySeekPosition.value = 0;
  trafficContainerActiveUntil.value = {};
}

function jumpTrafficPlayback(direction: -1 | 1) {
  if (!trafficPacketEvents.value.length) {
    return;
  }

  const events = ensureTrafficPlaybackEvents();
  trafficPlaybackPaused.value = true;
  settings.customTimeEnabled = true;
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();

  const currentIndex = getCurrentTrafficPlaybackEventIndex(events);
  const targetIndex = Math.min(
    events.length - 1,
    Math.max(0, currentIndex + direction),
  );
  showTrafficPlaybackEventAtIndex(targetIndex, events);
}

function updateTrafficReplaySeekPosition(value: number | number[] | string) {
  const nextPosition = normalizeTrafficReplaySeekInput(value);
  if (!Number.isFinite(nextPosition)) {
    return;
  }

  trafficReplaySeekPosition.value = clampTrafficReplaySeekPosition(nextPosition);
}

function seekTrafficPlaybackPosition(value: number | number[] | string) {
  const nextPosition = normalizeTrafficReplaySeekInput(value);
  const events = trafficPlaybackEvents.value.length
    ? trafficPlaybackEvents.value
    : [...trafficPacketEvents.value].sort(compareTrafficReplayEvents);

  if (!events.length || !Number.isFinite(nextPosition)) {
    return;
  }

  const clampedPosition = clampTrafficReplaySeekPosition(nextPosition);
  trafficPlaybackEvents.value = events;
  trafficPlaybackEnabled.value = true;
  trafficPlaybackPaused.value = true;
  settings.customTimeEnabled = true;
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();

  if (clampedPosition <= 0) {
    trafficPlaybackIndex.value = 0;
    trafficReplaySeekPosition.value = 0;
    const firstEvent = events[0];
    setTime(firstEvent.timestampMs);
    syncTimelineToTime(firstEvent.timestampMs);
    return;
  }

  showTrafficPlaybackEventAtIndex(Math.min(events.length - 1, clampedPosition - 1), events);
}

function normalizeTrafficReplaySeekInput(value: number | number[] | string) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const numericValue = Number(rawValue);

  return Number.isFinite(numericValue) ? numericValue : Number.NaN;
}

function clampTrafficReplaySeekPosition(position: number) {
  return Math.min(
    trafficReplaySeekMax.value,
    Math.max(0, Math.round(position)),
  );
}

function formatTrafficReplaySeekTooltip(value: number | string) {
  const position = normalizeTrafficReplaySeekInput(value);
  return Number.isFinite(position) ? String(clampTrafficReplaySeekPosition(position)) : '0';
}

function ensureTrafficPlaybackEvents() {
  if (!trafficPlaybackEvents.value.length) {
    trafficPlaybackEvents.value = [...trafficPacketEvents.value].sort(compareTrafficReplayEvents);
  }
  trafficPlaybackEnabled.value = true;

  return trafficPlaybackEvents.value;
}

function getCurrentTrafficPlaybackEventIndex(events: TrafficPacketReplayEvent[]) {
  if (!events.length) {
    return 0;
  }

  if (trafficReplaySeekPosition.value > 0) {
    return Math.min(events.length - 1, Math.max(0, trafficReplaySeekPosition.value - 1));
  }

  return Math.min(events.length - 1, Math.max(0, trafficPlaybackIndex.value - 1));
}

function showTrafficPlaybackEventAtIndex(index: number, events = trafficPlaybackEvents.value) {
  const target = events[index];
  if (!target) {
    return;
  }

  trafficPlaybackEvents.value = events;
  trafficPlaybackIndex.value = index + 1;
  trafficReplaySeekPosition.value = index + 1;
  setTime(target.timestampMs);
  syncTimelineToTime(target.timestampMs);
  triggerTrafficPacket(target);
}

function playCurrentTrafficPlaybackEvent() {
  clearTrafficPlaybackTimer();
  clearTrafficPlaybackClock();

  if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
    return;
  }

  const currentIndex = trafficPlaybackIndex.value;
  const currentEvent = trafficPlaybackEvents.value[trafficPlaybackIndex.value];
  if (!currentEvent) {
    trafficPlaybackPaused.value = true;
    return;
  }

  setTime(currentEvent.timestampMs);
  syncTimelineToTime(currentEvent.timestampMs);
  triggerTrafficPacket(currentEvent);

  trafficPlaybackIndex.value += 1;
  trafficReplaySeekPosition.value = trafficPlaybackIndex.value;
  const delayMs = getTrafficPlaybackDelayMs();
  startTrafficPlaybackClockBetweenEvents(currentIndex, delayMs);
  scheduleNextTrafficPlaybackEvent(delayMs);
}

function scheduleNextTrafficPlaybackEvent(delayMs: number) {
  clearTrafficPlaybackTimer();
  if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
    return;
  }

  if (trafficPlaybackIndex.value >= trafficPlaybackEvents.value.length) {
    trafficPlaybackPaused.value = true;
    return;
  }

  trafficPlaybackTimerId = window.setTimeout(playCurrentTrafficPlaybackEvent, delayMs);
}

function getTrafficPlaybackDelayMs() {
  return Math.min(
    TRAFFIC_REPLAY_MAX_STEP_MS,
    Math.max(TRAFFIC_REPLAY_MIN_STEP_MS, trafficPlaybackIntervalMs.value),
  );
}

function clearTrafficPlaybackTimer() {
  if (trafficPlaybackTimerId !== undefined) {
    window.clearTimeout(trafficPlaybackTimerId);
    trafficPlaybackTimerId = undefined;
  }
}

function startTrafficPlaybackClockBetweenEvents(currentIndex: number, durationMs: number) {
  const currentEvent = trafficPlaybackEvents.value[currentIndex];
  const nextEvent = trafficPlaybackEvents.value[currentIndex + 1];
  if (!currentEvent || !nextEvent) {
    return;
  }

  startTrafficPlaybackClockTween(currentEvent.timestampMs, nextEvent.timestampMs, durationMs);
}

function startTrafficPlaybackClockToNextEvent(durationMs: number) {
  const nextEvent = trafficPlaybackEvents.value[trafficPlaybackIndex.value];
  if (!nextEvent) {
    return;
  }

  startTrafficPlaybackClockTween(renderTime.value.getTime(), nextEvent.timestampMs, durationMs);
}

function startTrafficPlaybackClockTween(fromTimestampMs: number, toTimestampMs: number, durationMs: number) {
  clearTrafficPlaybackClock();

  const safeDurationMs = Math.max(1, durationMs);
  const startedAtMs = performance.now();

  const tick = () => {
    if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
      trafficPlaybackClockFrameId = undefined;
      return;
    }

    const progress = Math.min(1, (performance.now() - startedAtMs) / safeDurationMs);
    const timestampMs = fromTimestampMs + (toTimestampMs - fromTimestampMs) * progress;
    setTime(timestampMs);
    syncTimelineToTime(timestampMs);

    if (progress < 1) {
      trafficPlaybackClockFrameId = window.requestAnimationFrame(tick);
      return;
    }

    trafficPlaybackClockFrameId = undefined;
  };

  trafficPlaybackClockFrameId = window.requestAnimationFrame(tick);
}

function clearTrafficPlaybackClock() {
  if (trafficPlaybackClockFrameId !== undefined) {
    window.cancelAnimationFrame(trafficPlaybackClockFrameId);
    trafficPlaybackClockFrameId = undefined;
  }
}

function rememberTrafficContainerDetail(
  containerId: string,
  detail: { nodeName?: string; nodeIp?: string },
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
    : getFallbackTrafficNodeLocation(normalizedContainerId);
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
      nodeName,
      nodeIp: detail.nodeIp || previous?.nodeIp,
      nodeType: previous?.nodeType || emulatorInfo?.role,
      containerName: previous?.containerName || getContainerName(container),
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
          : getFallbackTrafficNodeLocation(normalizedContainerId)
            ? { ...getFallbackTrafficNodeLocation(normalizedContainerId)!, source: 'generated' as const }
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
) {
  const metadataLocation = getContainerGeoLocation(container);
  if (metadataLocation) {
    return {
      ...metadataLocation,
      source: 'metadata' as const,
    };
  }

  const fallbackLocation =
    getFallbackTrafficNodeLocation(container.Id) ??
    getFallbackTrafficNodeLocation(container.meta?.emulatorInfo?.name) ??
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

function getFallbackTrafficNodeLocation(nodeId: string | undefined) {
  if (!nodeId) {
    return undefined;
  }

  return fallbackTrafficNodeLocations.value[nodeId];
}

function getTrafficLocationCity(location: unknown) {
  return typeof location === 'object' &&
    location !== null &&
    'city' in location &&
    typeof location.city === 'string'
    ? location.city
    : undefined;
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
  return emulatorContainers.value.find((container) =>
    container.Id === containerId ||
    container.Id.startsWith(containerId) ||
    containerId.startsWith(container.Id),
  );
}

function getContainerName(container: EmulatorContainerInfo | undefined) {
  return container?.Names?.[0]?.replace(/^\//, '');
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
  statusTrafficContainerId.value = containerId;
  detailVisible.value = false;
  stationDetailVisible.value = false;
  containerDetailVisible.value = false;
}

function markTrafficContainerActive(containerId: string) {
  if (!containerId) {
    return;
  }

  ensureTrafficContainerVisible(containerId);
  const activeUntil = Date.now() + TRAFFIC_NODE_FLASH_MS;
  trafficContainerActiveUntil.value = {
    ...trafficContainerActiveUntil.value,
    [containerId]: activeUntil,
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
    getFallbackTrafficNodeLocation(container.Id) ??
    getFallbackTrafficNodeLocation(nodeName);
  if (existingLocation) {
    const occupiedLocations = getOccupiedTrafficNodeLocations(container.Id);
    const nearestDistanceKm = getNearestLocationDistanceKm(existingLocation, occupiedLocations);
    if (nearestDistanceKm >= TRAFFIC_FALLBACK_MIN_DISTANCE_KM || !occupiedLocations.length) {
      if (!getFallbackTrafficNodeLocation(container.Id)) {
        fallbackTrafficNodeLocations.value = {
          ...fallbackTrafficNodeLocations.value,
          [container.Id]: existingLocation,
        };
      }
      rememberTrafficContainerLocation(container.Id, existingLocation, 'generated');
      return;
    }
  }

  const fallbackLocation = pickFallbackTrafficNodeLocation(container.Id);
  fallbackTrafficNodeLocations.value = {
    ...fallbackTrafficNodeLocations.value,
    [container.Id]: fallbackLocation,
  };
  rememberTrafficContainerLocation(container.Id, fallbackLocation, 'generated');
}

function getContainerGeoLocation(container: EmulatorContainerInfo) {
  const emulatorInfo = container.meta?.emulatorInfo;
  const longitude = Number(emulatorInfo?.longitude);
  const latitude = Number(emulatorInfo?.latitude);

  if (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  ) {
    return { longitude, latitude };
  }

  return undefined;
}

function pickFallbackTrafficNodeLocation(nodeId: string) {
  const occupiedLocations = getOccupiedTrafficNodeLocations(nodeId);
  const candidates = createFallbackTrafficNodeCandidates();
  let bestCandidate = candidates[0];
  let bestDistanceKm = -1;

  candidates.forEach((candidate) => {
    const nearestDistanceKm = getNearestLocationDistanceKm(candidate, occupiedLocations);
    if (nearestDistanceKm > bestDistanceKm) {
      bestCandidate = candidate;
      bestDistanceKm = nearestDistanceKm;
    }
  });

  if (bestDistanceKm >= TRAFFIC_FALLBACK_MIN_DISTANCE_KM || !occupiedLocations.length) {
    return bestCandidate;
  }

  return createDeterministicFallbackLocation(nodeId, occupiedLocations);
}

function getOccupiedTrafficNodeLocations(excludeNodeId?: string) {
  const occupiedLocations: Array<{ longitude: number; latitude: number }> = [];
  const occupiedKeys = new Set<string>();

  function addOccupiedLocation(location: { longitude: number; latitude: number }) {
    const key = `${location.longitude.toFixed(5)},${location.latitude.toFixed(5)}`;
    if (occupiedKeys.has(key)) {
      return;
    }

    occupiedKeys.add(key);
    occupiedLocations.push(location);
  }

  emulatorContainers.value.forEach((container) => {
    const nodeId = container.meta?.emulatorInfo?.name;
    const matchesExcludedNode =
      excludeNodeId !== undefined &&
      excludeNodeId !== '' &&
      (
        container.Id === excludeNodeId ||
        container.Id.startsWith(excludeNodeId) ||
        excludeNodeId.startsWith(container.Id) ||
        (nodeId && nodeId === excludeNodeId)
      );
    if (matchesExcludedNode) {
      return;
    }

    const geoLocation = getContainerGeoLocation(container);
    if (geoLocation) {
      addOccupiedLocation(geoLocation);
    }
  });

  Object.entries(fallbackTrafficNodeLocations.value).forEach(([nodeId, location]) => {
    if (nodeId === excludeNodeId) {
      return;
    }

    addOccupiedLocation({
      longitude: location.longitude,
      latitude: location.latitude,
    });
  });

  return occupiedLocations;
}

function createFallbackTrafficNodeCandidates() {
  const candidates: Array<{ city: string; longitude: number; latitude: number }> = [];
  const rings = [
    { radius: 0, count: 1 },
    { radius: 2.4, count: 8 },
    { radius: 4.8, count: 12 },
    { radius: 7.2, count: 16 },
    { radius: 10.5, count: 20 },
  ];

  FALLBACK_TRAFFIC_NODE_CITIES.forEach((city, cityIndex) => {
    rings.forEach((ring) => {
      for (let index = 0; index < ring.count; index += 1) {
        const angle = ring.count === 1
          ? 0
          : ((Math.PI * 2) / ring.count) * index + cityIndex * 0.37;
        const longitude = clampLongitude(city.longitude + Math.cos(angle) * ring.radius);
        const latitude = clampLatitude(city.latitude + Math.sin(angle) * ring.radius);
        candidates.push({
          city: ring.radius === 0 ? city.name : `${city.name}+${ring.radius.toFixed(1)}`,
          longitude,
          latitude,
        });
      }
    });
  });

  return candidates;
}

function createDeterministicFallbackLocation(
  nodeId: string,
  occupiedLocations: Array<{ longitude: number; latitude: number }>,
) {
  let bestLocation = {
    city: 'Generated',
    longitude: 0,
    latitude: 0,
  };
  let bestDistanceKm = -1;
  const seed = hashString(nodeId);

  for (let index = 0; index < 240; index += 1) {
    const longitude = normalizeLongitude(seed * 0.037 + index * 137.508);
    const latitude = clampLatitude(-58 + ((seed * 0.019 + index * 47.231) % 116));
    const candidate = {
      city: 'Generated',
      longitude,
      latitude,
    };
    const nearestDistanceKm = getNearestLocationDistanceKm(candidate, occupiedLocations);
    if (nearestDistanceKm > bestDistanceKm) {
      bestLocation = candidate;
      bestDistanceKm = nearestDistanceKm;
    }
  }

  return bestLocation;
}

function getNearestLocationDistanceKm(
  candidate: { longitude: number; latitude: number },
  occupiedLocations: Array<{ longitude: number; latitude: number }>,
) {
  if (!occupiedLocations.length) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...occupiedLocations.map((location) => getGreatCircleDistanceKm(candidate, location)),
  );
}

function getGreatCircleDistanceKm(
  left: { longitude: number; latitude: number },
  right: { longitude: number; latitude: number },
) {
  const earthRadiusKm = 6371;
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const halfChord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function clampLatitude(latitude: number) {
  return Math.max(-75, Math.min(75, latitude));
}

function clampLongitude(longitude: number) {
  return Math.max(-180, Math.min(180, longitude));
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 2166136261);
}

function normalizeContainerNodeType(role: string | undefined) {
  const normalizedRole = role?.toLowerCase() ?? '';

  if (normalizedRole.includes('host')) {
    return 'host';
  }

  if (normalizedRole.includes('router')) {
    return 'router';
  }

  return role || 'container';
}

function recordFrameTimelineEvent(
  kind: TimelineEventKind,
  label: string,
  shortLabel: string,
  sampleTime: Date,
  signature: string,
  lastSignature: { value: string },
  fallbackDetail: string,
) {
  if (!signature || signature === lastSignature.value) {
    return;
  }

  const changes = createTimelineChangeDetails(kind, signature, lastSignature.value, fallbackDetail);
  lastSignature.value = signature;
  changes.forEach((change) => {
    recordTimelineEvent(kind, label, change.action, shortLabel, sampleTime.getTime(), change.detail);
  });
}

function recordTimelineEvent(
  kind: TimelineEventKind,
  label: string,
  action: string,
  shortLabel: string,
  timestampMs: number,
  detail = label,
) {
  const isoTime = new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, '');
  const event: TimelineEvent = {
    id: `${kind}:${timestampMs}:${Math.random().toString(36).slice(2, 8)}`,
    kind,
    timestampMs,
    label,
    action,
    shortLabel,
    detail,
    isoTime,
  };

  timelineEvents.value = [...timelineEvents.value, event].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
}

function toggleTimelineSort() {
  timelineSortDescending.value = !timelineSortDescending.value;
}

function toggleTimelineEventList() {
  timelineEventListVisible.value = !timelineEventListVisible.value;
  if (!timelineEventListVisible.value) {
    focusedTimelineEventIds.value = [];
  }
}

function closeTimelineEventList() {
  timelineEventListVisible.value = false;
  focusedTimelineEventIds.value = [];
}

function selectTimelineEventFromList(event: TimelineEvent) {
  focusedTimelineEventIds.value = [event.id];
  jumpToTimelineEvent(event);
}

function selectTimelineMarker(event: TimelineDisplayEvent) {
  if (event.isCluster) {
    timelineEventListVisible.value = true;
    focusedTimelineEventIds.value = event.groupedEventIds;
  }
  jumpToTimelineEvent(event);
}

function jumpToTimelineEvent(event: TimelineEvent) {
  setTime(event.timestampMs);
  settings.customTimeEnabled = true;
  syncTimelineToTime(event.timestampMs);
}

function createGroundTimelineSignature(links: SatelliteGroundLink[]) {
  return links
    .map((link) => `${link.satelliteId}->${link.stationId}`)
    .sort()
    .join('|');
}

function createTimelineChangeDetails(
  kind: TimelineEventKind,
  currentSignature: string,
  previousSignature: string,
  fallbackDetail: string,
) {
  const currentItems = parseTimelineSignatureItems(kind, currentSignature);
  const previousItems = parseTimelineSignatureItems(kind, previousSignature);
  const currentByKey = new Map(currentItems.map((item) => [item.key, item]));
  const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
  const changes: Array<{ action: string; detail: string }> = [];

  currentItems.forEach((currentItem) => {
    const previousItem = previousByKey.get(currentItem.key);
    if (!previousItem) {
      changes.push({ action: 'Added', detail: formatSignatureItem(currentItem.raw) });
      return;
    }

    if (previousItem.value !== currentItem.value) {
      changes.push({
        action: 'Update',
        detail: `${formatSignatureItem(currentItem.key)}: ${formatSignatureItem(previousItem.value)} -> ${formatSignatureItem(currentItem.value)}`,
      });
    }
  });

  previousItems.forEach((previousItem) => {
    if (!currentByKey.has(previousItem.key)) {
      changes.push({ action: 'Removed', detail: formatSignatureItem(previousItem.raw) });
    }
  });

  return changes.length
    ? changes
    : [{ action: 'Update', detail: `${fallbackDetail}: ${currentItems.length} active` }];
}

function parseTimelineSignatureItems(kind: TimelineEventKind, signature: string) {
  return signature
    .split('|')
    .filter(Boolean)
    .map((raw) => {
      if (kind === 'ground') {
        const [satelliteId, stationId] = raw.split('->');
        return {
          key: satelliteId || raw,
          value: stationId || raw,
          raw,
        };
      }

      if (kind === 'network') {
        const separatorIndex = raw.indexOf(':f=');
        if (separatorIndex > -1) {
          return {
            key: raw.slice(0, separatorIndex),
            value: raw.slice(separatorIndex + 1),
            raw,
          };
        }
      }

      return {
        key: raw,
        value: raw,
        raw,
      };
    });
}

function formatSignatureItem(value: string) {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function createSatelliteTimelineSignature(links: InterSatelliteLink[]) {
  return links
    .map((link) => [link.satelliteAId, link.satelliteBId].sort().join('<->'))
    .sort()
    .join('|');
}

function createNetworkTimelineSignature(links: NetworkPathUpdateState[]) {
  return links
    .map((link, index) => {
      const flowId = link.id ?? `flow-${index}`;
      const forward = link.forwardPath.map((node) => `${node.type}:${node.id}`).join('>');
      const backward = link.returnPath.map((node) => `${node.type}:${node.id}`).join('>');
      return `${flowId}:f=${forward}:r=${backward}`;
    })
    .sort()
    .join('|');
}

function setSystemTime(timestampMs: number) {
  setTime(timestampMs);
  settings.customTimeEnabled = true;
  syncTimelineToTime(timestampMs);
  recordTimelineEvent(
    'time',
    'Manual time jump',
    'Jump',
    'Jump',
    timestampMs,
    `Jumped to ${formatTimelineDateTime(new Date(timestampMs))}`,
  );
}

function resetSystemTime() {
  const timestampMs = Date.now();
  setTime(timestampMs);
  settings.customTimeEnabled = false;
  syncTimelineToTime(timestampMs);
  recordTimelineEvent(
    'time',
    'Reset to current time',
    'Reset',
    'Now',
    timestampMs,
    `Reset to ${formatTimelineDateTime(new Date(timestampMs))}`,
  );
}

function focusGroundStation(station: GroundStation) {
  selectedStationId.value = station.id;
  void flashFocusedStation(station.id);
  detailVisible.value = false;
}

function showSatelliteStatus(satellite: SatellitePoint | undefined, anchor?: ScreenAnchor) {
  statusSatelliteId.value = satellite?.id;
  detailVisible.value = Boolean(satellite && settings.showSelectionDetails);
  if (satellite) {
    detailPanelAnchor.value = anchor;
    stationDetailVisible.value = false;
    containerDetailVisible.value = false;
  }
}

function showGroundStationStatus(station: GroundStation | undefined, anchor?: ScreenAnchor) {
  statusStationId.value = station?.id;
  stationDetailVisible.value = Boolean(station && settings.showSelectionDetails);
  if (station) {
    detailPanelAnchor.value = anchor;
    detailVisible.value = false;
    containerDetailVisible.value = false;
  }
}

function showTrafficContainerStatus(node: NetworkNodeLocation | undefined, anchor?: ScreenAnchor) {
  statusTrafficContainerId.value = node?.id;
  containerDetailVisible.value = Boolean(node && settings.showSelectionDetails);
  if (node) {
    detailPanelAnchor.value = anchor;
    detailVisible.value = false;
    stationDetailVisible.value = false;
  }
}

function updateGroundStationSelection(stationIds: string[]) {
  const validStationIds = new Set(groundStations.value.map((station) => station.id));
  const nextStationIds = Array.from(
    new Set(stationIds.filter((stationId) => validStationIds.has(stationId))),
  );
  const nextStationIdSet = new Set(nextStationIds);
  const removedStationIds = selectedGroundStationIds.value.filter(
    (stationId) => !nextStationIdSet.has(stationId),
  );

  hiddenBackendGroundStationIds.value = Array.from(
    new Set([...hiddenBackendGroundStationIds.value, ...removedStationIds]),
  ).filter((stationId) => !nextStationIdSet.has(stationId));
  selectedGroundStationIds.value = nextStationIds;

  if (selectedStationId.value && !nextStationIdSet.has(selectedStationId.value)) {
    selectedStationId.value = undefined;
    stationDetailVisible.value = false;
  }
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-dashboard.scss"></style>
