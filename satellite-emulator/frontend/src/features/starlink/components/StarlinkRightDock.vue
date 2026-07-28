<template>
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
        @toggle-shell="starlinkActions.toggleShell"
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
          :satellites="satellites"
          :selected-satellites="selectedSatellites"
          :orbit-plane-options="orbitPlaneOptions"
          :ground-stations="groundStations"
          :selected-station-ids="selectedStationIds"
          :connected-station-ids="connectedStationIds"
          :settings="settings"
          :current-time="currentTime"
          :selected-id="selectedId"
          :speed-disabled="speedDisabled"
          @select="starlinkActions.selectSatellite"
          @focus-selected="starlinkActions.focusSelectedSatellite"
          @remove="starlinkActions.removeSatellite"
          @remove-all="starlinkActions.removeAllSatellites"
          @station-focus="starlinkActions.stationFocus"
          @station-selection-change="starlinkActions.stationSelectionChange"
          @update-settings="starlinkActions.updateSettings"
          @set-system-time="starlinkActions.setSystemTime"
          @reset-system-time="starlinkActions.resetSystemTime"
        />
      </section>

      <section v-if="activeDockPage === 'traffic'" class="dock-list-page dock-page-traffic">
        <h2>
          <span>Traffic Replay</span>
          <em>{{ packetCount.toLocaleString() }}</em>
        </h2>

        <TrafficReplayPanel
          :filter-input="filterInput"
          :node-search-input="nodeSearchInput"
          :playback-interval-ms="playbackIntervalMs"
          :packet-count="packetCount"
          :node-search-keyword="nodeSearchKeyword"
          :node-search-results-count="nodeSearchResultsCount"
          :visible-node-search-results="visibleNodeSearchResults"
          :filter-submitting="filterSubmitting"
          :panel-disabled="trafficPanelDisabled"
          :filter-error="filterError"
          :filter-status-text="filterStatusText"
          :recording-enabled="recordingEnabled"
          :playback-enabled="playbackEnabled"
          :playback-paused="playbackPaused"
          :seek-position="seekPosition"
          :seek-max="seekMax"
          :range-label="rangeLabel"
          :format-seek-tooltip="formatSeekTooltip"
          @update:filter-input="$emit('update:filterInput', $event)"
          @update:node-search-input="$emit('update:nodeSearchInput', $event)"
          @update:playback-interval-ms="$emit('update:playbackIntervalMs', $event)"
          @submit-filter="trafficActions.submitFilter"
          @select-node-search-result="trafficActions.selectNodeSearchResult"
          @toggle-recording="trafficActions.toggleRecording"
          @toggle-playback="trafficActions.togglePlayback"
          @stop-playback="trafficActions.stopPlayback"
          @jump-playback="trafficActions.jumpPlayback"
          @clear-recording="trafficActions.clearRecording"
          @update-seek-position="trafficActions.updateSeekPosition"
          @seek-position="trafficActions.seekPosition"
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
</template>

<script setup lang="ts">
import SatelliteList from '@/features/starlink/components/SatelliteList.vue';
import StarlinkShellLegend, {
  type StarlinkShellLegendItem,
} from '@/features/starlink/components/StarlinkShellLegend.vue';
import TrafficReplayPanel from '@/features/starlink/components/TrafficReplayPanel.vue';
import {
  useDockPages,
  type DockPage,
} from '@/features/starlink/composables/useDockPages';
import type {
  GroundStation,
  SatellitePoint,
  SimulationSettings,
  TrafficContainerNodeDetail,
} from '@/features/starlink/types';

export type StarlinkDockActions = {
  toggleShell: (shellId: string) => void;
  selectSatellite: (satellite: SatellitePoint) => void;
  focusSelectedSatellite: (satellite: SatellitePoint) => void;
  removeSatellite: (satellite: SatellitePoint) => void;
  removeAllSatellites: () => void;
  stationFocus: (station: GroundStation) => void;
  stationSelectionChange: (stationIds: string[]) => void;
  updateSettings: (settings: SimulationSettings) => void;
  setSystemTime: (timestampMs: number) => void;
  resetSystemTime: () => void;
};

export type TrafficReplayDockActions = {
  submitFilter: () => void;
  selectNodeSearchResult: (containerId: string) => void;
  toggleRecording: () => void;
  togglePlayback: () => void;
  stopPlayback: () => void;
  jumpPlayback: (direction: -1 | 1) => void;
  clearRecording: () => void;
  updateSeekPosition: (value: number | number[] | string) => void;
  seekPosition: (value: number | number[] | string) => void;
};

const props = defineProps<{
  shellLegendItems: StarlinkShellLegendItem[];
  totalSatelliteCount: number;
  hiddenShellIds: string[];
  satellites: SatellitePoint[];
  selectedSatellites: SatellitePoint[];
  orbitPlaneOptions: string[];
  groundStations: GroundStation[];
  selectedStationIds: string[];
  connectedStationIds: string[];
  settings: SimulationSettings;
  currentTime: Date;
  selectedId?: string;
  speedDisabled: boolean;
  filterInput: string;
  nodeSearchInput: string;
  playbackIntervalMs: number;
  packetCount: number;
  nodeSearchKeyword: string;
  nodeSearchResultsCount: number;
  visibleNodeSearchResults: TrafficContainerNodeDetail[];
  filterSubmitting: boolean;
  trafficPanelDisabled: boolean;
  filterError: string;
  filterStatusText: string;
  recordingEnabled: boolean;
  playbackEnabled: boolean;
  playbackPaused: boolean;
  seekPosition: number;
  seekMax: number;
  rangeLabel: string;
  formatSeekTooltip: (value: number | string) => string;
  starlinkActions: StarlinkDockActions;
  trafficActions: TrafficReplayDockActions;
}>();

defineEmits<{
  'update:filterInput': [value: string];
  'update:nodeSearchInput': [value: string];
  'update:playbackIntervalMs': [value: number];
}>();

const dockPageDefinitions: Array<{ id: DockPage; label: string }> = [
  { id: 'shells', label: 'Starlink Shells' },
  { id: 'all', label: 'Satellites' },
  { id: 'selected', label: 'Selected' },
  { id: 'stations', label: 'Stations' },
  { id: 'traffic', label: 'Traffic Replay' },
  { id: 'settings', label: 'Settings' },
];

const {
  activeDockPage,
  dockCollapsed,
  dockPageMenuVisible,
  dockPages,
  activeDockPageLabel,
  activeDockPageCount,
  activeDockListTab,
  toggleDockCollapsed,
  toggleDockPageMenu,
  selectDockPage,
  switchDockPage,
} = useDockPages(dockPageDefinitions, getDockPageCount);

function getDockPageCount(page: DockPage) {
  if (page === 'shells') {
    return props.totalSatelliteCount;
  }

  if (page === 'all') {
    return props.satellites.length;
  }

  if (page === 'selected') {
    return props.selectedSatellites.length;
  }

  if (page === 'stations') {
    return props.groundStations.length;
  }

  if (page === 'traffic') {
    return props.packetCount;
  }

  return undefined;
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-right-dock.scss"></style>
