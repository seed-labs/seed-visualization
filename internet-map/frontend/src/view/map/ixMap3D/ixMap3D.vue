<script setup lang="ts">
import { RefreshRight, Setting } from '@element-plus/icons-vue'
import UploadMap3DGlobe from '@/view/map/uploadMap/components/UploadMap3DGlobe.vue'
import { useIxMap3DUi } from './ui'

const {
  nodeScale,
  showRouterNodes,
  settingsOpen,
  loadingVisible,
  graph,
  ixOptions,
  selectedIxLabels,
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
      :show-router-nodes="showRouterNodes"
      :orient-to-graph="orientToInitialNode"
      @rendered="onGlobeRendered"
      @node-click="onGlobeNodeClick"
    />

    <section class="ix-map-3d-toolbar">
      <div class="ix-map-3d-summary">
        <strong>3D IX Map</strong>
        <span>{{ graph.nodes.length }} nodes / {{ graph.edges.length }} links</span>
      </div>
      <div class="ix-map-3d-controls">
        <el-tooltip content="Settings" placement="bottom">
          <el-button
            class="ix-map-3d-icon-button"
            :class="{ 'is-active': settingsOpen }"
            :icon="Setting"
            circle
            size="small"
            @click="settingsOpen = !settingsOpen"
          />
        </el-tooltip>
        <el-button
          class="ix-map-3d-reload-button"
          :icon="RefreshRight"
          size="small"
          @click="loadMap"
        >
          Reload
        </el-button>
      </div>

      <section v-show="settingsOpen" class="ix-map-3d-settings">
        <label class="ix-map-3d-slider">
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

        <el-checkbox v-model="showRouterNodes" class="ix-map-3d-check">
          Router nodes
        </el-checkbox>

        <label class="ix-map-3d-count">
          <span>Num of IX</span>
          <el-input-number
            v-model="ixCount"
            :min="0"
            :max="ixCountMax"
            size="small"
            @change="applyIxCount"
          />
        </label>

        <div class="ix-map-3d-ix-select">
          <span>IX</span>
          <div class="ix-map-3d-ix-action">
            <el-select
              v-model="selectedIxLabels"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              clearable
              placeholder="Select IX"
              @change="applyIxSelection"
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
              :disabled="selectedIxLabels.length === 0"
              @click="renderWithLoading"
            >
              Confirm
            </el-button>
          </div>
        </div>
      </section>
    </section>

    <section v-if="loadingVisible" class="ix-map-3d-loading">
      <div class="ix-map-3d-loading-box">
        <span class="ix-map-3d-loading-spinner" />
        <strong>Loading...</strong>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss" src="./styles/ix-map-3d.scss"></style>
