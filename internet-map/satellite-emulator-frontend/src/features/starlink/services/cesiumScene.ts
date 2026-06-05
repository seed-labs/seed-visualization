import {
  Cartesian3,
  Cartesian2,
  Color,
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
import type {
  GroundStation,
  SatelliteGroundLink,
  SatellitePoint,
  TleRecord,
} from '@/features/starlink/types';

Ion.defaultAccessToken = '';

const STARLINK_COLOR = Color.fromCssColorString('#ff4a2a');
const SELECTED_COLOR = Color.fromCssColorString('#ff6a1a');
const HIGHLIGHT_COLOR = Color.fromCssColorString('#fff7c8');
const HOVER_COLOR = Color.fromCssColorString('#fff8dc');
const ORBIT_COLOR = Color.fromCssColorString('#ff6b3a').withAlpha(0.42);
const STATION_COLOR = Color.fromCssColorString('#28d7ff');
const STATION_INNER_COLOR = Color.fromCssColorString('#063f68');
const LINK_COLOR = Color.fromCssColorString('#45f3ff').withAlpha(0.62);

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
  focusedSatelliteId?: string;
  focusedStationId?: string;
  focusSatelliteZoom: boolean;
  showLabels: boolean;
  orbitRecords: TleRecord[];
  currentTime: Date;
  onSelect: (satellite: SatellitePoint) => void;
  onStationSelect: (station: GroundStation) => void;
};

const STARLINK_TILE_URL = import.meta.env.VITE_SATELLITE_TILES_URL;
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
  const labels = viewer.scene.primitives.add(new LabelCollection());
  const orbitLines = viewer.scene.primitives.add(new PolylineCollection());
  const groundLinkLines = viewer.scene.primitives.add(new PolylineCollection());
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
  let hoveredId: string | undefined;
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
  ) {
    const hovered = satelliteId === hoveredId;
    const selected = satelliteId === selectedId;
    const highlighted = highlightedIds.has(satelliteId);
    const pulse = highlighted ? 1 + Math.sin(Date.now() / 180) * 0.32 : 1;

    point.pixelSize = (hovered ? 15 : highlighted ? 11.25 : selected ? 6 : 2.25) * pulse;
    point.color = hovered
      ? HOVER_COLOR
      : highlighted
        ? HIGHLIGHT_COLOR
        : selected
          ? SELECTED_COLOR
          : STARLINK_COLOR;
    point.outlineWidth = 0;
    point.scaleByDistance = new NearFarScalar(2_000_000, hovered ? 2.2 : 2, 18_000_000, 0.95);
  }

  function renderSatellites(satellites: SatellitePoint[], options: RenderOptions) {
    points.removeAll();
    stationPoints.removeAll();
    labels.removeAll();
    orbitLines.removeAll();
    groundLinkLines.removeAll();
    pointBySatelliteId.clear();
    const highlightedIds = new Set(options.highlightedIds);
    const satelliteById = new Map(satellites.map((satellite) => [satellite.id, satellite]));
    const stationById = new Map(options.groundStations.map((station) => [station.id, station]));

    options.groundStations.forEach((station) => {
      const position = Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        station.altitudeMeters,
      );

      stationPoints.add({
        id: station,
        position,
        pixelSize: 11,
        color: STATION_INNER_COLOR,
        outlineColor: STATION_COLOR,
        outlineWidth: 3,
        scaleByDistance: new NearFarScalar(1_500_000, 1.3, 14_000_000, 0.55),
      });

      labels.add({
        position,
        text: station.city,
        font: '13px sans-serif',
        fillColor: STATION_COLOR,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -18),
        heightReference: HeightReference.NONE,
        scaleByDistance: new NearFarScalar(1_500_000, 1, 12_000_000, 0.22),
      });
    });

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
        pixelSize: 2.25,
        color: STARLINK_COLOR,
        outlineWidth: 0,
        scaleByDistance: new NearFarScalar(2_000_000, 2, 18_000_000, 0.95),
      });

      point.id = satellite;
      applyPointStyle(point, satellite.id, options.selectedId, highlightedIds);
      pointBySatelliteId.set(satellite.id, point);

      if (options.showLabels && (selected || highlightedIds.has(satellite.id))) {
        const highlighted = highlightedIds.has(satellite.id);
        labels.add({
          position,
          text: satellite.name,
          font: highlighted ? '24px sans-serif' : '16px sans-serif',
          fillColor: highlighted ? HIGHLIGHT_COLOR : SELECTED_COLOR,
          outlineColor: Color.BLACK,
          outlineWidth: highlighted ? 7 : 4,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, highlighted ? -32 : -20),
          heightReference: HeightReference.NONE,
          scaleByDistance: new NearFarScalar(1_500_000, 1, 12_000_000, highlighted ? 0.62 : 0.32),
        });
      }
    });

    options.orbitRecords.forEach((record) => {
      const path = sampleOrbit(record, options.currentTime);
      if (path.length > 2) {
        orbitLines.add({
          positions: path.map(([lon, lat, height]) => Cartesian3.fromDegrees(lon, lat, height)),
          width: 2.4,
          material: createColorMaterial(SELECTED_COLOR.withAlpha(0.82)),
        });
      }
    });

    options.groundLinks.forEach((link) => {
      const satellite = satelliteById.get(link.satelliteId);
      const station = stationById.get(link.stationId);
      if (!satellite || !station) {
        return;
      }

      groundLinkLines.add({
        positions: [
          Cartesian3.fromDegrees(satellite.longitude, satellite.latitude, satellite.altitudeKm * 1000),
          Cartesian3.fromDegrees(station.longitude, station.latitude, station.altitudeMeters),
        ],
        width: 1.5,
        material: createDashMaterial(LINK_COLOR),
      });
    });

    focusSceneTarget(options, satelliteById, stationById);
  }

  function focusSceneTarget(
    options: RenderOptions,
    satelliteById: Map<string, SatellitePoint>,
    stationById: Map<string, GroundStation>,
  ) {
    const satellite = options.focusedSatelliteId
      ? satelliteById.get(options.focusedSatelliteId)
      : undefined;
    const station =
      !satellite && options.focusedStationId ? stationById.get(options.focusedStationId) : undefined;
    const focusMode = options.focusSatelliteZoom ? 'zoom' : 'front';
    const focusKey = satellite
      ? `satellite:${satellite.id}:${focusMode}`
      : station
        ? `station:${station.id}`
        : undefined;

    if (!focusKey || focusKey === lastFocusKey) {
      return;
    }

    lastFocusKey = focusKey;
    const currentHeight = viewer.camera.positionCartographic.height;
    viewer.camera.flyTo({
      destination: satellite
        ? Cartesian3.fromDegrees(
            satellite.longitude,
            satellite.latitude,
            options.focusSatelliteZoom
              ? Math.max(satellite.altitudeKm * 1000 + 1_200_000, 1_800_000)
              : currentHeight,
          )
        : Cartesian3.fromDegrees(station!.longitude, station!.latitude, 2_000_000),
      duration: 0.9,
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    });
  }

  viewer.screenSpaceEventHandler.setInputAction((movement: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.position);
    const pickedItem = picked?.primitive?.id as SatellitePoint | GroundStation | undefined;
    if (pickedItem?.id && 'altitudeKm' in pickedItem) {
      optionsSafeSelect(pickedItem);
      return;
    }

    if (pickedItem?.id && 'altitudeMeters' in pickedItem) {
      stationSelectHandler(pickedItem);
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const satellite = picked?.primitive?.id as SatellitePoint | undefined;
    const nextHoveredId = satellite && 'altitudeKm' in satellite ? satellite.id : undefined;

    if (nextHoveredId === hoveredId) {
      return;
    }

    const previousPoint = hoveredId ? pointBySatelliteId.get(hoveredId) : undefined;
    hoveredId = nextHoveredId;
    const nextPoint = hoveredId ? pointBySatelliteId.get(hoveredId) : undefined;

    if (previousPoint) {
      applyPointStyle(previousPoint, previousPoint.id.id, lastSelectedId, lastHighlightedIds);
    }

    if (nextPoint) {
      applyPointStyle(nextPoint, nextPoint.id.id, lastSelectedId, lastHighlightedIds);
    }

    container.style.cursor = nextHoveredId ? 'pointer' : '';
  }, ScreenSpaceEventType.MOUSE_MOVE);

  let selectHandler: RenderOptions['onSelect'] = () => undefined;
  let stationSelectHandler: RenderOptions['onStationSelect'] = () => undefined;
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
