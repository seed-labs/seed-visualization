import {
  Cartesian3,
  Cartesian2,
  Cartographic,
  Color,
  EllipsoidGeodesic,
  HeightReference,
  ImageryLayer,
  Ion,
  LabelCollection,
  LabelStyle,
  Math as CesiumMath,
  Material,
  NearFarScalar,
  PointPrimitiveCollection,
  PolylineCollection,
  SceneMode,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  WebMercatorTilingScheme,
} from 'cesium';
import { sampleOrbit } from '@/features/starlink/services/orbitService';
import { getSatelliteShellStyle } from '@/features/starlink/services/satelliteShellStyle';
import type {
  GroundStation,
  InterSatelliteLink,
  NetworkNodeLocation,
  NetworkNodeRef,
  NetworkPathUpdateState,
  PlannedOrbitRecord,
  SatelliteGroundLink,
  SatellitePoint,
  ScreenAnchor,
} from '@/features/starlink/types';

Ion.defaultAccessToken = '';

const HIGHLIGHT_COLOR = Color.fromCssColorString('#fff7c8');
const HOVER_COLOR = Color.fromCssColorString('#fff8dc');
const ORBIT_COLOR = Color.fromCssColorString('#ff6b3a').withAlpha(0.42);
const STATION_COLOR = Color.fromCssColorString('#ffffff');
const LINK_COLOR = Color.fromCssColorString('#45f3ff').withAlpha(0.62);
const SATELLITE_LINK_COLOR = Color.fromCssColorString('#ffe66d').withAlpha(0.72);
const NETWORK_FORWARD_LINK_COLOR = Color.fromCssColorString('#ff4dff').withAlpha(0.9);
const NETWORK_RETURN_LINK_COLOR = Color.fromCssColorString('#39ff9f').withAlpha(0.82);
const ROUTER_COLOR = Color.fromCssColorString('#b36bff');
const HOST_COLOR = Color.fromCssColorString('#55ffbd');
const TRAFFIC_FLASH_COLOR = Color.fromCssColorString('#fff176');
const SATELLITE_PIXEL_SIZE = 2.25;
const STATION_PIXEL_SIZE = SATELLITE_PIXEL_SIZE * 2;
const GROUND_LINK_ARC_SEGMENTS = 48;
const GROUND_LINK_MIN_ARC_LIFT_METERS = 260_000;
const GROUND_LINK_MAX_ARC_LIFT_METERS = 1_400_000;
const LINK_FLASH_DURATION_MS = 900;
const LINK_RETIRE_DURATION_MS = 1_100;

type LinkSnapshot = {
  key: string;
  positions: Cartesian3[];
  color: Color;
  width: number;
  material: 'dash' | 'arrow';
};

type RetiringLinkSnapshot = LinkSnapshot & {
  expiresAt: number;
};

function createColorMaterial(color: Color) {
  return Material.fromType('Color', { color });
}

function createDashMaterial(color: Color) {
  return Material.fromType(Material.PolylineDashType, {
    color,
    gapColor: Color.TRANSPARENT,
    dashLength: 18,
    dashPattern: 0b1111000011110000,
  });
}

function createArrowMaterial(color: Color) {
  return Material.fromType(Material.PolylineArrowType, { color });
}

function createMeridianPositions(longitude: number) {
  const degrees: number[] = [];
  for (let latitude = -90; latitude <= 90; latitude += 2) {
    degrees.push(longitude, latitude);
  }

  return Cartesian3.fromDegreesArray(degrees);
}

function createParallelPositions(latitude: number) {
  const degrees: number[] = [];
  for (let longitude = -180; longitude <= 180; longitude += 2) {
    degrees.push(longitude, latitude);
  }

  return Cartesian3.fromDegreesArray(degrees);
}

function createGroundLinkArcPositions(satellite: SatellitePoint, station: GroundStation) {
  const satelliteHeight = satellite.altitudeKm * 1000;
  const stationHeight = station.altitudeMeters;
  const geodesic = new EllipsoidGeodesic(
    Cartographic.fromDegrees(station.longitude, station.latitude),
    Cartographic.fromDegrees(satellite.longitude, satellite.latitude),
  );
  const arcLift = Math.min(
    GROUND_LINK_MAX_ARC_LIFT_METERS,
    Math.max(GROUND_LINK_MIN_ARC_LIFT_METERS, geodesic.surfaceDistance * 0.16),
  );

  return Array.from({ length: GROUND_LINK_ARC_SEGMENTS + 1 }, (_, index) => {
    const fraction = index / GROUND_LINK_ARC_SEGMENTS;
    const surfacePoint = geodesic.interpolateUsingFraction(fraction);
    const height =
      stationHeight +
      (satelliteHeight - stationHeight) * fraction +
      Math.sin(Math.PI * fraction) * arcLift;

    return Cartesian3.fromRadians(surfacePoint.longitude, surfacePoint.latitude, height);
  });
}

export type CesiumSceneApi = {
  viewer: Viewer;
  renderSatellites: (satellites: SatellitePoint[], options: RenderOptions) => void;
  destroy: () => void;
};

export type RenderOptions = {
  selectedId?: string;
  highlightedIds: string[];
  groundStations: GroundStation[];
  groundLinks: SatelliteGroundLink[];
  satelliteLinks: InterSatelliteLink[];
  networkLinks: NetworkPathUpdateState[];
  networkNodes: NetworkNodeLocation[];
  containerNodes: NetworkNodeLocation[];
  activeTrafficNodeIds: string[];
  focusedSatelliteId?: string;
  focusedStationId?: string;
  focusedContainerNodeId?: string;
  showSatellites: boolean;
  showGroundStations: boolean;
  showLabels: boolean;
  orbitRecords: PlannedOrbitRecord[];
  currentTime: Date;
  onSelect: (satellite: SatellitePoint) => void;
  onStationSelect: (station: GroundStation) => void;
  onSatelliteHover: (satellite: SatellitePoint | undefined, anchor?: ScreenAnchor) => void;
  onStationHover: (station: GroundStation | undefined, anchor?: ScreenAnchor) => void;
  onContainerNodeHover: (node: NetworkNodeLocation | undefined, anchor?: ScreenAnchor) => void;
};

type PickableNetworkNode = NetworkNodeLocation & {
  pickKind: 'network-node' | 'container-node';
};

const STARLINK_TILE_URL = import.meta.env.VITE_SATELLITE_TILES_URL
  ?? 'https://satellitemap.space/tiles/styles/dark/512/{z}/{x}/{y}@2x.png';
const STARLINK_TILE_CREDIT = 'satellitemap.space';
const STARLINK_TILE_MINIMUM_LEVEL = 0;
const STARLINK_TILE_MAXIMUM_LEVEL = 7;
const STARLINK_TILE_SIZE = 1024;

export function createCesiumScene(container: HTMLElement): CesiumSceneApi {
  const baseLayer = new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: STARLINK_TILE_URL,
      credit: STARLINK_TILE_CREDIT,
      tilingScheme: new WebMercatorTilingScheme(),
      minimumLevel: STARLINK_TILE_MINIMUM_LEVEL,
      maximumLevel: STARLINK_TILE_MAXIMUM_LEVEL,
      tileWidth: STARLINK_TILE_SIZE,
      tileHeight: STARLINK_TILE_SIZE,
    }),
  );
  baseLayer.brightness = 0.9;
  baseLayer.contrast = 1.08;
  baseLayer.hue = 0;
  baseLayer.saturation = 1.08;
  baseLayer.gamma = 0.92;

  const viewer = new Viewer(container, {
    animation: false,
    baseLayer,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    sceneMode: SceneMode.SCENE3D,
    shouldAnimate: true,
  });

  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.baseColor = Color.fromCssColorString('#0a2140');
  viewer.scene.globe.material = undefined;
  viewer.scene.backgroundColor = Color.fromCssColorString('#020815');
  viewer.scene.globe.maximumScreenSpaceError = 1;
  viewer.scene.globe.tileCacheSize = 700;
  viewer.scene.globe.atmosphereHueShift = 0;
  viewer.scene.globe.atmosphereSaturationShift = -0.15;
  viewer.scene.globe.atmosphereBrightnessShift = -0.34;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.scene.postProcessStages.bloom.enabled = true;
  viewer.scene.postProcessStages.bloom.uniforms.glowOnly = false;
  viewer.scene.postProcessStages.bloom.uniforms.contrast = 120;
  viewer.scene.postProcessStages.bloom.uniforms.brightness = -0.25;
  viewer.scene.postProcessStages.bloom.uniforms.delta = 1.1;
  viewer.scene.postProcessStages.bloom.uniforms.sigma = 2.2;
  viewer.scene.postProcessStages.bloom.uniforms.stepSize = 1;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.hueShift = 0;
    viewer.scene.skyAtmosphere.saturationShift = -0.35;
    viewer.scene.skyAtmosphere.brightnessShift = -0.42;
  }

  viewer.scene.camera.setView({
    destination: Cartesian3.fromDegrees(106, 24, 18_000_000),
    orientation: {
      heading: CesiumMath.toRadians(0),
      pitch: CesiumMath.toRadians(-90),
      roll: 0,
    },
  });

  const points = viewer.scene.primitives.add(new PointPrimitiveCollection());
  const stationPoints = viewer.scene.primitives.add(new PointPrimitiveCollection());
  const networkNodePoints = viewer.scene.primitives.add(new PointPrimitiveCollection());
  const labels = viewer.scene.primitives.add(new LabelCollection());
  const orbitLines = viewer.scene.primitives.add(new PolylineCollection());
  const groundLinkLines = viewer.scene.primitives.add(new PolylineCollection());
  const satelliteLinkLines = viewer.scene.primitives.add(new PolylineCollection());
  const networkLinkLines = viewer.scene.primitives.add(new PolylineCollection());
  const gridLines = viewer.scene.primitives.add(new PolylineCollection());
  for (let longitude = -180; longitude <= 180; longitude += 15) {
    gridLines.add({
      positions: createMeridianPositions(longitude),
      width: longitude % 45 === 0 ? 0.8 : 0.45,
      material: createColorMaterial(Color.fromCssColorString('#6ee7ff').withAlpha(0.16)),
    });
  }
  for (let latitude = -75; latitude <= 75; latitude += 15) {
    gridLines.add({
      positions: createParallelPositions(latitude),
      width: latitude % 45 === 0 ? 0.8 : 0.45,
      material: createColorMaterial(Color.fromCssColorString('#6ee7ff').withAlpha(0.16)),
    });
  }
  const pointBySatelliteId = new Map<string, ReturnType<typeof points.add>>();
  const pointByStationId = new Map<string, ReturnType<typeof stationPoints.add>>();
  let lastLinkSnapshots = new Map<string, LinkSnapshot>();
  const linkFlashUntilByKey = new Map<string, number>();
  const retiringLinksByKey = new Map<string, RetiringLinkSnapshot>();
  let hoveredSatelliteId: string | undefined;
  let hoveredStationId: string | undefined;
  let hoveredContainerNodeId: string | undefined;
  const highlightTimerId = window.setInterval(() => {
    lastHighlightedIds.forEach((satelliteId) => {
      const point = pointBySatelliteId.get(satelliteId);
      if (point) {
        applyPointStyle(point, satelliteId, lastSelectedId, lastHighlightedIds);
      }
    });
  }, 180);

  function applyPointStyle(
    point: ReturnType<typeof points.add>,
    satelliteId: string,
    selectedId?: string,
    highlightedIds: ReadonlySet<string> = new Set(),
    focusedId?: string,
  ) {
    const hovered = satelliteId === hoveredSatelliteId;
    const selected = satelliteId === selectedId;
    const focused = satelliteId === focusedId;
    const emphasized = hovered || selected || focused;
    const highlighted = highlightedIds.has(satelliteId);
    const shellColor = Color.fromCssColorString(point.id.orbitPlaneId
      ? getSatelliteShellStyle(point.id.orbitPlaneId).color
      : '#858585');
    const pulse = highlighted || focused ? 1 + Math.sin(Date.now() / 180) * 0.32 : 1;

    point.pixelSize =
      (emphasized ? 4.2 : highlighted ? 11.25 : SATELLITE_PIXEL_SIZE) * pulse;
    point.color = emphasized
      ? Color.TRANSPARENT
      : highlighted
          ? HIGHLIGHT_COLOR
          : shellColor;
    point.outlineColor = emphasized ? shellColor : Color.TRANSPARENT;
    point.outlineWidth = emphasized ? 1.6 : 0;
    point.scaleByDistance = new NearFarScalar(2_000_000, emphasized ? 2.1 : 2, 18_000_000, 0.95);
  }

  function applyStationPointStyle(
    point: ReturnType<typeof stationPoints.add>,
    stationId: string,
    focusedStationId?: string,
  ) {
    const hovered = stationId === hoveredStationId;
    const focused = stationId === focusedStationId;
    const pulse = focused ? 1 + Math.sin(Date.now() / 180) * 0.32 : 1;

    point.pixelSize = STATION_PIXEL_SIZE * (hovered ? 1.5 : focused ? 1.35 : 1) * pulse;
    point.color = hovered || focused ? HOVER_COLOR : STATION_COLOR;
    point.outlineColor = focused ? STATION_COLOR : Color.TRANSPARENT;
    point.outlineWidth = focused ? 1.4 : 0;
    point.scaleByDistance = new NearFarScalar(
      2_000_000,
      hovered || focused ? 2.25 : 2,
      18_000_000,
      0.95,
    );
  }

  function renderSatellites(satellites: SatellitePoint[], options: RenderOptions) {
    const nowMs = performance.now();
    const nextLinkSnapshots = new Map<string, LinkSnapshot>();
    points.removeAll();
    stationPoints.removeAll();
    networkNodePoints.removeAll();
    labels.removeAll();
    orbitLines.removeAll();
    groundLinkLines.removeAll();
    satelliteLinkLines.removeAll();
    networkLinkLines.removeAll();
    pointBySatelliteId.clear();
    pointByStationId.clear();
    const highlightedIds = new Set(options.highlightedIds);
    const satelliteById = new Map(satellites.map((satellite) => [satellite.id, satellite]));
    const stationById = new Map(options.groundStations.map((station) => [station.id, station]));
    const networkNodeById = new Map(
      [...options.networkNodes, ...options.containerNodes].map((node) => [node.id, node]),
    );
    const activeTrafficNodeIds = new Set(options.activeTrafficNodeIds);
    const connectedSatelliteIds = new Set<string>();
    const connectedStationIds = new Set<string>();
    options.groundLinks.forEach((link) => {
      connectedSatelliteIds.add(link.satelliteId);
      connectedStationIds.add(link.stationId);
    });
    options.satelliteLinks.forEach((link) => {
      connectedSatelliteIds.add(link.satelliteAId);
      connectedSatelliteIds.add(link.satelliteBId);
    });
    options.networkLinks.forEach((link) => {
      [...link.forwardPath, ...link.returnPath].forEach((node) => {
        if (isSatelliteNode(node)) {
          connectedSatelliteIds.add(node.id);
        }
        if (isGroundStationNode(node)) {
          connectedStationIds.add(node.id);
        }
      });
    });

    const connectedNetworkNodeIds = new Set<string>();
    options.networkLinks.forEach((link) => {
      [...link.forwardPath, ...link.returnPath].forEach((node) => {
        if (!isSatelliteNode(node) && !isGroundStationNode(node)) {
          connectedNetworkNodeIds.add(node.id);
        }
      });
    });

    options.networkNodes.forEach((node) => {
      renderNetworkNodePoint(node, false, 'network-node');
    });

    options.containerNodes.forEach((node) => {
      renderNetworkNodePoint(node, isTrafficNodeActive(node.id, activeTrafficNodeIds), 'container-node');
    });

    [...options.networkNodes, ...options.containerNodes].forEach((node) => {
      const position = Cartesian3.fromDegrees(node.longitude, node.latitude, node.altitudeMeters ?? 0);
      const isHost = node.type === 'host';
      const color = isHost ? HOST_COLOR : ROUTER_COLOR;
      if (
        options.showLabels &&
        (connectedNetworkNodeIds.has(node.id) || isTrafficNodeActive(node.id, activeTrafficNodeIds))
      ) {
        labels.add({
          position,
          text: node.name,
          font: '18px sans-serif',
          fillColor: color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -16),
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1_500_000, 1, 12_000_000, 0.32),
        });
      }
    });

    if (options.showGroundStations) {
      options.groundStations.forEach((station) => {
      const position = Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        station.altitudeMeters,
      );

      const point = stationPoints.add({
        id: station,
        position,
        pixelSize: STATION_PIXEL_SIZE,
        color: STATION_COLOR,
        outlineWidth: 0,
        scaleByDistance: new NearFarScalar(2_000_000, 2, 18_000_000, 0.95),
      });
      applyStationPointStyle(point, station.id, options.focusedStationId);
      pointByStationId.set(station.id, point);

      if (
        options.showLabels &&
        (connectedStationIds.has(station.id) || station.id === options.focusedStationId)
      ) {
        labels.add({
          position,
          text: station.city,
          font: '20px sans-serif',
          fillColor: STATION_COLOR,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -16),
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1_500_000, 1, 12_000_000, 0.3),
        });
      }
    });
    }

    if (options.showSatellites) {
      satellites.forEach((satellite) => {
      const selected = satellite.id === options.selectedId;
      const position = Cartesian3.fromDegrees(
        satellite.longitude,
        satellite.latitude,
        satellite.altitudeKm * 1000,
      );

      const point = points.add({
        id: satellite,
        position,
        pixelSize: SATELLITE_PIXEL_SIZE,
        color: Color.fromCssColorString(getSatelliteShellStyle(satellite.orbitPlaneId).color),
        outlineWidth: 0,
        scaleByDistance: new NearFarScalar(2_000_000, 2, 18_000_000, 0.95),
      });

      point.id = satellite;
      applyPointStyle(point, satellite.id, options.selectedId, highlightedIds, options.focusedSatelliteId);
      pointBySatelliteId.set(satellite.id, point);

      if (
        options.showLabels &&
        (selected || highlightedIds.has(satellite.id) || connectedSatelliteIds.has(satellite.id))
      ) {
        const highlighted = highlightedIds.has(satellite.id);
        labels.add({
          position,
          text: satellite.name,
          font: highlighted ? '24px sans-serif' : selected ? '21px sans-serif' : '18px sans-serif',
          fillColor: highlighted
            ? HIGHLIGHT_COLOR
            : Color.fromCssColorString(getSatelliteShellStyle(satellite.orbitPlaneId).color),
          outlineColor: Color.BLACK,
          outlineWidth: highlighted ? 3 : 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, highlighted ? -28 : -18),
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1_500_000, 1, 12_000_000, highlighted ? 0.55 : 0.3),
        });
      }
    });
    }

    options.orbitRecords.forEach((record) => {
      const path = sampleOrbit(record, options.currentTime);
      if (path.length > 2) {
        orbitLines.add({
          positions: path.map(([lon, lat, height]) => Cartesian3.fromDegrees(lon, lat, height)),
          width: 2.4,
          material: createColorMaterial(
            Color.fromCssColorString(getSatelliteShellStyle(record.orbitPlaneId).color).withAlpha(0.82),
          ),
        });
      }
    });

    options.groundLinks.forEach((link) => {
      const satellite = satelliteById.get(link.satelliteId);
      const station = stationById.get(link.stationId);
      if (!satellite || !station) {
        return;
      }

      renderTrackedLink({
        key: createGroundLinkKey(link),
        positions: createGroundLinkArcPositions(satellite, station),
        width: 0.9,
        color: LINK_COLOR,
        material: 'dash',
      });
    });

    options.satelliteLinks.forEach((link) => {
      const satelliteA = satelliteById.get(link.satelliteAId);
      const satelliteB = satelliteById.get(link.satelliteBId);
      if (!satelliteA || !satelliteB) {
        return;
      }

      renderTrackedLink({
        key: createSatelliteLinkKey(link),
        positions: [
          Cartesian3.fromDegrees(
            satelliteA.longitude,
            satelliteA.latitude,
            satelliteA.altitudeKm * 1000,
          ),
          Cartesian3.fromDegrees(
            satelliteB.longitude,
            satelliteB.latitude,
            satelliteB.altitudeKm * 1000,
          ),
        ],
        width: 0.8,
        color: SATELLITE_LINK_COLOR,
        material: 'dash',
      });
    });

    options.networkLinks.forEach((link) => {
      renderNetworkPath(
        link.id,
        'forward',
        link.forwardPath,
        NETWORK_FORWARD_LINK_COLOR,
        satelliteById,
        stationById,
        networkNodeById,
        renderTrackedLink,
      );
      renderNetworkPath(
        link.id,
        'return',
        link.returnPath,
        NETWORK_RETURN_LINK_COLOR,
        satelliteById,
        stationById,
        networkNodeById,
        renderTrackedLink,
      );
    });

    lastLinkSnapshots.forEach((snapshot, key) => {
      if (!nextLinkSnapshots.has(key) && !retiringLinksByKey.has(key)) {
        retiringLinksByKey.set(key, {
          ...snapshot,
          expiresAt: nowMs + LINK_RETIRE_DURATION_MS,
        });
      }
    });

    retiringLinksByKey.forEach((snapshot, key) => {
      const remainingMs = snapshot.expiresAt - nowMs;
      if (remainingMs <= 0 || nextLinkSnapshots.has(key)) {
        retiringLinksByKey.delete(key);
        return;
      }

      drawLinkSnapshot({
        ...snapshot,
        color: snapshot.color.withAlpha(Math.max(0.08, 0.32 * (remainingMs / LINK_RETIRE_DURATION_MS))),
        width: Math.max(0.7, snapshot.width * 0.88),
      });
    });

    lastLinkSnapshots = nextLinkSnapshots;

    focusSceneTarget(options, satelliteById, stationById, networkNodeById);

    function renderTrackedLink(snapshot: LinkSnapshot) {
      nextLinkSnapshots.set(snapshot.key, snapshot);
      const flashUntil = linkFlashUntilByKey.get(snapshot.key);
      if (!lastLinkSnapshots.has(snapshot.key) && !flashUntil) {
        linkFlashUntilByKey.set(snapshot.key, nowMs + LINK_FLASH_DURATION_MS);
      }

      const activeFlashUntil = linkFlashUntilByKey.get(snapshot.key) ?? 0;
      const flashProgress = Math.max(0, (activeFlashUntil - nowMs) / LINK_FLASH_DURATION_MS);
      if (flashProgress <= 0) {
        linkFlashUntilByKey.delete(snapshot.key);
      }

      drawLinkSnapshot({
        ...snapshot,
        color: flashProgress > 0
          ? Color.lerp(Color.WHITE, snapshot.color, 1 - flashProgress * 0.55, new Color())
          : snapshot.color,
        width: snapshot.width + flashProgress * 2.2,
      });
    }
  }

  function isSatelliteNode(node: NetworkNodeRef) {
    return node.type === 'satellite';
  }

  function isGroundStationNode(node: NetworkNodeRef) {
    return ['groundStation', 'ground-station', 'base-station', 'station'].includes(node.type);
  }

  function renderNetworkNodePoint(
    node: NetworkNodeLocation,
    activeTraffic: boolean,
    pickKind: PickableNetworkNode['pickKind'],
  ) {
    const position = Cartesian3.fromDegrees(node.longitude, node.latitude, node.altitudeMeters ?? 0);
    const isHost = node.type === 'host';
    const color = isHost ? HOST_COLOR : ROUTER_COLOR;
    const trafficPulse = activeTraffic ? 1 + Math.sin(Date.now() / 90) * 0.2 : 1;

    networkNodePoints.add({
      id: { ...node, pickKind },
      position,
      pixelSize: (isHost ? 7 : 8.5) * (activeTraffic ? 1.9 : 1) * trafficPulse,
      color: activeTraffic
        ? Color.lerp(TRAFFIC_FLASH_COLOR, color, 0.34, new Color())
        : color,
      outlineColor: activeTraffic ? TRAFFIC_FLASH_COLOR : Color.TRANSPARENT,
      outlineWidth: activeTraffic ? 2.6 : 0,
      scaleByDistance: new NearFarScalar(2_000_000, activeTraffic ? 2.45 : 2, 18_000_000, 0.95),
    });
  }

  function resolveNetworkNodePosition(
    node: NetworkNodeRef,
    satelliteById: Map<string, SatellitePoint>,
    stationById: Map<string, GroundStation>,
    networkNodeById: Map<string, NetworkNodeLocation>,
  ) {
    if (isSatelliteNode(node)) {
      const satellite = satelliteById.get(node.id);
      return satellite
        ? Cartesian3.fromDegrees(
            satellite.longitude,
            satellite.latitude,
            satellite.altitudeKm * 1000,
          )
        : undefined;
    }

    if (isGroundStationNode(node)) {
      const station = stationById.get(node.id);
      return station
        ? Cartesian3.fromDegrees(station.longitude, station.latitude, station.altitudeMeters)
        : undefined;
    }

    const networkNode = networkNodeById.get(node.id);
    if (networkNode) {
      return Cartesian3.fromDegrees(
        networkNode.longitude,
        networkNode.latitude,
        networkNode.altitudeMeters ?? 0,
      );
    }

    return undefined;
  }

  function resolveContainerNode(
    containerId: string,
    networkNodeById: Map<string, NetworkNodeLocation>,
  ) {
    return (
      networkNodeById.get(containerId) ??
      Array.from(networkNodeById.values()).find((item) =>
        item.id.startsWith(containerId) || containerId.startsWith(item.id),
      )
    );
  }

  function isTrafficNodeActive(nodeId: string, activeTrafficNodeIds: Set<string>) {
    return (
      activeTrafficNodeIds.has(nodeId) ||
      Array.from(activeTrafficNodeIds).some((activeId) =>
        nodeId.startsWith(activeId) || activeId.startsWith(nodeId),
      )
    );
  }

  function isPickableContainerNode(value: unknown): value is PickableNetworkNode {
    const node = value as PickableNetworkNode;
    return Boolean(node?.id && node.pickKind === 'container-node');
  }

  function renderNetworkPath(
    flowId: string | undefined,
    direction: 'forward' | 'return',
    path: NetworkNodeRef[],
    color: Color,
    satelliteById: Map<string, SatellitePoint>,
    stationById: Map<string, GroundStation>,
    networkNodeById: Map<string, NetworkNodeLocation>,
    renderTrackedLink: (snapshot: LinkSnapshot) => void,
  ) {
    if (path.length < 2) {
      return;
    }

    for (let index = 0; index < path.length - 1; index += 1) {
      const source = resolveNetworkNodePosition(
        path[index],
        satelliteById,
        stationById,
        networkNodeById,
      );
      const target = resolveNetworkNodePosition(
        path[index + 1],
        satelliteById,
        stationById,
        networkNodeById,
      );
      if (!source || !target) {
        continue;
      }

      renderTrackedLink({
        key: createNetworkLinkKey(flowId, direction, index, path[index], path[index + 1]),
        positions: [source, target],
        width: 2.2,
        color,
        material: 'arrow',
      });
    }
  }

  function drawLinkSnapshot(snapshot: LinkSnapshot) {
    const collection = snapshot.material === 'arrow' ? networkLinkLines : groundLinkLines;
    collection.add({
      positions: snapshot.positions,
      width: snapshot.width,
      material: snapshot.material === 'arrow'
        ? createArrowMaterial(snapshot.color)
        : createDashMaterial(snapshot.color),
    });
  }

  function createGroundLinkKey(link: SatelliteGroundLink) {
    return `ground:${link.satelliteId}->${link.stationId}`;
  }

  function createSatelliteLinkKey(link: InterSatelliteLink) {
    const [left, right] = [link.satelliteAId, link.satelliteBId].sort();
    return `satellite:${left}<->${right}`;
  }

  function createNetworkLinkKey(
    flowId: string | undefined,
    direction: 'forward' | 'return',
    hopIndex: number,
    source: NetworkNodeRef,
    target: NetworkNodeRef,
  ) {
    const flowKey = flowId ?? 'flow';
    return `network:${flowKey}:${direction}:${hopIndex}:${source.type}:${source.id}->${target.type}:${target.id}`;
  }

  function focusSceneTarget(
    options: RenderOptions,
    satelliteById: Map<string, SatellitePoint>,
    stationById: Map<string, GroundStation>,
    networkNodeById: Map<string, NetworkNodeLocation>,
  ) {
    const satellite = options.focusedSatelliteId
      ? satelliteById.get(options.focusedSatelliteId)
      : undefined;
    const station =
      !satellite && options.focusedStationId ? stationById.get(options.focusedStationId) : undefined;
    const containerNode =
      !satellite && !station && options.focusedContainerNodeId
        ? resolveFocusedContainerNode(options.focusedContainerNodeId, networkNodeById)
        : undefined;
    const focusKey = satellite
      ? `satellite:${satellite.id}`
      : station
        ? `station:${station.id}`
        : containerNode
          ? `container:${containerNode.id}`
          : undefined;

    if (!focusKey) {
      lastFocusKey = undefined;
      return;
    }

    if (focusKey === lastFocusKey) {
      return;
    }

    lastFocusKey = focusKey;
    const currentHeight = viewer.camera.positionCartographic.height;
    const destination = satellite
      ? Cartesian3.fromDegrees(
          satellite.longitude,
          satellite.latitude,
          currentHeight,
        )
      : station
        ? Cartesian3.fromDegrees(station.longitude, station.latitude, currentHeight)
        : Cartesian3.fromDegrees(containerNode!.longitude, containerNode!.latitude, currentHeight);

    viewer.camera.flyTo({
      destination,
      duration: 0.9,
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });
  }

  function resolveFocusedContainerNode(
    nodeId: string,
    networkNodeById: Map<string, NetworkNodeLocation>,
  ) {
    return (
      networkNodeById.get(nodeId) ??
      Array.from(networkNodeById.values()).find((node) =>
        node.id.startsWith(nodeId) || nodeId.startsWith(node.id),
      )
    );
  }

  viewer.screenSpaceEventHandler.setInputAction((movement: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position);
    const pickedItem = picked?.primitive?.id as
      | SatellitePoint
      | GroundStation
      | PickableNetworkNode
      | undefined;
    if (pickedItem?.id && 'altitudeKm' in pickedItem) {
      optionsSafeSelect(pickedItem);
      return;
    }

    if (pickedItem?.id && 'altitudeMeters' in pickedItem && 'city' in pickedItem) {
      stationSelectHandler(pickedItem);
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const pickedItem = picked?.primitive?.id as
      | SatellitePoint
      | GroundStation
      | PickableNetworkNode
      | undefined;
    const satellite =
      pickedItem && 'altitudeKm' in pickedItem ? pickedItem as SatellitePoint : undefined;
    const station =
      pickedItem && 'altitudeMeters' in pickedItem && 'city' in pickedItem
        ? pickedItem as GroundStation
        : undefined;
    const containerNode = isPickableContainerNode(pickedItem) ? pickedItem : undefined;
    const nextHoveredSatelliteId = satellite?.id;
    const nextHoveredStationId = station?.id;
    const nextHoveredContainerNodeId = containerNode?.id;

    if (
      nextHoveredSatelliteId === hoveredSatelliteId &&
      nextHoveredStationId === hoveredStationId &&
      nextHoveredContainerNodeId === hoveredContainerNodeId
    ) {
      return;
    }

    const previousSatellitePoint = hoveredSatelliteId
      ? pointBySatelliteId.get(hoveredSatelliteId)
      : undefined;
    const previousStationPoint = hoveredStationId
      ? pointByStationId.get(hoveredStationId)
      : undefined;
    hoveredSatelliteId = nextHoveredSatelliteId;
    hoveredStationId = nextHoveredStationId;
    hoveredContainerNodeId = nextHoveredContainerNodeId;
    const nextSatellitePoint = hoveredSatelliteId
      ? pointBySatelliteId.get(hoveredSatelliteId)
      : undefined;
    const nextStationPoint = hoveredStationId ? pointByStationId.get(hoveredStationId) : undefined;

    if (previousSatellitePoint) {
      applyPointStyle(
        previousSatellitePoint,
        previousSatellitePoint.id.id,
        lastSelectedId,
        lastHighlightedIds,
      );
    }

    if (nextSatellitePoint) {
      applyPointStyle(
        nextSatellitePoint,
        nextSatellitePoint.id.id,
        lastSelectedId,
        lastHighlightedIds,
      );
    }

    if (previousStationPoint) {
      applyStationPointStyle(previousStationPoint, previousStationPoint.id.id);
    }

    if (nextStationPoint) {
      applyStationPointStyle(nextStationPoint, nextStationPoint.id.id);
    }

    const hoverAnchor = {
      x: movement.endPosition.x,
      y: movement.endPosition.y,
    };
    satelliteHoverHandler(satellite, satellite ? hoverAnchor : undefined);
    stationHoverHandler(station, station ? hoverAnchor : undefined);
    containerNodeHoverHandler(containerNode, containerNode ? hoverAnchor : undefined);
    container.style.cursor = nextHoveredSatelliteId || nextHoveredStationId || nextHoveredContainerNodeId ? 'pointer' : '';
  }, ScreenSpaceEventType.MOUSE_MOVE);

  let selectHandler: RenderOptions['onSelect'] = () => undefined;
  let stationSelectHandler: RenderOptions['onStationSelect'] = () => undefined;
  let satelliteHoverHandler: RenderOptions['onSatelliteHover'] = () => undefined;
  let stationHoverHandler: RenderOptions['onStationHover'] = () => undefined;
  let containerNodeHoverHandler: RenderOptions['onContainerNodeHover'] = () => undefined;
  let lastSelectedId: string | undefined;
  let lastHighlightedIds = new Set<string>();
  let lastFocusKey: string | undefined;
  function optionsSafeSelect(satellite: SatellitePoint) {
    selectHandler(satellite);
  }

  return {
    viewer,
    renderSatellites(satellites, options) {
      selectHandler = options.onSelect;
      stationSelectHandler = options.onStationSelect;
      satelliteHoverHandler = options.onSatelliteHover;
      stationHoverHandler = options.onStationHover;
      containerNodeHoverHandler = options.onContainerNodeHover;
      lastSelectedId = options.selectedId;
      lastHighlightedIds = new Set(options.highlightedIds);
      renderSatellites(satellites, options);
    },
    destroy() {
      window.clearInterval(highlightTimerId);
      viewer.destroy();
    },
  };
}
