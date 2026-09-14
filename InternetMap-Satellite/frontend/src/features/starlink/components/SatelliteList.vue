<template>
  <section class="satellite-list embedded">
    <section class="tab-panel satellite-tab">
      <div class="filter-input-row">
        <el-input
          :model-value="settings.search"
          clearable
          placeholder="Name or NORAD ID"
          @update:model-value="updateSetting('search', $event)"
        />
        <el-checkbox
          :model-value="settings.invertSearch"
          @update:model-value="updateSetting('invertSearch', Boolean($event))"
        >
          NOT
        </el-checkbox>
      </div>

      <details class="satellite-filters">
        <summary>
          <span>More filters</span>
          <em>{{ activeFilterCount ? `${activeFilterCount} active` : 'None' }}</em>
        </summary>

        <div class="filter-section">
          <div class="filter-heading">
            <el-tooltip
              content="Both boundary values are included: min â‰?altitude â‰?max."
              placement="top"
              :show-after="300"
              popper-class="starlink-multiline-tooltip"
            >
              <span class="filter-label">Altitude (km, inclusive)</span>
            </el-tooltip>
            <el-checkbox
              :model-value="settings.invertAltitude"
              @update:model-value="updateSetting('invertAltitude', Boolean($event))"
            >
              NOT
            </el-checkbox>
          </div>
          <div class="altitude-range">
            <el-input-number
              :model-value="settings.altitudeMinKm"
              :min="0"
              :controls="false"
              placeholder="Min"
              @update:model-value="updateSetting('altitudeMinKm', normalizeOptionalNumber($event))"
            />
            <span>to</span>
            <el-input-number
              :model-value="settings.altitudeMaxKm"
              :min="0"
              :controls="false"
              placeholder="Max"
              @update:model-value="updateSetting('altitudeMaxKm', normalizeOptionalNumber($event))"
            />
          </div>
        </div>

        <div class="filter-section">
          <div class="filter-heading">
            <span>Plane filter</span>
            <el-checkbox
              :model-value="settings.invertOrbitPlanes"
              @update:model-value="updateSetting('invertOrbitPlanes', Boolean($event))"
            >
              NOT
            </el-checkbox>
          </div>
          <el-select
            :model-value="settings.selectedOrbitPlaneIds"
            multiple
            filterable
            collapse-tags
            :max-collapse-tags="1"
            placeholder="Planes in visible shells"
            @update:model-value="updateSetting('selectedOrbitPlaneIds', $event)"
          >
            <el-option
              v-for="orbitPlane in orbitPlaneOptions"
              :key="orbitPlane"
              :label="orbitPlane"
              :value="orbitPlane"
            />
          </el-select>
        </div>

        <el-button text class="clear-filters" :disabled="!activeFilterCount" @click="clearFilters">
          Clear filters
        </el-button>
      </details>

      <div ref="bodyRef" class="satellite-list-body" @scroll="handleScroll">
        <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
          <button
            v-for="satellite in visibleSatellites"
            :key="satellite.id"
            class="satellite-row"
            :class="{ active: selectedSatelliteIds.has(satellite.id) }"
            type="button"
            :style="{ transform: `translateY(${satellite.offset}px)` }"
            @click="$emit('select', satellite)"
          >
            <span>
              <strong>{{ satellite.name }}</strong>
              <small>NORAD {{ satellite.id }}</small>
            </span>
            <em>{{ satellite.altitudeKm.toFixed(0) }} km</em>
          </button>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  SatellitePoint,
  SimulationSettings,
} from '@/features/starlink/types';

const props = defineProps<{
  satellites: SatellitePoint[];
  selectedSatellites: SatellitePoint[];
  orbitPlaneOptions: string[];
  settings: SimulationSettings;
}>();

const emit = defineEmits<{
  select: [satellite: SatellitePoint];
  updateSettings: [settings: SimulationSettings];
}>();

const rowHeight = 57;
const overscan = 8;
const bodyRef = ref<HTMLElement>();
const scrollTop = ref(0);

const selectedSatelliteIds = computed(
  () => new Set(props.selectedSatellites.map((satellite) => satellite.id)),
);
const activeFilterCount = computed(
  () =>
    Number(Boolean(props.settings.search.trim())) +
    Number(
      Number.isFinite(props.settings.altitudeMinKm) ||
        Number.isFinite(props.settings.altitudeMaxKm),
    ) +
    Number(props.settings.selectedOrbitPlaneIds.length > 0),
);
const totalHeight = computed(() => props.satellites.length * rowHeight);
const visibleCount = computed(() => {
  const height = bodyRef.value?.clientHeight ?? 430;
  return Math.ceil(height / rowHeight) + overscan * 2;
});
const startIndex = computed(() => Math.max(Math.floor(scrollTop.value / rowHeight) - overscan, 0));
const visibleSatellites = computed(() =>
  props.satellites
    .slice(startIndex.value, startIndex.value + visibleCount.value)
    .map((satellite, index) => ({
      ...satellite,
      offset: (startIndex.value + index) * rowHeight,
    })),
);

watch(
  () => [
    props.settings.search,
    props.settings.invertSearch,
    props.settings.altitudeMinKm,
    props.settings.altitudeMaxKm,
    props.settings.invertAltitude,
    props.settings.selectedOrbitPlaneIds.join(','),
    props.settings.invertOrbitPlanes,
  ],
  () => {
    scrollTop.value = 0;
    if (bodyRef.value) {
      bodyRef.value.scrollTop = 0;
    }
  },
);

function handleScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function updateSetting<Key extends keyof SimulationSettings>(
  key: Key,
  value: SimulationSettings[Key],
) {
  emit('updateSettings', {
    ...props.settings,
    [key]: value,
  });
}

function normalizeOptionalNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clearFilters() {
  emit('updateSettings', {
    ...props.settings,
    search: '',
    invertSearch: false,
    altitudeMinKm: undefined,
    altitudeMaxKm: undefined,
    invertAltitude: false,
    selectedOrbitPlaneIds: [],
    invertOrbitPlanes: false,
  });
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-list.scss"></style>
