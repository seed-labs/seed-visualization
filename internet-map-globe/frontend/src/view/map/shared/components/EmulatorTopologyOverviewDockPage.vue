<template>
  <section class="emulator-topology-3d-dock-page">
    <section class="emulator-topology-3d-stats">
      <el-popover placement="top-start" width="390" trigger="click" popper-class="emulator-topology-3d-filter-popover">
        <template #reference>
          <button type="button" class="emulator-topology-3d-stat-card">
            <strong>{{ stats.autonomousSystems }}</strong><span>AS</span>
          </button>
        </template>
        <section class="emulator-topology-3d-picker">
          <header>
            <strong>Transit AS</strong>
            <el-switch v-model="showAsDetails" size="small" active-text="Details" />
          </header>
          <el-select
            v-model="selectedAsnValues"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="Select AS"
            popper-class="emulator-topology-3d-select-popper"
            style="width: 100%"
          >
            <el-option
              v-for="item in asSummaries"
              :key="item.asn"
              :label="`AS-${item.asn} (${item.routers})`"
              :value="item.asn"
            />
          </el-select>
          <div v-if="showAsDetails" class="emulator-topology-3d-as-detail-list">
            <el-popover
              v-for="item in asSummaries"
              :key="item.asn"
              placement="left"
              width="520"
              trigger="hover"
              :show-after="160"
              popper-class="emulator-topology-3d-as-detail-popover"
            >
              <template #reference>
                <span :class="{ active: selectedAsns.has(item.asn) }">AS-{{ item.asn }} / {{ item.routers }} routers</span>
              </template>
              <el-table :data="asDetailsByAsn.get(item.asn) ?? []" max-height="360" size="small">
                <el-table-column type="index" label="#" width="52" />
                <el-table-column prop="name" label="Router" width="120" />
                <el-table-column prop="role" label="Role" width="140" />
                <el-table-column prop="nets" label="Networks" />
              </el-table>
            </el-popover>
          </div>
        </section>
      </el-popover>
      <el-popover placement="top-start" width="360" trigger="click" popper-class="emulator-topology-3d-filter-popover">
        <template #reference>
          <button type="button" class="emulator-topology-3d-stat-card">
            <strong>{{ stats.ix }}</strong><span>IX</span>
          </button>
        </template>
        <section class="emulator-topology-3d-picker">
          <header><strong>IX networks</strong></header>
          <el-select
            v-model="selectedIxNameValues"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="Select IX"
            popper-class="emulator-topology-3d-select-popper"
            style="width: 100%"
          >
            <el-option
              v-for="ix in ixSummaries"
              :key="ix.name"
              :label="ix.label"
              :value="ix.name"
            />
          </el-select>
        </section>
      </el-popover>
      <div><strong>{{ stats.networks }}</strong><span>Networks</span></div>
      <div><strong>{{ stats.routers }}</strong><span>Routers</span></div>
      <div><strong>{{ stats.hosts }}</strong><span>Hosts</span></div>
    </section>
    <el-button
      v-if="selectedAsns.size || selectedIxNames.size"
      size="small"
      plain
      @click="$emit('clearTopologyFilters')"
    >
      Clear topology filters
    </el-button>

    <section class="emulator-topology-3d-legend">
      <span><i class="is-ix" />IX network</span>
      <span><i class="is-network" />Network</span>
      <span><i class="is-router" />Router</span>
      <span><i class="is-host" />Host</span>
    </section>

    <section v-if="selectedNodeSummary" class="emulator-topology-3d-detail">
      <header>
        <Aim />
        <strong>{{ selectedNodeSummary.label }}</strong>
      </header>
      <dl>
        <dt>ID</dt>
        <dd>{{ selectedNodeSummary.id }}</dd>
        <dt>Type</dt>
        <dd>{{ selectedNodeSummary.type }}</dd>
        <dt>Group</dt>
        <dd>{{ selectedNodeSummary.group }}</dd>
        <dt>Position</dt>
        <dd>{{ selectedNodeSummary.position }}</dd>
      </dl>
    </section>
  </section>
</template>

<script setup lang="ts">
import { Aim } from '@element-plus/icons-vue'
import type {
  EmulatorTopologyAsDetail,
  EmulatorTopologyAsSummary,
  EmulatorTopologyCommonStats,
  EmulatorTopologyIxSummary,
  EmulatorTopologySelectedNodeSummary,
} from '@/view/map/shared/types/emulatorTopologyDockTypes'

defineProps<{
  stats: EmulatorTopologyCommonStats
  asSummaries: EmulatorTopologyAsSummary[]
  ixSummaries: EmulatorTopologyIxSummary[]
  asDetailsByAsn: Map<string, EmulatorTopologyAsDetail[]>
  selectedAsns: Set<string>
  selectedIxNames: Set<string>
  selectedNodeSummary?: EmulatorTopologySelectedNodeSummary
}>()

const selectedAsnValues = defineModel<string[]>('selectedAsnValues', { required: true })
const selectedIxNameValues = defineModel<string[]>('selectedIxNameValues', { required: true })
const showAsDetails = defineModel<boolean>('showAsDetails', { required: true })

defineEmits<{
  clearTopologyFilters: []
}>()
</script>

<style scoped lang="scss">
.emulator-topology-3d-dock-page {
  flex: 1 1 auto;
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow: auto;
}

.emulator-topology-3d-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;

  div,
  .emulator-topology-3d-stat-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 8px;
    color: inherit;
    text-align: left;
    border: 1px solid rgba(126, 213, 255, 0.14);
    border-radius: 8px;
    background: rgba(17, 41, 63, 0.54);
  }

  .emulator-topology-3d-stat-card {
    width: 100%;
    cursor: pointer;

    &:hover {
      border-color: rgba(125, 232, 255, 0.38);
      background: rgba(22, 66, 92, 0.72);
    }
  }

  strong {
    color: #7de8ff;
    font-size: 15px;
  }

  span {
    overflow: hidden;
    color: rgba(211, 230, 244, 0.68);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.emulator-topology-3d-picker {
  display: grid;
  gap: 12px;
  min-width: 0;

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;

    strong {
      color: #eaf8ff;
      font-size: 14px;
      font-weight: 850;
      letter-spacing: 0.01em;
    }
  }
}

.emulator-topology-3d-as-detail-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 120px;
  overflow: auto;

  span {
    max-width: 100%;
    padding: 4px 7px;
    overflow: hidden;
    color: #d7f8ff;
    border: 1px solid rgba(125, 232, 255, 0.34);
    border-radius: 999px;
    background: rgba(22, 79, 108, 0.42);
    cursor: help;
    font-size: 11px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:hover {
      color: #ffffff;
      border-color: rgba(154, 241, 255, 0.72);
      background: rgba(45, 161, 210, 0.36);
      box-shadow: 0 0 14px rgba(66, 210, 255, 0.22);
    }

    &.active {
      color: #031826;
      border-color: rgba(156, 245, 255, 0.92);
      background: linear-gradient(135deg, #7de8ff, #b8fff3);
    }
  }
}

.emulator-topology-3d-legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: rgba(211, 230, 244, 0.74);
    font-size: 11px;
    font-weight: 700;
  }

  i {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    border-radius: 999px;
  }

  .is-ix {
    width: 14px;
    height: 14px;
    border-radius: 0;
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
    background: #ffcc33;
    box-shadow: 0 0 10px rgba(255, 204, 51, 0.7);
  }

  .is-network {
    transform: rotate(45deg) scale(0.86);
    border-radius: 2px;
    background: #38d996;
    box-shadow: 0 0 10px rgba(56, 217, 150, 0.58);
  }

  .is-router {
    background: #2388d9;
    box-shadow: 0 0 10px rgba(35, 136, 217, 0.68);
  }

  .is-host {
    clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%);
    border-radius: 3px;
    background: #7de8ff;
    box-shadow: 0 0 10px rgba(125, 232, 255, 0.56);
  }
}

.emulator-topology-3d-detail {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(192, 140, 255, 0.28);
  border-radius: 10px;
  background: rgba(32, 20, 54, 0.5);

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: #f0ddff;
    font-size: 12px;
    font-weight: 800;
  }

  svg {
    width: 16px;
    height: 16px;
  }

  dl {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 6px 10px;
    margin: 0;
    font-size: 11px;
  }

  dt {
    color: rgba(166, 205, 225, 0.72);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: #eaf9ff;
  }
}

:global(.emulator-topology-3d-filter-popover),
:global(.emulator-topology-3d-as-detail-popover) {
  border: 1px solid rgba(104, 214, 255, 0.28) !important;
  border-radius: 14px !important;
  background:
    linear-gradient(180deg, rgba(10, 30, 48, 0.98), rgba(4, 14, 25, 0.98)),
    rgba(4, 14, 25, 0.98) !important;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.48),
    0 0 0 1px rgba(125, 232, 255, 0.08) inset !important;
  color: #eaf8ff !important;
  backdrop-filter: blur(18px);
}

:global(.emulator-topology-3d-filter-popover) {
  padding: 14px !important;
}

:global(.emulator-topology-3d-as-detail-popover) {
  padding: 10px !important;
}

:global(.emulator-topology-3d-filter-popover .el-popper__arrow::before),
:global(.emulator-topology-3d-as-detail-popover .el-popper__arrow::before) {
  border-color: rgba(104, 214, 255, 0.28) !important;
  background: rgba(10, 30, 48, 0.98) !important;
}

:global(.emulator-topology-3d-filter-popover .el-select__wrapper) {
  min-height: 38px;
  border-radius: 10px;
  background: rgba(2, 12, 22, 0.74);
  box-shadow:
    0 0 0 1px rgba(125, 232, 255, 0.18) inset,
    0 8px 22px rgba(0, 0, 0, 0.18);
}

:global(.emulator-topology-3d-filter-popover .el-select__placeholder),
:global(.emulator-topology-3d-filter-popover .el-select__input),
:global(.emulator-topology-3d-filter-popover .el-select__selected-item) {
  color: #dff7ff;
}

:global(.emulator-topology-3d-filter-popover .el-tag) {
  border-color: rgba(125, 232, 255, 0.28);
  background: rgba(36, 122, 160, 0.24);
  color: #c9f4ff;
}

:global(.emulator-topology-3d-filter-popover .el-switch__label) {
  color: rgba(224, 244, 255, 0.78);
  font-size: 12px;
  font-weight: 750;
}

:global(.emulator-topology-3d-filter-popover .el-switch__label.is-active) {
  color: #7de8ff;
}

:global(.emulator-topology-3d-as-detail-popover .el-table) {
  overflow: hidden;
  color: #dff7ff;
  border-radius: 10px;
  background: rgba(4, 14, 25, 0.72);
}

:global(.emulator-topology-3d-as-detail-popover .el-table th.el-table__cell) {
  color: #9eeaff;
  background: rgba(18, 55, 82, 0.92);
  font-weight: 800;
}

:global(.emulator-topology-3d-as-detail-popover .el-table tr),
:global(.emulator-topology-3d-as-detail-popover .el-table td.el-table__cell) {
  color: #dff7ff;
  background: rgba(4, 14, 25, 0.72);
}

:global(.emulator-topology-3d-as-detail-popover .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell) {
  background: rgba(48, 169, 218, 0.18);
}

:global(.el-select__popper.emulator-topology-3d-select-popper) {
  border: 1px solid rgba(104, 214, 255, 0.24) !important;
  border-radius: 12px !important;
  background: rgba(4, 14, 25, 0.98) !important;
}

:global(.el-select__popper.emulator-topology-3d-select-popper .el-popper__arrow::before) {
  border-color: rgba(104, 214, 255, 0.24) !important;
  background: rgba(4, 14, 25, 0.98) !important;
}

:global(.el-select__popper.emulator-topology-3d-select-popper .el-select-dropdown) {
  background: transparent;
}

:global(.el-select__popper.emulator-topology-3d-select-popper .el-select-dropdown__item) {
  margin: 2px 6px;
  color: #cfeeff;
  border-radius: 8px;
  font-weight: 650;
}

:global(.el-select__popper.emulator-topology-3d-select-popper .el-select-dropdown__item.is-hovering),
:global(.el-select__popper.emulator-topology-3d-select-popper .el-select-dropdown__item:hover) {
  background: rgba(48, 169, 218, 0.22);
}

:global(.el-select__popper.emulator-topology-3d-select-popper .el-select-dropdown__item.is-selected) {
  color: #7de8ff;
  background: rgba(125, 232, 255, 0.13);
}
</style>
