import { computed, ref, type Ref } from 'vue';
import {
  TIMELINE_LABEL_LANE_COUNT,
  TIMELINE_LABEL_MIN_GAP_PERCENT,
  TIMELINE_MARKER_MIN_GAP_PERCENT,
  TIMELINE_SHIFT_MS,
  TIMELINE_TICK_MS,
  TIMELINE_WINDOW_MS,
} from '@/features/starlink/constants/timeline';
import type {
  InterSatelliteLink,
  NetworkPathUpdateState,
  SatelliteGroundLink,
} from '@/features/starlink/types';
import type {
  TimelineDisplayEvent,
  TimelineEvent,
  TimelineEventKind,
  TimelineTick,
} from '@/features/starlink/types/timeline';

export function useTimelineController(
  renderTime: Ref<Date>,
  setTime: (timestampMs: number) => void,
  setCustomTimeEnabled: (enabled: boolean) => void,
) {
  const timelineEvents = ref<TimelineEvent[]>([]);
  const timelineWindowOffsetMs = ref(0);
  const timelineEventListVisible = ref(false);
  const timelineSortDescending = ref(true);
  const focusedTimelineEventIds = ref<string[]>([]);
  const timelineCollapsed = ref(true);
  const timelineFollowCurrentTime = ref(true);

  const timelineCenterMs = computed(() => renderTime.value.getTime() + timelineWindowOffsetMs.value);
  const timelineStartMs = computed(() => timelineCenterMs.value - TIMELINE_WINDOW_MS / 2);
  const timelineEndMs = computed(() => timelineCenterMs.value + TIMELINE_WINDOW_MS / 2);
  const currentTimeLeftPercent = computed(() =>
    clampPercent(((renderTime.value.getTime() - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100),
  );
  const visibleTimelineEvents = computed<TimelineDisplayEvent[]>(() =>
    compactTimelineEvents(
      timelineEvents.value.filter(
        (event) =>
          event.timestampMs >= timelineStartMs.value &&
          event.timestampMs <= timelineEndMs.value,
      ),
      focusedTimelineEventIds.value,
    ),
  );
  const sortedTimelineEvents = computed(() =>
    [...timelineEvents.value].sort((left, right) =>
      timelineSortDescending.value
        ? right.timestampMs - left.timestampMs
        : left.timestampMs - right.timestampMs,
    ),
  );
  const timelineTicks = computed<TimelineTick[]>(() => {
    const firstTick = Math.ceil(timelineStartMs.value / TIMELINE_TICK_MS) * TIMELINE_TICK_MS;
    const ticks: TimelineTick[] = [];
    for (let timestampMs = firstTick; timestampMs <= timelineEndMs.value; timestampMs += TIMELINE_TICK_MS) {
      ticks.push({
        timestampMs,
        leftPercent: clampPercent(((timestampMs - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100),
        label: formatTimelineHourMinute(new Date(timestampMs)),
      });
    }
    return ticks;
  });

  function shiftTimelineWindow(direction: -1 | 1) {
    timelineFollowCurrentTime.value = false;
    timelineWindowOffsetMs.value += direction * TIMELINE_SHIFT_MS;
  }

  function syncTimelineToTime(timestampMs: number) {
    timelineFollowCurrentTime.value = false;
    timelineWindowOffsetMs.value = timestampMs - renderTime.value.getTime();
  }

  function toggleTimelineCollapsed() {
    timelineCollapsed.value = !timelineCollapsed.value;
    if (timelineCollapsed.value) {
      closeTimelineEventList();
    }
  }

  function recordFrameTimelineEvent(
    kind: TimelineEventKind,
    label: string,
    shortLabel: string,
    sampleTime: Date,
    signature: string,
    lastSignature: { value: string },
    fallbackDetail: string,
  ) {
    if (!signature || signature === lastSignature.value) {
      return;
    }

    const changes = createTimelineChangeDetails(kind, signature, lastSignature.value, fallbackDetail);
    lastSignature.value = signature;
    changes.forEach((change) => {
      recordTimelineEvent(kind, label, change.action, shortLabel, sampleTime.getTime(), change.detail);
    });
  }

  function recordTimelineEvent(
    kind: TimelineEventKind,
    label: string,
    action: string,
    shortLabel: string,
    timestampMs: number,
    detail = label,
  ) {
    const isoTime = new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, '');
    const event: TimelineEvent = {
      id: `${kind}:${timestampMs}:${Math.random().toString(36).slice(2, 8)}`,
      kind,
      timestampMs,
      label,
      action,
      shortLabel,
      detail,
      isoTime,
    };

    timelineEvents.value = [...timelineEvents.value, event].sort(
      (left, right) => left.timestampMs - right.timestampMs,
    );
  }

  function toggleTimelineSort() {
    timelineSortDescending.value = !timelineSortDescending.value;
  }

  function toggleTimelineEventList() {
    timelineEventListVisible.value = !timelineEventListVisible.value;
    if (!timelineEventListVisible.value) {
      focusedTimelineEventIds.value = [];
    }
  }

  function closeTimelineEventList() {
    timelineEventListVisible.value = false;
    focusedTimelineEventIds.value = [];
  }

  function selectTimelineEventFromList(event: TimelineEvent) {
    focusedTimelineEventIds.value = [event.id];
    jumpToTimelineEvent(event);
  }

  function selectTimelineMarker(event: TimelineDisplayEvent) {
    if (event.isCluster) {
      timelineEventListVisible.value = true;
      focusedTimelineEventIds.value = event.groupedEventIds;
    }
    jumpToTimelineEvent(event);
  }

  function jumpToTimelineEvent(event: TimelineEvent) {
    setTime(event.timestampMs);
    setCustomTimeEnabled(true);
    syncTimelineToTime(event.timestampMs);
  }

  function followCurrentTime() {
    timelineFollowCurrentTime.value = true;
    timelineWindowOffsetMs.value = 0;
  }

  function compactTimelineEvents(events: TimelineEvent[], focusedEventIds: string[]) {
    const focusedEventIdSet = new Set(focusedEventIds);
    const eventsByTimestamp = new Map<number, TimelineEvent[]>();
    events.forEach((event) => {
      eventsByTimestamp.set(event.timestampMs, [
        ...(eventsByTimestamp.get(event.timestampMs) ?? []),
        event,
      ]);
    });

    const timestampEvents = Array.from(eventsByTimestamp.values()).map((timestampGroup) => {
      const displayEvent =
        timestampGroup.find((event) => focusedEventIdSet.has(event.id)) ??
        timestampGroup[timestampGroup.length - 1];
      return {
        ...displayEvent,
        clusterCount: timestampGroup.length,
        groupedEventIds: timestampGroup.map((event) => event.id),
        isCluster: timestampGroup.length > 1,
        leftPercent: clampPercent(
          ((displayEvent.timestampMs - timelineStartMs.value) / TIMELINE_WINDOW_MS) * 100,
        ),
        clusterWidthPercent: 0,
        labelLane: 0,
        timeLabel: formatTimelineClock(new Date(displayEvent.timestampMs)),
        showLabel: false,
      };
    })
      .sort((left, right) => left.leftPercent - right.leftPercent);

    if (focusedEventIds.length) {
      return assignTimelineLabelLanes(
        timestampEvents
          .filter((event) => event.groupedEventIds.some((eventId) => focusedEventIdSet.has(eventId)))
          .map((event) => ({
            ...event,
            showLabel: true,
          })),
        true,
      );
    }

    const markerGroups = groupTimelineMarkersByDistance(timestampEvents);
    const displayEvents = markerGroups
      .map((group) => {
        const displayEvent = [...group].sort((left, right) => right.timestampMs - left.timestampMs)[0];
        const groupedEventIds = group.flatMap((event) => event.groupedEventIds);
        const clusterCount = group.reduce((total, event) => total + event.clusterCount, 0);
        const clusterStartPercent = Math.min(...group.map((event) => event.leftPercent));
        const clusterEndPercent = Math.max(...group.map((event) => event.leftPercent));
        return {
          ...displayEvent,
          clusterCount,
          groupedEventIds,
          isCluster: clusterCount > 1,
          leftPercent: clusterStartPercent,
          clusterWidthPercent: clusterEndPercent - clusterStartPercent,
          showLabel: false,
        };
      })
      .sort((left, right) => right.timestampMs - left.timestampMs)
      .map((event) => ({ ...event, showLabel: true }));

    return assignTimelineLabelLanes(displayEvents)
      .sort((left, right) => left.timestampMs - right.timestampMs);
  }

  return {
    timelineEvents,
    timelineWindowOffsetMs,
    timelineEventListVisible,
    timelineSortDescending,
    focusedTimelineEventIds,
    timelineCollapsed,
    timelineFollowCurrentTime,
    currentTimeLeftPercent,
    visibleTimelineEvents,
    sortedTimelineEvents,
    timelineTicks,
    shiftTimelineWindow,
    syncTimelineToTime,
    toggleTimelineCollapsed,
    recordFrameTimelineEvent,
    recordTimelineEvent,
    toggleTimelineSort,
    toggleTimelineEventList,
    closeTimelineEventList,
    selectTimelineEventFromList,
    selectTimelineMarker,
    followCurrentTime,
    formatTimelineDateTime,
  };
}

export function createGroundTimelineSignature(links: SatelliteGroundLink[]) {
  return links
    .map((link) => `${link.satelliteId}->${link.stationId}`)
    .sort()
    .join('|');
}

export function createSatelliteTimelineSignature(links: InterSatelliteLink[]) {
  return links
    .map((link) => [link.satelliteAId, link.satelliteBId].sort().join('<->'))
    .sort()
    .join('|');
}

export function createNetworkTimelineSignature(links: NetworkPathUpdateState[]) {
  return links
    .map((link, index) => {
      const flowId = link.id ?? `flow-${index}`;
      const forward = link.forwardPath.map((node) => `${node.type}:${node.id}`).join('>');
      const backward = link.returnPath.map((node) => `${node.type}:${node.id}`).join('>');
      return `${flowId}:f=${forward}:r=${backward}`;
    })
    .sort()
    .join('|');
}

function assignTimelineLabelLanes(events: TimelineDisplayEvent[], forceShow = false) {
  const laneSlots: number[][] = Array.from({ length: TIMELINE_LABEL_LANE_COUNT }, () => []);

  return events.map((event) => {
    const labelAnchorPercent = getTimelineLabelAnchorPercent(event);
    const laneIndex = laneSlots.findIndex((slots) =>
      slots.every((leftPercent) => Math.abs(leftPercent - labelAnchorPercent) >= TIMELINE_LABEL_MIN_GAP_PERCENT),
    );

    if (laneIndex === -1) {
      return {
        ...event,
        labelLane: TIMELINE_LABEL_LANE_COUNT - 1,
        showLabel: forceShow ? event.showLabel : false,
      };
    }

    laneSlots[laneIndex].push(labelAnchorPercent);
    return {
      ...event,
      labelLane: laneIndex,
      showLabel: event.showLabel,
    };
  });
}

function getTimelineLabelAnchorPercent(event: TimelineDisplayEvent) {
  return event.isCluster
    ? clampPercent(event.leftPercent + event.clusterWidthPercent + 1)
    : event.leftPercent;
}

function groupTimelineMarkersByDistance(events: TimelineDisplayEvent[]) {
  const groups: TimelineDisplayEvent[][] = [];

  events.forEach((event) => {
    const lastGroup = groups[groups.length - 1];
    const lastEvent = lastGroup?.[lastGroup.length - 1];
    if (lastGroup && lastEvent && Math.abs(event.leftPercent - lastEvent.leftPercent) < TIMELINE_MARKER_MIN_GAP_PERCENT) {
      lastGroup.push(event);
      return;
    }

    groups.push([event]);
  });

  return groups;
}

function createTimelineChangeDetails(
  kind: TimelineEventKind,
  currentSignature: string,
  previousSignature: string,
  fallbackDetail: string,
) {
  const currentItems = parseTimelineSignatureItems(kind, currentSignature);
  const previousItems = parseTimelineSignatureItems(kind, previousSignature);
  const currentByKey = new Map(currentItems.map((item) => [item.key, item]));
  const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
  const changes: Array<{ action: string; detail: string }> = [];

  currentItems.forEach((currentItem) => {
    const previousItem = previousByKey.get(currentItem.key);
    if (!previousItem) {
      changes.push({ action: 'Added', detail: formatSignatureItem(currentItem.raw) });
      return;
    }

    if (previousItem.value !== currentItem.value) {
      changes.push({
        action: 'Update',
        detail: `${formatSignatureItem(currentItem.key)}: ${formatSignatureItem(previousItem.value)} -> ${formatSignatureItem(currentItem.value)}`,
      });
    }
  });

  previousItems.forEach((previousItem) => {
    if (!currentByKey.has(previousItem.key)) {
      changes.push({ action: 'Removed', detail: formatSignatureItem(previousItem.raw) });
    }
  });

  return changes.length
    ? changes
    : [{ action: 'Update', detail: `${fallbackDetail}: ${currentItems.length} active` }];
}

function parseTimelineSignatureItems(kind: TimelineEventKind, signature: string) {
  return signature
    .split('|')
    .filter(Boolean)
    .map((raw) => {
      if (kind === 'ground') {
        const [satelliteId, stationId] = raw.split('->');
        return {
          key: satelliteId || raw,
          value: stationId || raw,
          raw,
        };
      }

      if (kind === 'network') {
        const separatorIndex = raw.indexOf(':f=');
        if (separatorIndex > -1) {
          return {
            key: raw.slice(0, separatorIndex),
            value: raw.slice(separatorIndex + 1),
            raw,
          };
        }
      }

      return {
        key: raw,
        value: raw,
        raw,
      };
    });
}

function formatSignatureItem(value: string) {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function formatTimelineClock(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimelineHourMinute(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimelineDateTime(date: Date) {
  const datePart = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
  return `${datePart} ${formatTimelineClock(date)}`;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
