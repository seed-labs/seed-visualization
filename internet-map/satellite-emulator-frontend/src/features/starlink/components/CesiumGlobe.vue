<template>
  <div ref="containerRef" class="globe"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ScreenSpaceEventType } from 'cesium';
import {
  createCesiumScene,
  type CesiumSceneApi,
} from '@/features/starlink/services/cesiumScene';
import type {
  GroundStation,
  SatelliteGroundLink,
  SatellitePoint,
  TleRecord,
} from '@/features/starlink/types';

const props = defineProps<{
  satellites: SatellitePoint[];
  orbitRecords: TleRecord[];
  selectedId?: string;
  highlightedIds: string[];
  groundStations: GroundStation[];
  groundLinks: SatelliteGroundLink[];
  focusedSatelliteId?: string;
  focusedStationId?: string;
  focusSatelliteZoom: boolean;
  showLabels: boolean;
  currentTime: Date;
}>();

const emit = defineEmits<{
  select: [satellite: SatellitePoint];
  selectStation: [station: GroundStation];
}>();

const containerRef = ref<HTMLElement>();
let sceneApi: CesiumSceneApi | undefined;

function render() {
  sceneApi?.renderSatellites(props.satellites, {
    selectedId: props.selectedId,
    highlightedIds: props.highlightedIds,
    groundStations: props.groundStations,
    groundLinks: props.groundLinks,
    focusedSatelliteId: props.focusedSatelliteId,
    focusedStationId: props.focusedStationId,
    focusSatelliteZoom: props.focusSatelliteZoom,
    showLabels: props.showLabels,
    orbitRecords: props.orbitRecords,
    currentTime: props.currentTime,
    onSelect: (satellite) => emit('select', satellite),
    onStationSelect: (station) => emit('selectStation', station),
  });
}

onMounted(() => {
  if (containerRef.value) {
    sceneApi = createCesiumScene(containerRef.value);
    sceneApi.viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    render();
  }
});

watch(
  () => [
    props.satellites,
    props.orbitRecords,
    props.selectedId,
    props.highlightedIds,
    props.groundStations,
    props.groundLinks,
    props.focusedSatelliteId,
    props.focusedStationId,
    props.focusSatelliteZoom,
    props.showLabels,
  ],
  render,
  { deep: false },
);

onBeforeUnmount(() => sceneApi?.destroy());
</script>

<style scoped lang="scss" src="@/features/starlink/styles/cesium-globe.scss"></style>
