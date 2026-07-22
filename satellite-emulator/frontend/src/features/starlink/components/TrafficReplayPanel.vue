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
        :disabled="panelDisabled || filterSubmitting"
        clearable
        @update:model-value="$emit('update:filterInput', String($event))"
        @keyup.enter="$emit('submitFilter')"
      />
      <el-button
        size="small"
        type="primary"
        :loading="filterSubmitting"
        :disabled="panelDisabled"
        @click="$emit('submitFilter')"
      >
        Apply
      </el-button>
    </div>
    <small class="traffic-filter-status" :class="{ error: Boolean(filterError) }">
      {{ filterStatusText }}
    </small>

    <div class="traffic-node-search">
      <el-input
        :model-value="nodeSearchInput"
        size="small"
        placeholder="Search nodes by name, IP, container, or id"
        clearable
        @update:model-value="$emit('update:nodeSearchInput', String($event))"
      />
      <small v-if="nodeSearchKeyword">
        {{ nodeSearchResultsCount.toLocaleString() }} matched container nodes
      </small>
      <div v-if="nodeSearchKeyword" class="traffic-node-search-results">
        <button
          v-for="node in visibleNodeSearchResults"
          :key="node.containerId"
          type="button"
          @click="$emit('selectNodeSearchResult', node.containerId)"
        >
          <strong>{{ node.nodeName }}</strong>
          <span>{{ node.nodeIp || 'No IP' }}</span>
          <em>{{ node.containerName || node.shortContainerId }}</em>
        </button>
        <p v-if="!nodeSearchResultsCount">No matched container nodes.</p>
        <p v-else-if="nodeSearchResultsCount > visibleNodeSearchResults.length">
          Showing {{ visibleNodeSearchResults.length }} of {{ nodeSearchResultsCount }}.
        </p>
      </div>
    </div>

    <label class="traffic-replay-number">
      <span>Event interval (ms)</span>
      <el-input-number
        :model-value="playbackIntervalMs"
        size="small"
        :min="1"
        :max="60000"
        :step="100"
        :disabled="panelDisabled"
        controls-position="right"
        @update:model-value="$emit('update:playbackIntervalMs', Number($event))"
      />
    </label>

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
  Right,
  SwitchButton,
  VideoCameraFilled,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue';

type TrafficNodeSearchResult = {
  containerId: string;
  nodeName: string;
  nodeIp?: string;
  containerName?: string;
  shortContainerId: string;
};

defineProps<{
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
  recordingEnabled: boolean;
  playbackEnabled: boolean;
  playbackPaused: boolean;
  playbackIntervalMs: number;
  seekPosition: number;
  seekMax: number;
  rangeLabel: string;
  formatSeekTooltip: (value: number | string) => string;
}>();

defineEmits<{
  'update:filterInput': [value: string];
  submitFilter: [];
  'update:nodeSearchInput': [value: string];
  selectNodeSearchResult: [containerId: string];
  'update:playbackIntervalMs': [value: number];
  toggleRecording: [];
  togglePlayback: [];
  stopPlayback: [];
  jumpPlayback: [direction: 1 | -1];
  clearRecording: [];
  updateSeekPosition: [value: number | string];
  seekPosition: [value: number | string];
}>();
</script>

<style scoped lang="scss" src="@/features/starlink/styles/traffic-replay-panel.scss"></style>
