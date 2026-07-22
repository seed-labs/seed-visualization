<template>
  <section class="satellite-list" :class="{ embedded }">
    <header v-if="!hideHeader">
      <button type="button" :class="{ active: currentTab === 'all' }" @click="setActiveTab('all')">
        Satellites
        <strong>{{ satellites.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: currentTab === 'selected' }"
        @click="setActiveTab('selected')"
      >
        Selected
        <strong>{{ selectedSatellites.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: currentTab === 'stations' }"
        @click="setActiveTab('stations')"
      >
        Stations
        <strong>{{ filteredStations.length.toLocaleString() }}</strong>
      </button>
      <button
        type="button"
        :class="{ active: currentTab === 'settings' }"
        @click="setActiveTab('settings')"
      >
        Settings
      </button>
    </header>

    <section v-if="currentTab === 'all'" class="tab-panel satellite-tab">
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
              content="Both boundary values are included: min ≤ altitude ≤ max."
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

    <section v-if="currentTab === 'selected'" class="selected-satellites">
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

    <section v-if="currentTab === 'stations'" class="ground-station-list">
      <el-input v-model="stationSearch" clearable placeholder="Search station, city, or ID" />

      <div class="station-filter-actions">
        <span>
          {{ connectedStationIds.length
            ? `${selectedConnectedStationCount} / ${connectedStationIds.length} linked selected`
            : `${selectedStationIds.size} / ${groundStations.length} selected` }}
        </span>
        <div>
          <el-button text size="small" @click="selectAllFilteredStations">Select all</el-button>
          <el-button text size="small" @click="invertFilteredStations">Invert</el-button>
        </div>
      </div>

      <div class="ground-station-items">
        <article
          v-for="station in filteredStations"
          :key="station.id"
          class="ground-station-row"
          :class="{ selected: selectedStationIds.has(station.id) }"
          @click="toggleStationSelection(station)"
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

    <section v-if="currentTab === 'settings'" class="settings-tab">
      <div class="time-control">
        <div class="time-control-heading">
          <span>System time</span>
          <small>
            {{ settings.paused ? 'Paused' : settings.customTimeEnabled ? 'Custom' : 'Automatic' }}
          </small>
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
          <el-button
            :type="settings.paused ? 'success' : 'warning'"
            @click="updateSetting('paused', !settings.paused)"
          >
            {{ settings.paused ? 'Resume' : 'Pause' }}
          </el-button>
        </div>
      </div>

      <div class="control-row">
        <span>Simulation speed</span>
        <el-segmented
          :model-value="settings.speed"
          :options="speedOptions"
          :disabled="speedDisabled"
          @update:model-value="updateSetting('speed', Number($event))"
        />
      </div>

      <div class="switch-grid">
        <el-tooltip
          content="Show or hide satellite nodes<br/>on the globe."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showSatellites"
            active-text="Show satellites"
            @update:model-value="updateSetting('showSatellites', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show or hide ground station<br/>nodes on the globe."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showGroundStations"
            active-text="Show ground stations"
            @update:model-value="updateSetting('showGroundStations', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show orbit paths for selected<br/>or connected satellites."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showOrbits"
            active-text="Orbits"
            @update:model-value="updateSetting('showOrbits', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show name labels for selected<br/>or highlighted satellites."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showLabels"
            active-text="Labels"
            @update:model-value="updateSetting('showLabels', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Show details when hovering over a satellite<br/>or ground station."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.showSelectionDetails"
            active-text="Hover details"
            @update:model-value="updateSetting('showSelectionDetails', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Use locally calculated nearest-station links<br/>instead of backend ground links."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.useLocalGroundLinks"
            active-text="Local links"
            @update:model-value="updateSetting('useLocalGroundLinks', Boolean($event))"
          />
        </el-tooltip>
        <el-tooltip
          content="Hide every link involving a satellite<br/>excluded by the current filters."
          placement="top"
          :show-after="300"
          raw-content
          popper-class="starlink-multiline-tooltip"
        >
          <el-switch
            :model-value="settings.hideLinksForFilteredSatellites"
            active-text="Hide filtered links"
            @update:model-value="updateSetting('hideLinksForFilteredSatellites', Boolean($event))"
          />
        </el-tooltip>
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
  orbitPlaneOptions: string[];
  groundStations: GroundStation[];
  selectedStationIds: string[];
  connectedStationIds: string[];
  settings: SimulationSettings;
  currentTime: Date;
  selectedId?: string;
  embedded?: boolean;
  activeTab?: TabName;
  hideHeader?: boolean;
  speedDisabled?: boolean;
}>();

const emit = defineEmits<{
  select: [satellite: SatellitePoint];
  focusSelected: [satellite: SatellitePoint];
  remove: [satellite: SatellitePoint];
  removeAll: [];
  stationFocus: [station: GroundStation];
  stationSelectionChange: [stationIds: string[]];
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
const currentTab = computed(() => props.activeTab ?? activeTab.value);
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
const selectedStationIds = computed(() => new Set(props.selectedStationIds));
const selectedConnectedStationCount = computed(() =>
  props.connectedStationIds.filter((stationId) => selectedStationIds.value.has(stationId)).length,
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
  () => props.selectedSatellites.length,
  (count, previousCount) => {
    if (props.activeTab) {
      return;
    }

    if (count > 0 && previousCount === 0) {
      activeTab.value = 'selected';
    }

    if (count === 0 && previousCount > 0) {
      activeTab.value = 'all';
    }
  },
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

watch(currentTab, (tab) => {
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

function setActiveTab(tab: TabName) {
  activeTab.value = tab;
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

function toggleStationSelection(station: GroundStation) {
  const nextStationIds = new Set(props.selectedStationIds);
  const shouldFocus = !nextStationIds.has(station.id);
  if (nextStationIds.has(station.id)) {
    nextStationIds.delete(station.id);
  } else {
    nextStationIds.add(station.id);
  }
  emit('stationSelectionChange', Array.from(nextStationIds));
  if (shouldFocus) {
    emit('stationFocus', station);
  }
}

function selectAllFilteredStations() {
  if (props.connectedStationIds.length) {
    emit('stationSelectionChange', [...props.connectedStationIds]);
    return;
  }

  const nextStationIds = new Set(props.selectedStationIds);
  filteredStations.value.forEach((station) => nextStationIds.add(station.id));
  emit('stationSelectionChange', Array.from(nextStationIds));
}

function invertFilteredStations() {
  if (props.connectedStationIds.length) {
    const nextStationIds = props.connectedStationIds.filter(
      (stationId) => !selectedStationIds.value.has(stationId),
    );
    emit('stationSelectionChange', nextStationIds);
    return;
  }

  const nextStationIds = new Set(props.selectedStationIds);
  filteredStations.value.forEach((station) => {
    if (nextStationIds.has(station.id)) {
      nextStationIds.delete(station.id);
    } else {
      nextStationIds.add(station.id);
    }
  });
  emit('stationSelectionChange', Array.from(nextStationIds));
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
