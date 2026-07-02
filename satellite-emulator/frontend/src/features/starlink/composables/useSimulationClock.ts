import { computed, onBeforeUnmount, ref } from 'vue';

export function useSimulationClock(speed: () => number) {
  const now = ref(new Date());
  const tickMs = 1000;

  function tick() {
    now.value = new Date(now.value.getTime() + tickMs * speed());
  }

  const timerId = window.setInterval(tick, tickMs);
  onBeforeUnmount(() => window.clearInterval(timerId));

  function setTime(time: Date | number) {
    const nextTime = new Date(time);
    if (!Number.isNaN(nextTime.getTime())) {
      now.value = nextTime;
    }
  }

  return {
    now,
    setTime,
    isoTime: computed(() => now.value.toISOString().replace('T', ' ').slice(0, 19)),
  };
}
