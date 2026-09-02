<template>
  <section class="emulator-topology-3d-dock-page">
    <input
      v-if="trafficMode === 'offline'"
      ref="packetFileInputRef"
      class="emulator-topology-3d-hidden-input"
      type="file"
      multiple
      accept=".json,.pcap,application/json"
      @change="$emit('packetFileChange', $event)"
    >
    <EmulatorTrafficReplayPanel
      v-if="trafficMode === 'offline'"
      v-model:filter-input="filterInput"
      v-model:playback-timing-mode="playbackTimingMode"
      v-model:playback-interval-ms="playbackIntervalMs"
      v-model:timeline-window-ms="timelineWindowMs"
      v-model:timeline-speed="timelineSpeed"
      v-model:show-only-packet-links="showOnlyPacketLinks"
      :filter-submitting="filterSubmitting"
      :filter-error="filterError"
      :filter-status-text="filterStatusText"
      :capture-active="captureActive"
      :capture-disabled="captureDisabled"
      :capture-disabled-text="captureDisabledText"
      :offline-filter-enabled="offlineFilterEnabled"
      :offline-filter-disabled-text="offlineFilterDisabledText"
      :import-busy="importBusy"
      :import-active="importActive"
      :recording-enabled="recordingEnabled"
      :packet-count="packetCount"
      :seek-position="seekPosition"
      :playback-enabled="playbackEnabled"
      :playback-paused="playbackPaused"
      :imported-file-name="importedFileName"
      :import-status-text="importStatusText"
      :import-error="importError"
      @submit-filter="$emit('submitFilter')"
      @open-import="openPacketFilePicker"
      @toggle-recording="$emit('toggleRecording')"
      @toggle-playback="$emit('togglePlayback')"
      @stop-playback="$emit('stopPlayback')"
      @clear-playback="$emit('clearPlayback')"
      @jump-playback="$emit('jumpPlayback', $event)"
      @update-seek-position="$emit('updateSeekPosition', $event)"
      @seek-position="$emit('seekPosition', $event)"
    />
    <LiveTrafficReplayPanel
      v-else
      v-model:filter-input="filterInput"
      v-model:playback-timing-mode="playbackTimingMode"
      v-model:playback-interval-ms="playbackIntervalMs"
      v-model:timeline-window-ms="timelineWindowMs"
      v-model:timeline-speed="timelineSpeed"
      v-model:show-only-packet-links="showOnlyPacketLinks"
      :filter-submitting="filterSubmitting"
      :filter-error="filterError"
      :filter-status-text="filterStatusText"
      :capture-active="captureActive"
      :recording-enabled="recordingEnabled"
      :packet-count="packetCount"
      :seek-position="seekPosition"
      :playback-enabled="playbackEnabled"
      :playback-paused="playbackPaused"
      @submit-filter="$emit('submitFilter')"
      @toggle-recording="$emit('toggleRecording')"
      @toggle-playback="$emit('togglePlayback')"
      @stop-playback="$emit('stopPlayback')"
      @clear-playback="$emit('clearPlayback')"
      @jump-playback="$emit('jumpPlayback', $event)"
      @update-seek-position="$emit('updateSeekPosition', $event)"
      @seek-position="$emit('seekPosition', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import EmulatorTrafficReplayPanel from '../../emulatorTopology3D/components/EmulatorTrafficReplayPanel.vue'
import LiveTrafficReplayPanel from '../../liveEmulatorTopology3D/components/LiveTrafficReplayPanel.vue'

withDefaults(defineProps<{
  trafficMode: 'offline' | 'live'
  filterSubmitting: boolean
  filterError: string
  filterStatusText: string
  captureActive: boolean
  captureDisabled?: boolean
  captureDisabledText?: string
  offlineFilterEnabled?: boolean
  offlineFilterDisabledText?: string
  importBusy?: boolean
  importActive?: boolean
  recordingEnabled: boolean
  packetCount: number
  seekPosition: number
  playbackEnabled: boolean
  playbackPaused: boolean
  importedFileName?: string
  importStatusText?: string
  importError?: string
}>(), {
  captureDisabled: false,
  captureDisabledText: '',
  offlineFilterEnabled: false,
  offlineFilterDisabledText: '',
  importBusy: false,
  importActive: false,
  importedFileName: '',
  importStatusText: '',
  importError: '',
})

const filterInput = defineModel<string>('filterInput', { required: true })
const playbackTimingMode = defineModel<'interval' | 'timeline'>('playbackTimingMode', { required: true })
const playbackIntervalMs = defineModel<number>('playbackIntervalMs', { required: true })
const timelineWindowMs = defineModel<number>('timelineWindowMs', { required: true })
const timelineSpeed = defineModel<number>('timelineSpeed', { required: true })
const showOnlyPacketLinks = defineModel<boolean>('showOnlyPacketLinks', { required: true })

defineEmits<{
  packetFileChange: [event: Event]
  submitFilter: []
  toggleRecording: []
  togglePlayback: []
  stopPlayback: []
  clearPlayback: []
  jumpPlayback: [direction: number]
  seekPosition: [position: number]
  updateSeekPosition: [position: number]
}>()

const packetFileInputRef = ref<HTMLInputElement>()

function openPacketFilePicker() {
  packetFileInputRef.value?.click()
}
</script>

<style scoped lang="scss">
.emulator-topology-3d-dock-page {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow: auto;
}

.emulator-topology-3d-hidden-input {
  display: none;
}
</style>
