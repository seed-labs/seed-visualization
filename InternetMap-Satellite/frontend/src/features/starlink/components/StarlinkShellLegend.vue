<template>
  <section class="shell-legend">
    <h2>
      <span>Starlink Shells</span>
      <em>{{ totalSatelliteCount.toLocaleString() }}</em>
    </h2>
    <button
      v-for="shell in items"
      :key="shell.id"
      type="button"
      :class="{ muted: hiddenShellIds.includes(shell.id) }"
      @click="$emit('toggleShell', shell.id)"
    >
      <i :style="{ backgroundColor: shell.color }"></i>
      <span>{{ shell.label }}</span>
      <em>{{ shell.count }}</em>
    </button>
  </section>
</template>

<script setup lang="ts">
export type StarlinkShellLegendItem = {
  id: string;
  label: string;
  color: string;
  count: number;
};

defineProps<{
  items: StarlinkShellLegendItem[];
  totalSatelliteCount: number;
  hiddenShellIds: string[];
}>();

defineEmits<{
  toggleShell: [shellId: string];
}>();
</script>

<style scoped lang="scss" src="@/features/starlink/styles/starlink-shell-legend.scss"></style>
