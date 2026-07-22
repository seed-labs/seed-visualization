<template>
  <section
    v-if="visible && station"
    ref="panelRef"
    class="satellite-detail-panel"
    :style="panelStyle"
  >
    <header @pointerdown="startDrag">
      <span>{{ station.name }}</span>
      <button type="button" aria-label="Close station details" @click="$emit('close')">x</button>
    </header>

    <div class="satellite-detail">
      <dl>
        <div v-for="row in rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAnchoredDetailPanel } from '@/features/starlink/composables/useAnchoredDetailPanel';
import type { GroundStation, SatelliteDetailRow, ScreenAnchor } from '@/features/starlink/types';

const props = defineProps<{
  visible: boolean;
  station?: GroundStation;
  anchor?: ScreenAnchor;
}>();

defineEmits<{
  close: [];
}>();

const rows = computed<SatelliteDetailRow[]>(() =>
  props.station
    ? [
        { label: 'Station ID', value: props.station.id },
        { label: 'City', value: props.station.city },
        { label: 'Latitude', value: `${props.station.latitude.toFixed(4)}°` },
        { label: 'Longitude', value: `${props.station.longitude.toFixed(4)}°` },
        { label: 'Altitude', value: `${props.station.altitudeMeters.toFixed(1)} m` },
      ]
    : [],
);
const { panelRef, panelStyle, startDrag } = useAnchoredDetailPanel({
  anchor: () => props.anchor,
  active: () => props.visible && Boolean(props.station),
  identity: () => props.station?.id,
});
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
