<template>
  <AnchoredDetailPanel
    v-if="visible && satellite"
    :visible="visible"
    :title="satellite.name"
    :rows="rows"
    :anchor="anchor"
    :identity="satellite.id"
    close-label="Close details"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnchoredDetailPanel from '@/features/starlink/components/AnchoredDetailPanel.vue';
import { createSatelliteDetailRows } from '@/features/starlink/services/satelliteDetailService';
import type { SatellitePoint, ScreenAnchor } from '@/features/starlink/types';

const props = defineProps<{
  visible: boolean;
  satellite?: SatellitePoint;
  anchor?: ScreenAnchor;
}>();

defineEmits<{
  close: [];
}>();

const rows = computed(() => (props.satellite ? createSatelliteDetailRows(props.satellite) : []));
</script>
