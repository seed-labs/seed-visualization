<template>
  <section
    v-if="visible && detail"
    ref="panelRef"
    class="satellite-detail-panel"
    :style="panelStyle"
  >
    <header @pointerdown="startDrag">
      <span>{{ detail.nodeName }}</span>
      <button type="button" aria-label="Close container details" @click="$emit('close')">x</button>
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

const { panelRef, panelStyle, startDrag } = useAnchoredDetailPanel({
  anchor: () => props.anchor,
  active: () => props.visible && Boolean(props.detail),
  identity: () => props.detail?.containerId,
});
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
