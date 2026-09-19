import type { Ref } from 'vue'

export function usePacketReplayScheduler(playing: Ref<boolean>) {
  let generation = 0
  let nextTimerId: number | undefined
  const timerIds = new Set<number>()

  function clearTimers() {
    if (nextTimerId !== undefined) window.clearTimeout(nextTimerId)
    nextTimerId = undefined
    timerIds.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.clear()
  }

  function cancel() {
    generation += 1
    clearTimers()
  }

  function scheduleNext(callback: () => void, delayMs: number) {
    const scheduledGeneration = generation
    nextTimerId = window.setTimeout(() => {
      nextTimerId = undefined
      if (scheduledGeneration !== generation || !playing.value) return
      callback()
    }, Math.max(0, delayMs))
  }

  function schedule(callback: () => void, delayMs: number) {
    const scheduledGeneration = generation
    const timerId = window.setTimeout(() => {
      timerIds.delete(timerId)
      if (scheduledGeneration !== generation) return
      callback()
    }, Math.max(0, delayMs))
    timerIds.add(timerId)
  }

  return { cancel, clearTimers, schedule, scheduleNext }
}
