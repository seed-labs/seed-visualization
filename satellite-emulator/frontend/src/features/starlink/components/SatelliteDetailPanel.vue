<template>
  <section
    v-if="visible && satellite"
    ref="panelRef"
    class="satellite-detail-panel"
    :style="panelStyle"
  >
    <header @pointerdown="startDrag">
      <span>{{ satellite.name }}</span>
      <button type="button" aria-label="Close details" @click="$emit('close')">x</button>
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
const { panelRef, panelStyle, startDrag } = useAnchoredDetailPanel({
  anchor: () => props.anchor,
  active: () => props.visible && Boolean(props.satellite),
  identity: () => props.satellite?.id,
});
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
