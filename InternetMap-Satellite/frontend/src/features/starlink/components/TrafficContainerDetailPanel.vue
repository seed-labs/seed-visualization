<template>
  <AnchoredDetailPanel
    v-if="visible && detail"
    :visible="visible"
    :title="detail.nodeName"
    :rows="rows"
    :anchor="anchor"
    :identity="detail.containerId"
    close-label="Close container details"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnchoredDetailPanel from '@/features/starlink/components/AnchoredDetailPanel.vue';
import type {
  SatelliteDetailRow,
  ScreenAnchor,
  TrafficContainerNodeDetail,
} from '@/features/starlink/types';

const props = defineProps<{
  visible: boolean;
  detail?: TrafficContainerNodeDetail;
  anchor?: ScreenAnchor;
}>();

defineEmits<{
  close: [];
}>();

const rows = computed<SatelliteDetailRow[]>(() =>
  props.detail
    ? [
        { label: 'Container ID', value: props.detail.shortContainerId },
        { label: 'Node name', value: props.detail.nodeName },
        { label: 'Node IP', value: props.detail.nodeIp || '-' },
        { label: 'Node type', value: props.detail.nodeType || '-' },
        { label: 'Container', value: props.detail.containerName || '-' },
        { label: 'Longitude', value: formatCoordinate(props.detail.longitude) },
        { label: 'Latitude', value: formatCoordinate(props.detail.latitude) },
        { label: 'Location source', value: props.detail.locationSource || '-' },
      ]
    : [],
);

function formatCoordinate(value: number | undefined) {
  return value === undefined ? '-' : value.toFixed(5);
}
</script>
