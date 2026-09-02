<template>
  <div class="emulator-traffic-replay-panel">
    <header>
      <span>Packet Playback</span>
      <el-tooltip
        content="Live capture uses the traffic observer filter.<br/>Captured packets can be recorded and replayed in this page."
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
        :disabled="filterSubmitting"
        clearable
        @keyup.enter="$emit('submitFilter')"
      />
      <el-button
        size="small"
        type="primary"
        :loading="filterSubmitting"
        :disabled="filterSubmitting"
        @click="$emit('submitFilter')"
      >
        Apply
      </el-button>
    </div>
    <small class="emulator-traffic-filter-status" :class="{ error: Boolean(filterError) }">
      {{ filterError || filterStatusText }}
    </small>

    <el-tooltip
      content="Only render links that belong to the current live or replayed packet path.<br/>This keeps large topologies readable while capturing."
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
      <el-tooltip
        :content="recordingEnabled ? 'Stop recording packets' : 'Record packets'"
        placement="top"
        :show-after="160"
        popper-class="emulator-traffic-control-tooltip"
      >
        <button
          type="button"
          class="emulator-traffic-icon-button record"
          :class="{ active: recordingEnabled }"
          :disabled="!captureActive || playbackEnabled"
          @click="$emit('toggleRecording')"
        >
          <el-icon>
            <component :is="recordingEnabled ? CircleCloseFilled : VideoCameraFilled" />
          </el-icon>
        </button>
      </el-tooltip>
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
  Right,
  SwitchButton,
  VideoCameraFilled,
  VideoPause,
  VideoPlay,
} from '@element-plus/icons-vue'
import { computed } from 'vue'

const props = defineProps<{
  filterSubmitting: boolean
  filterError: string
  filterStatusText: string
  captureActive: boolean
  recordingEnabled: boolean
  packetCount: number
  seekPosition: number
  playbackEnabled: boolean
  playbackPaused: boolean
}>()

const filterInput = defineModel<string>('filterInput', { required: true })
const playbackTimingMode = defineModel<'interval' | 'timeline'>('playbackTimingMode', { required: true })
const playbackIntervalMs = defineModel<number>('playbackIntervalMs', { required: true })
const timelineWindowMs = defineModel<number>('timelineWindowMs', { required: true })
const timelineSpeed = defineModel<number>('timelineSpeed', { required: true })
const showOnlyPacketLinks = defineModel<boolean>('showOnlyPacketLinks', { required: true })

const emit = defineEmits<{
  submitFilter: []
  toggleRecording: []
  togglePlayback: []
  stopPlayback: []
  clearPlayback: []
  jumpPlayback: [direction: number]
  seekPosition: [position: number]
  updateSeekPosition: [position: number]
}>()

const rangeLabel = computed(() => {
  if (props.recordingEnabled) {
    return `Recording live packets: ${props.packetCount.toLocaleString()} captured.`
  }
  if (!props.packetCount) return 'No replay packets.'
  return `Ready to replay ${props.packetCount.toLocaleString()} flow steps.`
})
const playbackTimingHelp = [
  '<strong>Interval</strong>: plays packets one by one in timestamp order, using a fixed event interval.',
  '<strong>Timeline, window &gt; 0</strong>: groups packets by time windows and plays packets inside each window in parallel.',
  '<strong>Timeline, window = 0</strong>: disables grouping and plays packets one by one using real packet time gaps divided by Timeline speed.',
].join('<br/>')

function formatSeekTooltip(value: number) {
  return `${value}/${props.packetCount}`
}

</script>

<style scoped lang="scss" src="../styles/emulator-traffic-replay-panel.scss"></style>
