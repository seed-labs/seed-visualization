<template>
  <section
    v-if="visible"
    ref="panelRef"
    class="satellite-detail-panel"
    :style="panelStyle"
  >
    <header @pointerdown="startDrag">
      <span>{{ title }}</span>
      <button type="button" :aria-label="closeLabel" @click="$emit('close')">x</button>
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
import { useAnchoredDetailPanel } from '@/features/starlink/composables/useAnchoredDetailPanel';
import type { SatelliteDetailRow, ScreenAnchor } from '@/features/starlink/types';

const props = withDefaults(defineProps<{
  visible: boolean;
  title: string;
  rows: SatelliteDetailRow[];
  anchor?: ScreenAnchor;
  identity?: string;
  closeLabel?: string;
}>(), {
  closeLabel: 'Close details',
});

defineEmits<{
  close: [];
}>();

const { panelRef, panelStyle, startDrag } = useAnchoredDetailPanel({
  anchor: () => props.anchor,
  active: () => props.visible,
  identity: () => props.identity,
});
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
