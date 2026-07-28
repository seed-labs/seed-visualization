import { ref, type Ref } from 'vue';
import type {
  GroundStation,
  NetworkNodeLocation,
  SatellitePoint,
  ScreenAnchor,
} from '@/features/starlink/types';

export function useSelectionDetailPanels(showSelectionDetails: Ref<boolean>) {
  const statusSatelliteId = ref<string>();
  const statusStationId = ref<string>();
  const statusTrafficContainerId = ref<string>();
  const detailPanelAnchor = ref<ScreenAnchor>();
  const satelliteDetailVisible = ref(false);
  const stationDetailVisible = ref(false);
  const containerDetailVisible = ref(false);

  function showSatelliteStatus(satellite: SatellitePoint | undefined, anchor?: ScreenAnchor) {
    statusSatelliteId.value = satellite?.id;
    satelliteDetailVisible.value = Boolean(satellite && showSelectionDetails.value);
    if (satellite) {
      detailPanelAnchor.value = anchor;
      stationDetailVisible.value = false;
      containerDetailVisible.value = false;
    }
  }

  function showGroundStationStatus(station: GroundStation | undefined, anchor?: ScreenAnchor) {
    statusStationId.value = station?.id;
    stationDetailVisible.value = Boolean(station && showSelectionDetails.value);
    if (station) {
      detailPanelAnchor.value = anchor;
      satelliteDetailVisible.value = false;
      containerDetailVisible.value = false;
    }
  }

  function showTrafficContainerStatus(node: NetworkNodeLocation | undefined, anchor?: ScreenAnchor) {
    statusTrafficContainerId.value = node?.id;
    containerDetailVisible.value = Boolean(node && showSelectionDetails.value);
    if (node) {
      detailPanelAnchor.value = anchor;
      satelliteDetailVisible.value = false;
      stationDetailVisible.value = false;
    }
  }

  function closeSatelliteDetail() {
    satelliteDetailVisible.value = false;
  }

  function closeGroundStationDetail() {
    stationDetailVisible.value = false;
  }

  function closeTrafficContainerDetail() {
    containerDetailVisible.value = false;
  }

  function closeAllSelectionDetails() {
    satelliteDetailVisible.value = false;
    stationDetailVisible.value = false;
    containerDetailVisible.value = false;
  }

  return {
    statusSatelliteId,
    statusStationId,
    statusTrafficContainerId,
    detailPanelAnchor,
    satelliteDetailVisible,
    stationDetailVisible,
    containerDetailVisible,
    showSatelliteStatus,
    showGroundStationStatus,
    showTrafficContainerStatus,
    closeSatelliteDetail,
    closeGroundStationDetail,
    closeTrafficContainerDetail,
    closeAllSelectionDetails,
  };
}
