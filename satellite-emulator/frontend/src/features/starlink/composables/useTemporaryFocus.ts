import { nextTick, ref } from 'vue';

export function useTemporaryFocus(durationMs: number) {
  const focusedSatelliteId = ref<string>();
  const focusedStationId = ref<string>();
  let satelliteClearTimer: number | undefined;
  let stationClearTimer: number | undefined;

  async function flashFocusedSatellite(satelliteId: string) {
    if (satelliteClearTimer !== undefined) {
      window.clearTimeout(satelliteClearTimer);
    }

    focusedSatelliteId.value = undefined;
    await nextTick();
    focusedSatelliteId.value = satelliteId;
    satelliteClearTimer = window.setTimeout(() => {
      if (focusedSatelliteId.value === satelliteId) {
        focusedSatelliteId.value = undefined;
      }
      satelliteClearTimer = undefined;
    }, durationMs);
  }

  async function flashFocusedStation(stationId: string) {
    if (stationClearTimer !== undefined) {
      window.clearTimeout(stationClearTimer);
    }

    focusedStationId.value = undefined;
    await nextTick();
    focusedStationId.value = stationId;
    stationClearTimer = window.setTimeout(() => {
      if (focusedStationId.value === stationId) {
        focusedStationId.value = undefined;
      }
      stationClearTimer = undefined;
    }, durationMs);
  }

  function disposeTemporaryFocus() {
    if (satelliteClearTimer !== undefined) {
      window.clearTimeout(satelliteClearTimer);
      satelliteClearTimer = undefined;
    }
    if (stationClearTimer !== undefined) {
      window.clearTimeout(stationClearTimer);
      stationClearTimer = undefined;
    }
  }

  return {
    focusedSatelliteId,
    focusedStationId,
    flashFocusedSatellite,
    flashFocusedStation,
    disposeTemporaryFocus,
  };
}
