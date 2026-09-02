<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import Map3DGlobe from '@/components/Map3DGlobe/index.vue'
import EmulatorTopologyDock from '@/view/map/shared/components/EmulatorTopologyDock.vue'
import LoadingOverlay from '@/view/map/shared/components/LoadingOverlay.vue'
import TopologyNodeHoverCard from '@/view/map/shared/components/TopologyNodeHoverCard.vue'
import { useEmulatorTopologyGraph } from '@/view/map/shared/composables/useEmulatorTopologyGraph'
import type { EmulatorNetwork, EmulatorNode } from '@/utils/types'
import { reqGetContainersList, reqGetNetworksList } from '@/api/map'
import {
  remapEmulatorTopologyPacketReplayEvent,
  type EmulatorTopologyPacketReplayEvent,
} from '@/view/map/shared/services/packetReplayFileService'
import {
  analyzePacketFlow,
  type PacketFlowPathStep,
} from '@/view/map/shared/services/packetFlowAnalyzer'
import type { Map3DSceneMode } from '@/view/map/shared/services/cesiumScene'
import {
  fetchTrafficObserverFilter,
  setTrafficObserverFilter,
  TrafficObserverClient,
} from './services/trafficObserverService'
import { WindowManager } from '@/utils/window-manager'

const LIVE_FLOW_IDLE_RESET_MS = 2500
const LIVE_FLOW_STALE_MS = 3000
const MIN_REPLAY_TIMER_DELAY_MS = 4
const MIN_PACKET_VISUAL_DURATION_MS = 16
const DEFAULT_TIMELINE_WINDOW_MS = 50
const LIVE_PACKET_FLASH_INTERVAL_MS = 180
const LIVE_PACKET_FLASH_DURATION_MS = 420
const LIVE_PACKET_HOP_DELAY_MS = 80
const LIVE_PACKET_ANIMATION_QUEUE_LIMIT = 96

type PacketReplayTimingMode = 'interval' | 'timeline'
type LivePacketAnimationJob = {
  event: EmulatorTopologyPacketReplayEvent
  pathNodeIds: string[]
  mode: 'highlight' | 'path'
}

const props = withDefaults(defineProps<{
  sceneMode?: Map3DSceneMode
  title?: string
}>(), {
  sceneMode: 'globe',
  title: 'Live Emulator Topology Globe',
})

const topologyLoaded = ref(false)
const activeDockPage = ref<'overview' | 'settings' | 'traffic'>('overview')
const packetReplayEvents = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayPlaylist = ref<EmulatorTopologyPacketReplayEvent[]>([])
const packetReplayFlowPath = ref<string[]>([])
const packetReplayFlowSegments = ref<string[][]>([])
const packetReplayPathSteps = ref<PacketFlowPathStep[]>([])
const liveFlowEvents = ref<EmulatorTopologyPacketReplayEvent[]>([])
const liveFlowPath = ref<string[]>([])
const liveFlowSegments = ref<string[][]>([])
const liveFlowPathSteps = ref<PacketFlowPathStep[]>([])
const packetReplayIndex = ref(0)
const packetReplayPlaying = ref(false)
const packetReplayTimingMode = ref<PacketReplayTimingMode>('interval')
const packetReplayIntervalMs = ref(1200)
const packetReplayTimelineWindowMs = ref(DEFAULT_TIMELINE_WINDOW_MS)
const packetReplayTimelineSpeed = ref(1)
const packetReplayTimelineCursorMs = ref<number>()
const packetReplayStatus = ref('Submit a filter, then record live packets for replay.')
const packetRecordingEnabled = ref(false)
const showOnlyPacketLinks = ref(false)
const globeRef = ref<InstanceType<typeof Map3DGlobe>>()
const topologyLoadError = ref('')
const trafficFilterInput = ref('')
const trafficFilterStatus = ref('Submit a filter to start live capture.')
const trafficFilterError = ref('')
const trafficFilterSubmitting = ref(false)
const trafficCaptureActive = ref(false)
let packetReplayTimerId: number | undefined
const packetReplayScheduledTimerIds = new Set<number>()
let consoleWindowManager: WindowManager | undefined
let packetReplayGeneration = 0
let trafficObserverClient: TrafficObserverClient | undefined
let lastLivePacketReceivedAtMs = 0
const livePacketAnimationQueue: LivePacketAnimationJob[] = []
const liveFlowObservationSignatures = new Map<string, string>()
const liveFlowLastSeenAtMs = new Map<string, number>()
let livePacketFlasherTimerId: number | undefined
let liveFlowIdleTimerId: number | undefined
let liveVisualizationSuspended = false

const {
  graph,
  baseGraph,
  containers,
  networks,
  loadingVisible,
  waitingForGraphRender,
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
  setTopologyData: setTopologyGraphData,
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
  getPathFilterNodes: () => {
    if (packetReplayPlaying.value) return packetReplayFlowSegments.value
    return trafficCaptureActive.value ? liveFlowSegments.value : []
  },
  orientToNode: (nodeId) => globeRef.value?.orientToNode(nodeId),
})
const packetReplayProgress = computed({
  get: () => packetReplayIndex.value,
  set: (value: number) => showPacketReplayEventAt(Number(value)),
})
const packetReplayStepCount = computed(() =>
  packetReplayTimingMode.value === 'timeline'
    ? packetReplayEvents.value.length
    : packetReplayPlaylist.value.length || packetReplayFlowPath.value.length || packetReplayEvents.value.length,
)

function initConsoleWindowManager() {
  if (consoleWindowManager) return
  consoleWindowManager = new WindowManager('globe-console-area', 'globe-console-taskbar')
}

function launchContainerConsole(nodeId: string, title: string) {
  initConsoleWindowManager()
  consoleWindowManager?.createWindow(nodeId.slice(0, 12), title, { cmd: '' }, true)
}

async function setTopologyData(value: { nodes: EmulatorNode[]; nets: EmulatorNetwork[] }) {
  topologyLoaded.value = true
  await setTopologyGraphData(value)
}

async function loadDockerTopology() {
  loadingVisible.value = true
  topologyLoadError.value = ''
  try {
    const [containerResponse, networkResponse] = await Promise.all([
      reqGetContainersList({}),
      reqGetNetworksList({}),
    ])
    if (!containerResponse.ok) throw new Error('Failed to load emulator containers.')
    if (!networkResponse.ok) throw new Error('Failed to load emulator networks.')
    await setTopologyData({
      nodes: containerResponse.result as EmulatorNode[],
      nets: networkResponse.result as EmulatorNetwork[],
    })
  } catch (error) {
    topologyLoadError.value = error instanceof Error ? error.message : String(error)
    ElMessage.error(topologyLoadError.value)
    loadingVisible.value = false
    waitingForGraphRender.value = false
  }
}

async function reloadDockerTopology() {
  stopPacketReplay()
  clearPacketReplay()
  resetTopologyState()
  lastLivePacketReceivedAtMs = 0
  await loadDockerTopology()
}

function showPacketReplayEventAt(index: number) {
  const events = packetReplayTimingMode.value === 'timeline'
    ? ensureTimelinePacketReplayEvents()
    : ensurePacketReplayPlaylist()
  if (!events.length) return
  packetReplayIndex.value = Math.max(0, Math.min(events.length, Math.round(index)))
  if (packetReplayTimingMode.value === 'timeline') {
    packetReplayTimelineCursorMs.value = packetReplayEvents.value[packetReplayIndex.value]
      ? getPacketTimestampMs(packetReplayEvents.value[packetReplayIndex.value]!)
      : undefined
    playPacketReplayPacket(packetReplayIndex.value)
    return
  }
  playPacketReplayStep(packetReplayIndex.value)
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

  const events = packetReplayPlaylist.value
  if (packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayStep(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, Math.max(0, getNextPacketReplayDelayMs(packetReplayIndex.value)))
}

function playNextPacketReplaySpeedEvent() {
  const events = packetReplayEvents.value
  if (!events.length || packetReplayIndex.value >= events.length) {
    packetReplayPlaying.value = false
    return
  }

  packetReplayIndex.value += 1
  playPacketReplayPacket(packetReplayIndex.value)
  scheduleNextPacketReplay(playNextPacketReplayEvent, Math.max(0, getNextPacketReplayDelayMs(packetReplayIndex.value)))
}

function togglePacketReplay() {
  if (packetRecordingEnabled.value) return
  const events = packetReplayTimingMode.value === 'timeline'
    ? ensureTimelinePacketReplayEvents()
    : ensurePacketReplayPlaylist()
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
  resetLiveFlowState()
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
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  resetLiveFlowState()
  packetReplayStatus.value = 'Submit a filter, then record live packets for replay.'
  refreshDisplayGraph()
}

function handleLivePacket(packet: EmulatorTopologyPacketReplayEvent) {
  if (
    !trafficCaptureActive.value ||
    packetReplayPlaying.value
  ) {
    return
  }

  if (isPageHidden()) {
    suspendLiveVisualization()
    return
  }

  const now = Date.now()
  if (lastLivePacketReceivedAtMs > 0 && now - lastLivePacketReceivedAtMs > LIVE_FLOW_IDLE_RESET_MS) {
    resetLiveFlowState()
    clearLivePacketAnimationQueues()
  }
  lastLivePacketReceivedAtMs = now
  scheduleLiveFlowIdleReset()

  const remappedPacket = remapEmulatorTopologyPacketReplayEvent(packet, containers.value, networks.value)
  const flowKey = getLiveFlowKey(remappedPacket)
  if (flowKey) {
    liveFlowLastSeenAtMs.set(flowKey, now)
  }
  pruneStaleLiveFlows(now)

  const livePathChanged = shouldSkipLivePacketAnimation(remappedPacket)
    ? false
    : updateLiveFlowPathIfNeeded(remappedPacket)

  if (packetRecordingEnabled.value) {
    packetReplayEvents.value.push(remappedPacket)
    if (livePathChanged) {
      rebuildPacketReplayFlow(packetReplayEvents.value)
    }
    packetReplayIndex.value = packetReplayTimingMode.value === 'timeline'
      ? packetReplayEvents.value.length
      : packetReplayPlaylist.value.length || packetReplayEvents.value.length
    packetReplayStatus.value =
      `Recording live flow: ${packetReplayFlowPath.value.length.toLocaleString()} flow steps from ${packetReplayEvents.value.length.toLocaleString()} packets.`
  } else {
    packetReplayStatus.value =
      `Live capture active. Click record to save packets for replay. Current live flow has ${liveFlowPath.value.length.toLocaleString()} steps.`
  }

  playLivePacketAnimation(remappedPacket)
}

function resetLiveFlowState() {
  clearLiveFlowIdleResetTimer()
  liveFlowObservationSignatures.clear()
  liveFlowLastSeenAtMs.clear()
  liveFlowEvents.value = []
  liveFlowPath.value = []
  liveFlowSegments.value = []
  liveFlowPathSteps.value = []
}

function rebuildLiveFlowFromEvents() {
  if (!liveFlowEvents.value.length) {
    liveFlowPath.value = []
    liveFlowSegments.value = []
    liveFlowPathSteps.value = []
    refreshDisplayGraph()
    return
  }

  const liveAnalysis = analyzePacketFlow(liveFlowEvents.value, { appendDestinationEndpoint: false })
  const liveSegments = buildLiveFlowSegmentsWithObservedDestinations(liveAnalysis.pathSteps)
  logComputedPacketFlowPath('live', liveSegments)
  liveFlowPath.value = uniquePathNodes(liveSegments.flat())
  liveFlowSegments.value = liveSegments
  liveFlowPathSteps.value = liveAnalysis.pathSteps
  refreshDisplayGraph()
}

function pruneStaleLiveFlows(nowMs: number) {
  const staleFlowKeys = Array.from(liveFlowLastSeenAtMs.entries())
    .filter(([, lastSeenAtMs]) => nowMs - lastSeenAtMs > LIVE_FLOW_STALE_MS)
    .map(([flowKey]) => flowKey)

  if (staleFlowKeys.length === 0) return

  staleFlowKeys.forEach((flowKey) => {
    liveFlowLastSeenAtMs.delete(flowKey)
    Array.from(liveFlowObservationSignatures.keys())
      .filter((observationKey) => observationKey.startsWith(`${flowKey}|`))
      .forEach((observationKey) => liveFlowObservationSignatures.delete(observationKey))
  })

  const staleFlowKeySet = new Set(staleFlowKeys)
  const nextEvents = liveFlowEvents.value.filter((event) => !staleFlowKeySet.has(getLiveFlowKey(event)))
  if (nextEvents.length === liveFlowEvents.value.length) return

  liveFlowEvents.value = nextEvents
  rebuildLiveFlowFromEvents()
}

function scheduleLiveFlowIdleReset() {
  clearLiveFlowIdleResetTimer()
  liveFlowIdleTimerId = window.setTimeout(() => {
    liveFlowIdleTimerId = undefined
    if (!trafficCaptureActive.value) return
    if (lastLivePacketReceivedAtMs <= 0) return
    if (Date.now() - lastLivePacketReceivedAtMs < LIVE_FLOW_IDLE_RESET_MS) {
      scheduleLiveFlowIdleReset()
      return
    }

    resetLiveFlowState()
    clearReplayFlash()
    lastLivePacketReceivedAtMs = 0
    packetReplayStatus.value = packetRecordingEnabled.value
      ? `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets.`
      : 'Live capture active. Waiting for packets...'
    refreshDisplayGraph()
  }, LIVE_FLOW_IDLE_RESET_MS)
}

function clearLiveFlowIdleResetTimer() {
  if (liveFlowIdleTimerId === undefined) return
  window.clearTimeout(liveFlowIdleTimerId)
  liveFlowIdleTimerId = undefined
}

function updateLiveFlowPathIfNeeded(event: EmulatorTopologyPacketReplayEvent) {
  const observationKey = getLiveFlowObservationKey(event)
  const observationSignature = getLiveFlowObservationSignature(event)
  if (!observationKey || !observationSignature) return false
  const signatureUnchanged = liveFlowObservationSignatures.get(observationKey) === observationSignature
  if (signatureUnchanged && canReuseLiveFlowPathForPacket(event)) return false

  liveFlowObservationSignatures.set(observationKey, observationSignature)
  liveFlowEvents.value.push(event)
  rebuildLiveFlowFromEvents()
  return true
}

function canReuseLiveFlowPathForPacket(event: EmulatorTopologyPacketReplayEvent) {
  const completePath = getCompleteLiveFlowPathForPacket(event)
  if (!completePath.length) return false
  return getPacketLocalPathFromCompletePath(event, completePath).length > 1
}

function getLiveFlowObservationKey(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getLiveFlowKey(event),
    makeObservationPart(event.containerName, event.containerId, event.nodeLabel, event.nodeName, event.nodeIp),
    makeObservationPart(event.networkId, event.networkName, event.networkLabel, event.ifName),
  ].join('|')
}

function getLiveFlowObservationSignature(event: EmulatorTopologyPacketReplayEvent) {
  return [
    getLiveFlowKey(event),
    event.containerId,
    event.containerName,
    event.ifName,
    event.nodeLabel,
    event.nodeName,
    event.nodeIp,
    event.networkId,
    event.networkName,
    event.networkLabel,
    event.sourceIp,
    event.destIp,
    event.ipProtocol,
    event.ipProtocolNumber,
    event.sourcePort,
    event.destPort,
    event.packetRole,
    event.packetKind,
    event.sourceContainerId,
    event.sourceContainerName,
    event.sourceNodeName,
    event.sourceNodeIp,
    event.destContainerId,
    event.destContainerName,
    event.destNodeName,
    event.destNodeIp,
  ].map((value) => String(value ?? '')).join('|')
}

function getLiveFlowKey(event: EmulatorTopologyPacketReplayEvent) {
  if (event.flowId) return event.flowId
  const protocol = (event.ipProtocol || String(event.ipProtocolNumber ?? '') || 'unknown').toLowerCase()
  const sourceEndpoint = makeLiveEndpointKey(event.sourceIp, event.sourcePort)
  const destEndpoint = makeLiveEndpointKey(event.destIp, event.destPort)
  if (!sourceEndpoint && !destEndpoint) {
    return `${protocol}|${event.containerId}`
  }
  return `${protocol}|${sourceEndpoint}|${destEndpoint}`
}

function makeLiveEndpointKey(ip: string | undefined, port: number | undefined) {
  return `${ip || ''}:${port ?? 0}`
}

function makeObservationPart(...values: Array<string | number | undefined>) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join('/')
}

function animatePacketHop(
  fromNodeId: string | undefined,
  toNodeId: string | undefined,
  position = packetReplayIndex.value,
) {
  const visualDurationMs = getCurrentReplayVisualDurationMs(position)
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    globeRef.value?.flashNode(toNodeId || fromNodeId || '', Math.min(1200, Math.max(16, visualDurationMs * 0.65)))
    return
  }

  globeRef.value?.animatePacketHop(fromNodeId, toNodeId, Math.max(1, visualDurationMs))
}

function playPacketReplayStep(position: number) {
  const targetIndex = Math.max(0, position - 1)
  const step = packetReplayPathSteps.value[targetIndex]
  const targetNodeId = step?.nodeId
  if (!targetNodeId) return

  if (!step.previousNodeId) {
    const visualDurationMs = getCurrentReplayVisualDurationMs(position)
    globeRef.value?.flashNode(targetNodeId, Math.min(1200, Math.max(16, visualDurationMs * 0.65)))
    return
  }

  logPacketReplayHop(step.previousNodeId, targetNodeId, step.event)
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

function playLivePacketAnimation(event: EmulatorTopologyPacketReplayEvent) {
  if (shouldSkipLivePacketAnimation(event)) return

  const completePath = getCompleteLiveFlowPathForPacket(event)
  if (!completePath.length) {
    enqueueLivePacketAnimation(event, getCapturedPacketNodePath(event), 'highlight')
    return
  }

  const localPath = getPacketLocalPathFromCompletePath(event, completePath)
  if (localPath.length > 1) {
    enqueueLivePacketAnimation(event, localPath, 'path')
  } else {
    enqueueLivePacketAnimation(event, getCapturedPacketNodePath(event), 'highlight')
  }
}

function enqueueLivePacketAnimation(
  event: EmulatorTopologyPacketReplayEvent,
  pathNodeIds: string[],
  mode: LivePacketAnimationJob['mode'],
) {
  if (!trafficCaptureActive.value) return
  const normalizedPath = getExistingLinkPath(pathNodeIds)
  if (mode === 'path' && normalizedPath.length < 2) return

  const queuedPath = mode === 'path' ? normalizedPath : uniquePathNodes(pathNodeIds)
  if (!queuedPath.length) return

  livePacketAnimationQueue.push({ event, pathNodeIds: queuedPath, mode })
  if (livePacketAnimationQueue.length > LIVE_PACKET_ANIMATION_QUEUE_LIMIT) {
    livePacketAnimationQueue.splice(0, livePacketAnimationQueue.length - LIVE_PACKET_ANIMATION_QUEUE_LIMIT)
  }
}

function startLivePacketFlasher() {
  if (livePacketFlasherTimerId !== undefined) return
  livePacketFlasherTimerId = window.setInterval(() => {
    flashNextLivePacketAnimation()
  }, LIVE_PACKET_FLASH_INTERVAL_MS)
}

function stopLivePacketFlasher() {
  if (livePacketFlasherTimerId === undefined) return
  window.clearInterval(livePacketFlasherTimerId)
  livePacketFlasherTimerId = undefined
}

function flashNextLivePacketAnimation() {
  if (!trafficCaptureActive.value) {
    clearLivePacketAnimationQueues()
    return
  }

  const flashingJobs = livePacketAnimationQueue.splice(0)
  if (flashingJobs.length === 0) return

  flashLivePacketJobs(flashingJobs)
}

function flashLivePacketJobs(jobs: LivePacketAnimationJob[]) {
  const highlightedNodeIds = new Set<string>()
  const packetPaths: string[][] = []

  jobs.forEach((job) => {
    if (job.mode === 'path' && job.pathNodeIds.length > 1) {
      logLivePacketPath(job.pathNodeIds, job.event)
      packetPaths.push(job.pathNodeIds)
    } else {
      job.pathNodeIds.forEach((nodeId) => highlightedNodeIds.add(nodeId))
    }
  })

  if (highlightedNodeIds.size > 0) {
    globeRef.value?.flashNodes(Array.from(highlightedNodeIds), LIVE_PACKET_FLASH_DURATION_MS)
  }

  if (packetPaths.length > 0) {
    globeRef.value?.animatePacketPaths(packetPaths, LIVE_PACKET_FLASH_DURATION_MS, LIVE_PACKET_HOP_DELAY_MS)
  }
}

function clearLivePacketAnimationQueues() {
  livePacketAnimationQueue.splice(0)
}

function logLivePacketPath(pathNodeIds: string[], event: EmulatorTopologyPacketReplayEvent) {
  if (!import.meta.env.DEV) return
  console.debug(`[packet live] ${pathNodeIds.map(getGraphNodeLabel).join(' -> ')}`, {
    protocol: event.ipProtocol || event.ipProtocolNumber || '-',
    packetRole: event.packetRole || '-',
    packetKind: event.packetKind || '-',
    sourceIp: event.sourceIp || '-',
    destIp: event.destIp || '-',
  })
}

function getCompleteLiveFlowPathForPacket(event: EmulatorTopologyPacketReplayEvent) {
  const flowKey = event.flowId
  if (!flowKey) return liveFlowSegments.value[0] ?? []
  const segment = liveFlowSegments.value.find((path) => {
    const destNodeId = resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp)
    return Boolean(destNodeId && path.includes(destNodeId))
  })
  return segment ?? []
}

function buildLiveFlowSegmentsWithObservedDestinations(steps: PacketFlowPathStep[]) {
  const stepsByFlow = new Map<string, PacketFlowPathStep[]>()
  steps.forEach((step) => {
    const flowSteps = stepsByFlow.get(step.flowKey) ?? []
    flowSteps.push(step)
    stepsByFlow.set(step.flowKey, flowSteps)
  })

  return Array.from(stepsByFlow.values())
    .map((flowSteps) => appendObservedDestinationEndpoint(pathFromLiveFlowSteps(flowSteps), flowSteps[flowSteps.length - 1]?.event))
    .filter((segment) => segment.length > 0)
}

function pathFromLiveFlowSteps(steps: PacketFlowPathStep[]) {
  const nodeIds: string[] = []
  steps.forEach((step) => {
    if (step.previousNodeId && !nodeIds.includes(step.previousNodeId)) {
      nodeIds.push(step.previousNodeId)
    }
    if (!nodeIds.includes(step.nodeId)) {
      nodeIds.push(step.nodeId)
    }
  })
  return nodeIds
}

function appendObservedDestinationEndpoint(pathNodeIds: string[], event: EmulatorTopologyPacketReplayEvent | undefined) {
  if (!event || pathNodeIds.length === 0) return pathNodeIds

  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  const destNodeId = resolveGraphNodeId(event.destContainerId, event.destContainerName, event.destNodeName, event.destNodeIp)
  if (!networkNodeId || !destNodeId || pathNodeIds.includes(destNodeId)) return pathNodeIds
  if (!pathNodeIds.includes(networkNodeId) || !hasGraphEdge(networkNodeId, destNodeId)) return pathNodeIds

  return uniquePathNodes([
    ...pathNodeIds,
    networkNodeId,
    destNodeId,
  ])
}

function hasGraphEdge(leftNodeId: string, rightNodeId: string) {
  return baseGraph.value.edges.some((edge) =>
    edge.from === leftNodeId && edge.to === rightNodeId ||
    edge.from === rightNodeId && edge.to === leftNodeId,
  )
}

function getPacketLocalPathFromCompletePath(
  event: EmulatorTopologyPacketReplayEvent,
  completePath: string[],
) {
  const containerNodeId = resolveGraphNodeId(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel)
  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  if (!containerNodeId || !networkNodeId) return []

  const networkIndex = completePath.indexOf(networkNodeId)
  const containerIndex = completePath.indexOf(containerNodeId)
  if (networkIndex < 0 || containerIndex < 0) return []

  if (containerIndex === networkIndex - 1) {
    const nextNodeId = completePath[networkIndex + 1]
    return getExistingLinkPath([containerNodeId, networkNodeId, nextNodeId])
  }

  if (containerIndex === networkIndex + 1) {
    const previousNodeId = completePath[networkIndex - 1]
    return getExistingLinkPath([previousNodeId, networkNodeId, containerNodeId])
  }

  return []
}

function getExistingLinkPath(nodeIds: Array<string | undefined>) {
  const path = uniquePathNodes(nodeIds.filter(Boolean) as string[])
  if (path.length < 2) return []
  for (let index = 1; index < path.length; index += 1) {
    if (!hasGraphEdge(path[index - 1]!, path[index]!)) return []
  }
  return path
}

function getCapturedPacketNodePath(event: EmulatorTopologyPacketReplayEvent) {
  const containerNodeId = resolveGraphNodeId(event.containerId, event.containerName, event.nodeName, event.nodeIp, event.nodeLabel)
  const networkNodeId = resolveGraphNodeId(event.networkId, event.networkName, event.networkLabel)
  return uniquePathNodes([containerNodeId, networkNodeId].filter(Boolean) as string[])
}

function shouldSkipLivePacketAnimation(event: EmulatorTopologyPacketReplayEvent) {
  return event.ipProtocol?.toLowerCase() === 'icmp' && event.packetRole?.toLowerCase() === 'reply'
}

function logPacketReplayHop(_fromNodeId: string, _toNodeId: string, _event: EmulatorTopologyPacketReplayEvent) {
  // console.log(
  //   `[packet replay] ${getGraphNodeLabel(fromNodeId)} -> ${getGraphNodeLabel(toNodeId)}`,
  //   {
  //     fromNodeId,
  //     toNodeId,
  //     protocol: event.ipProtocol || event.ipProtocolNumber || '-',
  //     packetRole: event.packetRole || '-',
  //     packetKind: event.packetKind || '-',
  //     sourceIp: event.sourceIp || '-',
  //     destIp: event.destIp || '-',
  //   },
  // )
}

function getGraphNodeLabel(nodeId: string) {
  const normalizedNodeId = nodeId.trim().toLowerCase()
  const node = baseGraph.value.nodes.find((item) =>
    item.id.toLowerCase() === normalizedNodeId ||
    item.sourceId?.toLowerCase() === normalizedNodeId ||
    item.label.toLowerCase() === normalizedNodeId ||
    item.searchText?.toLowerCase().includes(normalizedNodeId),
  )
  return node?.label || nodeId
}

function logComputedPacketFlowPath(source: 'live' | 'replay', segments: string[][]) {
  if (!import.meta.env.DEV) return
  const labeledSegments = segments.map((segment) => segment.map(getGraphNodeLabel))
  console.debug(`[packet flow path:${source}]`, labeledSegments.map((segment) => segment.join(' -> ')))
}

function playPacketReplayPacket(position: number) {
  playPacketReplayPacketAtIndex(Math.max(0, position - 1))
}

function playPacketReplayPacketAtIndex(packetIndex: number) {
  const event = packetReplayEvents.value[packetIndex]
  if (!event) return

  const eventSteps = packetReplayPathSteps.value.filter((step) => step.event === event)
  if (eventSteps.length > 0) {
    playPacketReplaySteps(eventSteps, packetIndex)
    return
  }

  const directPath = getPacketDirectPath(event)
  if (directPath.length === 0) return

  playPacketDirectPath(event, directPath, packetIndex)
}

function playPacketReplaySteps(steps: PacketFlowPathStep[], packetIndex: number) {
  const stepCount = Math.max(1, steps.length)
  const stepDelayMs = Math.max(1, getCurrentReplayVisualDurationMs(packetIndex + 1) / Math.max(2, stepCount + 1))

  steps.forEach((step, index) => {
    schedulePacketReplayCallback(() => {
      if (!step.previousNodeId) {
        globeRef.value?.flashNode(step.nodeId, Math.min(1200, Math.max(16, getCurrentReplayVisualDurationMs(packetIndex + 1) * 0.65)))
        return
      }
      logPacketReplayHop(step.previousNodeId, step.nodeId, step.event)
      animatePacketHop(step.previousNodeId, step.nodeId, packetIndex + 1)
    }, index * stepDelayMs)
  })
}

function playPacketDirectPath(event: EmulatorTopologyPacketReplayEvent, pathNodeIds: string[], packetIndex: number) {
  const stepCount = Math.max(1, pathNodeIds.length - 1)
  const stepDelayMs = Math.max(1, getCurrentReplayVisualDurationMs(packetIndex + 1) / Math.max(2, stepCount + 1))

  if (pathNodeIds.length === 1) {
    const nodeId = pathNodeIds[0]!
    console.log(`[packet replay] ${getGraphNodeLabel(nodeId)}`, {
      nodeId,
      protocol: event.ipProtocol || event.ipProtocolNumber || '-',
      packetRole: event.packetRole || '-',
      packetKind: event.packetKind || '-',
      sourceIp: event.sourceIp || '-',
      destIp: event.destIp || '-',
    })
    globeRef.value?.flashNode(nodeId, Math.min(1200, Math.max(16, getCurrentReplayVisualDurationMs(packetIndex + 1) * 0.65)))
    return
  }

  for (let index = 1; index < pathNodeIds.length; index += 1) {
    const fromNodeId = pathNodeIds[index - 1]!
    const toNodeId = pathNodeIds[index]!
    schedulePacketReplayCallback(() => {
      logPacketReplayHop(fromNodeId, toNodeId, event)
      animatePacketHop(fromNodeId, toNodeId, packetIndex + 1)
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

function getNextPacketReplayDelayMs(currentPosition: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return packetReplayIntervalMs.value
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

  const current = packetReplayPlaylist.value[currentPosition - 1]
  const next = packetReplayPlaylist.value[currentPosition]
  if (!current || !next) {
    return 0
  }

  return Math.max(MIN_REPLAY_TIMER_DELAY_MS, getSpeedAdjustedPacketDurationMs(current, next, packetReplayTimelineSpeed.value))
}

function getCurrentReplayVisualDurationMs(position: number) {
  if (packetReplayTimingMode.value === 'interval') {
    return packetReplayIntervalMs.value
  }
  if (packetReplayTimingMode.value === 'timeline') {
    if (isTimelineSpeedMode()) {
      const previous = packetReplayEvents.value[Math.max(0, position - 2)]
      const current = packetReplayEvents.value[Math.max(0, position - 1)]
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

  const currentIndex = Math.max(0, position - 1)
  const previous = packetReplayPlaylist.value[Math.max(0, currentIndex - 1)]
  const current = packetReplayPlaylist.value[currentIndex]
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

function rebuildPacketReplayFlow(events: EmulatorTopologyPacketReplayEvent[]) {
  const analysis = analyzePacketFlow(events)
  logComputedPacketFlowPath('replay', analysis.pathSegments)
  packetReplayPlaylist.value = analysis.pathEvents
  packetReplayFlowPath.value = analysis.nodePath
  packetReplayFlowSegments.value = analysis.pathSegments
  packetReplayPathSteps.value = analysis.pathSteps
  refreshDisplayGraph()
}

function ensurePacketReplayPlaylist() {
  if (!packetReplayPlaylist.value.length) {
    rebuildPacketReplayFlow(packetReplayEvents.value)
  }

  return packetReplayPlaylist.value
}

function ensureTimelinePacketReplayEvents() {
  packetReplayEvents.value = [...packetReplayEvents.value].sort((left, right) =>
    getPacketTimestampMs(left) - getPacketTimestampMs(right),
  )
  return packetReplayEvents.value
}

function clearReplayFlash() {
  globeRef.value?.flashNode('', 0)
  globeRef.value?.clearPacketAnimations()
  clearLivePacketAnimationQueues()
}

function isPageHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function suspendLiveVisualization() {
  if (liveVisualizationSuspended) return
  liveVisualizationSuspended = true
  if (packetReplayPlaying.value) {
    packetReplayPlaying.value = false
    cancelPacketReplayQueue()
  }
  resetLiveFlowState()
  clearReplayFlash()
  lastLivePacketReceivedAtMs = 0
  refreshDisplayGraph()
}

function deactivateLiveVisualization() {
  suspendLiveVisualization()
  disconnectTrafficObserver()
}

function resumeLiveVisualization() {
  if (!liveVisualizationSuspended) return
  liveVisualizationSuspended = false
  resetLiveFlowState()
  clearReplayFlash()
  lastLivePacketReceivedAtMs = 0
  if (trafficCaptureActive.value) {
    packetReplayStatus.value = packetRecordingEnabled.value
      ? `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets. Waiting for new packets...`
      : 'Live capture active. Waiting for packets...'
    startLivePacketFlasher()
  }
  refreshDisplayGraph()
}

function handleVisibilityChange() {
  if (isPageHidden()) {
    suspendLiveVisualization()
  } else {
    resumeLiveVisualization()
  }
}

function togglePacketRecording() {
  if (!trafficCaptureActive.value || packetReplayPlaying.value) return

  if (packetRecordingEnabled.value) {
    packetRecordingEnabled.value = false
    packetReplayStatus.value = `Recording paused at ${packetReplayEvents.value.length.toLocaleString()} packets.`
    return
  }

  packetReplayEvents.value = []
  packetReplayPlaylist.value = []
  packetReplayFlowPath.value = []
  packetReplayFlowSegments.value = []
  packetReplayPathSteps.value = []
  packetReplayIndex.value = 0
  packetRecordingEnabled.value = true
  packetReplayStatus.value = 'Recording live packets from now on...'
}

function connectTrafficObserver() {
  if (!trafficObserverClient) {
    trafficObserverClient = new TrafficObserverClient(
      handleLivePacket,
      () => {
        trafficFilterError.value = 'Traffic observer websocket connection failed.'
      },
    )
  }
  startLivePacketFlasher()
  trafficObserverClient.connect()
}

function disconnectTrafficObserver() {
  stopLivePacketFlasher()
  trafficObserverClient?.disconnect()
}

async function loadTrafficFilter() {
  try {
    const response = await fetchTrafficObserverFilter()
    trafficFilterInput.value = response.filter ?? ''
    trafficCaptureActive.value = Boolean(trafficFilterInput.value.trim())
    trafficFilterStatus.value = trafficCaptureActive.value
      ? `Live capture active: ${trafficFilterInput.value}`
      : 'Submit a filter to start live capture.'
    if (trafficCaptureActive.value) connectTrafficObserver()
  } catch {
    trafficFilterStatus.value = 'Traffic filter status unavailable.'
  }
}

async function submitTrafficFilter() {
  trafficFilterSubmitting.value = true
  trafficFilterError.value = ''
  try {
    const filter = trafficFilterInput.value.trim()
    const response = await setTrafficObserverFilter(filter)
    trafficFilterInput.value = response.filter ?? filter
    trafficCaptureActive.value = Boolean(trafficFilterInput.value)
    trafficFilterStatus.value = trafficCaptureActive.value
      ? `Live capture active: ${trafficFilterInput.value}`
      : 'Live capture stopped.'
    if (trafficCaptureActive.value) {
      packetReplayEvents.value = []
      packetReplayPlaylist.value = []
      packetReplayFlowPath.value = []
      packetReplayFlowSegments.value = []
      packetReplayPathSteps.value = []
      resetLiveFlowState()
      packetReplayIndex.value = 0
      packetRecordingEnabled.value = false
      clearReplayFlash()
      lastLivePacketReceivedAtMs = 0
      packetReplayStatus.value = 'Live capture is active. Click record to save packets for replay.'
      refreshDisplayGraph()
      connectTrafficObserver()
    } else {
      stopPacketReplay()
      packetRecordingEnabled.value = false
      resetLiveFlowState()
      clearReplayFlash()
      lastLivePacketReceivedAtMs = 0
      packetReplayStatus.value = 'Submit a filter, then record live packets for replay.'
      refreshDisplayGraph()
      disconnectTrafficObserver()
    }
  } catch (error) {
    trafficFilterError.value = error instanceof Error ? error.message : String(error)
  } finally {
    trafficFilterSubmitting.value = false
  }
}

watch(
  () => [
    visibleTypes.value.ix,
    visibleTypes.value.network,
    visibleTypes.value.router,
    visibleTypes.value.host,
  ],
  () => {
    if (!topologyLoaded.value) return
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
  packetRecordingEnabled.value = false
  stopPacketReplay()
  clearReplayFlash()
  disconnectTrafficObserver()
  loadingVisible.value = false
})

onDeactivated(() => {
  deactivateLiveVisualization()
})

onActivated(() => {
  if (!trafficCaptureActive.value) return
  resumeLiveVisualization()
  connectTrafficObserver()
})

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  await nextTick()
  initConsoleWindowManager()
  await Promise.all([
    loadTrafficFilter(),
    loadDockerTopology(),
  ])
})
</script>

<template>
  <main class="emulator-topology-3d-page" data-testid="live-emulator-topology-3d-page">
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
      actions-enabled
      @refresh="loadDockerTopology"
      @launch-console="launchContainerConsole"
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
      bottom-offset="58px"
      :title="props.title"
      :stats="stats"
      :as-summaries="asSummaries"
      :ix-summaries="ixSummaries"
      :as-details-by-asn="asDetailsByAsn"
      :selected-asns="selectedAsns"
      :selected-ix-names="selectedIxNames"
      :selected-node-summary="selectedNodeSummary"
      :query-search-suggestions="querySearchSuggestions"
      traffic-mode="live"
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
      :traffic-recording-enabled="packetRecordingEnabled"
      :traffic-packet-count="packetReplayStepCount"
      :traffic-playback-enabled="packetReplayPlaying"
      :traffic-playback-paused="!packetReplayPlaying"
      @refresh="reloadDockerTopology"
      @clear-topology-filters="clearTopologyFilters"
      @apply-search="applySearch"
      @clear-search="clearSearch"
      @submit-search-from-keyboard="submitSearchFromKeyboard"
      @select-search-suggestion="selectSearchSuggestion"
      @traffic-submit-filter="submitTrafficFilter"
      @traffic-toggle-recording="togglePacketRecording"
      @traffic-toggle-playback="togglePacketReplay"
      @traffic-stop-playback="stopPacketReplay"
      @traffic-clear-playback="clearPacketReplay"
      @traffic-jump-playback="jumpPacketReplay"
      @traffic-update-seek-position="showPacketReplayEventAt"
      @traffic-seek-position="showPacketReplayEventAt"
    >
      <template #after-header>
        <p v-if="topologyLoadError" class="emulator-topology-3d-error">
          {{ topologyLoadError }}
        </p>
      </template>
    </EmulatorTopologyDock>

    <LoadingOverlay :visible="loadingVisible" />
    <div id="globe-console-area" class="console-area"></div>
    <div id="globe-console-taskbar" class="taskbar hide"></div>
  </main>
</template>

<style scoped lang="scss" src="./styles/emulator-topology-3d.scss"></style>
<style lang="scss">
@use '@/style/common/window-manager.css' as *;

.console-area {
  position: fixed;
  inset: 0;
  z-index: 90000;
  pointer-events: none;
}

.console-area .console-window {
  pointer-events: auto;
}
</style>
