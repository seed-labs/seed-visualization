export type TimelineEventKind = 'ground' | 'satellite' | 'network' | 'time';

export type TimelineEvent = {
  id: string;
  kind: TimelineEventKind;
  timestampMs: number;
  label: string;
  action: string;
  shortLabel: string;
  detail: string;
  isoTime: string;
};

export type TimelineDisplayEvent = TimelineEvent & {
  leftPercent: number;
  clusterWidthPercent: number;
  labelLane: number;
  timeLabel: string;
  clusterCount: number;
  groupedEventIds: string[];
  isCluster: boolean;
  showLabel: boolean;
};

export type TimelineTick = {
  timestampMs: number;
  leftPercent: number;
  label: string;
};
