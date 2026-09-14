<template>
  <AnchoredDetailPanel
    v-if="visible && station"
    :visible="visible"
    :title="station.name"
    :rows="rows"
    :anchor="anchor"
    :identity="station.id"
    close-label="Close station details"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnchoredDetailPanel from '@/features/starlink/components/AnchoredDetailPanel.vue';
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
</script>
