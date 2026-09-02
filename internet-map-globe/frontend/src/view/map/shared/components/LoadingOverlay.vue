<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean
    message?: string
  }>(),
  {
    message: 'Loading...',
  },
)
</script>

<template>
  <section v-if="visible" class="emulator-topology-loading-overlay">
    <div class="emulator-topology-loading-overlay__box">
      <span class="emulator-topology-loading-overlay__spinner" />
      <strong>{{ message }}</strong>
    </div>
  </section>
</template>

<style scoped lang="scss">
.emulator-topology-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: grid;
  place-items: center;
  color: #edf7ff;
  background: rgba(0, 0, 0, 0.3);
}

.emulator-topology-loading-overlay__box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border: 1px solid rgba(141, 217, 255, 0.22);
  border-radius: 8px;
  background: rgba(6, 15, 22, 0.82);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(18px);
}

.emulator-topology-loading-overlay__spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(237, 247, 255, 0.28);
  border-top-color: #32d6ff;
  border-radius: 50%;
  animation: emulator-topology-loading-overlay-spin 0.9s linear infinite;
}

@keyframes emulator-topology-loading-overlay-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
