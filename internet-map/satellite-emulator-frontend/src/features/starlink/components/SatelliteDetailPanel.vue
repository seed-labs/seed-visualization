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
import { computed, ref } from 'vue';
import { createSatelliteDetailRows } from '@/features/starlink/services/satelliteDetailService';
import type { SatellitePoint } from '@/features/starlink/types';

const props = defineProps<{
  visible: boolean;
  satellite?: SatellitePoint;
}>();

defineEmits<{
  close: [];
}>();

const panelRef = ref<HTMLElement>();
const position = ref({ x: Math.max(window.innerWidth - 568, 24), y: 600 });
const dragOffset = ref({ x: 0, y: 0 });

const rows = computed(() => (props.satellite ? createSatelliteDetailRows(props.satellite) : []));
const panelStyle = computed(() => {
  return {
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  };
});

function startDrag(event: PointerEvent) {
  if ((event.target as HTMLElement).closest('button')) {
    return;
  }

  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  const rect = panel.getBoundingClientRect();
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  position.value = {
    x: rect.left,
    y: rect.top,
  };

  panel.setPointerCapture(event.pointerId);
  panel.addEventListener('pointermove', movePanel);
  panel.addEventListener('pointerup', stopDrag, { once: true });
  panel.addEventListener('pointercancel', stopDrag, { once: true });
}

function movePanel(event: PointerEvent) {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const nextX = event.clientX - dragOffset.value.x;
  const nextY = event.clientY - dragOffset.value.y;

  position.value = {
    x: Math.max(0, Math.min(window.innerWidth - width, nextX)),
    y: Math.max(0, Math.min(window.innerHeight - height, nextY)),
  };
}

function stopDrag(event: PointerEvent) {
  const panel = panelRef.value;
  if (!panel) {
    return;
  }

  panel.releasePointerCapture(event.pointerId);
  panel.removeEventListener('pointermove', movePanel);
}
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-detail-panel.scss"></style>
