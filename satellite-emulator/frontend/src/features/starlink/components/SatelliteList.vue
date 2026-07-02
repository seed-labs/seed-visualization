<template>
  <section class="satellite-list">
    <header>
      <button type="button" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">
        Satellites
        <strong>{{ satellites.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: activeTab === 'selected' }"
        @click="activeTab = 'selected'"
      >
        Selected
        <strong>{{ selectedSatellites.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: activeTab === 'stations' }"
        @click="activeTab = 'stations'"
      >
        Stations
        <strong>{{ filteredStations.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: activeTab === 'settings' }"
        @click="activeTab = 'settings'"
      >
        Settings
      </button>
    </header>

    <section v-if="activeTab === 'all'" class="tab-panel satellite-tab">
      <el-input
        :model-value="settings.search"
        clearable
        placeholder="Search STARLINK or NORAD ID"
        @update:model-value="updateSetting('search', $event)"
      />

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

    <section v-if="activeTab === 'selected'" class="selected-satellites">
      <div v-if="selectedSatellites.length" class="selected-satellites-title">
        <span>Orbits visible</span>
        <button type="button" @click="$emit('removeAll')">Clear all</button>
      </div>

      <button
        v-for="satellite in selectedSatellites"
        :key="satellite.id"
        class="selected-satellite-chip"
        type="button"
        @click="$emit('focusSelected', satellite)"
      >
        <span>
          <strong>{{ satellite.name }}</strong>
          <small>NORAD {{ satellite.id }}</small>
        </span>
        <em
          role="button"
          tabindex="0"
          aria-label="Remove selection"
          @click.stop="$emit('remove', satellite)"
          @keydown.enter.stop="$emit('remove', satellite)"
          @keydown.space.prevent.stop="$emit('remove', satellite)"
        >
          x
        </em>
      </button>

      <p v-if="!selectedSatellites.length" class="empty-selected">No selected satellites</p>
    </section>

    <section v-if="activeTab === 'stations'" class="ground-station-list">
      <el-input v-model="stationSearch" clearable placeholder="Search station, city, or ID" />

      <div class="ground-station-items">
        <article
          v-for="station in filteredStations"
          :key="station.id"
          class="ground-station-row"
          @click="emit('stationSelect', station)"
        >
          <span>
            <strong>{{ station.name }}</strong>
            <small>{{ station.city }} / {{ station.id }}</small>
          </span>
          <em>{{ station.latitude.toFixed(2) }}, {{ station.longitude.toFixed(2) }}</em>
        </article>

        <p v-if="!filteredStations.length" class="empty-selected">No stations found</p>
      </div>
    </section>

    <section v-if="activeTab === 'settings'" class="settings-tab">
      <div class="time-control">
        <div class="time-control-heading">
          <span>System time</span>
          <small>{{ settings.customTimeEnabled ? 'Custom' : 'Automatic' }}</small>
        </div>
        <label for="simulation-timestamp">Unix timestamp (seconds)</label>
        <el-input-number
          id="simulation-timestamp"
          v-model="timestampInput"
          :min="0"
          :max="maxTimestampSeconds"
          :precision="0"
          :step="1"
          controls-position="right"
        />
        <small class="time-preview">{{ timestampPreview }}</small>
        <div class="time-actions">
          <el-button type="primary" :disabled="!validTimestamp" @click="applySystemTime">
            Apply
          </el-button>
          <el-button @click="resetSystemTime">Use current time</el-button>
        </div>
      </div>

      <div class="control-row">
        <span>Simulation speed</span>
        <el-segmented
          :model-value="settings.speed"
          :options="speedOptions"
          @update:model-value="updateSetting('speed', Number($event))"
        />
      </div>

      <div class="switch-grid">
        <el-switch
          :model-value="settings.showOrbits"
          active-text="Orbits"
          @update:model-value="updateSetting('showOrbits', Boolean($event))"
        />
        <el-switch
          :model-value="settings.showLabels"
          active-text="Labels"
          @update:model-value="updateSetting('showLabels', Boolean($event))"
        />
        <el-switch
          :model-value="settings.focusSatelliteZoom"
          active-text="Focus satellite"
          @update:model-value="updateSetting('focusSatelliteZoom', Boolean($event))"
        />
        <el-switch
          :model-value="settings.showSatelliteStatus"
          active-text="Satellite status"
          @update:model-value="updateSetting('showSatelliteStatus', Boolean($event))"
        />
        <el-switch
          :model-value="settings.useLocalGroundLinks"
          active-text="Local links"
          @update:model-value="updateSetting('useLocalGroundLinks', Boolean($event))"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  GroundStation,
  SatellitePoint,
  SimulationSettings,
} from '@/features/starlink/types';

const props = defineProps<{
  satellites: SatellitePoint[];
  selectedSatellites: SatellitePoint[];
  groundStations: GroundStation[];
  settings: SimulationSettings;
  currentTime: Date;
  selectedId?: string;
}>();

const emit = defineEmits<{
  select: [satellite: SatellitePoint];
  focusSelected: [satellite: SatellitePoint];
  remove: [satellite: SatellitePoint];
  removeAll: [];
  stationSelect: [station: GroundStation];
  stationFocus: [station: GroundStation];
  updateSettings: [settings: SimulationSettings];
  setSystemTime: [timestampMs: number];
  resetSystemTime: [];
}>();

type TabName = 'all' | 'selected' | 'stations' | 'settings';

const rowHeight = 57;
const overscan = 8;
const bodyRef = ref<HTMLElement>();
const scrollTop = ref(0);
const activeTab = ref<TabName>('all');
const stationSearch = ref('');
const timestampInput = ref<number>();
const maxTimestampSeconds = Math.floor(8_640_000_000_000_000 / 1000);
const speedOptions = [
  { label: '1x', value: 1 },
  { label: '10x', value: 10 },
  { label: '60x', value: 60 },
  { label: '600x', value: 600 },
];

const filteredStations = computed(() => {
  const keyword = stationSearch.value.trim().toLowerCase();
  if (!keyword) {
    return props.groundStations;
  }

  return props.groundStations.filter(
    (station) =>
      station.name.toLowerCase().includes(keyword) ||
      station.city.toLowerCase().includes(keyword) ||
      station.id.toLowerCase().includes(keyword),
  );
});
const validTimestamp = computed(
  () =>
    typeof timestampInput.value === 'number' &&
    Number.isFinite(timestampInput.value) &&
    timestampInput.value >= 0 &&
    timestampInput.value <= maxTimestampSeconds,
);
const timestampPreview = computed(() => {
  if (!validTimestamp.value) {
    return 'Enter a valid timestamp';
  }

  return `${new Date(Math.trunc(timestampInput.value!) * 1000).toISOString()} UTC`;
});
const selectedSatelliteIds = computed(
  () => new Set(props.selectedSatellites.map((satellite) => satellite.id)),
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
  () => props.selectedSatellites.length,
  (count, previousCount) => {
    if (count > 0 && previousCount === 0) {
      activeTab.value = 'selected';
    }

    if (count === 0 && previousCount > 0) {
      activeTab.value = 'all';
    }
  },
);

watch(activeTab, (tab) => {
  if (tab === 'settings') {
    syncTimestampInput();
  }
});

watch(
  () => [stationSearch.value, filteredStations.value[0]?.id],
  () => {
    const firstStation = filteredStations.value[0];
    if (stationSearch.value.trim() && firstStation) {
      emit('stationFocus', firstStation);
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

function syncTimestampInput() {
  timestampInput.value = Math.floor(props.currentTime.getTime() / 1000);
}

function applySystemTime() {
  if (!validTimestamp.value) {
    return;
  }

  const timestampMs = Math.trunc(timestampInput.value!) * 1000;
  emit('setSystemTime', timestampMs);
  timestampInput.value = timestampMs / 1000;
}

function resetSystemTime() {
  emit('resetSystemTime');
  timestampInput.value = Math.floor(Date.now() / 1000);
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-list.scss"></style>
