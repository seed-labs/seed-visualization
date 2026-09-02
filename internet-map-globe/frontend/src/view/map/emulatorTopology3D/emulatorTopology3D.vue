<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import {
  UploadFilled,
} from '@element-plus/icons-vue'
import Map3DGlobe from '@/components/Map3DGlobe/index.vue'
import Upload from '@/components/Upload/index.vue'
import EmulatorTopologyDock from '@/view/map/shared/components/EmulatorTopologyDock.vue'
import LoadingOverlay from '@/view/map/shared/components/LoadingOverlay.vue'
import TopologyNodeHoverCard from '@/view/map/shared/components/TopologyNodeHoverCard.vue'
import { useEmulatorTopologyGraph } from '@/view/map/shared/composables/useEmulatorTopologyGraph'
import type { VisData } from '@/utils/types'
import {
  type EmulatorTopologyPcapPacket,
  type EmulatorTopologyPacketReplayEvent,
} from '@/view/map/shared/services/packetReplayFileService'
import { PacketReplayWorkerClient } from '@/view/map/shared/services/packetReplayWorkerClient'
import {
  analyzePacketFlow,
  type PacketFlowPathStep,
} from '@/view/map/shared/services/packetFlowAnalyzer'
import type { Map3DSceneMode } from '@/view/map/shared/services/cesiumScene'

const CAPTURE_UNAVAILABLE_TEXT = 'Live capture is unavailable<br/>when topology data comes from an uploaded docker-compose file.'
const MIN_REPLAY_TIMER_DELAY_MS = 4
const MIN_PACKET_VISUAL_DURATION_MS = 16
const DEFAULT_TIMELINE_WINDOW_MS = 50

type PacketReplayTimingMode = 'interval' | 'timeline'

const props = withDefaults(defineProps<{
  sceneMode?: Map3DSceneMode
  title?: string
  uploadTitle?: string
  uploadDescription?: string
}>(), {
  sceneMode: 'globe',
  title: 'Emulator Topology Globe',
  uploadTitle: 'Emulator Topology Globe',
  uploadDescription: 'Upload docker-compose.yml to render IX networks, ordinary networks, routers, and hosts on the globe.',
})

const mapData = ref<VisData>()
const activeDockPage = ref<'overview' | 'settings' | 'traffic'>('overview')
const packetReplayEvents = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayJsonEvents = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayPcapPackets = ref<EmulatorTopologyPcapPacket[]>([])
const packetReplayPlaylist = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayFlowPath = ref<string[]>([])
const packetReplayFlowSegments = ref<string[][]>([])
const packetReplayPathSteps = ref<PacketFlowPathStep[]>([])
const packetReplayEventPathIndexes = ref<number[]>([])
const packetReplayIndex = ref(0)
const packetReplayPlaying = ref(false)
const packetReplayImporting = ref(false)
const packetReplayTimingMode = ref<PacketReplayTimingMode>('interval')
const packetReplayIntervalMs = ref(1200)
const packetReplayTimelineWindowMs = ref(DEFAULT_TIMELINE_WINDOW_MS)
const packetReplayTimelineSpeed = ref(1)
const packetReplayTimelineCursorMs = ref<number>()
const packetReplayFileName = ref('')
const packetReplayStatus = ref('Import saved collector JSON or pcap files.')
const packetReplayError = ref('')
const packetRecordingEnabled = ref(false)
const showOnlyPacketLinks = ref(false)
const globeRef = ref<InstanceType<typeof Map3DGlobe>>()
const trafficFilterInput = ref('')
const trafficFilterStatus = ref('Live capture is unavailable for uploaded docker-compose topology data.')
const trafficFilterError = ref('')
const trafficFilterSubmitting = ref(false)
const trafficCaptureActive = ref(false)
const offlinePacketFilterEnabled = computed(
  () => packetReplayJsonEvents.value.length > 0 && packetReplayPcapPackets.value.length > 0,
)
let packetReplayTimerId: number | undefined
const packetReplayScheduledTimerIds = new Set<number>()
let packetReplayGeneration = 0
const packetReplayWorker = new PacketReplayWorkerClient()

const {
  graph,
  baseGraph,
  containers,
  networks,
  loadingVisible,
  orientToInitialNode,
  nodeScale,
  showNodeLabels,
  showHoverDetails,
  hoveredNode,
  hoverPosition,
  keyword,
  selectedAsns,
  selectedIxNames,
  selectedAsnValues,
  selectedIxNameValues,
  showAsDetails,
  expandedParentIds,
  selectedNode,
  stats,
  visibleTypes,
  selectedNodeSummary,
  ixSummaries,
  asSummaries,
  asDetailsByAsn,
  resetTopologyState,
  setTopologyData,
  renderGraph,
  refreshDisplayGraph,
  applySearch,
  submitSearchFromKeyboard,
  clearSearch,
  querySearchSuggestions,
  selectSearchSuggestion,
  onNodeClick,
  onNodeHover,
  onGlobeRendered,
  clearTopologyFilters,
} = useEmulatorTopologyGraph({
  getPathFilterEnabled: () => showOnlyPacketLinks.value,
  getPathFilterNodes: () => packetReplayFlowSegments.value,
  orientToNode: (nodeId) => globeRef.value?.orientToNode(nodeId),
})
const packetReplayProgress = computed({
  get: () => packetReplayIndex.value,
  set: (value: number) => showPacketReplayEventAt(Number(value)),
})
const packetReplayStepCount = computed(() => packetReplayEvents.value.length)

async function handleParsedMap(value: VisData) {
  mapData.value = value
  await setTopologyData({ nodes: value.nodes ?? [], nets: value.nets ?? [] })
}

function resetUpload() {
  stopPacketReplay()
  clearPacketReplay()
  mapData.value = undefined
  resetTopologyState()
}

async function handlePacketReplayFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selectedFiles = Array.from(input.files ?? [])
  input.value = ''
  if (!selectedFiles.length) return

  const jsonFile = selectedFiles.find((file) => file.name.toLowerCase().endsWith('.json'))
  const pcapFile = selectedFiles.find((file) => file.name.toLowerCase().endsWith('.pcap'))
  if (!jsonFile) {
    packetReplayError.value = 'Import a collector JSON file. PCAP can only be used together with JSON.'
    packetReplayStatus.value = 'Import failed.'
    return
  }

  packetReplayError.value = ''
  packetReplayImporting.value = true
  packetReplayStatus.value = 'Importing packet files...'
  packetRecordingEnabled.value = false
  stopPacketReplay()
  packetReplayJsonEvents.value = []
  packetReplayPcapPackets.value = []

  try {
    const result = await packetReplayWorker.importFiles(
      jsonFile,
      pcapFile,
      containers.value,
      networks.value,
      (message) => {
        packetReplayStatus.value = message
      },
    )
    if (!result.events.length) {
      packetReplayEvents.value = []
      packetReplayJsonEvents.value = []
      packetReplayPcapPackets.value = []
      packetReplayFileName.value = ''
      packetReplayStatus.value = 'No playable packets were found.'
      packetReplayError.value = 'No packet could be matched to the uploaded topology.'
      return
    }

    packetReplayJsonEvents.value = result.jsonEvents
    packetReplayPcapPackets.value = result.pcapPackets
    packetReplayEvents.value = result.events
    rebuildPacketReplayFlow(packetReplayEvents.value)
    packetReplayIndex.value = 0
    packetReplayFileName.value = pcapFile ? `${jsonFile.name} + ${pcapFile.name}` : jsonFile.name
    packetReplayStatus.value =
      pcapFile
        ? `Imported ${result.events.length.toLocaleString()} JSON packets and ${packetReplayPcapPackets.value.length.toLocaleString()} PCAP packets. Offline filter is available.`
        : `Imported ${result.events.length.toLocaleString()} JSON packets. Offline filter requires a matching PCAP file.`
    trafficFilterStatus.value = pcapFile
      ? 'Offline filter is ready. Empty filter selects all imported JSON packets.'
      : 'Offline filter is disabled because no matching PCAP file was imported.'
    trafficFilterError.value = ''
    trafficFilterInput.value = ''
    clearReplayFlash()
  } catch (error) {
    packetReplayError.value = error instanceof Error ? error.message : String(error)
    packetReplayStatus.value = 'Import failed.'
  } finally {
    packetReplayImporting.value = false
  }
}

function showPacketReplayEventAt(index: number) {
  const events = ensurePacketReplayEvents()
  if (!events.length) return
  packetReplayIndex.value = Math.max(0, Math.min(events.length, Math.round(index)))
  if (packetReplayTimingMode.value === 'timeline') {
    packetReplayTimelineCursorMs.value = events[packetReplayIndex.value]
      ? getPacketTimestampMs(events[packetReplayIndex.value]!)
      : undefined
  }
  playPacketReplayPacket(packetReplayIndex.value)
}

function jumpPacketReplay(direction: number) {
  showPacketReplayEventAt(packetReplayIndex.value + direction)
}

function playNextPacketReplayEvent() {
  if (!packetReplayPlaying.value) return
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      playNextPacketReplaySpeedEvent()
      return
    }
    playNextPacketReplayWindow()
    return
  }

  const events = packetReplayEvents.value
  if (packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayPacket(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, getNextPacketReplayDelayMs(packetReplayIndex.value))
}

function playNextPacketReplaySpeedEvent() {
  const events = packetReplayEvents.value
  if (!events.length || packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayPacket(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, getNextPacketReplayDelayMs(packetReplayIndex.value))
}

function togglePacketReplay() {
  if (packetRecordingEnabled.value) return
  const events = ensurePacketReplayEvents()
  if (!events.length) return
  if (packetReplayPlaying.value) {
    packetReplayPlaying.value = false
    cancelPacketReplayQueue()
    return
  }

  if (packetReplayIndex.value >= events.length) {
    packetReplayIndex.value = 0
  }
  cancelPacketReplayQueue()
  packetReplayTimelineCursorMs.value = undefined
  packetReplayPlaying.value = true
  playNextPacketReplayEvent()
}

function stopPacketReplay() {
  packetReplayPlaying.value = false
  cancelPacketReplayQueue()
  packetReplayIndex.value = 0
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayEventPathIndexes.value = []
  packetReplayTimelineCursorMs.value = undefined
  clearReplayFlash()
  refreshDisplayGraph()
}

function cancelPacketReplayQueue() {
  packetReplayGeneration += 1
  clearPacketReplayTimers()
}

function clearPacketReplayTimers() {
  if (packetReplayTimerId !== undefined) {
    window.clearTimeout(packetReplayTimerId)
    packetReplayTimerId = undefined
  }
  packetReplayScheduledTimerIds.forEach((timerId) => window.clearTimeout(timerId))
  packetReplayScheduledTimerIds.clear()
}

function scheduleNextPacketReplay(callback: () => void, delayMs: number) {
  const generation = packetReplayGeneration
  packetReplayTimerId = window.setTimeout(() => {
    packetReplayTimerId = undefined
    if (generation !== packetReplayGeneration || !packetReplayPlaying.value) return
    callback()
  }, Math.max(0, delayMs))
}

function schedulePacketReplayCallback(callback: () => void, delayMs: number) {
  const generation = packetReplayGeneration
  const timerId = window.setTimeout(() => {
    packetReplayScheduledTimerIds.delete(timerId)
    if (generation !== packetReplayGeneration) return
    callback()
  }, Math.max(0, delayMs))
  packetReplayScheduledTimerIds.add(timerId)
}

function clearPacketReplay() {
  if (packetRecordingEnabled.value) return
  stopPacketReplay()
  packetReplayEvents.value = []
  packetReplayJsonEvents.value = []
  packetReplayPcapPackets.value = []
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayEventPathIndexes.value = []
  packetReplayFileName.value = ''
  packetReplayStatus.value = 'Import saved collector JSON or pcap files.'
  packetReplayError.value = ''
  trafficFilterInput.value = ''
  trafficFilterStatus.value = 'Live capture is unavailable for uploaded docker-compose topology data.'
  trafficFilterError.value = ''
}

function animatePacketHop(
  fromNodeId: string | undefined,
  toNodeId: string | undefined,
  packetIndex = Math.max(0, packetReplayIndex.value - 1),
) {
  const visualDurationMs = getCurrentPacketVisualDurationMs(packetIndex)
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    globeRef.value?.flashNode(toNodeId || fromNodeId || '', Math.min(1200, Math.max(16, visualDurationMs * 0.65)))
    return
  }

  globeRef.value?.animatePacketHop(fromNodeId, toNodeId, Math.max(1, visualDurationMs))
}

function playPacketReplayPathStep(position: number) {
  const targetIndex = Math.max(0, position - 1)
  const step = packetReplayPathSteps.value[targetIndex]
  const targetNodeId = step?.nodeId
  if (!targetNodeId) return

  if (!step.previousNodeId) {
    const visualDurationMs = getCurrentPacketVisualDurationMs(Math.max(0, packetReplayIndex.value - 1))
    globeRef.value?.flashNode(targetNodeId, Math.min(1200, Math.max(16, visualDurationMs * 0.65)))
    return
  }

  // logPacketReplayHop(step.previousNodeId, targetNodeId, step.event)
  animatePacketHop(step.previousNodeId, targetNodeId)
}

function playNextPacketReplayWindow() {
  const events = packetReplayEvents.value
  if (!events.length || packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    packetReplayTimelineCursorMs.value = undefined
    return
  }

  const windowMs = Math.max(1, packetReplayTimelineWindowMs.value)
  const startIndex = Math.max(0, packetReplayIndex.value)
  const startMs = getPacketTimestampMs(events[startIndex]!)
  const endMs = startMs + windowMs
  let nextIndex = startIndex

  while (nextIndex < events.length && getPacketTimestampMs(events[nextIndex]!) <= endMs) {
    nextIndex += 1
  }
  if (nextIndex === startIndex) {
    nextIndex += 1
  }

  const windowEvents = events.slice(startIndex, nextIndex)
  const lastWindowDelayMs = playPacketReplayWindow(windowEvents, startIndex)
  const nextWindowStartMs = nextIndex < events.length ? getPacketTimestampMs(events[nextIndex]!) : endMs
  packetReplayTimelineCursorMs.value = nextIndex < events.length ? nextWindowStartMs : undefined

  scheduleNextPacketReplay(
    playNextPacketReplayEvent,
    Math.max(
      MIN_REPLAY_TIMER_DELAY_MS,
      (nextWindowStartMs - startMs) / Math.max(0.0001, packetReplayTimelineSpeed.value),
      lastWindowDelayMs + MIN_REPLAY_TIMER_DELAY_MS,
    ),
  )
}

function playPacketReplayWindow(events: EmulatorTopologyPacketReplayEvent[], startIndex: number) {
  if (!events.length) return 0
  const windowStartMs = getPacketTimestampMs(events[0]!)
  const safeSpeed = Math.max(0.0001, packetReplayTimelineSpeed.value)
  let lastDelayMs = 0

  console.log('[packet replay window]', {
    packets: events.length,
    from: events[0]?.timestampMs,
    to: events[events.length - 1]?.timestampMs,
  })

  events.forEach((_, offset) => {
    const event = events[offset]!
    const eventOffsetMs = Math.max(0, getPacketTimestampMs(event) - windowStartMs)
    const delayMs = Math.max(0, eventOffsetMs / safeSpeed)
    lastDelayMs = Math.max(lastDelayMs, delayMs)
    schedulePacketReplayCallback(() => {
      packetReplayIndex.value = startIndex + offset + 1
      playPacketReplayPacketAtIndex(startIndex + offset)
    }, delayMs)
  })

  return lastDelayMs
}

function logPacketReplayHop(fromNodeId: string, toNodeId: string, event: EmulatorTopologyPacketReplayEvent) {
  console.log(
    `[packet replay] ${getGraphNodeLabel(fromNodeId)} -> ${getGraphNodeLabel(toNodeId)}`,
    {
      fromNodeId,
      toNodeId,
      protocol: event.ipProtocol || event.ipProtocolNumber || '-',
      packetRole: event.packetRole || '-',
      packetKind: event.packetKind || '-',
      sourceIp: event.sourceIp || '-',
      destIp: event.destIp || '-',
    },
  )
}

function getGraphNodeLabel(nodeId: string) {
  const node = baseGraph.value.nodes.find((item) => item.id === nodeId || item.sourceId === nodeId)
  return node?.label || nodeId
}

function playPacketReplayPacket(position: number) {
  const packetIndex = Math.max(0, position - 1)
  playPacketReplayPacketAtIndex(packetIndex)
}

function playPacketReplayPacketAtIndex(packetIndex: number) {
  const event = packetReplayEvents.value[packetIndex]
  const directPath = event ? getPacketDirectPath(event) : []
  if (event && directPath.length > 0) {
    playPacketDirectPath(event, directPath, packetIndex)
    return
  }

  const targetPathIndex = packetReplayEventPathIndexes.value[packetIndex]
  if (targetPathIndex === undefined) return

  const previousPathIndex = packetIndex > 0 ? packetReplayEventPathIndexes.value[packetIndex - 1] ?? -1 : -1
  const startPathIndex = Math.max(0, previousPathIndex + 1)
  const stepCount = Math.max(1, targetPathIndex - startPathIndex + 1)
  const stepDelayMs = Math.max(1, getCurrentPacketVisualDurationMs(packetIndex) / Math.max(2, stepCount + 1))

  for (let pathIndex = startPathIndex; pathIndex <= targetPathIndex; pathIndex += 1) {
    schedulePacketReplayCallback(() => {
      playPacketReplayPathStep(pathIndex + 1)
    }, (pathIndex - startPathIndex) * stepDelayMs)
  }
}

function playPacketDirectPath(event: EmulatorTopologyPacketReplayEvent, pathNodeIds: string[], packetIndex: number) {
  const stepCount = Math.max(1, pathNodeIds.length - 1)
  const stepDelayMs = Math.max(1, getCurrentPacketVisualDurationMs(packetIndex) / Math.max(2, stepCount + 1))

  if (pathNodeIds.length === 1) {
    schedulePacketReplayCallback(() => {
      const nodeId = pathNodeIds[0]!
      console.log(`[packet replay] ${getGraphNodeLabel(nodeId)}`, {
        nodeId,
        protocol: event.ipProtocol || event.ipProtocolNumber || '-',
        packetRole: event.packetRole || '-',
        packetKind: event.packetKind || '-',
        sourceIp: event.sourceIp || '-',
        destIp: event.destIp || '-',
      })
      globeRef.value?.flashNode(nodeId, Math.min(1200, Math.max(16, getCurrentPacketVisualDurationMs(packetIndex) * 0.65)))
    }, 0)
    return
  }

  for (let index = 1; index < pathNodeIds.length; index += 1) {
    const fromNodeId = pathNodeIds[index - 1]!
    const toNodeId = pathNodeIds[index]!
    schedulePacketReplayCallback(() => {
      logPacketReplayHop(fromNodeId, toNodeId, event)
      animatePacketHop(fromNodeId, toNodeId, packetIndex)
    }, (index - 1) * stepDelayMs)
  }
}

function getPacketDirectPath(event: EmulatorTopologyPacketReplayEvent) {
  return uniquePathNodes([
    resolveGraphNodeId(event.sourceContainerId, event.sourceContainerName, event.sourceNodeName, event.sourceNodeIp),
    resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel),
    resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp),
  ].filter(Boolean) as string[])
}

function uniquePathNodes(nodeIds: string[]) {
  return nodeIds.filter((nodeId, index) => index === 0 || nodeIds[index - 1] !== nodeId)
}

function resolveGraphNodeId(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim().toLowerCase()
    if (!normalizedCandidate) continue

    const exact = baseGraph.value.nodes.find((node) =>
      node.id.toLowerCase() === normalizedCandidate ||
      node.sourceId?.toLowerCase() === normalizedCandidate ||
      node.label.toLowerCase() === normalizedCandidate,
    )
    if (exact) return exact.id

    const searchable = baseGraph.value.nodes.find((node) =>
      node.searchText?.toLowerCase().includes(normalizedCandidate),
    )
    if (searchable) return searchable.id
  }

  return undefined
}

function rebuildPacketReplayFlow(events: EmulatorTopologyPacketReplayEvent[]) {
  const analysis = analyzePacketFlow(events)
  packetReplayPlaylist.value = analysis.pathEvents
  packetReplayFlowPath.value = analysis.nodePath
  packetReplayFlowSegments.value = analysis.pathSegments
  packetReplayPathSteps.value = analysis.pathSteps
  packetReplayEventPathIndexes.value = buildPacketEventPathIndexes(analysis.events, analysis.pathEvents, analysis.nodePath)
  refreshDisplayGraph()
}

function buildPacketEventPathIndexes(
  events: EmulatorTopologyPacketReplayEvent[],
  pathEvents: EmulatorTopologyPacketReplayEvent[],
  nodePath: string[],
) {
  let searchFrom = 0
  return events.map((event) => {
    for (let index = searchFrom; index < pathEvents.length; index += 1) {
      if (pathEvents[index] === event && nodePath[index] === event.containerId) {
        searchFrom = index + 1
        return index
      }
    }
    for (let index = searchFrom; index < pathEvents.length; index += 1) {
      if (pathEvents[index] === event) {
        searchFrom = index + 1
        return index
      }
    }
    return searchFrom > 0 ? searchFrom - 1 : 0
  })
}

function ensurePacketReplayEvents() {
  if (!packetReplayEvents.value.length) return []
  if (!packetReplayFlowPath.value.length) {
    rebuildPacketReplayFlow(packetReplayEvents.value)
  }

  return packetReplayEvents.value
}

function getNextPacketReplayDelayMs(currentPosition: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return Math.max(0, packetReplayIntervalMs.value)
  }
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      const current = packetReplayEvents.value[currentPosition - 1]
      const next = packetReplayEvents.value[currentPosition]
      if (!current || !next) return 0
      return Math.max(MIN_REPLAY_TIMER_DELAY_MS, getSpeedAdjustedPacketDurationMs(current, next, packetReplayTimelineSpeed.value))
    }
    return Math.max(
      MIN_REPLAY_TIMER_DELAY_MS,
      Math.max(1, packetReplayTimelineWindowMs.value) / Math.max(0.0001, packetReplayTimelineSpeed.value),
    )
  }

  const current = packetReplayEvents.value[currentPosition - 1]
  const next = packetReplayEvents.value[currentPosition]
  if (!current || !next) {
    return 0
  }

  return Math.max(MIN_REPLAY_TIMER_DELAY_MS, getSpeedAdjustedPacketDurationMs(current, next, packetReplayTimelineSpeed.value))
}

function getCurrentPacketVisualDurationMs(packetIndex: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return packetReplayIntervalMs.value
  }
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      const previous = packetReplayEvents.value[Math.max(0, packetIndex - 1)]
      const current = packetReplayEvents.value[packetIndex]
      if (!previous || !current) {
        return Math.min(650, Math.max(120, packetReplayIntervalMs.value))
      }
      return Math.max(MIN_PACKET_VISUAL_DURATION_MS, getSpeedAdjustedPacketDurationMs(previous, current, packetReplayTimelineSpeed.value))
    }
    return Math.max(
      MIN_PACKET_VISUAL_DURATION_MS,
      Math.max(1, packetReplayTimelineWindowMs.value) / Math.max(0.0001, packetReplayTimelineSpeed.value),
    )
  }

  const previous = packetReplayEvents.value[Math.max(0, packetIndex - 1)]
  const current = packetReplayEvents.value[packetIndex]
  if (!previous || !current) {
    return Math.min(650, Math.max(120, packetReplayIntervalMs.value))
  }

  return Math.max(MIN_PACKET_VISUAL_DURATION_MS, getSpeedAdjustedPacketDurationMs(previous, current, packetReplayTimelineSpeed.value))
}

function getSpeedAdjustedPacketDurationMs(
  previous: EmulatorTopologyPacketReplayEvent,
  current: EmulatorTopologyPacketReplayEvent,
  speed: number,
) {
  const rawDeltaMs = Math.max(0, getPacketTimestampMs(current) - getPacketTimestampMs(previous))
  return rawDeltaMs / Math.max(0.0001, speed)
}

function isTimelineSpeedMode() {
  return packetReplayTimingMode.value === 'timeline' && packetReplayTimelineWindowMs.value <= 0
}

function getPacketTimestampMs(event: EmulatorTopologyPacketReplayEvent) {
  if (event.timestampNs !== undefined) {
    const timestampNs = Number(event.timestampNs)
    if (Number.isFinite(timestampNs)) {
      return timestampNs / 1_000_000
    }
  }
  return event.timestampMs
}

function clearReplayFlash() {
  globeRef.value?.flashNode('', 0)
  globeRef.value?.clearPacketAnimations()
}

function handleVisibilityChange() {
  if (typeof document === 'undefined' || !document.hidden || !packetReplayPlaying.value) return

  pausePacketReplayForInactivePage()
}

function pausePacketReplayForInactivePage() {
  if (!packetReplayPlaying.value) return

  packetReplayPlaying.value = false
  cancelPacketReplayQueue()
  clearReplayFlash()
  packetReplayStatus.value = packetReplayEvents.value.length
    ? 'Playback paused because the page was hidden.'
    : packetReplayStatus.value
}

function togglePacketRecording() {
  trafficFilterError.value = 'Live capture is unavailable for uploaded docker-compose topology data.'
  if (!trafficCaptureActive.value || packetReplayFileName.value || packetReplayPlaying.value) return

  packetRecordingEnabled.value = !packetRecordingEnabled.value
  packetReplayStatus.value = packetRecordingEnabled.value
    ? 'Recording live packets...'
    : `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets.`
}

async function submitTrafficFilter() {
  if (offlinePacketFilterEnabled.value) {
    trafficFilterSubmitting.value = true
    trafficFilterError.value = ''
    packetRecordingEnabled.value = false
    stopPacketReplay()

    try {
      const result = await packetReplayWorker.filterPackets(
        packetReplayJsonEvents.value,
        packetReplayPcapPackets.value,
        trafficFilterInput.value,
        (message) => {
          trafficFilterStatus.value = message
        },
      )
      packetReplayEvents.value = result.events
      rebuildPacketReplayFlow(packetReplayEvents.value)
      packetReplayIndex.value = 0
      trafficFilterStatus.value = trafficFilterInput.value.trim()
        ? `Offline filter matched ${result.events.length.toLocaleString()} JSON packets from ${result.matchedPacketCount.toLocaleString()} PCAP packets.`
        : `Offline filter cleared. Using all ${result.events.length.toLocaleString()} imported JSON packets.`
      packetReplayStatus.value = `Ready to replay ${result.events.length.toLocaleString()} filtered packets.`
      clearReplayFlash()
    } catch (error) {
      trafficFilterError.value = error instanceof Error ? error.message : String(error)
    } finally {
      trafficFilterSubmitting.value = false
    }
    return
  }

  trafficFilterError.value = 'Live capture is unavailable for uploaded docker-compose topology data.'
  packetRecordingEnabled.value = false
  trafficCaptureActive.value = false
  trafficFilterSubmitting.value = false
}

watch(
  () => [
    visibleTypes.value.ix,
    visibleTypes.value.network,
    visibleTypes.value.router,
    visibleTypes.value.host,
  ],
  () => {
    if (!mapData.value) return
    selectedNode.value = undefined
    renderGraph(false)
  },
)

watch(showOnlyPacketLinks, () => {
  refreshDisplayGraph()
})

watch(
  () => visibleTypes.value.router,
  (routerVisible) => {
    if (!routerVisible) {
      visibleTypes.value.network = false
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  packetReplayWorker.terminate()
  packetRecordingEnabled.value = false
  stopPacketReplay()
  clearReplayFlash()
  loadingVisible.value = false
})

onDeactivated(() => {
  pausePacketReplayForInactivePage()
})

onActivated(() => {
  clearReplayFlash()
})

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <main v-if="mapData" class="emulator-topology-3d-page" data-testid="emulator-topology-3d-page">
    <Map3DGlobe
      ref="globeRef"
      :graph="graph"
      :node-scale="nodeScale"
      :show-router-labels="showNodeLabels"
      :show-node-labels="showNodeLabels"
      :expanded-router-parent-ids="expandedParentIds"
      :orient-to-graph="orientToInitialNode"
      :scene-mode="props.sceneMode"
      @rendered="onGlobeRendered"
      @node-click="onNodeClick"
      @node-hover="onNodeHover"
    />
    <TopologyNodeHoverCard
      v-if="showHoverDetails && hoveredNode"
      :node="hoveredNode"
      :position="hoverPosition"
    />

    <EmulatorTopologyDock
      v-model:active-page="activeDockPage"
      v-model:selected-asn-values="selectedAsnValues"
      v-model:selected-ix-name-values="selectedIxNameValues"
      v-model:keyword="keyword"
      v-model:visible-types="visibleTypes"
      v-model:node-scale="nodeScale"
      v-model:show-node-labels="showNodeLabels"
      v-model:show-hover-details="showHoverDetails"
      v-model:show-as-details="showAsDetails"
      :title="props.title"
      :stats="stats"
      :as-summaries="asSummaries"
      :ix-summaries="ixSummaries"
      :as-details-by-asn="asDetailsByAsn"
      :selected-asns="selectedAsns"
      :selected-ix-names="selectedIxNames"
      :selected-node-summary="selectedNodeSummary"
      :query-search-suggestions="querySearchSuggestions"
      traffic-mode="offline"
      v-model:traffic-filter-input="trafficFilterInput"
      v-model:traffic-playback-timing-mode="packetReplayTimingMode"
      v-model:traffic-playback-interval-ms="packetReplayIntervalMs"
      v-model:traffic-timeline-window-ms="packetReplayTimelineWindowMs"
      v-model:traffic-timeline-speed="packetReplayTimelineSpeed"
      v-model:traffic-show-only-packet-links="showOnlyPacketLinks"
      v-model:traffic-seek-position="packetReplayProgress"
      :traffic-filter-submitting="trafficFilterSubmitting"
      :traffic-filter-error="trafficFilterError"
      :traffic-filter-status-text="trafficFilterStatus"
      :traffic-capture-active="trafficCaptureActive"
      :traffic-capture-disabled="true"
      :traffic-capture-disabled-text="CAPTURE_UNAVAILABLE_TEXT"
      :traffic-offline-filter-enabled="offlinePacketFilterEnabled"
      :traffic-offline-filter-disabled-text="packetReplayJsonEvents.length ? 'Offline filter requires importing a matching PCAP file together with JSON.' : ''"
      :traffic-import-busy="packetReplayImporting"
      :traffic-import-active="Boolean(packetReplayFileName)"
      :traffic-recording-enabled="packetRecordingEnabled"
      :traffic-packet-count="packetReplayStepCount"
      :traffic-playback-enabled="packetReplayPlaying"
      :traffic-playback-paused="!packetReplayPlaying"
      :traffic-imported-file-name="packetReplayFileName"
      :traffic-import-status-text="packetReplayStatus"
      :traffic-import-error="packetReplayError"
      @refresh="resetUpload"
      @clear-topology-filters="clearTopologyFilters"
      @apply-search="applySearch"
      @clear-search="clearSearch"
      @submit-search-from-keyboard="submitSearchFromKeyboard"
      @select-search-suggestion="selectSearchSuggestion"
      @traffic-packet-file-change="handlePacketReplayFileChange"
      @traffic-submit-filter="submitTrafficFilter"
      @traffic-toggle-recording="togglePacketRecording"
      @traffic-toggle-playback="togglePacketReplay"
      @traffic-stop-playback="stopPacketReplay"
      @traffic-clear-playback="clearPacketReplay"
      @traffic-jump-playback="jumpPacketReplay"
      @traffic-update-seek-position="showPacketReplayEventAt"
      @traffic-seek-position="showPacketReplayEventAt"
    />

    <LoadingOverlay :visible="loadingVisible" />
  </main>

  <main v-else class="emulator-topology-3d-upload-page" data-testid="emulator-topology-3d-upload-page">
    <section class="emulator-topology-3d-upload-card">
      <header>
        <el-icon><UploadFilled /></el-icon>
        <div>
          <strong>{{ props.uploadTitle }}</strong>
          <span>{{ props.uploadDescription }}</span>
        </div>
      </header>
      <Upload
        class="emulator-topology-3d-upload"
        data-testid="emulator-topology-3d-upload"
        v-model:map-data="mapData"
        @update:map-data="handleParsedMap"
      />
    </section>
  </main>
</template>

<style scoped lang="scss" src="./styles/emulator-topology-3d.scss"></style>
