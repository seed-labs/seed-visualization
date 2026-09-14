<template>
  <section class="satellite-list embedded">
    <section class="selected-satellites">
      <div v-if="selectedSatellites.length" class="selected-satellites-title">
        <span>Orbits visible</span>
        <button type="button" @click="$emit('removeAll')">Clear all</button>
      </div>

      <button
        v-for="satellite in selectedSatellites"
        :key="satellite.id"
        class="selected-satellite-chip"
        type="button"
        @click="$emit('focusSelected', satellite)"
      >
        <span>
          <strong>{{ satellite.name }}</strong>
          <small>NORAD {{ satellite.id }}</small>
        </span>
        <em
          role="button"
          tabindex="0"
          aria-label="Remove selection"
          @click.stop="$emit('remove', satellite)"
          @keydown.enter.stop="$emit('remove', satellite)"
          @keydown.space.prevent.stop="$emit('remove', satellite)"
        >
          x
        </em>
      </button>

      <p v-if="!selectedSatellites.length" class="empty-selected">No selected satellites</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { SatellitePoint } from '@/features/starlink/types';

defineProps<{
  selectedSatellites: SatellitePoint[];
}>();

defineEmits<{
  focusSelected: [satellite: SatellitePoint];
  remove: [satellite: SatellitePoint];
  removeAll: [];
}>();
</script>

<style scoped lang="scss" src="@/features/starlink/styles/satellite-list.scss"></style>
