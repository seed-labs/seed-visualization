import { computed, onBeforeUnmount, ref } from 'vue';

export function useSimulationClock(speed: () => number, paused: () => boolean) {
  const now = ref(new Date());
  const tickMs = 1000;
  let lastWallTimeMs = Date.now();

  function normalizeSpeed(value: number) {
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function tick() {
    const wallTimeMs = Date.now();
    const elapsedWallTimeMs = Math.max(0, wallTimeMs - lastWallTimeMs);
    lastWallTimeMs = wallTimeMs;
    if (paused()) {
      return;
    }

    now.value = new Date(
      now.value.getTime() + elapsedWallTimeMs * normalizeSpeed(speed()),
    );
  }

  const timerId = window.setInterval(tick, tickMs);
  onBeforeUnmount(() => window.clearInterval(timerId));

  function setTime(time: Date | number) {
    const nextTime = new Date(time);
    if (!Number.isNaN(nextTime.getTime())) {
      now.value = nextTime;
      lastWallTimeMs = Date.now();
    }
  }

  return {
    now,
    setTime,
    commitElapsedTime: tick,
    isoTime: computed(() => now.value.toISOString().replace('T', ' ').slice(0, 19)),
  };
}
