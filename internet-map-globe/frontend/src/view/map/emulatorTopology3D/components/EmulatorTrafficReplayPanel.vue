<template>
  <div class="emulator-traffic-replay-panel">
    <header>
      <span>Packet Playback</span>
      <el-tooltip
        content="Import saved collector JSON or pcap files<br/>for offline packet playback."
        placement="top"
        :show-after="200"
        raw-content
      >
        <button type="button" class="emulator-traffic-help-button">?</button>
      </el-tooltip>
    </header>

    <div class="emulator-traffic-filter-row">
      <el-input
        v-model="filterInput"
        size="small"
        placeholder="tcpdump-like filter, e.g. icmp"
        :disabled="filterControlsDisabled"
        clearable
        @keyup.enter="$emit('submitFilter')"
      />
      <el-tooltip
        :disabled="!filterControlsDisabledReason"
        :content="filterControlsDisabledReason"
        placement="top"
        raw-content
      >
        <span class="emulator-traffic-filter-action-wrap">
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
    <small class="emulator-traffic-filter-status" :class="{ error: Boolean(filterError) }">
      {{ filterError || filterStatusText }}
    </small>

    <div
      class="emulator-traffic-import-card"
      :class="{ error: Boolean(importError), disabled: importCardDisabled }"
      role="button"
      :aria-disabled="importCardDisabled"
      :tabindex="importCardDisabled ? -1 : 0"
      @click="openImport"
      @keydown.enter.prevent="openImport"
      @keydown.space.prevent="openImport"
    >
      <span class="emulator-traffic-import-icon">
        <el-icon :class="{ 'is-loading': importBusy }">
          <WarningFilled v-if="importError" />
          <Loading v-else-if="importBusy" />
          <Document v-else-if="importedFileName" />
          <UploadFilled v-else />
        </el-icon>
      </span>
      <span class="emulator-traffic-import-copy">
        <span class="emulator-traffic-import-title">
          <strong>{{ importedFileName || 'Import capture file' }}</strong>
          <el-tooltip
            content="Import collector JSON or pcap files<br/>and map packets to current emulator nodes."
            placement="top"
            :show-after="200"
            raw-content
          >
            <el-icon class="emulator-traffic-import-help">
              <InfoFilled />
            </el-icon>
          </el-tooltip>
        </span>
        <small>{{ compactImportStatusText }}</small>
      </span>
    </div>

    <small class="emulator-traffic-import-status" :class="{ error: Boolean(importError) }">
      {{ importError || compactImportStatusText }}
    </small>

    <el-tooltip
      content="Only render links that belong to the current packet path.<br/>This is useful for large topologies."
      placement="top"
      :show-after="200"
      raw-content
    >
      <el-checkbox
        class="emulator-traffic-path-link-toggle"
        v-model="showOnlyPacketLinks"
      >
        Packet path links only
      </el-checkbox>
    </el-tooltip>

    <label class="emulator-traffic-replay-number">
      <span class="emulator-traffic-field-title">
        <span>Playback timing</span>
        <el-tooltip
          :content="playbackTimingHelp"
          placement="top"
          :show-after="180"
          raw-content
          popper-class="emulator-traffic-control-tooltip"
        >
          <button type="button" class="emulator-traffic-inline-help">?</button>
        </el-tooltip>
      </span>
      <span class="emulator-traffic-timing-toggle" role="group" aria-label="Playback timing">
        <button
          type="button"
          :class="{ active: playbackTimingMode === 'interval' }"
          @click="playbackTimingMode = 'interval'"
        >
          Interval
        </button>
        <button
          type="button"
          :class="{ active: playbackTimingMode === 'timeline' }"
          @click="playbackTimingMode = 'timeline'"
        >
          Timeline
        </button>
      </span>
    </label>

    <label v-if="playbackTimingMode === 'interval'" class="emulator-traffic-replay-number">
      <span>Event interval (ms)</span>
      <el-input-number
        v-model="playbackIntervalMs"
        size="small"
        :min="100"
        :max="60000"
        :step="1"
        controls-position="right"
      />
    </label>

    <template v-else>
      <label class="emulator-traffic-replay-number">
        <span>Time window (ms)</span>
        <el-input-number
          v-model="timelineWindowMs"
          size="small"
          :min="0"
          :max="60000"
          :step="1"
          controls-position="right"
        />
      </label>

      <label class="emulator-traffic-replay-number">
        <span>Timeline speed</span>
        <el-input-number
          v-model="timelineSpeed"
          size="small"
          :min="0.0001"
          :max="10000"
          :step="0.0001"
          :precision="4"
          controls-position="right"
        />
      </label>
    </template>

    <div class="emulator-traffic-replay-controls">
      <button
        type="button"
        class="emulator-traffic-icon-button record"
        :class="{ active: recordingEnabled }"
        :disabled="recordButtonDisabled"
        :data-tooltip="recordButtonTooltip"
        @click="$emit('toggleRecording')"
      >
        <el-icon>
          <component :is="recordingEnabled ? CircleCloseFilled : VideoCameraFilled" />
        </el-icon>
      </button>
      <button
        type="button"
        class="emulator-traffic-icon-button"
        :class="{ active: playbackEnabled && !playbackPaused }"
        :disabled="recordingEnabled || !packetCount"
        :data-tooltip="playbackEnabled && !playbackPaused ? 'Pause replay' : 'Play replay'"
        @click="$emit('togglePlayback')"
      >
        <el-icon>
          <component :is="playbackEnabled && !playbackPaused ? VideoPause : VideoPlay" />
        </el-icon>
      </button>
      <button
        type="button"
        class="emulator-traffic-icon-button"
        :disabled="recordingEnabled || !packetCount"
        data-tooltip="Stop replay"
        @click="$emit('stopPlayback')"
      >
        <el-icon>
          <SwitchButton />
        </el-icon>
      </button>
      <button
        type="button"
        class="emulator-traffic-icon-button"
        :disabled="recordingEnabled || !packetCount"
        data-tooltip="Previous packet"
        @click="$emit('jumpPlayback', -1)"
      >
        <el-icon>
          <Back />
        </el-icon>
      </button>
      <button
        type="button"
        class="emulator-traffic-icon-button"
        :disabled="recordingEnabled || !packetCount"
        data-tooltip="Next packet"
        @click="$emit('jumpPlayback', 1)"
      >
        <el-icon>
          <Right />
        </el-icon>
      </button>
      <button
        type="button"
        class="emulator-traffic-clear-button"
        :disabled="recordingEnabled || playbackEnabled || !packetCount"
        data-tooltip="Clear packets"
        @click="$emit('clearPlayback')"
      >
        <el-icon>
          <Delete />
        </el-icon>
      </button>
    </div>

    <label class="emulator-traffic-replay-seek">
      <span>Packet</span>
      <el-slider
        class="emulator-traffic-replay-slider"
        :min="0"
        :max="packetCount"
        :step="1"
        :model-value="seekPosition"
        :disabled="!packetCount"
        :show-tooltip="true"
        :format-tooltip="formatSeekTooltip"
        @input="$emit('updateSeekPosition', Number($event))"
        @change="$emit('seekPosition', Number($event))"
      />
      <em>{{ seekPosition }} / {{ packetCount.toLocaleString() }}</em>
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
  SwitchButton,
  UploadFilled,
  VideoCameraFilled,
  VideoPause,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue'
import { computed } from 'vue'

const props = defineProps<{
  filterSubmitting: boolean
  filterError: string
  filterStatusText: string
  captureActive: boolean
  captureDisabled?: boolean
  captureDisabledText?: string
  offlineFilterEnabled?: boolean
  offlineFilterDisabledText?: string
  importBusy?: boolean
  importActive: boolean
  recordingEnabled: boolean
  packetCount: number
  seekPosition: number
  playbackEnabled: boolean
  playbackPaused: boolean
  importedFileName: string
  importStatusText: string
  importError: string
}>()

const filterInput = defineModel<string>('filterInput', { required: true })
const playbackTimingMode = defineModel<'interval' | 'timeline'>('playbackTimingMode', { required: true })
const playbackIntervalMs = defineModel<number>('playbackIntervalMs', { required: true })
const timelineWindowMs = defineModel<number>('timelineWindowMs', { required: true })
const timelineSpeed = defineModel<number>('timelineSpeed', { required: true })
const showOnlyPacketLinks = defineModel<boolean>('showOnlyPacketLinks', { required: true })

const emit = defineEmits<{
  openImport: []
  submitFilter: []
  toggleRecording: []
  togglePlayback: []
  stopPlayback: []
  clearPlayback: []
  jumpPlayback: [direction: number]
  seekPosition: [position: number]
  updateSeekPosition: [position: number]
}>()

const compactImportStatusText = computed(() => props.importStatusText || 'Click to select .json or .pcap')
const playbackTimingHelp = [
  '<strong>Interval</strong>: plays packets one by one in timestamp order, using a fixed event interval.',
  '<strong>Timeline, window &gt; 0</strong>: groups packets by time windows and plays packets inside each window in parallel.',
  '<strong>Timeline, window = 0</strong>: disables grouping and plays packets one by one using real packet time gaps divided by Timeline speed.',
].join('<br/>')
const importCardDisabled = computed(() => props.captureActive || Boolean(props.importBusy))
const captureUnavailableText = computed(
  () => props.captureDisabledText || 'Live capture is unavailable<br/>when topology data comes from an uploaded docker-compose file.',
)
const filterControlsDisabledReason = computed(() => {
  if (props.offlineFilterEnabled) return ''
  if (props.offlineFilterDisabledText) return props.offlineFilterDisabledText
  if (props.captureDisabled) return captureUnavailableText.value
  if (props.importActive) return 'Clear the imported replay file<br/>before applying a capture filter.'
  return ''
})
const filterControlsDisabled = computed(
  () => props.filterSubmitting || (!props.offlineFilterEnabled && (props.captureDisabled || props.importActive)),
)
const recordButtonDisabled = computed(
  () => props.captureDisabled || !props.captureActive || props.importActive || props.playbackEnabled,
)
const recordButtonTooltip = computed(() => {
  if (props.captureDisabled) return 'Live capture is unavailable for uploaded topology data'
  if (props.importActive) return 'Clear imported packets before recording live packets'
  if (!props.captureActive) return 'Apply a live capture filter before recording packets'
  return props.recordingEnabled ? 'Stop recording packets' : 'Record packets'
})
const rangeLabel = computed(() => {
  if (props.recordingEnabled) {
    return `Recording live packets: ${props.packetCount.toLocaleString()} captured.`
  }
  if (!props.packetCount) return 'No replay packets.'
  return `Ready to replay ${props.packetCount.toLocaleString()} packets.`
})

function formatSeekTooltip(value: number) {
  return `${value}/${props.packetCount}`
}

function openImport() {
  if (importCardDisabled.value) return
  emit('openImport')
}
</script>

<style scoped lang="scss" src="../styles/emulator-traffic-replay-panel.scss"></style>
