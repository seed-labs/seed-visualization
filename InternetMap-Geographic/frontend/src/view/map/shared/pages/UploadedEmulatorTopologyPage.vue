<script setup lang="ts">
import EmulatorTopologyPage from '../components/EmulatorTopologyPage.vue'
import type { Map3DSceneMode } from '../services/cesiumScene'
import { createUploadTopologySource, createUploadTrafficSource } from '../services/emulatorTopologyPageAdapters'

const topologySource = createUploadTopologySource()
const trafficSource = createUploadTrafficSource()

withDefaults(defineProps<{
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
</script>

<template>
  <EmulatorTopologyPage
    :topology-source="topologySource"
    :traffic-source="trafficSource"
    :scene-mode="sceneMode"
    :title="title"
    :upload-title="uploadTitle"
    :upload-description="uploadDescription"
  />
</template>
