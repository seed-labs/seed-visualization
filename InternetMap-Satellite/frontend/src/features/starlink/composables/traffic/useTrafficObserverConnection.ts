import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import {
  fetchTrafficObserverFilter,
  setTrafficObserverFilter,
  TrafficObserverClient,
} from '@/features/starlink/services/trafficObserverService';
import { isIngressTrafficPacket } from '@/features/starlink/services/starlink/starlinkUiStateService';
import type {
  SimulationSettings,
  TrafficPacketMessage,
} from '@/features/starlink/types';

type UseTrafficObserverConnectionOptions = {
  cleanupInactiveTrafficContainers: () => void;
  captureActive?: Ref<boolean>;
  filterBlocked?: Ref<boolean>;
  isPanelDisabled: Ref<boolean>;
  playbackEnabled: Ref<boolean>;
  recordTrafficPacket: (message: TrafficPacketMessage) => void;
  recordingEnabled: Ref<boolean>;
  rememberTrafficPacketNodes: (message: TrafficPacketMessage) => void;
  setRecordingEnabled: (enabled: boolean) => void;
  settings: SimulationSettings;
  stopTrafficPlayback: () => void;
  triggerTrafficPacket: (message: TrafficPacketMessage) => void;
};

export function useTrafficObserverConnection(options: UseTrafficObserverConnectionOptions) {
  const trafficCaptureActive = options.captureActive ?? ref(false);
  const trafficFilterInput = ref('');
  const trafficActiveFilter = ref('');
  const trafficFilterSubmitting = ref(false);
  const trafficFilterError = ref('');
  let trafficObserverClient: TrafficObserverClient | undefined;
  let trafficCleanupTimerId: number | undefined;

  const trafficFilterStatusText = computed(() => {
    if (trafficFilterError.value) {
      return trafficFilterError.value;
    }
    if (trafficCaptureActive.value) {
      return `Collector filter active: ${trafficActiveFilter.value}`;
    }
    if (options.isPanelDisabled.value) {
      return 'Set Settings simulation speed to 1x before using Traffic Replay.';
    }
    return 'Submit an empty filter to stop packet capture.';
  });

  onMounted(() => {
    void syncTrafficObserverFilter();

    trafficObserverClient = new TrafficObserverClient(
      (message) => {
        if (!isIngressTrafficPacket(message)) {
          return;
        }

        options.rememberTrafficPacketNodes(message);
        if (options.recordingEnabled.value && !options.playbackEnabled.value) {
          options.recordTrafficPacket(message);
        }
        if (!options.playbackEnabled.value) {
          options.triggerTrafficPacket(message);
        }
      },
      (error) => {
        console.warn('Traffic observer websocket error.', error);
      },
    );
    trafficObserverClient.connect();
    trafficCleanupTimerId = window.setInterval(options.cleanupInactiveTrafficContainers, 250);
  });

  onUnmounted(() => {
    trafficObserverClient?.disconnect();
    if (trafficCleanupTimerId !== undefined) {
      window.clearInterval(trafficCleanupTimerId);
    }
  });

  async function syncTrafficObserverFilter() {
    trafficFilterError.value = '';

    try {
      const response = await fetchTrafficObserverFilter();
      const filter = response.filter.trim();
      trafficFilterInput.value = filter;
      trafficActiveFilter.value = filter;
      trafficCaptureActive.value = Boolean(filter);

      if (trafficCaptureActive.value) {
        options.settings.speed = 1;
      } else {
        options.setRecordingEnabled(false);
      }
    } catch (error) {
      trafficFilterError.value = error instanceof Error
        ? error.message
        : 'Failed to load traffic filter.';
    }
  }

  async function submitTrafficFilter() {
    if (options.isPanelDisabled.value || options.filterBlocked?.value || trafficFilterSubmitting.value) {
      return;
    }

    const nextFilter = trafficFilterInput.value.trim();
    trafficFilterSubmitting.value = true;
    trafficFilterError.value = '';

    try {
      const response = await setTrafficObserverFilter(nextFilter);
      trafficActiveFilter.value = response.filter.trim();
      trafficCaptureActive.value = Boolean(trafficActiveFilter.value);

      if (trafficCaptureActive.value) {
        options.stopTrafficPlayback();
        options.settings.speed = 1;
        return;
      }

      options.setRecordingEnabled(false);
      options.stopTrafficPlayback();
    } catch (error) {
      trafficFilterError.value = error instanceof Error ? error.message : 'Failed to update traffic filter.';
    } finally {
      trafficFilterSubmitting.value = false;
    }
  }

  return {
    submitTrafficFilter,
    syncTrafficObserverFilter,
    trafficCaptureActive,
    trafficFilterError,
    trafficFilterInput,
    trafficFilterStatusText,
    trafficFilterSubmitting,
  };
}
