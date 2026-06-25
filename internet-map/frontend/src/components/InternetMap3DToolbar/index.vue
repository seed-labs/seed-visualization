<script setup lang="ts">
import { RefreshRight, Setting } from '@element-plus/icons-vue'

defineProps<{
  title: string
  nodeCount: number
  edgeCount: number
  ixOptions?: { label: string; value: string }[]
  ixCountMax?: number
  showIxControls?: boolean
  confirmDisabled?: boolean
  reloadText?: string
}>()

const nodeScale = defineModel<number>('nodeScale', { required: true })
const showRouterLabels = defineModel<boolean>('showRouterLabels', { required: true })
const settingsOpen = defineModel<boolean>('settingsOpen', { required: true })
const ixCount = defineModel<number>('ixCount', { required: true })
const selectedIxLabels = defineModel<string[]>('selectedIxLabels', { required: true })

const emit = defineEmits<{
  reload: []
  confirm: []
  ixCountChange: [value: number | undefined]
  ixSelectionChange: []
}>()
</script>

<template>
  <section class="internet-map-3d-toolbar">
    <div class="internet-map-3d-summary">
      <strong>{{ title }}</strong>
      <span>{{ nodeCount }} nodes / {{ edgeCount }} links</span>
    </div>
    <div class="internet-map-3d-controls">
      <el-tooltip content="Settings" placement="bottom">
        <el-button
          class="internet-map-3d-icon-button"
          :class="{ 'is-active': settingsOpen }"
          :icon="Setting"
          circle
          size="small"
          @click="settingsOpen = !settingsOpen"
        />
      </el-tooltip>
      <el-button
        class="internet-map-3d-reload-button"
        :icon="RefreshRight"
        size="small"
        @click="emit('reload')"
      >
        {{ reloadText ?? 'Reload' }}
      </el-button>
    </div>

    <section v-show="settingsOpen" class="internet-map-3d-settings">
      <label class="internet-map-3d-slider">
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

      <el-checkbox v-model="showRouterLabels" class="internet-map-3d-check">
        Router labels
      </el-checkbox>

      <label v-if="showIxControls" class="internet-map-3d-count">
        <span>Num of IX</span>
        <el-input-number
          v-model="ixCount"
          :min="0"
          :max="ixCountMax ?? 0"
          size="small"
          @change="emit('ixCountChange', ixCount)"
        />
      </label>

      <div v-if="showIxControls" class="internet-map-3d-ix-select">
        <span>IX</span>
        <div class="internet-map-3d-ix-action">
          <el-select
            v-model="selectedIxLabels"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            clearable
            placeholder="Select IX"
            @change="emit('ixSelectionChange')"
          >
            <el-option
              v-for="item in ixOptions ?? []"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button
            size="small"
            type="primary"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            Confirm
          </el-button>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped lang="scss" src="./styles.scss"></style>
