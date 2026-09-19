<script setup lang="ts">
import EmulatorTopologyPage from '../components/EmulatorTopologyPage.vue'
import type { Map3DSceneMode } from '../services/cesiumScene'
import { createLiveTopologySource, createLiveTrafficSource } from '../services/emulatorTopologyPageAdapters'

const topologySource = createLiveTopologySource()
const trafficSource = createLiveTrafficSource()

withDefaults(defineProps<{
  sceneMode?: Map3DSceneMode
  title?: string
}>(), {
  sceneMode: 'globe',
  title: 'Live Emulator Topology Globe',
})
</script>

<template>
  <EmulatorTopologyPage
    :topology-source="topologySource"
    :traffic-source="trafficSource"
    :scene-mode="sceneMode"
    :title="title"
  />
</template>
