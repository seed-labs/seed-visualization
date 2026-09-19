import { ref, shallowRef } from 'vue'
import type { EmulatorTopologyPacketReplayEvent } from '../services/packetReplayFileService'
import type { PacketFlowPathStep } from '../services/packetFlowAnalyzer'
import { DEFAULT_TIMELINE_WINDOW_MS, type PacketReplayTimingMode } from '../services/packetReplayRuntime'

export function usePacketReplayState(initialStatus: string, initialFilterStatus: string) {
  const activeDockPage = ref<'overview' | 'settings' | 'traffic'>('overview')
  const packetReplayEvents = shallowRef<EmulatorTopologyPacketReplayEvent[]>([])
  const packetReplayPlaylist = shallowRef<EmulatorTopologyPacketReplayEvent[]>([])
  const packetReplayFlowPath = ref<string[]>([])
  const packetReplayFlowSegments = ref<string[][]>([])
  const packetReplayPathSteps = ref<PacketFlowPathStep[]>([])
  const packetReplayFlowResolved = ref(false)
  const packetReplayIndex = ref(0)
  const packetReplayPlaying = ref(false)
  const packetReplayPaused = ref(false)
  const packetReplayPreparing = ref(false)
  const packetReplayTimingMode = ref<PacketReplayTimingMode>('interval')
  const packetReplayIntervalMs = ref(1200)
  const packetReplayTimelineWindowMs = ref(DEFAULT_TIMELINE_WINDOW_MS)
  const packetReplayTimelineSpeed = ref(1)
  const packetReplayTimelineCursorMs = ref<number>()
  const packetReplayStatus = ref(initialStatus)
  const packetRecordingEnabled = ref(false)
  const showOnlyPacketLinks = ref(false)
  const flowAnimationEnabled = ref(false)
  const trafficCaptureActive = ref(false)
  const trafficFilterError = ref('')
  const trafficFilterInput = ref('')
  const trafficFilterStatus = ref(initialFilterStatus)
  const trafficFilterSubmitting = ref(false)

  return {
    activeDockPage,
    flowAnimationEnabled,
    packetRecordingEnabled,
    packetReplayEvents,
    packetReplayFlowPath,
    packetReplayFlowResolved,
    packetReplayFlowSegments,
    packetReplayIndex,
    packetReplayIntervalMs,
    packetReplayPathSteps,
    packetReplayPaused,
    packetReplayPlaying,
    packetReplayPlaylist,
    packetReplayPreparing,
    packetReplayStatus,
    packetReplayTimelineCursorMs,
    packetReplayTimelineSpeed,
    packetReplayTimelineWindowMs,
    packetReplayTimingMode,
    showOnlyPacketLinks,
    trafficCaptureActive,
    trafficFilterError,
    trafficFilterInput,
    trafficFilterStatus,
    trafficFilterSubmitting,
  }
}
