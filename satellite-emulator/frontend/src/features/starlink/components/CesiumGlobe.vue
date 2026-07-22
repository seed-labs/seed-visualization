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
  NetworkNodeLocation,
  InterSatelliteLink,
  NetworkPathUpdateState,
  PlannedOrbitRecord,
  SatelliteGroundLink,
  SatellitePoint,
  ScreenAnchor,
} from '@/features/starlink/types';

const props = defineProps<{
  satellites: SatellitePoint[];
  orbitRecords: PlannedOrbitRecord[];
  selectedId?: string;
  highlightedIds: string[];
  groundStations: GroundStation[];
  groundLinks: SatelliteGroundLink[];
  satelliteLinks: InterSatelliteLink[];
  networkLinks: NetworkPathUpdateState[];
  networkNodes: NetworkNodeLocation[];
  containerNodes: NetworkNodeLocation[];
  activeTrafficNodeIds: string[];
  focusedSatelliteId?: string;
  focusedStationId?: string;
  focusedContainerNodeId?: string;
  showSatellites: boolean;
  showGroundStations: boolean;
  showLabels: boolean;
  currentTime: Date;
}>();

const emit = defineEmits<{
  select: [satellite: SatellitePoint];
  selectStation: [station: GroundStation];
  hoverSatellite: [satellite: SatellitePoint | undefined, anchor?: ScreenAnchor];
  hoverStation: [station: GroundStation | undefined, anchor?: ScreenAnchor];
  hoverContainerNode: [node: NetworkNodeLocation | undefined, anchor?: ScreenAnchor];
}>();

const containerRef = ref<HTMLElement>();
let sceneApi: CesiumSceneApi | undefined;
let animationFrameId: number | undefined;
let animationRenderUntil = 0;

function render() {
  sceneApi?.renderSatellites(props.satellites, {
    selectedId: props.selectedId,
    highlightedIds: props.highlightedIds,
    groundStations: props.groundStations,
    groundLinks: props.groundLinks,
    satelliteLinks: props.satelliteLinks,
    networkLinks: props.networkLinks,
    networkNodes: props.networkNodes,
    containerNodes: props.containerNodes,
    activeTrafficNodeIds: props.activeTrafficNodeIds,
    focusedSatelliteId: props.focusedSatelliteId,
    focusedStationId: props.focusedStationId,
    focusedContainerNodeId: props.focusedContainerNodeId,
    showSatellites: props.showSatellites,
    showGroundStations: props.showGroundStations,
    showLabels: props.showLabels,
    orbitRecords: props.orbitRecords,
    currentTime: props.currentTime,
    onSelect: (satellite) => emit('select', satellite),
    onStationSelect: (station) => emit('selectStation', station),
    onSatelliteHover: (satellite, anchor) => emit('hoverSatellite', satellite, anchor),
    onStationHover: (station, anchor) => emit('hoverStation', station, anchor),
    onContainerNodeHover: (node, anchor) => emit('hoverContainerNode', node, anchor),
  });
}

function renderLinkChangeAnimation(durationMs = 1300) {
  animationRenderUntil = Math.max(animationRenderUntil, performance.now() + durationMs);
  if (animationFrameId !== undefined) {
    return;
  }

  const tick = () => {
    render();
    if (performance.now() < animationRenderUntil) {
      animationFrameId = window.requestAnimationFrame(tick);
      return;
    }
    animationFrameId = undefined;
  };

  animationFrameId = window.requestAnimationFrame(tick);
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
    props.satelliteLinks,
    props.networkLinks,
    props.networkNodes,
    props.containerNodes,
    props.activeTrafficNodeIds,
    props.focusedSatelliteId,
    props.focusedStationId,
    props.focusedContainerNodeId,
    props.showSatellites,
    props.showGroundStations,
    props.showLabels,
  ],
  render,
  { deep: false },
);

watch(
  () => [props.groundLinks, props.satelliteLinks, props.networkLinks, props.activeTrafficNodeIds],
  () => renderLinkChangeAnimation(),
  { deep: false },
);

watch(
  () => [props.focusedSatelliteId, props.focusedStationId],
  () => renderLinkChangeAnimation(1200),
  { deep: false },
);

onBeforeUnmount(() => {
  if (animationFrameId !== undefined) {
    window.cancelAnimationFrame(animationFrameId);
  }
  sceneApi?.destroy();
});
</script>

<style scoped lang="scss" src="@/features/starlink/styles/cesium-globe.scss"></style>
