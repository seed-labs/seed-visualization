<script setup lang="ts">
import UploadMap3DGlobe from '@/components/UploadMap3DGlobe/index.vue'
import InternetMap3DToolbar from '@/components/InternetMap3DToolbar/index.vue'
import { useIxMap3DUi } from './ui'

const {
  nodeScale,
  showRouterLabels,
  settingsOpen,
  loadingVisible,
  graph,
  ixOptions,
  selectedIxLabels,
  expandedRouterParentIds,
  ixCount,
  orientToInitialNode,
  ixCountMax,
  loadMap,
  renderWithLoading,
  applyIxCount,
  applyIxSelection,
  onGlobeRendered,
  onGlobeNodeClick,
} = useIxMap3DUi()
</script>

<template>
  <main class="ix-map-3d-page">
    <UploadMap3DGlobe
      :graph="graph"
      :node-scale="nodeScale"
      :show-router-labels="showRouterLabels"
      :expanded-router-parent-ids="expandedRouterParentIds"
      :orient-to-graph="orientToInitialNode"
      @rendered="onGlobeRendered"
      @node-click="onGlobeNodeClick"
    />

    <InternetMap3DToolbar
      v-model:node-scale="nodeScale"
      v-model:show-router-labels="showRouterLabels"
      v-model:settings-open="settingsOpen"
      v-model:ix-count="ixCount"
      v-model:selected-ix-labels="selectedIxLabels"
      title="3D IX Map"
      :node-count="graph.nodes.length"
      :edge-count="graph.edges.length"
      :ix-options="ixOptions"
      :ix-count-max="ixCountMax"
      :show-ix-controls="true"
      :confirm-disabled="selectedIxLabels.length === 0"
      @reload="loadMap"
      @confirm="renderWithLoading"
      @ix-count-change="applyIxCount"
      @ix-selection-change="applyIxSelection"
    />

    <section v-if="loadingVisible" class="ix-map-3d-loading">
      <div class="ix-map-3d-loading-box">
        <span class="ix-map-3d-loading-spinner" />
        <strong>Loading...</strong>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss" src="./styles/ix-map-3d.scss"></style>
