#!/usr/bin/env python3
"""
Generate a GroundLinksRequest JSON payload from planned_shell_orbit.json and mockGroundStations.ts.

Examples:
  python satellite-emulator/scripts/create_ground_links_request.py --timestamp now --interval 10s --count 6 --out ground-links.json
  python satellite-emulator/scripts/create_ground_links_request.py --timestamp 1719123456789 --interval 10s --count 6 --post-url http://127.0.0.1:9090/api/v1/satellite/ground-links
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


EARTH_EQUATORIAL_RADIUS_KM = 6378.137
EARTH_RADIUS_KM = 6371.0
EARTH_MU_KM3_S2 = 398600.4418
EARTH_FLATTENING = 1 / 298.257223563
EARTH_ECCENTRICITY_SQUARED = EARTH_FLATTENING * (2 - EARTH_FLATTENING)
MAX_GROUND_LINK_DISTANCE_KM = 1100.0
STATION_INDEX_CELL_DEGREES = 10.0
DEFAULT_SATELLITE_COUNT: int | None = 4408

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
PLANNED_ORBIT_PATH = PROJECT_DIR / "tmp" / "planned_shell_orbit.json"
GROUND_STATIONS_PATH = (
    PROJECT_DIR / "frontend" / "src" / "features" / "starlink" / "services" / "mockGroundStations.ts"
)

Vector3 = tuple[float, float, float]
Matrix3 = tuple[Vector3, Vector3, Vector3]


@dataclass(frozen=True)
class PlannedSatelliteOrbit:
    satellite_id: str
    epoch_utc: dt.datetime
    mean_motion_rev_per_day: float
    semi_major_axis_km: float
    mean_anomaly_deg: float
    rotation: Matrix3


@dataclass(frozen=True)
class GroundStationPosition:
    station_id: str
    position_ecef: Vector3
    radius_km: float
    latitude_deg: float
    longitude_deg: float


@dataclass(frozen=True)
class GroundStationIndex:
    stations: list[GroundStationPosition]
    cells: dict[tuple[int, int], list[GroundStationPosition]]
    min_station_radius_km: float
    max_station_radius_km: float


def parse_interval_milliseconds(value: str) -> int:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(ms|s)?\s*", value)
    if not match:
        raise ValueError(f"Invalid interval: {value!r}. Use values like 500ms, 1s, 10s.")

    amount = float(match.group(1))
    unit = match.group(2) or "ms"
    milliseconds = amount if unit == "ms" else amount * 1000

    if milliseconds < 0:
        raise ValueError("interval must be greater than or equal to 0.")

    return int(milliseconds)


def parse_timestamp(value: str) -> tuple[dt.datetime, str]:
    if value.lower() == "now":
        now = dt.datetime.now(dt.timezone.utc)
        return now, str(int(now.timestamp() * 1000))

    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        numeric = float(value)
        seconds = numeric / 1000 if numeric > 1_000_000_000_000 else numeric
        timestamp = dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc)
        return timestamp, value

    normalized = value.replace("Z", "+00:00")
    timestamp = dt.datetime.fromisoformat(normalized)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=dt.timezone.utc)

    return timestamp.astimezone(dt.timezone.utc), value


def read_planned_orbit_records(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("selected_records")
    if not isinstance(records, list):
        raise ValueError(f"{path} must contain a selected_records array.")

    return records


def read_ground_stations(path: Path) -> list[dict[str, Any]]:
    source = path.read_text(encoding="utf-8")
    array_match = re.search(r"mockGroundStations\s*:\s*GroundStation\[\]\s*=\s*\[(.*)\]\s*;", source, re.S)
    if not array_match:
        raise ValueError(f"Could not find mockGroundStations array in {path}.")

    stations = [json.loads(match.group(0)) for match in re.finditer(r"\{[^{}]+\}", array_match.group(1))]

    if not stations:
        raise ValueError(f"No ground stations found in {path}.")

    return stations


def datetime_to_julian_date(timestamp: dt.datetime) -> float:
    timestamp = timestamp.astimezone(dt.timezone.utc)
    return timestamp.timestamp() / 86400.0 + 2440587.5


def gmst_radians(julian_date: float) -> float:
    centuries = (julian_date - 2451545.0) / 36525.0
    seconds = (
        67310.54841
        + (876600 * 3600 + 8640184.812866) * centuries
        + 0.093104 * centuries * centuries
        - 0.0000062 * centuries * centuries * centuries
    )
    return (seconds % 86400) * (math.pi / 43200)


def eci_to_ecef(position_km: tuple[float, float, float], timestamp: dt.datetime) -> tuple[float, float, float]:
    julian_date = datetime_to_julian_date(timestamp)
    theta = gmst_radians(julian_date)
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    x, y, z = position_km

    return (
        cos_theta * x + sin_theta * y,
        -sin_theta * x + cos_theta * y,
        z,
    )


def mean_motion_to_altitude_km(mean_motion_rev_per_day: float) -> float:
    mean_motion_rad_per_second = mean_motion_rev_per_day * 2.0 * math.pi / 86400.0
    semi_major_axis_km = (EARTH_MU_KM3_S2 / (mean_motion_rad_per_second**2)) ** (1.0 / 3.0)
    return semi_major_axis_km - EARTH_RADIUS_KM


def parse_planned_satellite_orbit(record: dict[str, Any]) -> PlannedSatelliteOrbit:
    epoch = dt.datetime.fromisoformat(str(record["epoch_utc"]).replace("Z", "+00:00"))
    if epoch.tzinfo is None:
        epoch = epoch.replace(tzinfo=dt.timezone.utc)
    mean_motion = float(record["mean_motion_rev_per_day"])
    semi_major_axis_km = EARTH_RADIUS_KM + mean_motion_to_altitude_km(mean_motion)
    raan_rad = math.radians(float(record["raan_deg"]))
    inclination_rad = math.radians(float(record["inclination_deg"]))
    argument_rad = math.radians(float(record["argument_of_perigee_deg"]))

    cos_raan = math.cos(raan_rad)
    sin_raan = math.sin(raan_rad)
    cos_inc = math.cos(inclination_rad)
    sin_inc = math.sin(inclination_rad)
    cos_arg = math.cos(argument_rad)
    sin_arg = math.sin(argument_rad)
    rotation = (
        (
            cos_raan * cos_arg - sin_raan * sin_arg * cos_inc,
            -cos_raan * sin_arg - sin_raan * cos_arg * cos_inc,
            sin_raan * sin_inc,
        ),
        (
            sin_raan * cos_arg + cos_raan * sin_arg * cos_inc,
            -sin_raan * sin_arg + cos_raan * cos_arg * cos_inc,
            -cos_raan * sin_inc,
        ),
        (
            sin_arg * sin_inc,
            cos_arg * sin_inc,
            cos_inc,
        ),
    )

    return PlannedSatelliteOrbit(
        satellite_id=str(record["norad_id"]),
        epoch_utc=epoch.astimezone(dt.timezone.utc),
        mean_motion_rev_per_day=mean_motion,
        semi_major_axis_km=semi_major_axis_km,
        mean_anomaly_deg=float(record["mean_anomaly_deg"]),
        rotation=rotation,
    )


def propagate_planned_orbit_ecef(
    orbit: PlannedSatelliteOrbit,
    sample_time: dt.datetime,
) -> Vector3:
    delta_seconds = (
        sample_time.astimezone(dt.timezone.utc) - orbit.epoch_utc
    ).total_seconds()
    anomaly_rad = math.radians(
        (
            orbit.mean_anomaly_deg
            + orbit.mean_motion_rev_per_day * 360.0 * delta_seconds / 86400.0
        )
        % 360.0
    )
    perifocal_position = (
        orbit.semi_major_axis_km * math.cos(anomaly_rad),
        orbit.semi_major_axis_km * math.sin(anomaly_rad),
        0.0,
    )
    rotation = orbit.rotation
    position_eci = (
        rotation[0][0] * perifocal_position[0] + rotation[0][1] * perifocal_position[1],
        rotation[1][0] * perifocal_position[0] + rotation[1][1] * perifocal_position[1],
        rotation[2][0] * perifocal_position[0] + rotation[2][1] * perifocal_position[1],
    )

    return eci_to_ecef(position_eci, sample_time)


def ground_station_to_ecef(station: dict[str, Any]) -> tuple[float, float, float]:
    longitude = math.radians(float(station["longitude"]))
    latitude = math.radians(float(station["latitude"]))
    altitude_km = float(station.get("altitudeMeters", 0)) / 1000

    sin_latitude = math.sin(latitude)
    cos_latitude = math.cos(latitude)
    prime_vertical_radius = EARTH_EQUATORIAL_RADIUS_KM / math.sqrt(
        1 - EARTH_ECCENTRICITY_SQUARED * sin_latitude * sin_latitude
    )

    return (
        (prime_vertical_radius + altitude_km) * cos_latitude * math.cos(longitude),
        (prime_vertical_radius + altitude_km) * cos_latitude * math.sin(longitude),
        (prime_vertical_radius * (1 - EARTH_ECCENTRICITY_SQUARED) + altitude_km) * sin_latitude,
    )


def vector_radius(position: Vector3) -> float:
    return math.sqrt(position[0] ** 2 + position[1] ** 2 + position[2] ** 2)


def position_lat_lon_degrees(position: Vector3) -> tuple[float, float]:
    radius = vector_radius(position)
    latitude = math.degrees(math.asin(position[2] / radius))
    longitude = math.degrees(math.atan2(position[1], position[0]))
    return latitude, longitude


def ground_station_position(station: dict[str, Any]) -> GroundStationPosition:
    position = ground_station_to_ecef(station)
    latitude, longitude = position_lat_lon_degrees(position)
    return GroundStationPosition(
        station_id=str(station["id"]),
        position_ecef=position,
        radius_km=vector_radius(position),
        latitude_deg=latitude,
        longitude_deg=longitude,
    )


def station_cell(latitude_deg: float, longitude_deg: float) -> tuple[int, int]:
    lat_index = int(math.floor((latitude_deg + 90.0) / STATION_INDEX_CELL_DEGREES))
    lon_index = int(math.floor((longitude_deg + 180.0) / STATION_INDEX_CELL_DEGREES))
    lat_count = int(math.ceil(180.0 / STATION_INDEX_CELL_DEGREES))
    lon_count = int(math.ceil(360.0 / STATION_INDEX_CELL_DEGREES))
    return (
        max(0, min(lat_count - 1, lat_index)),
        lon_index % lon_count,
    )


def build_ground_station_index(stations: list[dict[str, Any]]) -> GroundStationIndex:
    positions = [ground_station_position(station) for station in stations]
    cells: dict[tuple[int, int], list[GroundStationPosition]] = {}
    for position in positions:
        cells.setdefault(
            station_cell(position.latitude_deg, position.longitude_deg),
            [],
        ).append(position)

    radii = [position.radius_km for position in positions]
    return GroundStationIndex(
        stations=positions,
        cells=cells,
        min_station_radius_km=min(radii),
        max_station_radius_km=max(radii),
    )


def squared_distance(a: Vector3, b: Vector3) -> float:
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def max_candidate_angle_degrees(satellite_radius_km: float, station_index: GroundStationIndex) -> float:
    max_angle = 0.0
    for station_radius_km in (
        station_index.min_station_radius_km,
        station_index.max_station_radius_km,
    ):
        if MAX_GROUND_LINK_DISTANCE_KM < abs(satellite_radius_km - station_radius_km):
            continue
        cosine = (
            satellite_radius_km**2
            + station_radius_km**2
            - MAX_GROUND_LINK_DISTANCE_KM**2
        ) / (2.0 * satellite_radius_km * station_radius_km)
        cosine = max(-1.0, min(1.0, cosine))
        max_angle = max(max_angle, math.degrees(math.acos(cosine)))
    return max_angle


def candidate_ground_stations(
    satellite_ecef: Vector3,
    station_index: GroundStationIndex,
) -> list[GroundStationPosition]:
    satellite_radius = vector_radius(satellite_ecef)
    angle_deg = max_candidate_angle_degrees(satellite_radius, station_index)
    if angle_deg <= 0.0:
        return []

    latitude_deg, longitude_deg = position_lat_lon_degrees(satellite_ecef)
    lat_count = int(math.ceil(180.0 / STATION_INDEX_CELL_DEGREES))
    lon_count = int(math.ceil(360.0 / STATION_INDEX_CELL_DEGREES))

    min_lat = max(-90.0, latitude_deg - angle_deg)
    max_lat = min(90.0, latitude_deg + angle_deg)
    min_lat_index, _ = station_cell(min_lat, longitude_deg)
    max_lat_index, _ = station_cell(max_lat, longitude_deg)

    if abs(latitude_deg) + angle_deg >= 89.0:
        lon_steps = lon_count // 2
    else:
        cos_lat = math.cos(math.radians(abs(latitude_deg) + angle_deg))
        lon_span = angle_deg / max(0.01, cos_lat)
        lon_steps = int(math.ceil(lon_span / STATION_INDEX_CELL_DEGREES)) + 1

    _, center_lon_index = station_cell(latitude_deg, longitude_deg)
    candidates: list[GroundStationPosition] = []
    seen_ids: set[str] = set()
    for lat_index in range(min_lat_index, max_lat_index + 1):
        for lon_offset in range(-lon_steps, lon_steps + 1):
            cell_key = (lat_index, (center_lon_index + lon_offset) % lon_count)
            for station in station_index.cells.get(cell_key, []):
                if station.station_id in seen_ids:
                    continue
                seen_ids.add(station.station_id)
                candidates.append(station)
    return candidates


def nearest_ground_station_id(
    satellite_ecef: Vector3,
    station_index: GroundStationIndex,
) -> str | None:
    candidates = candidate_ground_stations(satellite_ecef, station_index)
    if not candidates:
        return None

    nearest = candidates[0]
    nearest_distance = squared_distance(satellite_ecef, nearest.position_ecef)

    for station in candidates[1:]:
        distance = squared_distance(satellite_ecef, station.position_ecef)
        if distance < nearest_distance:
            nearest = station
            nearest_distance = distance

    if nearest_distance > MAX_GROUND_LINK_DISTANCE_KM**2:
        return None

    return nearest.station_id


def select_satellites(
    records: list[dict[str, Any]],
    satellite_count: int | None,
) -> list[dict[str, Any]]:
    if satellite_count is None:
        return records

    if satellite_count > len(records):
        raise ValueError(
            f"Only {len(records)} satellites are available in selected_records; "
            f"{satellite_count} are required."
        )

    return records[:satellite_count]


def create_ground_links_request(
    timestamp_value: str,
    interval: str,
    count: int,
    satellite_count: int | None = DEFAULT_SATELLITE_COUNT,
) -> dict[str, Any]:
    start_time, serialized_timestamp = parse_timestamp(timestamp_value)
    interval_milliseconds = parse_interval_milliseconds(interval)

    sample_times = [
        start_time + dt.timedelta(milliseconds=index * interval_milliseconds)
        for index in range(count)
    ]

    orbit_records = read_planned_orbit_records(PLANNED_ORBIT_PATH)
    ground_stations = read_ground_stations(GROUND_STATIONS_PATH)
    station_index = build_ground_station_index(ground_stations)
    satellites = [
        parse_planned_satellite_orbit(record)
        for record in select_satellites(orbit_records, satellite_count)
    ]

    ground_links: list[list[dict[str, str]]] = []
    for sample_time in sample_times:
        links: list[dict[str, str]] = []

        for satellite in satellites:
            satellite_ecef = propagate_planned_orbit_ecef(satellite, sample_time)
            ground_station_id = nearest_ground_station_id(satellite_ecef, station_index)
            if ground_station_id is None:
                continue

            links.append(
                {
                    "satelliteId": satellite.satellite_id,
                    "groundStationId": ground_station_id,
                }
            )

        ground_links.append(links)

    return {
        "timestamp": serialized_timestamp,
        "interval": interval,
        "groundLinks": ground_links,
    }


def post_json(url: str, body: dict[str, Any]) -> None:
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        print(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a GroundLinksRequest payload.")
    parser.add_argument("--timestamp", default="now", help="Timestamp: now, milliseconds, seconds, or ISO date.")
    parser.add_argument("--interval", default="1s", help="Interval with unit, for example 1s, 10s, or 500ms.")
    parser.add_argument("--count", default=300, type=int, help="Number of future groundLinks groups.")
    parser.add_argument(
        "--satellites",
        type=int,
        default=DEFAULT_SATELLITE_COUNT,
        help="Satellite count. Defaults to all selected_records.",
    )
    parser.add_argument("--out", help="Write JSON payload to this file. Defaults to stdout.")
    parser.add_argument("--post-url", help="POST the JSON payload to this URL after generation.")
    args = parser.parse_args()

    if args.count < 0:
        raise ValueError("--count must be greater than or equal to 0.")
    if args.satellites is not None and args.satellites <= 0:
        raise ValueError("--satellites must be greater than 0.")

    body = create_ground_links_request(
        timestamp_value=args.timestamp,
        interval=args.interval,
        count=args.count,
        satellite_count=args.satellites,
    )

    formatted = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    if args.out:
        output_path = Path(args.out)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(formatted, encoding="utf-8")
        print(f"Wrote {args.out}")
    else:
        print(formatted)

    if args.post_url:
        post_json(args.post_url, body)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
