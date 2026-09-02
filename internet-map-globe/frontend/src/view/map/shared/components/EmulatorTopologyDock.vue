<template>
  <aside
    class="emulator-topology-3d-dock"
    :class="{ 'is-collapsed': collapsed }"
    :style="{ '--emulator-topology-3d-dock-bottom': bottomOffset }"
    data-testid="emulator-topology-3d-dock"
  >
    <template v-if="collapsed">
      <button type="button" class="emulator-topology-3d-collapsed-card" @click="collapsed = false">
        <Grid />
        <span>{{ title }}</span>
      </button>
    </template>

    <template v-else>
      <header class="emulator-topology-3d-header">
        <div class="emulator-topology-3d-header-title">
          <strong>{{ title }}</strong>
          <span>{{ stats.renderedNodes }} nodes / {{ stats.renderedLinks }} links</span>
        </div>
        <div class="emulator-topology-3d-header-actions">
          <el-button class="emulator-topology-3d-icon-button" :icon="RefreshRight" circle size="small" @click="$emit('refresh')" />
          <button
            type="button"
            class="emulator-topology-3d-minimize-button"
            aria-label="Minimize topology panel"
            @click="collapsed = true"
          >
            <el-icon>
              <Minus />
            </el-icon>
          </button>
        </div>
      </header>

      <slot name="after-header" />

      <EmulatorTopologyOverviewDockPage
        v-if="activePage === 'overview'"
        v-model:selected-asn-values="selectedAsnValues"
        v-model:selected-ix-name-values="selectedIxNameValues"
        v-model:show-as-details="showAsDetails"
        :stats="stats"
        :as-summaries="asSummaries"
        :ix-summaries="ixSummaries"
        :as-details-by-asn="asDetailsByAsn"
        :selected-asns="selectedAsns"
        :selected-ix-names="selectedIxNames"
        :selected-node-summary="selectedNodeSummary"
        @clear-topology-filters="$emit('clearTopologyFilters')"
      />

      <EmulatorTopologySettingsDockPage
        v-else-if="activePage === 'settings'"
        v-model:keyword="keyword"
        v-model:visible-types="visibleTypes"
        v-model:node-scale="nodeScale"
        v-model:show-node-labels="showNodeLabels"
        v-model:show-hover-details="showHoverDetails"
        :query-search-suggestions="querySearchSuggestions"
        @apply-search="$emit('applySearch')"
        @clear-search="$emit('clearSearch')"
        @submit-search-from-keyboard="$emit('submitSearchFromKeyboard', $event)"
        @select-search-suggestion="$emit('selectSearchSuggestion', $event)"
      />

      <EmulatorTopologyTrafficDockPage
        v-else
        v-model:filter-input="trafficFilterInput"
        v-model:playback-timing-mode="trafficPlaybackTimingMode"
        v-model:playback-interval-ms="trafficPlaybackIntervalMs"
        v-model:timeline-window-ms="trafficTimelineWindowMs"
        v-model:timeline-speed="trafficTimelineSpeed"
        v-model:show-only-packet-links="trafficShowOnlyPacketLinks"
        :traffic-mode="trafficMode"
        :filter-submitting="trafficFilterSubmitting"
        :filter-error="trafficFilterError"
        :filter-status-text="trafficFilterStatusText"
        :capture-active="trafficCaptureActive"
        :capture-disabled="trafficCaptureDisabled"
        :capture-disabled-text="trafficCaptureDisabledText"
        :offline-filter-enabled="trafficOfflineFilterEnabled"
        :offline-filter-disabled-text="trafficOfflineFilterDisabledText"
        :import-busy="trafficImportBusy"
        :import-active="trafficImportActive"
        :recording-enabled="trafficRecordingEnabled"
        :packet-count="trafficPacketCount"
        :seek-position="trafficSeekPosition"
        :playback-enabled="trafficPlaybackEnabled"
        :playback-paused="trafficPlaybackPaused"
        :imported-file-name="trafficImportedFileName"
        :import-status-text="trafficImportStatusText"
        :import-error="trafficImportError"
        @packet-file-change="$emit('trafficPacketFileChange', $event)"
        @submit-filter="$emit('trafficSubmitFilter')"
        @toggle-recording="$emit('trafficToggleRecording')"
        @toggle-playback="$emit('trafficTogglePlayback')"
        @stop-playback="$emit('trafficStopPlayback')"
        @clear-playback="$emit('trafficClearPlayback')"
        @jump-playback="$emit('trafficJumpPlayback', $event)"
        @update-seek-position="$emit('trafficUpdateSeekPosition', $event)"
        @seek-position="$emit('trafficSeekPosition', $event)"
      />

      <nav class="emulator-topology-3d-tabs">
        <button type="button" :class="{ active: activePage === 'overview' }" @click="$emit('update:activePage', 'overview')">
          <Grid />
          <span>Overview</span>
        </button>
        <button type="button" :class="{ active: activePage === 'settings' }" @click="$emit('update:activePage', 'settings')">
          <Setting />
          <span>Settings</span>
        </button>
        <button type="button" :class="{ active: activePage === 'traffic' }" @click="$emit('update:activePage', 'traffic')">
          <VideoPlay />
          <span>Traffic Replay</span>
        </button>
      </nav>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Grid,
  Minus,
  RefreshRight,
  Setting,
  VideoPlay,
} from '@element-plus/icons-vue'
import EmulatorTopologyOverviewDockPage from './EmulatorTopologyOverviewDockPage.vue'
import EmulatorTopologySettingsDockPage from './EmulatorTopologySettingsDockPage.vue'
import EmulatorTopologyTrafficDockPage from './EmulatorTopologyTrafficDockPage.vue'
import type { TopologySearchSuggestion } from '@/view/map/shared/services/topologySearch'
import type {
  EmulatorTopologyAsDetail,
  EmulatorTopologyAsSummary,
  EmulatorTopologyCommonStats,
  EmulatorTopologyDockPage,
  EmulatorTopologyIxSummary,
  EmulatorTopologySelectedNodeSummary,
  EmulatorTopologyVisibleTypesModel,
  TopologySearchSuggestionProvider,
} from '@/view/map/shared/types/emulatorTopologyDockTypes'

defineProps<{
  title: string
  bottomOffset?: string
  activePage: EmulatorTopologyDockPage
  stats: EmulatorTopologyCommonStats
  asSummaries: EmulatorTopologyAsSummary[]
  ixSummaries: EmulatorTopologyIxSummary[]
  asDetailsByAsn: Map<string, EmulatorTopologyAsDetail[]>
  selectedAsns: Set<string>
  selectedIxNames: Set<string>
  selectedNodeSummary?: EmulatorTopologySelectedNodeSummary
  querySearchSuggestions: TopologySearchSuggestionProvider
  trafficMode: 'offline' | 'live'
  trafficFilterSubmitting: boolean
  trafficFilterError: string
  trafficFilterStatusText: string
  trafficCaptureActive: boolean
  trafficCaptureDisabled?: boolean
  trafficCaptureDisabledText?: string
  trafficOfflineFilterEnabled?: boolean
  trafficOfflineFilterDisabledText?: string
  trafficImportBusy?: boolean
  trafficImportActive?: boolean
  trafficRecordingEnabled: boolean
  trafficPacketCount: number
  trafficPlaybackEnabled: boolean
  trafficPlaybackPaused: boolean
  trafficImportedFileName?: string
  trafficImportStatusText?: string
  trafficImportError?: string
}>()

const selectedAsnValues = defineModel<string[]>('selectedAsnValues', { required: true })
const selectedIxNameValues = defineModel<string[]>('selectedIxNameValues', { required: true })
const keyword = defineModel<string>('keyword', { required: true })
const visibleTypes = defineModel<EmulatorTopologyVisibleTypesModel>('visibleTypes', { required: true })
const nodeScale = defineModel<number>('nodeScale', { required: true })
const showNodeLabels = defineModel<boolean>('showNodeLabels', { required: true })
const showHoverDetails = defineModel<boolean>('showHoverDetails', { required: true })
const showAsDetails = defineModel<boolean>('showAsDetails', { required: true })
const trafficFilterInput = defineModel<string>('trafficFilterInput', { required: true })
const trafficPlaybackTimingMode = defineModel<'interval' | 'timeline'>('trafficPlaybackTimingMode', { required: true })
const trafficPlaybackIntervalMs = defineModel<number>('trafficPlaybackIntervalMs', { required: true })
const trafficTimelineWindowMs = defineModel<number>('trafficTimelineWindowMs', { required: true })
const trafficTimelineSpeed = defineModel<number>('trafficTimelineSpeed', { required: true })
const trafficShowOnlyPacketLinks = defineModel<boolean>('trafficShowOnlyPacketLinks', { required: true })
const trafficSeekPosition = defineModel<number>('trafficSeekPosition', { required: true })
const collapsed = ref(false)

defineEmits<{
  'update:activePage': [page: EmulatorTopologyDockPage]
  refresh: []
  clearTopologyFilters: []
  applySearch: []
  clearSearch: []
  submitSearchFromKeyboard: [event: KeyboardEvent]
  selectSearchSuggestion: [suggestion: TopologySearchSuggestion]
  trafficPacketFileChange: [event: Event]
  trafficSubmitFilter: []
  trafficToggleRecording: []
  trafficTogglePlayback: []
  trafficStopPlayback: []
  trafficClearPlayback: []
  trafficJumpPlayback: [direction: number]
  trafficUpdateSeekPosition: [position: number]
  trafficSeekPosition: [position: number]
}>()
</script>

<style scoped lang="scss">
.emulator-topology-3d-dock {
  position: absolute;
  right: 22px;
  bottom: var(--emulator-topology-3d-dock-bottom, 22px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(420px, calc(100vw - 44px));
  max-height: calc(100vh - var(--emulator-topology-3d-dock-bottom, 22px) - 22px);
  min-height: 0;
  padding: 14px;
  overflow: hidden;
  color: #edf7ff;
  border: 1px solid rgba(126, 213, 255, 0.22);
  border-radius: 12px;
  background: rgba(4, 13, 23, 0.84);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(18px);

  &.is-collapsed {
    width: 58px;
    min-height: 58px;
    padding: 8px;
    overflow: visible;
  }
}

.emulator-topology-3d-collapsed-card {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  color: #edf7ff;
  border: 1px solid rgba(126, 213, 255, 0.18);
  border-radius: 10px;
  background: rgba(17, 41, 63, 0.5);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;

  &:hover {
    border-color: rgba(125, 232, 255, 0.6);
    background: rgba(30, 90, 126, 0.64);
    box-shadow: 0 0 22px rgba(76, 201, 240, 0.24);
  }

  svg {
    width: 18px;
    height: 18px;
  }

  span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    white-space: nowrap;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
  }
}

.emulator-topology-3d-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.emulator-topology-3d-header-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 16px;
    line-height: 1.2;
  }

  span {
    color: rgba(196, 225, 255, 0.72);
    font-size: 12px;
  }
}

.emulator-topology-3d-header-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  flex-direction: row;
  gap: 8px;
  white-space: nowrap;

  :deep(.el-button) {
    margin-left: 0;
  }
}

.emulator-topology-3d-icon-button {
  flex: 0 0 auto;
}

.emulator-topology-3d-minimize-button {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: rgba(223, 247, 255, 0.88);
  border: 1px solid rgba(126, 213, 255, 0.28);
  border-radius: 999px;
  background: rgba(17, 41, 63, 0.46);
  cursor: pointer;

  .el-icon,
  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    color: #ffffff;
    border-color: rgba(125, 232, 255, 0.62);
    background: rgba(30, 90, 126, 0.6);
  }
}

.emulator-topology-3d-dock-page {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: auto;
}

.emulator-topology-3d-tabs {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(126, 213, 255, 0.14);

  button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 50px;
    color: rgba(211, 230, 244, 0.68);
    border: 1px solid rgba(126, 213, 255, 0.14);
    border-radius: 10px;
    background: rgba(17, 41, 63, 0.38);
    cursor: pointer;
    transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;

    &:hover,
    &.active {
      color: #edf7ff;
      border-color: rgba(125, 232, 255, 0.54);
      background: rgba(30, 90, 126, 0.58);
    }

    svg {
      width: 16px;
      height: 16px;
    }

    span {
      overflow: hidden;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
</style>
