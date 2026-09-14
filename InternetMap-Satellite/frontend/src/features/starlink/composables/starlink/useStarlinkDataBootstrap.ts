import { onMounted, onUnmounted, watch, type Ref } from 'vue';
import {
  createGroundTimelineSignature,
  createSatelliteTimelineSignature,
} from '@/features/starlink/composables/useTimelineController';
import { SatelliteDataSource } from '@/features/starlink/services/satelliteDataSource';
import {
  fetchGroundStationsFromEmulator,
} from '@/features/starlink/services/groundStationService';
import {
  fetchPlannedShellOrbitData,
  parsePlannedOrbitRecords,
} from '@/features/starlink/services/tleService';
import type {
  GroundStation,
  InterSatelliteLink,
  PlannedOrbitRecord,
  SatelliteGroundLink,
} from '@/features/starlink/types';

type FrameTimelineKind = 'ground' | 'satellite';

type UseStarlinkDataBootstrapOptions = {
  backendGroundLinks: Ref<SatelliteGroundLink[]>;
  backendLinkedSatelliteIds: Ref<string[]>;
  backendSatelliteLinks: Ref<InterSatelliteLink[]>;
  groundStations: Ref<GroundStation[]>;
  hiddenBackendGroundStationIds: Ref<string[]>;
  hiddenBackendSatelliteIds: Ref<string[]>;
  hiddenBackendSatelliteLinkIds: Ref<string[]>;
  lastGroundTimelineSignature: Ref<string>;
  lastSatelliteTimelineSignature: Ref<string>;
  now: Ref<Date>;
  records: Ref<PlannedOrbitRecord[]>;
  recordFrameTimelineEvent: (
    kind: FrameTimelineKind,
    title: string,
    label: string,
    timestamp: Date,
    signature: string,
    lastSignature: Ref<string>,
    entityLabel: string,
  ) => void;
  selectedGroundStationIds: Ref<string[]>;
  setTime: (time: Date | number) => void;
  timelineFollowCurrentTime: Ref<boolean>;
  timelineWindowOffsetMs: Ref<number>;
};

export function useStarlinkDataBootstrap(options: UseStarlinkDataBootstrapOptions) {
  const satelliteDataSource = new SatelliteDataSource(
    () => options.now.value,
    (time) => options.setTime(time),
  );

  watch(options.now, (simulationTime) => {
    satelliteDataSource.advanceTo(simulationTime);
    if (options.timelineFollowCurrentTime.value) {
      options.timelineWindowOffsetMs.value = 0;
    }
  });

  onMounted(async () => {
    await loadPlannedOrbitRecords();
    await loadGroundStations();
    registerSatelliteDataSourceHandlers();
    satelliteDataSource.connect();
  });

  onUnmounted(() => {
    satelliteDataSource.disconnect();
  });

  async function loadPlannedOrbitRecords() {
    try {
      options.records.value = parsePlannedOrbitRecords(await fetchPlannedShellOrbitData());
    } catch (error) {
      console.warn('Failed to load planned shell orbit data.', error);
    }
  }

  async function loadGroundStations() {
    try {
      const stations = await fetchGroundStationsFromEmulator();
      if (stations.length) {
        options.groundStations.value = stations;
      }
    } catch (error) {
      console.warn('Failed to load emulator star nodes as ground stations.', error);
    }
  }

  function registerSatelliteDataSourceHandlers() {
    satelliteDataSource.on('ground-links', (frame) => {
      if (frame.completed) {
        options.backendGroundLinks.value = [];
        options.backendLinkedSatelliteIds.value = [];
        options.hiddenBackendSatelliteIds.value = [];
        return;
      }

      if (frame.requestIndex === 0 && frame.groupIndex === 0) {
        options.hiddenBackendSatelliteIds.value = [];
        options.hiddenBackendGroundStationIds.value = [];
      }

      const hiddenIds = new Set(options.hiddenBackendSatelliteIds.value);
      options.backendGroundLinks.value = frame.links.filter((link) => !hiddenIds.has(link.satelliteId));
      options.recordFrameTimelineEvent(
        'ground',
        'Ground link update',
        'Ground',
        frame.sampleTime,
        createGroundTimelineSignature(options.backendGroundLinks.value),
        options.lastGroundTimelineSignature,
        'Ground links',
      );
      options.backendLinkedSatelliteIds.value = Array.from(
        new Set(options.backendGroundLinks.value.map((link) => link.satelliteId)),
      );
      const hiddenStationIds = new Set(options.hiddenBackendGroundStationIds.value);
      options.selectedGroundStationIds.value = Array.from(
        new Set([
          ...options.selectedGroundStationIds.value,
          ...options.backendGroundLinks.value
            .map((link) => link.stationId)
            .filter((stationId) => !hiddenStationIds.has(stationId)),
        ]),
      );
    });

    satelliteDataSource.on('satellite-links', (frame) => {
      if (frame.completed) {
        options.backendSatelliteLinks.value = [];
        options.hiddenBackendSatelliteLinkIds.value = [];
        return;
      }

      if (frame.requestIndex === 0 && frame.groupIndex === 0) {
        options.hiddenBackendSatelliteLinkIds.value = [];
      }

      const hiddenIds = new Set(options.hiddenBackendSatelliteLinkIds.value);
      options.backendSatelliteLinks.value = frame.links.filter(
        (link) => !hiddenIds.has(link.satelliteAId) && !hiddenIds.has(link.satelliteBId),
      );
      options.recordFrameTimelineEvent(
        'satellite',
        'Inter-satellite link update',
        'ISL',
        frame.sampleTime,
        createSatelliteTimelineSignature(options.backendSatelliteLinks.value),
        options.lastSatelliteTimelineSignature,
        'Inter-satellite links',
      );
    });

    satelliteDataSource.on('dead', (error) => {
      console.warn('Satellite ground-link websocket disconnected.', error);
    });
  }
}
