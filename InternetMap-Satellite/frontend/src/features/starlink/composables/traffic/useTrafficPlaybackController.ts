import { computed, ref, type Ref } from 'vue';
import {
  TRAFFIC_REPLAY_MAX_EVENTS,
  TRAFFIC_REPLAY_MAX_STEP_MS,
  TRAFFIC_REPLAY_MIN_STEP_MS,
} from '@/features/starlink/constants/trafficReplay';
import {
  clampTrafficReplaySeekPosition as clampReplaySeekPosition,
  compareTrafficReplayEvents,
  createTrafficReplayEvent,
  formatTrafficReplaySeekTooltip as formatReplaySeekTooltip,
  normalizeTrafficReplaySeekInput,
  TrafficReplayPlaylist,
  type TrafficReplaySeekInput,
} from '@/features/starlink/services/traffic/trafficReplayService';
import type {
  SimulationSettings,
  TrafficPacketMessage,
  TrafficPacketReplayEvent,
} from '@/features/starlink/types';

type UseTrafficPlaybackControllerOptions = {
  formatTime: (date: Date) => string;
  isCaptureActive: Ref<boolean>;
  isPanelDisabled: Ref<boolean>;
  renderTime: Ref<Date>;
  settings: SimulationSettings;
  setTime: (timestampMs: number) => void;
  syncTimelineToTime: (timestampMs: number) => void;
  timelineFollowCurrentTime: Ref<boolean>;
  timelineWindowOffsetMs: Ref<number>;
  triggerTrafficPacket: (message: TrafficPacketMessage) => void;
  clearActiveTrafficContainers: () => void;
  playbackEnabled?: Ref<boolean>;
};

export type TrafficPlaybackTimingMode = 'interval' | 'timeline';

export function useTrafficPlaybackController(options: UseTrafficPlaybackControllerOptions) {
  const trafficRecordingEnabled = ref(false);
  const trafficPlaybackEnabled = options.playbackEnabled ?? ref(false);
  const trafficPlaybackIndex = ref(0);
  const trafficReplaySeekPosition = ref(0);
  const trafficPlaybackEvents = ref<TrafficPacketReplayEvent[]>([]);
  const trafficPacketEvents = ref<TrafficPacketReplayEvent[]>([]);
  const trafficImportedFileActive = ref(false);
  const trafficPlaybackPaused = ref(true);
  const trafficPlaybackTimingMode = ref<TrafficPlaybackTimingMode>('interval');
  const trafficPlaybackIntervalMs = ref(2000);
  const trafficPlaybackTimelineWindowMs = ref(0);
  const trafficPlaybackTimelineSpeed = ref(1);
  let trafficPlaybackTimerId: number | undefined;
  const trafficPlaybackScheduledTimerIds = new Set<number>();
  let trafficPlaybackClockFrameId: number | undefined;
  let trafficPlaybackGeneration = 0;

  const trafficReplaySeekMax = computed(() =>
    Math.max(0, trafficPlaybackEvents.value.length || trafficPacketEvents.value.length),
  );
  const trafficReplayRangeLabel = computed(() => {
    const playlist = TrafficReplayPlaylist.from(
      trafficPlaybackEvents.value.length ? trafficPlaybackEvents.value : trafficPacketEvents.value,
    );
    const first = playlist.first;
    const last = playlist.last;

    if (!first || !last) {
      return 'Enable recording to capture incoming traffic packets.';
    }

    return `${options.formatTime(new Date(first.timestampMs))} -> ${options.formatTime(new Date(last.timestampMs))}`;
  });

  function recordTrafficPacket(message: TrafficPacketMessage) {
    const replayEvent = createTrafficReplayEvent(message);
    trafficPacketEvents.value = [...trafficPacketEvents.value, replayEvent].slice(-TRAFFIC_REPLAY_MAX_EVENTS);
  }

  function importTrafficReplayEvents(events: TrafficPacketReplayEvent[]) {
    stopTrafficPlayback();
    trafficRecordingEnabled.value = false;
    trafficPacketEvents.value = [...events]
      .sort(compareTrafficReplayEvents)
      .slice(-TRAFFIC_REPLAY_MAX_EVENTS);
    trafficImportedFileActive.value = true;
    trafficPlaybackEvents.value = [];
    trafficPlaybackIndex.value = 0;
    trafficReplaySeekPosition.value = 0;
    options.clearActiveTrafficContainers();
  }

  function setRecordingEnabled(enabled: boolean) {
    trafficRecordingEnabled.value = enabled;
  }

  function toggleTrafficRecording() {
    if (
      options.isPanelDisabled.value ||
      trafficPlaybackEnabled.value ||
      !options.isCaptureActive.value
    ) {
      return;
    }

    trafficRecordingEnabled.value = !trafficRecordingEnabled.value;
    if (trafficRecordingEnabled.value) {
      stopTrafficPlayback();
    }
  }

  function toggleTrafficPlayback() {
    if (options.isPanelDisabled.value || !trafficPacketEvents.value.length) {
      return;
    }

    if (!trafficPlaybackEnabled.value) {
      startTrafficPlayback();
      return;
    }

    trafficPlaybackPaused.value = !trafficPlaybackPaused.value;
    if (trafficPlaybackPaused.value) {
      clearTrafficPlaybackTimer();
      clearTrafficPlaybackClock();
      return;
    }

    const delayMs = getNextTrafficPlaybackDelayMs(trafficPlaybackIndex.value);
    startTrafficPlaybackClockToNextEvent(delayMs);
    scheduleNextTrafficPlaybackEvent(delayMs);
  }

  function startTrafficPlayback() {
    const playlist = TrafficReplayPlaylist.from(trafficPacketEvents.value);
    const firstEvent = playlist.first;
    if (!firstEvent) {
      return;
    }

    trafficRecordingEnabled.value = false;
    trafficPlaybackEnabled.value = true;
    trafficPlaybackEvents.value = playlist.events;
    trafficPlaybackIndex.value = 0;
    trafficReplaySeekPosition.value = 0;
    trafficPlaybackPaused.value = false;
    options.settings.customTimeEnabled = true;
    trafficPlaybackGeneration += 1;
    playCurrentTrafficPlaybackEvent();
  }

  function stopTrafficPlayback() {
    const realTimeMs = Date.now();
    trafficPlaybackGeneration += 1;
    trafficPlaybackEnabled.value = false;
    trafficPlaybackPaused.value = true;
    trafficPlaybackIndex.value = 0;
    trafficReplaySeekPosition.value = 0;
    trafficPlaybackEvents.value = [];
    options.settings.customTimeEnabled = false;
    options.timelineFollowCurrentTime.value = true;
    options.timelineWindowOffsetMs.value = 0;
    options.setTime(realTimeMs);
    clearTrafficPlaybackTimer();
    clearTrafficPlaybackClock();
  }

  function clearTrafficRecording() {
    if (trafficRecordingEnabled.value || trafficPlaybackEnabled.value) {
      return;
    }

    trafficPlaybackGeneration += 1;
    trafficPacketEvents.value = [];
    trafficPlaybackEvents.value = [];
    trafficImportedFileActive.value = false;
    trafficPlaybackIndex.value = 0;
    trafficReplaySeekPosition.value = 0;
    options.clearActiveTrafficContainers();
  }

  function jumpTrafficPlayback(direction: -1 | 1) {
    if (!trafficPacketEvents.value.length) {
      return;
    }

    const events = ensureTrafficPlaybackEvents();
    trafficPlaybackPaused.value = true;
    options.settings.customTimeEnabled = true;
    trafficPlaybackGeneration += 1;
    clearTrafficPlaybackTimer();
    clearTrafficPlaybackClock();

    const currentIndex = getCurrentTrafficPlaybackEventIndex(events);
    const targetIndex = TrafficReplayPlaylist.from(events).clampIndex(currentIndex + direction);
    showTrafficPlaybackEventAtIndex(targetIndex, events);
  }

  function updateTrafficReplaySeekPosition(value: TrafficReplaySeekInput) {
    const nextPosition = normalizeTrafficReplaySeekInput(value);
    if (!Number.isFinite(nextPosition)) {
      return;
    }

    trafficReplaySeekPosition.value = clampTrafficReplaySeekPosition(nextPosition);
  }

  function seekTrafficPlaybackPosition(value: TrafficReplaySeekInput) {
    const nextPosition = normalizeTrafficReplaySeekInput(value);
    const playlist = TrafficReplayPlaylist.from(
      trafficPlaybackEvents.value.length ? trafficPlaybackEvents.value : trafficPacketEvents.value,
    );
    const events = playlist.events;

    if (!events.length || !Number.isFinite(nextPosition)) {
      return;
    }

    const clampedPosition = playlist.clampPosition(nextPosition);
    trafficPlaybackEvents.value = events;
    trafficPlaybackEnabled.value = true;
    trafficPlaybackPaused.value = true;
    options.settings.customTimeEnabled = true;
    trafficPlaybackGeneration += 1;
    clearTrafficPlaybackTimer();
    clearTrafficPlaybackClock();

    if (clampedPosition <= 0) {
      trafficPlaybackIndex.value = 0;
      trafficReplaySeekPosition.value = 0;
      const firstEvent = events[0];
      options.setTime(firstEvent.timestampMs);
      options.syncTimelineToTime(firstEvent.timestampMs);
      return;
    }

    showTrafficPlaybackEventAtIndex(Math.min(events.length - 1, clampedPosition - 1), events);
  }

  function clampTrafficReplaySeekPosition(position: number) {
    return clampReplaySeekPosition(position, trafficReplaySeekMax.value);
  }

  function formatTrafficReplaySeekTooltip(value: number | string) {
    return formatReplaySeekTooltip(value, trafficReplaySeekMax.value);
  }

  function ensureTrafficPlaybackEvents() {
    if (!trafficPlaybackEvents.value.length) {
      trafficPlaybackEvents.value = [...trafficPacketEvents.value].sort(compareTrafficReplayEvents);
    }
    trafficPlaybackEnabled.value = true;

    return trafficPlaybackEvents.value;
  }

  function getCurrentTrafficPlaybackEventIndex(events: TrafficPacketReplayEvent[]) {
    if (!events.length) {
      return 0;
    }

    if (trafficReplaySeekPosition.value > 0) {
      return Math.min(events.length - 1, Math.max(0, trafficReplaySeekPosition.value - 1));
    }

    return Math.min(events.length - 1, Math.max(0, trafficPlaybackIndex.value - 1));
  }

  function showTrafficPlaybackEventAtIndex(index: number, events = trafficPlaybackEvents.value) {
    const target = events[index];
    if (!target) {
      return;
    }

    trafficPlaybackEvents.value = events;
    trafficPlaybackIndex.value = index + 1;
    trafficReplaySeekPosition.value = index + 1;
    options.setTime(target.timestampMs);
    options.syncTimelineToTime(target.timestampMs);
    options.triggerTrafficPacket(target);
  }

  function playCurrentTrafficPlaybackEvent() {
    clearTrafficPlaybackTimer();
    clearTrafficPlaybackClock();

    if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
      return;
    }

    if (trafficPlaybackTimingMode.value === 'timeline' && trafficPlaybackTimelineWindowMs.value > 0) {
      playCurrentTrafficPlaybackWindow();
      return;
    }

    const currentIndex = trafficPlaybackIndex.value;
    const currentEvent = trafficPlaybackEvents.value[trafficPlaybackIndex.value];
    if (!currentEvent) {
      trafficPlaybackPaused.value = true;
      return;
    }

    options.setTime(currentEvent.timestampMs);
    options.syncTimelineToTime(currentEvent.timestampMs);
    options.triggerTrafficPacket(currentEvent);

    trafficPlaybackIndex.value += 1;
    trafficReplaySeekPosition.value = trafficPlaybackIndex.value;
    const delayMs = getNextTrafficPlaybackDelayMs(trafficPlaybackIndex.value);
    startTrafficPlaybackClockBetweenEvents(currentIndex, delayMs);
    scheduleNextTrafficPlaybackEvent(delayMs);
  }

  function playCurrentTrafficPlaybackWindow() {
    const events = trafficPlaybackEvents.value;
    const startEvent = events[trafficPlaybackIndex.value];
    if (!startEvent) {
      trafficPlaybackPaused.value = true;
      return;
    }

    const windowMs = Math.max(0, Number(trafficPlaybackTimelineWindowMs.value) || 0);
    const speed = getTrafficPlaybackTimelineSpeed();
    const startTimestampMs = startEvent.timestampMs;
    const endTimestampMs = startTimestampMs + windowMs;
    const generation = trafficPlaybackGeneration;
    let nextIndex = trafficPlaybackIndex.value;

    while (nextIndex < events.length && events[nextIndex]!.timestampMs <= endTimestampMs) {
      const event = events[nextIndex]!;
      const eventIndex = nextIndex;
      const delayMs = Math.max(0, Math.round((event.timestampMs - startTimestampMs) / speed));
      const timerId = window.setTimeout(() => {
        trafficPlaybackScheduledTimerIds.delete(timerId);
        if (generation !== trafficPlaybackGeneration || !trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
          return;
        }
        triggerTrafficPlaybackEvent(events[eventIndex]!);
      }, delayMs);
      trafficPlaybackScheduledTimerIds.add(timerId);
      nextIndex += 1;
    }

    trafficPlaybackIndex.value = nextIndex;
    trafficReplaySeekPosition.value = nextIndex;
    startTrafficPlaybackClockTween(startTimestampMs, endTimestampMs, Math.max(1, Math.round(windowMs / speed)));

    if (nextIndex >= events.length) {
      trafficPlaybackTimerId = window.setTimeout(() => {
        trafficPlaybackPaused.value = true;
      }, Math.max(1, Math.round(windowMs / speed)));
      return;
    }

    const nextEvent = events[nextIndex]!;
    scheduleNextTrafficPlaybackEvent(Math.max(
      TRAFFIC_REPLAY_MIN_STEP_MS,
      Math.round((nextEvent.timestampMs - startTimestampMs) / speed),
    ));
  }

  function scheduleNextTrafficPlaybackEvent(delayMs: number) {
    clearTrafficPlaybackTimer();
    if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
      return;
    }

    if (trafficPlaybackIndex.value >= trafficPlaybackEvents.value.length) {
      trafficPlaybackPaused.value = true;
      return;
    }

    trafficPlaybackTimerId = window.setTimeout(playCurrentTrafficPlaybackEvent, delayMs);
  }

  function getTrafficPlaybackDelayMs() {
    return Math.min(
      TRAFFIC_REPLAY_MAX_STEP_MS,
      Math.max(TRAFFIC_REPLAY_MIN_STEP_MS, trafficPlaybackIntervalMs.value),
    );
  }

  function getNextTrafficPlaybackDelayMs(nextIndex: number) {
    if (trafficPlaybackTimingMode.value !== 'timeline') {
      return getTrafficPlaybackDelayMs();
    }

    const currentEvent = trafficPlaybackEvents.value[nextIndex - 1];
    const nextEvent = trafficPlaybackEvents.value[nextIndex];
    if (!currentEvent || !nextEvent) {
      return TRAFFIC_REPLAY_MIN_STEP_MS;
    }

    return Math.min(
      TRAFFIC_REPLAY_MAX_STEP_MS,
      Math.max(
        TRAFFIC_REPLAY_MIN_STEP_MS,
        Math.round((nextEvent.timestampMs - currentEvent.timestampMs) / getTrafficPlaybackTimelineSpeed()),
      ),
    );
  }

  function getTrafficPlaybackTimelineSpeed() {
    return Math.min(10000, Math.max(0.0001, Number(trafficPlaybackTimelineSpeed.value) || 1));
  }

  function clearTrafficPlaybackTimer() {
    if (trafficPlaybackTimerId !== undefined) {
      window.clearTimeout(trafficPlaybackTimerId);
      trafficPlaybackTimerId = undefined;
    }
    trafficPlaybackScheduledTimerIds.forEach((timerId) => window.clearTimeout(timerId));
    trafficPlaybackScheduledTimerIds.clear();
  }

  function triggerTrafficPlaybackEvent(event: TrafficPacketReplayEvent) {
    options.setTime(event.timestampMs);
    options.syncTimelineToTime(event.timestampMs);
    options.triggerTrafficPacket(event);
  }

  function startTrafficPlaybackClockBetweenEvents(currentIndex: number, durationMs: number) {
    const currentEvent = trafficPlaybackEvents.value[currentIndex];
    const nextEvent = trafficPlaybackEvents.value[currentIndex + 1];
    if (!currentEvent || !nextEvent) {
      return;
    }

    startTrafficPlaybackClockTween(currentEvent.timestampMs, nextEvent.timestampMs, durationMs);
  }

  function startTrafficPlaybackClockToNextEvent(durationMs: number) {
    const nextEvent = trafficPlaybackEvents.value[trafficPlaybackIndex.value];
    if (!nextEvent) {
      return;
    }

    startTrafficPlaybackClockTween(options.renderTime.value.getTime(), nextEvent.timestampMs, durationMs);
  }

  function startTrafficPlaybackClockTween(fromTimestampMs: number, toTimestampMs: number, durationMs: number) {
    clearTrafficPlaybackClock();

    const safeDurationMs = Math.max(1, durationMs);
    const startedAtMs = performance.now();

    const tick = () => {
      if (!trafficPlaybackEnabled.value || trafficPlaybackPaused.value) {
        trafficPlaybackClockFrameId = undefined;
        return;
      }

      const progress = Math.min(1, (performance.now() - startedAtMs) / safeDurationMs);
      const timestampMs = fromTimestampMs + (toTimestampMs - fromTimestampMs) * progress;
      options.setTime(timestampMs);
      options.syncTimelineToTime(timestampMs);

      if (progress < 1) {
        trafficPlaybackClockFrameId = window.requestAnimationFrame(tick);
        return;
      }

      trafficPlaybackClockFrameId = undefined;
    };

    trafficPlaybackClockFrameId = window.requestAnimationFrame(tick);
  }

  function clearTrafficPlaybackClock() {
    if (trafficPlaybackClockFrameId !== undefined) {
      window.cancelAnimationFrame(trafficPlaybackClockFrameId);
      trafficPlaybackClockFrameId = undefined;
    }
  }

  return {
    clearTrafficPlaybackClock,
    clearTrafficPlaybackTimer,
    clearTrafficRecording,
    formatTrafficReplaySeekTooltip,
    importTrafficReplayEvents,
    jumpTrafficPlayback,
    recordTrafficPacket,
    setRecordingEnabled,
    seekTrafficPlaybackPosition,
    stopTrafficPlayback,
    toggleTrafficPlayback,
    toggleTrafficRecording,
    trafficPacketEvents,
    trafficImportedFileActive,
    trafficPlaybackEnabled,
    trafficPlaybackEvents,
    trafficPlaybackIntervalMs,
    trafficPlaybackPaused,
    trafficPlaybackTimingMode,
    trafficPlaybackTimelineSpeed,
    trafficPlaybackTimelineWindowMs,
    trafficRecordingEnabled,
    trafficReplayRangeLabel,
    trafficReplaySeekMax,
    trafficReplaySeekPosition,
    updateTrafficReplaySeekPosition,
  };
}
