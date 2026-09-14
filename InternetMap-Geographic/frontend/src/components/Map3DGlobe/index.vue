<template>
  <section ref="containerRef" class="map-globe" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, ref } from 'vue'
import { ScreenSpaceEventType } from 'cesium'
import {
  createMap3DScene,
  type Map3DRenderOptions,
  type Map3DSceneApi,
  type Map3DSceneMode,
} from '@/view/map/shared/services/cesiumScene'
import type { GlobeGraph, GlobeNode } from '@/view/map/shared/services/globeGraph'
import type { EmulatorTopologyVisibleTypes } from '@/view/map/shared/services/emulatorTopologyGraph'

const props = defineProps<{
  graph: GlobeGraph
  nodeScale?: number
  showRouterLabels?: boolean
  showNodeLabels?: boolean
  expandedRouterParentIds?: string[]
  orientToGraph?: boolean
  sceneMode?: Map3DSceneMode
  hoverEnabled?: boolean
  visibleTypes?: EmulatorTopologyVisibleTypes
}>()
const emit = defineEmits<{
  rendered: [graph: GlobeGraph]
  nodeClick: [node: GlobeNode]
  nodeHover: [node: GlobeNode | undefined, position: { x: number; y: number }]
}>()

const containerRef = ref<HTMLElement>()
let sceneApi: Map3DSceneApi | undefined
let removeRenderedListener: (() => void) | undefined

function render() {
  const renderedGraph = props.graph
  const options: Map3DRenderOptions = {
    nodeScale: props.nodeScale,
    showRouterLabels: props.showRouterLabels,
    showNodeLabels: props.showNodeLabels,
    expandedRouterParentIds: props.expandedRouterParentIds,
  }
  sceneApi?.renderGraph(renderedGraph, options)
  sceneApi?.setTopologyVisibility(props.visibleTypes)
  if (props.orientToGraph && renderedGraph.nodes.length > 0) {
    sceneApi?.orientToGraph(renderedGraph)
  }
  // A queued animation callback is not proof that Cesium has drawn the graph.
  // Keep the loading overlay until the first actual frame is complete.
  removeRenderedListener?.()
  removeRenderedListener = sceneApi?.viewer.scene.postRender.addEventListener(() => {
    removeRenderedListener?.()
    removeRenderedListener = undefined
    emit('rendered', renderedGraph)
  })
}

function flashNode(nodeId: string, durationMs?: number) {
  sceneApi?.flashNode(nodeId, durationMs)
}

function flashNodes(nodeIds: string[], durationMs?: number) {
  sceneApi?.flashNodes(nodeIds, durationMs)
}

function animatePacketHop(fromNodeId: string, toNodeId: string, durationMs?: number) {
  sceneApi?.animatePacketHop(fromNodeId, toNodeId, durationMs)
}

function animatePacketPath(nodeIds: string[], durationMs?: number, hopDelayMs?: number) {
  sceneApi?.animatePacketPath(nodeIds, durationMs, hopDelayMs)
}

function animatePacketPaths(paths: string[][], durationMs?: number, hopDelayMs?: number) {
  sceneApi?.animatePacketPaths(paths, durationMs, hopDelayMs)
}

function clearPacketAnimations() {
  sceneApi?.clearPacketAnimations()
}

function orientToNode(nodeId: string, height?: number) {
  sceneApi?.orientToNode(nodeId, height)
}

onMounted(() => {
  if (!containerRef.value) return
  sceneApi = createMap3DScene(containerRef.value, {
    mode: props.sceneMode,
  })
  sceneApi.viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  sceneApi.onNodeClick((node) => emit('nodeClick', node))
  sceneApi.onNodeHover((node, position) => emit('nodeHover', node, position))
  sceneApi.setHoverEnabled(props.hoverEnabled ?? true)
  render()
})

watch(
  () => [
    props.graph,
    props.nodeScale,
    props.showRouterLabels,
    props.showNodeLabels,
    props.expandedRouterParentIds,
    props.orientToGraph,
  ],
  render,
  { deep: false },
)

watch(() => props.hoverEnabled, enabled => sceneApi?.setHoverEnabled(enabled ?? true))
watch(
  () => [props.visibleTypes?.ix, props.visibleTypes?.network, props.visibleTypes?.router, props.visibleTypes?.host],
  () => sceneApi?.setTopologyVisibility(props.visibleTypes),
)

onBeforeUnmount(() => {
  removeRenderedListener?.()
  sceneApi?.destroy()
})

defineExpose({
  animatePacketHop,
  animatePacketPath,
  animatePacketPaths,
  clearPacketAnimations,
  flashNode,
  flashNodes,
  orientToNode,
})
</script>

<style scoped lang="scss" src="./map-3d-globe.scss"></style>
