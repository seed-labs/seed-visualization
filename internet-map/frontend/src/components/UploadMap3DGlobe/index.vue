<template>
  <section ref="containerRef" class="upload-map-3d-globe" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, ref } from 'vue'
import { ScreenSpaceEventType } from 'cesium'
import { createUploadMap3DScene, type UploadMap3DSceneApi } from '@/view/map/uploadMap/services/cesiumScene'
import type { GlobeGraph, GlobeNode } from '@/view/map/uploadMap/services/globeGraph'

const props = defineProps<{
  graph: GlobeGraph
  nodeScale?: number
  showRouterNodes?: boolean
  orientToGraph?: boolean
}>()
const emit = defineEmits<{
  rendered: [graph: GlobeGraph]
  nodeClick: [node: GlobeNode]
}>()

const containerRef = ref<HTMLElement>()
let sceneApi: UploadMap3DSceneApi | undefined

function render() {
  const renderedGraph = props.graph
  sceneApi?.renderGraph(renderedGraph, props.nodeScale, props.showRouterNodes)
  if (props.orientToGraph && renderedGraph.nodes.length > 0) {
    sceneApi?.orientToGraph(renderedGraph)
  }
  requestAnimationFrame(() => {
    emit('rendered', renderedGraph)
  })
}

onMounted(() => {
  if (!containerRef.value) return
  sceneApi = createUploadMap3DScene(containerRef.value)
  sceneApi.viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  sceneApi.onNodeClick((node) => emit('nodeClick', node))
  render()
})

watch(() => [props.graph, props.nodeScale, props.showRouterNodes, props.orientToGraph], render, { deep: false })

onBeforeUnmount(() => {
  sceneApi?.destroy()
})
</script>

<style scoped lang="scss" src="@/view/map/uploadMap/styles/upload-map-3d-globe.scss"></style>
