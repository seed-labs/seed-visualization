<template>
  <section class="emulator-topology-3d-dock-page">
    <div class="emulator-topology-3d-search">
      <el-autocomplete
        v-model="keyword"
        :fetch-suggestions="querySearchSuggestions"
        :trigger-on-focus="false"
        :teleported="false"
        popper-class="emulator-topology-3d-search-popper"
        fit-input-width
        clearable
        placeholder="Search name, AS, role, IP, or container ID"
        data-testid="emulator-topology-3d-search"
        @keyup.enter="$emit('submitSearchFromKeyboard', $event)"
        @clear="$emit('clearSearch')"
        @select="$emit('selectSearchSuggestion', $event)"
      >
        <template #default="{ item }">
          <div class="emulator-topology-3d-search-suggestion">
            <strong>{{ item.label }}</strong>
            <small>{{ item.detail }}</small>
          </div>
        </template>
      </el-autocomplete>
      <el-button type="primary" :icon="Search" @click="$emit('applySearch')">Search</el-button>
    </div>

    <section class="emulator-topology-3d-types">
      <span>Node visibility</span>
      <div class="emulator-topology-3d-visibility-options">
        <el-checkbox v-model="ixVisible">IX</el-checkbox>
        <el-tooltip
          content="Ordinary network nodes require router nodes to be visible."
          placement="top"
          :disabled="routerVisible"
        >
          <span class="emulator-topology-3d-checkbox-wrap">
            <el-checkbox v-model="networkVisible" :disabled="!routerVisible">Network</el-checkbox>
          </span>
        </el-tooltip>
        <el-checkbox v-model="routerVisible">Router</el-checkbox>
        <el-checkbox v-model="hostVisible">Host</el-checkbox>
      </div>
    </section>

    <label class="emulator-topology-3d-field">
      <span>Node / link scale</span>
      <el-slider v-model="nodeScale" :min="0.5" :max="4" :step="0.1" :show-tooltip="false" />
    </label>

    <el-checkbox v-model="showNodeLabels" class="emulator-topology-3d-label-toggle">
      Node labels
    </el-checkbox>

    <el-checkbox v-model="showHoverDetails" class="emulator-topology-3d-label-toggle">
      Hover details
    </el-checkbox>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { TopologySearchSuggestion } from '@/view/map/shared/services/topologySearch'
import type {
  EmulatorTopologyVisibleTypesModel,
  TopologySearchSuggestionProvider,
} from '@/view/map/shared/types/emulatorTopologyDockTypes'

defineProps<{
  querySearchSuggestions: TopologySearchSuggestionProvider
}>()

const keyword = defineModel<string>('keyword', { required: true })
const visibleTypes = defineModel<EmulatorTopologyVisibleTypesModel>('visibleTypes', { required: true })
const nodeScale = defineModel<number>('nodeScale', { required: true })
const showNodeLabels = defineModel<boolean>('showNodeLabels', { required: true })
const showHoverDetails = defineModel<boolean>('showHoverDetails', { required: true })

defineEmits<{
  applySearch: []
  clearSearch: []
  submitSearchFromKeyboard: [event: KeyboardEvent]
  selectSearchSuggestion: [suggestion: TopologySearchSuggestion]
}>()

function updateVisibleTypes(patch: Partial<EmulatorTopologyVisibleTypesModel>) {
  visibleTypes.value = {
    ...visibleTypes.value,
    ...patch,
  }
}

const ixVisible = computed({
  get: () => visibleTypes.value.ix,
  set: (value: boolean) => updateVisibleTypes({ ix: value }),
})

const networkVisible = computed({
  get: () => visibleTypes.value.network,
  set: (value: boolean) => updateVisibleTypes({ network: value }),
})

const routerVisible = computed({
  get: () => visibleTypes.value.router,
  set: (value: boolean) => updateVisibleTypes({ router: value }),
})

const hostVisible = computed({
  get: () => visibleTypes.value.host,
  set: (value: boolean) => updateVisibleTypes({ host: value }),
})
</script>

<style scoped lang="scss">
.emulator-topology-3d-dock-page {
  flex: 1 1 auto;
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.emulator-topology-3d-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;

  :deep(.el-autocomplete),
  :deep(.el-input) {
    width: 100%;
    min-width: 0;
  }

  :deep(.el-input__wrapper) {
    background: rgba(6, 20, 32, 0.72);
    box-shadow: 0 0 0 1px rgba(116, 204, 255, 0.16) inset;
  }

  :deep(.el-input__inner) {
    color: #e8f8ff;
  }
}

.emulator-topology-3d-search-suggestion {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 5px 0;
  line-height: 1.25;

  strong,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #ecfbff;
    font-size: 12px;
    font-weight: 800;
  }

  small {
    color: #91aabd;
    font-size: 11px;
  }
}

.emulator-topology-3d-types {
  display: grid;
  gap: 8px;

  > span {
    color: rgba(237, 247, 255, 0.88);
    font-size: 12px;
    font-weight: 700;
  }
}

.emulator-topology-3d-visibility-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  align-items: center;

  :deep(.el-checkbox) {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    margin-right: 0;
  }

  :deep(.el-checkbox__label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.emulator-topology-3d-checkbox-wrap {
  display: inline-flex;
  min-width: 0;
}

.emulator-topology-3d-field {
  display: grid;
  gap: 8px;

  > span {
    color: rgba(237, 247, 255, 0.88);
    font-size: 12px;
    font-weight: 700;
  }
}

.emulator-topology-3d-label-toggle {
  margin-right: auto;
}

:deep(.el-checkbox) {
  --el-checkbox-text-color: rgba(237, 247, 255, 0.78);
}

:deep(.el-slider__runway) {
  background: rgba(126, 213, 255, 0.18);
}

:global(.emulator-topology-3d-search-popper) {
  overflow: hidden;
  border: 1px solid rgba(92, 210, 255, 0.26) !important;
  border-radius: 10px !important;
  background:
    linear-gradient(180deg, rgba(10, 31, 47, 0.98), rgba(4, 14, 24, 0.98)),
    rgba(4, 14, 24, 0.98) !important;
  box-shadow:
    0 18px 38px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(62, 214, 255, 0.08) !important;
}

:global(.emulator-topology-3d-search-popper .el-autocomplete-suggestion) {
  background: transparent !important;
}

:global(.emulator-topology-3d-search-popper .el-autocomplete-suggestion__wrap) {
  max-height: 280px;
  padding: 6px;
  background: transparent !important;
}

:global(.emulator-topology-3d-search-popper .el-autocomplete-suggestion li) {
  height: auto;
  min-height: 42px;
  padding: 6px 9px;
  color: #dff6ff;
  border-radius: 8px;
  line-height: 1.25;
}

:global(.emulator-topology-3d-search-popper .el-autocomplete-suggestion li:hover),
:global(.emulator-topology-3d-search-popper .el-autocomplete-suggestion li.highlighted) {
  background: rgba(45, 171, 255, 0.2) !important;
}

:global(.emulator-topology-3d-search-popper .el-popper__arrow::before) {
  border-color: rgba(92, 210, 255, 0.26) !important;
  background: rgba(10, 31, 47, 0.98) !important;
}
</style>
