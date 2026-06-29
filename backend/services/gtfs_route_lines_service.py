"""Muat jalur GTFS rute bus aktif (sama sumber dengan layer EDA)."""

from __future__ import annotations

import csv
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

ROUTE_TYPE_LABELS = {
    0: "Tram/LRT",
    1: "Subway/Metro",
    2: "Rail",
    3: "Bus",
    4: "Ferry",
    5: "Cable Tram",
    6: "Aerial Lift",
    7: "Funicular",
    11: "Trolleybus",
    12: "Monorail",
}

JAKARTA_BOUNDS = {
    "min_lat": -6.45,
    "max_lat": -6.05,
    "min_lon": 106.65,
    "max_lon": 107.05,
}

GTFS_DIR = Path(
    os.getenv(
        "GTFS_DIR",
        str(Path(__file__).resolve().parents[1] / "mdb-1909-202602150020"),
    )
)


def _safe_int(value: str | int | None, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _safe_float(value: str | float | None, default: float = 0.0) -> float:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _is_in_jakarta(lat: float, lon: float) -> bool:
    return (
        JAKARTA_BOUNDS["min_lat"] <= lat <= JAKARTA_BOUNDS["max_lat"]
        and JAKARTA_BOUNDS["min_lon"] <= lon <= JAKARTA_BOUNDS["max_lon"]
    )


def sample_route_points(points: list[list[float]], max_points: int = 220) -> list[list[float]]:
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    sampled = points[::step]
    if sampled[-1] != points[-1]:
        sampled.append(points[-1])
    return sampled


def filter_route_lines_in_jakarta(route_lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for line in route_lines:
        points = [
            point
            for point in line.get("points", [])
            if len(point) >= 2 and _is_in_jakarta(float(point[0]), float(point[1]))
        ]
        if len(points) < 2:
            continue
        next_line = dict(line)
        next_line["points"] = sample_route_points(points)
        filtered.append(next_line)
    return filtered


def _build_route_lines(
    routes_meta: dict[str, dict[str, Any]],
    route_shape_map: dict[str, str],
    shape_points: dict[str, list[tuple[int, list[float]]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    route_lines: list[dict[str, Any]] = []
    for route_id, shape_id in route_shape_map.items():
        route_meta = routes_meta.get(route_id)
        if not route_meta:
            continue
        points_with_seq = shape_points.get(shape_id, [])
        if len(points_with_seq) < 2:
            continue
        points_with_seq.sort(key=lambda item: item[0])
        ordered_points = [item[1] for item in points_with_seq]
        route_name = (
            route_meta["route_short_name"]
            or route_meta["route_long_name"]
            or f"Route {route_id}"
        )
        route_lines.append(
            {
                "route_id": route_id,
                "route_name": route_name,
                "route_short_name": route_meta["route_short_name"],
                "route_long_name": route_meta["route_long_name"],
                "route_type": route_meta["route_type"],
                "route_type_label": route_meta["route_type_label"],
                "line_color": (
                    f"#{route_meta['route_color']}"
                    if route_meta.get("route_color") and len(route_meta["route_color"]) == 6
                    else None
                ),
                "shape_id": shape_id,
                "points": sample_route_points(ordered_points),
            }
        )

    route_lines.sort(key=lambda item: (item["route_type"], item["route_name"]))
    route_type_counts: dict[int, int] = defaultdict(int)
    for line in route_lines:
        route_type_counts[int(line["route_type"])] += 1
    route_type_summary = [
        {
            "route_type": route_type,
            "label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
            "count": count,
        }
        for route_type, count in sorted(route_type_counts.items(), key=lambda item: item[0])
    ]
    return route_lines, route_type_summary


def load_active_bus_route_lines_from_db(cur) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cur.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('gtfs_routes', 'gtfs_trips', 'gtfs_shapes')
        """
    )
    if int(cur.fetchone()["count"]) < 3:
        return [], []

    cur.execute("ALTER TABLE gtfs_routes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")

    cur.execute(
        """
        SELECT route_id, route_short_name, route_long_name, route_type, route_color, is_active
        FROM gtfs_routes
        """
    )
    routes_meta: dict[str, dict[str, Any]] = {}
    for row in cur.fetchall():
        route_id = (row.get("route_id") or "").strip()
        if not route_id:
            continue
        if not bool(row.get("is_active", True)):
            continue
        route_type = _safe_int(str(row.get("route_type")), 3)
        routes_meta[route_id] = {
            "route_id": route_id,
            "route_short_name": (row.get("route_short_name") or "").strip(),
            "route_long_name": (row.get("route_long_name") or "").strip(),
            "route_type": route_type,
            "route_type_label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
            "route_color": (row.get("route_color") or "").strip(),
        }

    cur.execute(
        """
        SELECT route_id, shape_id
        FROM gtfs_trips
        WHERE route_id IS NOT NULL AND shape_id IS NOT NULL
        ORDER BY trip_id
        """
    )
    route_shape_map: dict[str, str] = {}
    for row in cur.fetchall():
        route_id = (row.get("route_id") or "").strip()
        shape_id = (row.get("shape_id") or "").strip()
        if route_id and shape_id and route_id not in route_shape_map:
            route_shape_map[route_id] = shape_id

    cur.execute(
        """
        SELECT shape_id, shape_pt_sequence, shape_pt_lat, shape_pt_lon
        FROM gtfs_shapes
        WHERE shape_id IS NOT NULL
          AND shape_pt_sequence IS NOT NULL
          AND shape_pt_lat IS NOT NULL
          AND shape_pt_lon IS NOT NULL
        ORDER BY shape_id, shape_pt_sequence
        """
    )
    shape_points: dict[str, list[tuple[int, list[float]]]] = defaultdict(list)
    for row in cur.fetchall():
        shape_id = (row.get("shape_id") or "").strip()
        if not shape_id:
            continue
        lat = _safe_float(str(row.get("shape_pt_lat")))
        lon = _safe_float(str(row.get("shape_pt_lon")))
        sequence = _safe_int(str(row.get("shape_pt_sequence")), 0)
        if abs(lat) > 90 or abs(lon) > 180:
            continue
        shape_points[shape_id].append((sequence, [lat, lon]))

    return _build_route_lines(routes_meta, route_shape_map, shape_points)


def load_active_bus_route_lines_from_files() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    routes_file = GTFS_DIR / "routes.txt"
    trips_file = GTFS_DIR / "trips.txt"
    shapes_file = GTFS_DIR / "shapes.txt"
    if not routes_file.exists() or not trips_file.exists() or not shapes_file.exists():
        return [], []

    routes_meta: dict[str, dict[str, Any]] = {}
    with routes_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            if not route_id:
                continue
            route_type = _safe_int(row.get("route_type"), 3)
            routes_meta[route_id] = {
                "route_id": route_id,
                "route_short_name": (row.get("route_short_name") or "").strip(),
                "route_long_name": (row.get("route_long_name") or "").strip(),
                "route_type": route_type,
                "route_type_label": ROUTE_TYPE_LABELS.get(route_type, f"Type {route_type}"),
                "route_color": (row.get("route_color") or "").strip(),
            }

    route_shape_map: dict[str, str] = {}
    with trips_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            route_id = (row.get("route_id") or "").strip()
            shape_id = (row.get("shape_id") or "").strip()
            if not route_id or not shape_id:
                continue
            if route_id not in route_shape_map:
                route_shape_map[route_id] = shape_id

    shape_points: dict[str, list[tuple[int, list[float]]]] = defaultdict(list)
    with shapes_file.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            shape_id = (row.get("shape_id") or "").strip()
            if not shape_id:
                continue
            lat = _safe_float(row.get("shape_pt_lat"))
            lon = _safe_float(row.get("shape_pt_lon"))
            if abs(lat) > 90 or abs(lon) > 180:
                continue
            sequence = _safe_int(row.get("shape_pt_sequence"), 0)
            shape_points[shape_id].append((sequence, [lat, lon]))

    return _build_route_lines(routes_meta, route_shape_map, shape_points)


def load_active_bus_route_lines(cur) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    lines, summary = load_active_bus_route_lines_from_db(cur)
    if not lines:
        lines, summary = load_active_bus_route_lines_from_files()
    return filter_route_lines_in_jakarta(lines), summary
