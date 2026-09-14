<template>
  <div class="traffic-replay-panel">
    <header>
      <span>Packet Playback</span>
      <el-tooltip
        content="Traffic Replay capture/playback and Settings speed<br/>cannot be enabled at the same time.<br/>Set simulation speed to 1x before using this panel."
        placement="top"
        :show-after="200"
        raw-content
        popper-class="starlink-multiline-tooltip"
      >
        <button type="button" class="traffic-help-button">?</button>
      </el-tooltip>
    </header>

    <div class="traffic-filter-row">
      <el-input
        :model-value="filterInput"
        size="small"
        placeholder="tcpdump-like filter, e.g. icmp"
        :disabled="filterControlsDisabled"
        clearable
        @update:model-value="$emit('update:filterInput', String($event))"
        @keyup.enter="$emit('submitFilter')"
      />
      <el-tooltip
        :disabled="!filterControlsDisabledReason"
        :content="filterControlsDisabledReason"
        placement="top"
        raw-content
        popper-class="starlink-multiline-tooltip"
      >
        <span class="traffic-filter-action-wrap">
          <el-button
            size="small"
            type="primary"
            :loading="filterSubmitting"
            :disabled="filterControlsDisabled"
            @click="$emit('submitFilter')"
          >
            Apply
          </el-button>
        </span>
      </el-tooltip>
    </div>
    <small class="traffic-filter-status" :class="{ error: Boolean(filterError) }">
      {{ compactFilterStatusText }}
    </small>

    <el-tooltip
      :disabled="!importDisabledByFilter"
      content="Stop packet capture by submitting an empty filter<br/>before importing an offline replay file."
      placement="top"
      raw-content
      popper-class="starlink-multiline-tooltip"
    >
      <div
        class="traffic-import-card"
        :class="{
          disabled: importControlsDisabled,
          error: Boolean(importError),
          loading: importSubmitting,
        }"
        role="button"
        tabindex="0"
        @click="openImportFilePicker"
        @keydown.enter.prevent="openImportFilePicker"
        @keydown.space.prevent="openImportFilePicker"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,.pcap,application/json"
          multiple
          @change="handleImportFileChange"
        />
        <span class="traffic-import-icon">
          <el-icon>
            <WarningFilled v-if="importError" />
            <Loading v-else-if="importSubmitting" />
            <Document v-else-if="importedFileName" />
            <UploadFilled v-else />
          </el-icon>
        </span>
        <span class="traffic-import-copy">
          <span class="traffic-import-title">
            <strong>{{ importedFileName || 'Import capture file' }}</strong>
            <el-tooltip
              content="Import saved collector JSON or pcap files<br/>for offline packet playback."
              placement="top"
              :show-after="200"
              raw-content
              popper-class="starlink-multiline-tooltip"
            >
              <el-icon class="traffic-import-help">
                <InfoFilled />
              </el-icon>
            </el-tooltip>
          </span>
          <small>{{ compactImportStatusText }}</small>
        </span>
      </div>
    </el-tooltip>

    <div class="traffic-node-search">
      <div class="traffic-node-search-control">
        <el-autocomplete
          :model-value="nodeSearchInput"
          :fetch-suggestions="queryNodeSearchSuggestions"
          :trigger-on-focus="false"
          :teleported="false"
          popper-class="traffic-node-search-popper"
          fit-input-width
          size="small"
          clearable
          placeholder="Search nodes by name, IP, container, or id"
          @update:model-value="$emit('update:nodeSearchInput', String($event))"
          @keyup.enter="submitNodeSearch"
          @clear="$emit('update:nodeSearchInput', '')"
          @select="selectNodeSearchSuggestion"
        >
          <template #default="{ item }">
            <div class="traffic-node-search-suggestion">
              <strong>{{ item.label }}</strong>
              <small>{{ item.detail }}</small>
            </div>
          </template>
        </el-autocomplete>
        <el-button type="primary" size="small" :icon="Search" @click="submitNodeSearch">
          Search
        </el-button>
      </div>
      <p v-if="nodeSearchKeyword && !nodeSearchResultsCount">No matched container nodes.</p>
    </div>

    <label class="traffic-replay-number">
      <span class="traffic-field-title">
        <span>Playback timing</span>
        <el-tooltip
          :content="playbackTimingHelp"
          placement="top"
          :show-after="180"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <button type="button" class="traffic-inline-help">?</button>
        </el-tooltip>
      </span>
      <span class="traffic-timing-toggle" role="group" aria-label="Playback timing">
        <button
          type="button"
          :class="{ active: playbackTimingMode === 'interval' }"
          @click="$emit('update:playbackTimingMode', 'interval')"
        >
          Interval
        </button>
        <button
          type="button"
          :class="{ active: playbackTimingMode === 'timeline' }"
          @click="$emit('update:playbackTimingMode', 'timeline')"
        >
          Timeline
        </button>
      </span>
    </label>

    <label v-if="playbackTimingMode === 'interval'" class="traffic-replay-number">
      <span>Event interval (ms)</span>
      <el-input-number
        :model-value="playbackIntervalMs"
        size="small"
        :min="100"
        :max="60000"
        :step="1"
        :disabled="panelDisabled"
        controls-position="right"
        @update:model-value="emitNumberUpdate('update:playbackIntervalMs', $event)"
      />
    </label>

    <template v-else>
      <label class="traffic-replay-number">
        <span>Time window (ms)</span>
        <el-input-number
          :model-value="timelineWindowMs"
          size="small"
          :min="0"
          :max="60000"
          :step="1"
          :disabled="panelDisabled"
          controls-position="right"
          @update:model-value="emitNumberUpdate('update:timelineWindowMs', $event)"
        />
      </label>

      <label class="traffic-replay-number">
        <span>Timeline speed</span>
        <el-input-number
          :model-value="timelineSpeed"
          size="small"
          :min="0.0001"
          :max="10000"
          :step="0.0001"
          :precision="4"
          :disabled="panelDisabled"
          controls-position="right"
          @update:model-value="emitNumberUpdate('update:timelineSpeed', $event)"
        />
      </label>
    </template>

    <div class="traffic-replay-controls">
      <button
        type="button"
        class="traffic-icon-button record"
        :class="{ active: recordingEnabled }"
        :disabled="panelDisabled || playbackEnabled"
        :data-tooltip="recordingEnabled ? 'Stop recording packets' : 'Record packets'"
        @click="$emit('toggleRecording')"
      >
        <el-icon>
          <component :is="recordingEnabled ? CircleCloseFilled : VideoCameraFilled" />
        </el-icon>
      </button>
      <button
        type="button"
        class="traffic-icon-button"
        :class="{ active: playbackEnabled && !playbackPaused }"
        :disabled="panelDisabled || recordingEnabled || !packetCount"
        :data-tooltip="playbackEnabled && !playbackPaused ? 'Pause replay' : 'Play replay'"
        @click="$emit('togglePlayback')"
      >
        <el-icon>
          <component :is="playbackEnabled && !playbackPaused ? VideoPause : VideoPlay" />
        </el-icon>
      </button>
      <button
        type="button"
        class="traffic-icon-button"
        :disabled="panelDisabled || recordingEnabled || (!playbackEnabled && !packetCount)"
        data-tooltip="Stop replay and return to real time"
        @click="$emit('stopPlayback')"
      >
        <el-icon>
          <SwitchButton />
        </el-icon>
      </button>
      <button
        type="button"
        class="traffic-icon-button"
        :disabled="panelDisabled || recordingEnabled || !packetCount"
        data-tooltip="Previous packet"
        @click="$emit('jumpPlayback', -1)"
      >
        <el-icon>
          <Back />
        </el-icon>
      </button>
      <button
        type="button"
        class="traffic-icon-button"
        :disabled="panelDisabled || recordingEnabled || !packetCount"
        data-tooltip="Next packet"
        @click="$emit('jumpPlayback', 1)"
      >
        <el-icon>
          <Right />
        </el-icon>
      </button>
      <button
        type="button"
        class="traffic-clear-button"
        :disabled="panelDisabled || recordingEnabled || playbackEnabled || !packetCount"
        data-tooltip="Clear recorded packets"
        @click="$emit('clearRecording')"
      >
        <el-icon>
          <Delete />
        </el-icon>
      </button>
    </div>

    <label class="traffic-replay-seek">
      <span>Packet</span>
      <el-slider
        class="traffic-replay-slider"
        :min="0"
        :max="seekMax"
        :step="1"
        :model-value="seekPosition"
        :disabled="panelDisabled || recordingEnabled || !packetCount"
        :show-tooltip="true"
        :format-tooltip="formatSeekTooltip"
        @input="$emit('updateSeekPosition', $event)"
        @change="$emit('seekPosition', $event)"
      />
      <em>{{ seekPosition }} / {{ seekMax.toLocaleString() }}</em>
    </label>

    <p>{{ rangeLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import {
  Back,
  CircleCloseFilled,
  Delete,
  Document,
  InfoFilled,
  Loading,
  Right,
  Search,
  SwitchButton,
  UploadFilled,
  VideoCameraFilled,
  VideoPause,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue';
import { computed, ref, watch } from 'vue';

type TrafficNodeSearchResult = {
  containerId: string;
  nodeName: string;
  nodeIp?: string;
  containerName?: string;
  shortContainerId: string;
};

type TrafficNodeSearchSuggestion = {
  value: string;
  label: string;
  detail: string;
  containerId: string;
};

type TrafficReplayPanelProps = {
  packetCount: number;
  filterInput: string;
  nodeSearchInput: string;
  nodeSearchKeyword: string;
  nodeSearchResultsCount: number;
  visibleNodeSearchResults: TrafficNodeSearchResult[];
  filterSubmitting: boolean;
  panelDisabled: boolean;
  filterError: string;
  filterStatusText: string;
  filterDisabledByImport: boolean;
  importSubmitting: boolean;
  importError: string;
  importStatusText: string;
  importDisabledByFilter: boolean;
  importFileActive: boolean;
  recordingEnabled: boolean;
  playbackEnabled: boolean;
  playbackPaused: boolean;
  playbackTimingMode: 'interval' | 'timeline';
  playbackIntervalMs: number;
  timelineWindowMs: number;
  timelineSpeed: number;
  seekPosition: number;
  seekMax: number;
  rangeLabel: string;
  formatSeekTooltip: (value: number | string) => string;
};

const fileInputRef = ref<HTMLInputElement>();
const importedFileName = ref('');
const props = defineProps<TrafficReplayPanelProps>();
const offlineFilterEnabled = computed(() => props.importFileActive && !props.filterDisabledByImport);
const filterControlsDisabledReason = computed(() => {
  if (offlineFilterEnabled.value) {
    return '';
  }
  if (props.filterDisabledByImport) {
    return 'Import both collector JSON and matching PCAP<br/>to filter offline packets, or clear imported packets.';
  }
  return '';
});
const filterControlsDisabled = computed(() =>
  props.panelDisabled || props.filterSubmitting || props.filterDisabledByImport,
);
const importControlsDisabled = computed(() =>
  props.panelDisabled ||
  props.recordingEnabled ||
  props.playbackEnabled ||
  props.importSubmitting ||
  props.importDisabledByFilter,
);
const compactFilterStatusText = computed(() => {
  if (props.filterDisabledByImport) {
    return 'Clear imported replay file before applying a capture filter.';
  }
  return props.filterStatusText;
});
const compactImportStatusText = computed(() => {
  if (props.importDisabledByFilter) {
    return 'Stop packet capture before importing a file.';
  }
  if (props.importError) {
    return props.importStatusText || 'Import failed.';
  }
  if (props.importSubmitting) {
    return 'Importing capture file...';
  }
  if (importedFileName.value) {
    return props.importStatusText || 'Ready for playback.';
  }
  return 'Import collector JSON, optionally with matching PCAP.';
});
const playbackTimingHelp = [
  '<strong>Interval</strong>: plays packets one by one in timestamp order, using a fixed event interval.',
  '<strong>Timeline, window &gt; 0</strong>: groups packets by time windows and replays packets inside each window together.',
  '<strong>Timeline, window = 0</strong>: plays packets one by one using real packet time gaps divided by Timeline speed.',
].join('<br/>');
const nodeSearchSuggestions = computed<TrafficNodeSearchSuggestion[]>(() =>
  props.visibleNodeSearchResults.map((node) => {
    const label = node.nodeName || node.containerName || node.shortContainerId;
    const detail = [node.nodeIp || 'No IP', node.containerName || node.shortContainerId]
      .filter(Boolean)
      .join(' · ');
    return {
      value: label,
      label,
      detail,
      containerId: node.containerId,
    };
  }),
);
const emit = defineEmits<{
  'update:filterInput': [value: string];
  submitFilter: [];
  importReplayFile: [files: File[]];
  'update:nodeSearchInput': [value: string];
  selectNodeSearchResult: [containerId: string];
  'update:playbackTimingMode': [value: 'interval' | 'timeline'];
  'update:playbackIntervalMs': [value: number];
  'update:timelineWindowMs': [value: number];
  'update:timelineSpeed': [value: number];
  toggleRecording: [];
  togglePlayback: [];
  stopPlayback: [];
  jumpPlayback: [direction: 1 | -1];
  clearRecording: [];
  updateSeekPosition: [value: number | string];
  seekPosition: [value: number | string];
}>();

watch(
  () => props.importFileActive,
  (active) => {
    if (!active) {
      importedFileName.value = '';
    }
  },
);

function openImportFilePicker() {
  if (importControlsDisabled.value) {
    return;
  }
  fileInputRef.value?.click();
}

function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) {
    importedFileName.value = files.map((file) => file.name).join(' + ');
    emit('importReplayFile', files);
  }
}

function emitNumberUpdate(
  eventName: 'update:playbackIntervalMs' | 'update:timelineWindowMs' | 'update:timelineSpeed',
  value: number | string | undefined,
) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return;
  if (eventName === 'update:timelineSpeed') {
    emit('update:timelineSpeed', nextValue);
  } else if (eventName === 'update:playbackIntervalMs') {
    emit('update:playbackIntervalMs', nextValue);
  } else {
    emit('update:timelineWindowMs', nextValue);
  }
}

function queryNodeSearchSuggestions(
  _query: string,
  callback: (suggestions: TrafficNodeSearchSuggestion[]) => void,
) {
  callback(nodeSearchSuggestions.value);
}

function selectNodeSearchSuggestion(suggestion: TrafficNodeSearchSuggestion) {
  emit('selectNodeSearchResult', suggestion.containerId);
}

function submitNodeSearch() {
  const first = nodeSearchSuggestions.value[0];
  if (first) {
    emit('selectNodeSearchResult', first.containerId);
  }
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/traffic-replay-panel.scss"></style>
