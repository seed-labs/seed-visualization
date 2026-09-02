<template>
  <section class="satellite-list embedded">
    <section class="ground-station-list">
      <el-input v-model="stationSearch" clearable placeholder="Search station, city, or ID" />

      <div class="station-filter-actions">
        <span>
          {{ connectedStationIds.length
            ? `${selectedConnectedStationCount} / ${connectedStationIds.length} linked selected`
            : `${selectedStationIdsSet.size} / ${groundStations.length} selected` }}
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
          :class="{ selected: selectedStationIdsSet.has(station.id) }"
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GroundStation } from '@/features/starlink/types';

const props = defineProps<{
  groundStations: GroundStation[];
  selectedStationIds: string[];
  connectedStationIds: string[];
}>();

const emit = defineEmits<{
  stationFocus: [station: GroundStation];
  stationSelectionChange: [stationIds: string[]];
}>();

const stationSearch = ref('');

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
const selectedStationIdsSet = computed(() => new Set(props.selectedStationIds));
const selectedConnectedStationCount = computed(() =>
  props.connectedStationIds.filter((stationId) => selectedStationIdsSet.value.has(stationId)).length,
);

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
      (stationId) => !selectedStationIdsSet.value.has(stationId),
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
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-list.scss"></style>
