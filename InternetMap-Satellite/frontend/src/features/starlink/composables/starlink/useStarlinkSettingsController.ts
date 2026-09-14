import { ref } from 'vue';
import { sanitizeOrbitPlaneIdsForHiddenShells } from '@/features/starlink/services/starlink/starlinkUiStateService';
import type { SimulationSettings } from '@/features/starlink/types';

type UseStarlinkSettingsControllerOptions = {
  closeAllSelectionDetails: () => void;
  closeGroundStationDetail: () => void;
  closeSatelliteDetail: () => void;
  commitElapsedTime: () => void;
  formatTimelineDateTime: (date: Date) => string;
  isTrafficCaptureActive: () => boolean;
  recordTimelineEvent: (
    kind: 'ground' | 'network' | 'satellite' | 'time',
    title: string,
    label: string,
    entityLabel: string,
    timestampMs: number,
    description: string,
  ) => void;
  resetStatusSatellite: () => void;
  resetStatusStation: () => void;
  settings: SimulationSettings;
  setTime: (time: Date | number) => void;
  syncTimelineToTime: (timestampMs: number) => void;
};

export function useStarlinkSettingsController(options: UseStarlinkSettingsControllerOptions) {
  const hiddenShellIds = ref<string[]>([]);

  function toggleShellVisibility(shellId: string) {
    if (hiddenShellIds.value.includes(shellId)) {
      hiddenShellIds.value = hiddenShellIds.value.filter((id) => id !== shellId);
      sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIds.value);
      return;
    }

    hiddenShellIds.value = [...hiddenShellIds.value, shellId];
    sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIds.value);
  }

  function updateSettings(nextSettings: SimulationSettings) {
    if (
      nextSettings.speed !== options.settings.speed ||
      nextSettings.paused !== options.settings.paused
    ) {
      options.commitElapsedTime();
    }
    const sanitizedSettings = { ...nextSettings };
    if (options.isTrafficCaptureActive()) {
      sanitizedSettings.speed = 1;
    }
    sanitizedSettings.selectedOrbitPlaneIds = sanitizeOrbitPlaneIdsForHiddenShells(
      sanitizedSettings.selectedOrbitPlaneIds,
      hiddenShellIds.value,
    );
    Object.assign(options.settings, sanitizedSettings);
    if (!options.settings.showSelectionDetails) {
      options.closeAllSelectionDetails();
    }
    if (!options.settings.showSatellites) {
      options.closeSatelliteDetail();
      options.resetStatusSatellite();
    }
    if (!options.settings.showGroundStations) {
      options.closeGroundStationDetail();
      options.resetStatusStation();
    }
  }

  function sanitizeSelectedOrbitPlanesForVisibleShells(hiddenShellIdsSnapshot: string[]) {
    const nextPlaneIds = sanitizeOrbitPlaneIdsForHiddenShells(
      options.settings.selectedOrbitPlaneIds,
      hiddenShellIdsSnapshot,
    );

    if (nextPlaneIds.length !== options.settings.selectedOrbitPlaneIds.length) {
      options.settings.selectedOrbitPlaneIds = nextPlaneIds;
    }
  }

  function setSystemTime(timestampMs: number) {
    options.setTime(timestampMs);
    options.settings.customTimeEnabled = true;
    options.syncTimelineToTime(timestampMs);
    options.recordTimelineEvent(
      'time',
      'Manual time jump',
      'Jump',
      'Jump',
      timestampMs,
      `Jumped to ${options.formatTimelineDateTime(new Date(timestampMs))}`,
    );
  }

  function resetSystemTime() {
    const timestampMs = Date.now();
    options.setTime(timestampMs);
    options.settings.customTimeEnabled = false;
    options.syncTimelineToTime(timestampMs);
    options.recordTimelineEvent(
      'time',
      'Reset to current time',
      'Reset',
      'Now',
      timestampMs,
      `Reset to ${options.formatTimelineDateTime(new Date(timestampMs))}`,
    );
  }

  return {
    hiddenShellIds,
    resetSystemTime,
    setSystemTime,
    toggleShellVisibility,
    updateSettings,
  };
}
