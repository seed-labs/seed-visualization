<script setup lang="ts" xmlns="http://www.w3.org/1999/html">
import {nextTick, onBeforeUnmount, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {RefreshRight, Setting} from '@element-plus/icons-vue'
import BaseUploadMap from '@/components/BaseUploadMap/index.vue'
import UploadMap3DGlobe from '@/components/UploadMap3DGlobe/index.vue'
import {filterGraphByIXRoutersData, MapUi, type UploadMapUiOtherConfiguration} from './ui'
import {DataSource} from './datasource'
import {createGlobeGraph, type GlobeGraph} from './services/globeGraph'
import {allLoading} from '@/utils/tools'
import type {Edge, Vertex} from '@/utils/map-datasource'

const uploadMapUiOtherConfiguration: UploadMapUiOtherConfiguration = {}
const mapData = ref()
const displayMode = ref<'2d' | '3d'>()
const showAllNodes = ref(false)
const nodeScale = ref(2)
const showRouterNodes = ref(true)
const settingsOpen = ref(false)
const globeGraph = ref<GlobeGraph>({nodes: [], edges: []})
const globeLoadingVisible = ref(false)
const ixOptions = ref<{ label: string; value: string }[]>([])
const selected3DIxLabels = ref<string[]>([])
let globeLoading: ReturnType<typeof allLoading> | undefined
let cached3DGraphSource: { vertices: Vertex[]; edges: Edge[] } | undefined

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })
}

async function chooseDisplayMode() {
  try {
    await ElMessageBox.confirm(
        'The file has been parsed successfully. Which display mode do you want to use?',
        'Display Mode',
        {
          confirmButtonText: '3D Globe',
          cancelButtonText: '2D Plane',
          distinguishCancelAndClose: true,
          type: 'info',
        },
    )
    displayMode.value = '3d'
  } catch (action) {
    if (action === 'cancel') {
      displayMode.value = '2d'
      return
    }
    throw action
  }
}

async function chooseNodeScope() {
  try {
    await ElMessageBox.confirm(
        'Do you want to display all the nodes of the Internet Map?',
        'Display Node Scope',
        {
          confirmButtonText: 'All Nodes',
          cancelButtonText: 'Simplified Nodes',
          distinguishCancelAndClose: true,
          type: 'info',
        },
    )
    showAllNodes.value = true
  } catch (action) {
    if (action === 'cancel') {
      showAllNodes.value = false
      return
    }
    throw action
  }
}

function set3DIxOptions(mapUi: MapUi) {
  ixOptions.value = mapUi.getIxs()
      .map((ix: any) => ({
        label: ix.meta?.emulatorInfo?.displayname ?? ix.meta?.emulatorInfo?.name,
        value: ix.meta?.emulatorInfo?.name,
      }))
      .filter((item: { label?: string; value?: string }) => item.label && item.value)
  selected3DIxLabels.value = []
}

async function createGraphData(data: unknown): Promise<GlobeGraph> {
  const graphData = await createGraphSource(data)
  return createGlobeGraph(graphData.vertices, graphData.edges)
}

async function createGraphSource(data: unknown): Promise<{ vertices: Vertex[]; edges: Edge[] }> {
  const datasource = new DataSource()
  datasource.setVisData(data as any)
  await datasource.connect()

  return {
    vertices: datasource.vertices,
    edges: datasource.edges,
  }
}

async function getCached3DGraphSource() {
  if (!cached3DGraphSource) {
    cached3DGraphSource = await createGraphSource(mapData.value)
  }
  return cached3DGraphSource
}

async function handleParsedMap(value: unknown, parsedMapUi?: any) {
  try {
    await chooseDisplayMode()
    await chooseNodeScope()

    if (showAllNodes.value) {
      globeLoading?.close()
      globeLoading = allLoading()
      globeLoadingVisible.value = true
      parsedMapUi?.setAllLoadingInstance?.(globeLoading)
      await nextTick()
      await waitForBrowserPaint()
    }

    if (displayMode.value === '3d') {
      if (!showAllNodes.value) {
        set3DIxOptions(parsedMapUi as MapUi)
        settingsOpen.value = true
      }

      mapData.value = value
      cached3DGraphSource = undefined
      globeGraph.value = {nodes: [], edges: []}
      await nextTick()
      await waitForBrowserPaint()

      try {
        await nextTick()
        await waitForBrowserPaint()
        if (showAllNodes.value) {
          globeGraph.value = await createGraphData(value)
        } else {
          globeGraph.value = {nodes: [], edges: []}
        }
        if (globeGraph.value.nodes.length === 0) {
          ElMessage.warning('No IX nodes with geographic coordinates were found.')
        }
      } catch (error) {
        console.error('3D graph calculation failed:', error)
        ElMessage.error('3D graph calculation failed. Please try Simplified Nodes or reload the file.')
        globeLoading?.close()
        globeLoading = undefined
        globeLoadingVisible.value = false
      }
      return 'skip'
    }

    return showAllNodes.value ? 'all' : 'manual'
  } catch {
    mapData.value = undefined
    displayMode.value = undefined
    showAllNodes.value = false
    nodeScale.value = 2
    showRouterNodes.value = true
    settingsOpen.value = false
    globeGraph.value = {nodes: [], edges: []}
    ixOptions.value = []
    selected3DIxLabels.value = []
    cached3DGraphSource = undefined
    globeLoading?.close()
    globeLoading = undefined
    globeLoadingVisible.value = false
    return 'skip'
  }
}

async function update3DIxGraph() {
  if (showAllNodes.value || !mapData.value) return
  if (selected3DIxLabels.value.length === 0) {
    globeGraph.value = {nodes: [], edges: []}
    return
  }

  globeLoadingVisible.value = true
  await nextTick()
  await waitForBrowserPaint()

  try {
    const {vertices, edges} = await getCached3DGraphSource()
    const {filteredNodes, filteredEdges} = filterGraphByIXRoutersData(vertices, edges, selected3DIxLabels.value)
    globeGraph.value = createGlobeGraph(filteredNodes, filteredEdges)
  } catch (error) {
    console.error('3D IX graph calculation failed:', error)
    ElMessage.error('3D IX graph calculation failed.')
  } finally {
    globeLoadingVisible.value = false
  }
}

function onGlobeRendered() {
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
}

onBeforeUnmount(() => {
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
})

function resetUpload() {
  mapData.value = undefined
  displayMode.value = undefined
  showAllNodes.value = false
  nodeScale.value = 2
  showRouterNodes.value = true
  settingsOpen.value = false
  globeGraph.value = {nodes: [], edges: []}
  ixOptions.value = []
  selected3DIxLabels.value = []
  cached3DGraphSource = undefined
  globeLoading?.close()
  globeLoading = undefined
  globeLoadingVisible.value = false
}
</script>

<template>
  <main v-if="displayMode === '3d' && mapData" class="upload-map-3d-page">
    <UploadMap3DGlobe
        :graph="globeGraph"
        :node-scale="nodeScale"
        :show-router-nodes="showRouterNodes"
        @rendered="onGlobeRendered"
    />
    <section class="upload-map-3d-toolbar">
      <div class="upload-map-3d-summary">
        <strong>3D Internet Map</strong>
        <span>{{ globeGraph.nodes.length }} nodes / {{ globeGraph.edges.length }} links</span>
      </div>
      <div class="upload-map-3d-controls">
        <el-tooltip content="Settings" placement="bottom">
          <el-button
              class="upload-map-3d-icon-button"
              :class="{ 'is-active': settingsOpen }"
              :icon="Setting"
              circle
              size="small"
              @click="settingsOpen = !settingsOpen"
          />
        </el-tooltip>
        <el-button
            class="upload-map-3d-reload-button"
            :icon="RefreshRight"
            size="small"
            @click="resetUpload"
        >
          Reload
        </el-button>
      </div>

      <section v-show="settingsOpen" class="upload-map-3d-settings">
        <label class="upload-map-3d-slider">
          <span>Node / link scale</span>
          <el-slider
              v-model="nodeScale"
              :min="0.5"
              :max="4"
              :step="0.1"
              :show-tooltip="false"
          />
          <output>{{ nodeScale.toFixed(1) }}x</output>
        </label>
        <el-checkbox v-model="showRouterNodes" class="upload-map-3d-check">
          Router nodes
        </el-checkbox>
        <div v-if="!showAllNodes" class="upload-map-3d-ix-select">
          <span>IX</span>
          <div class="upload-map-3d-ix-action">
            <el-select
                v-model="selected3DIxLabels"
                multiple
                collapse-tags
                collapse-tags-tooltip
                filterable
                clearable
                placeholder="Select IX"
            >
              <el-option
                  v-for="item in ixOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
            <el-button
                size="small"
                type="primary"
                :disabled="selected3DIxLabels.length === 0"
                @click="update3DIxGraph"
            >
              Confirm
            </el-button>
          </div>
        </div>
      </section>
    </section>
    <section v-if="globeLoadingVisible" class="upload-map-3d-loading">
      <div class="upload-map-3d-loading-box">
        <span class="upload-map-3d-loading-spinner"/>
        <strong>Loading...</strong>
      </div>
    </section>
  </main>

  <BaseUploadMap
      v-else
      ref="mapRef"
      :map-ui-class="MapUi"
      :data-source-class="DataSource"
      :other-config="uploadMapUiOtherConfiguration"
      :on-parsed-map="handleParsedMap"
  />
</template>

<style scoped lang="scss" src="./styles/upload-map-3d.scss"></style>
