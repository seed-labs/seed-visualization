import { computed, onBeforeUnmount, ref } from 'vue';

export function useSimulationClock(speed: () => number) {
  const now = ref(new Date());
  const tickMs = 1000;

  function tick() {
    now.value = new Date(now.value.getTime() + tickMs * speed());
  }

  const timerId = window.setInterval(tick, tickMs);
  onBeforeUnmount(() => window.clearInterval(timerId));

  return {
    now,
    isoTime: computed(() => now.value.toISOString().replace('T', ' ').slice(0, 19)),
  };
}
