"""Saran transportasi umum (TransJakarta) antar titik itinerary."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from services.gtfs_stops_service import ensure_gtfs_route_active_column, gtfs_link_tables_ready
from services.haversine_service import haversine
from services.road_route_service import get_walk_leg


def _load_active_stops_with_id(cur) -> list[dict[str, Any]]:
    ensure_gtfs_route_active_column(cur)
    if gtfs_link_tables_ready(cur):
        cur.execute(
            """
            SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
            FROM stops s
            INNER JOIN gtfs_stop_times st ON st.stop_id = s.stop_id
            INNER JOIN gtfs_trips t ON t.trip_id = st.trip_id
            INNER JOIN gtfs_routes r ON r.route_id = t.route_id
            WHERE s.stop_lat IS NOT NULL
              AND s.stop_lon IS NOT NULL
              AND COALESCE(r.is_active, TRUE) = TRUE
            """
        )
        rows = [dict(row) for row in cur.fetchall()]
        if rows:
            return rows

    cur.execute(
        """
        SELECT stop_id, stop_name, stop_lat, stop_lon
        FROM stops
        WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL
        """
    )
    return [dict(row) for row in cur.fetchall()]


def _nearest_stop(stops: list[dict[str, Any]], lat: float, lon: float) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_dist = float("inf")
    for stop in stops:
        dist = haversine(lat, lon, float(stop["stop_lat"]), float(stop["stop_lon"]))
        if dist < best_dist:
            best_dist = dist
            best = {**stop, "distance_m": round(dist)}
    return best


def _bus_label(route_short_name: str | None, route_id: str | None) -> str:
    short = (route_short_name or "").strip()
    if short:
        return short
    return (route_id or "").strip() or "?"


def _direct_bus_routes(cur, from_stop_id: str, to_stop_id: str) -> list[str]:
    cur.execute(
        """
        SELECT DISTINCT r.route_short_name, r.route_id
        FROM gtfs_stop_times sta
        JOIN gtfs_stop_times stb
          ON sta.trip_id = stb.trip_id
         AND sta.stop_sequence < stb.stop_sequence
        JOIN gtfs_trips t ON t.trip_id = sta.trip_id
        JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE sta.stop_id = %s
          AND stb.stop_id = %s
          AND COALESCE(r.is_active, TRUE) = TRUE
        ORDER BY r.route_short_name NULLS LAST, r.route_id
        LIMIT 12
        """,
        (from_stop_id, to_stop_id),
    )
    labels: list[str] = []
    seen: set[str] = set()
    for row in cur.fetchall():
        label = _bus_label(row.get("route_short_name"), row.get("route_id"))
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def _routes_at_stop(cur, stop_id: str) -> list[str]:
    cur.execute(
        """
        SELECT DISTINCT r.route_short_name, r.route_id
        FROM gtfs_stop_times st
        JOIN gtfs_trips t ON t.trip_id = st.trip_id
        JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE st.stop_id = %s
          AND COALESCE(r.is_active, TRUE) = TRUE
        ORDER BY r.route_short_name NULLS LAST, r.route_id
        LIMIT 12
        """,
        (stop_id,),
    )
    labels: list[str] = []
    seen: set[str] = set()
    for row in cur.fetchall():
        label = _bus_label(row.get("route_short_name"), row.get("route_id"))
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def _suggest_transfer_stop(cur, from_stop_id: str, to_stop_id: str) -> dict[str, Any] | None:
    """Halte perantara untuk satu kali transfer antar dua halte (trip berbeda)."""
    cur.execute(
        """
        SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
        FROM gtfs_stop_times a
        JOIN gtfs_stop_times mid
          ON a.trip_id = mid.trip_id
         AND a.stop_sequence < mid.stop_sequence
        JOIN gtfs_stop_times b
          ON b.stop_id = mid.stop_id
         AND b.trip_id <> a.trip_id
        JOIN gtfs_stop_times c
          ON b.trip_id = c.trip_id
         AND b.stop_sequence < c.stop_sequence
        JOIN stops s ON s.stop_id = mid.stop_id
        JOIN gtfs_trips t1 ON t1.trip_id = a.trip_id
        JOIN gtfs_routes r1 ON r1.route_id = t1.route_id
        JOIN gtfs_trips t2 ON t2.trip_id = c.trip_id
        JOIN gtfs_routes r2 ON r2.route_id = t2.route_id
        WHERE a.stop_id = %s
          AND c.stop_id = %s
          AND mid.stop_id NOT IN (%s, %s)
          AND COALESCE(r1.is_active, TRUE) = TRUE
          AND COALESCE(r2.is_active, TRUE) = TRUE
        ORDER BY (mid.stop_sequence - a.stop_sequence) + (c.stop_sequence - b.stop_sequence)
        LIMIT 1
        """,
        (from_stop_id, to_stop_id, from_stop_id, to_stop_id),
    )
    row = cur.fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        stop_id = str(row.get("stop_id") or "").strip()
        name = str(row.get("stop_name") or "").strip()
        lat = row.get("stop_lat")
        lon = row.get("stop_lon")
    else:
        stop_id = str(row[0]).strip() if len(row) > 0 else ""
        name = str(row[1]).strip() if len(row) > 1 else ""
        lat = row[2] if len(row) > 2 else None
        lon = row[3] if len(row) > 3 else None
    if not name:
        return None
    out: dict[str, Any] = {"stop_id": stop_id or None, "stop_name": name}
    if lat is not None and lon is not None:
        out["stop_lat"] = float(lat)
        out["stop_lon"] = float(lon)
    return out


def _format_bus_list(routes: list[str]) -> str:
    if not routes:
        return "—"
    return ", ".join(routes)


def _nearest_shape_index(points: list[tuple[float, float]], lat: float, lon: float) -> int:
    best_idx = 0
    best_dist = float("inf")
    for idx, (plat, plon) in enumerate(points):
        dist = haversine(lat, lon, plat, plon)
        if dist < best_dist:
            best_dist = dist
            best_idx = idx
    return best_idx


def _find_direct_trip_id(cur, from_stop_id: str, to_stop_id: str) -> str | None:
    cur.execute(
        """
        SELECT sta.trip_id
        FROM gtfs_stop_times sta
        JOIN gtfs_stop_times stb
          ON sta.trip_id = stb.trip_id
         AND sta.stop_sequence < stb.stop_sequence
        JOIN gtfs_trips t ON t.trip_id = sta.trip_id
        JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE sta.stop_id = %s
          AND stb.stop_id = %s
          AND COALESCE(r.is_active, TRUE) = TRUE
        ORDER BY (stb.stop_sequence - sta.stop_sequence)
        LIMIT 1
        """,
        (from_stop_id, to_stop_id),
    )
    row = cur.fetchone()
    if not row:
        return None
    trip_id = row.get("trip_id") if isinstance(row, dict) else row[0]
    return str(trip_id).strip() if trip_id else None


def _find_trip_between_stops(cur, from_stop_id: str, to_stop_id: str) -> str | None:
    return _find_direct_trip_id(cur, from_stop_id, to_stop_id)


def _load_shape_points(cur, shape_id: str) -> list[tuple[float, float]]:
    cur.execute(
        """
        SELECT shape_pt_lat, shape_pt_lon
        FROM gtfs_shapes
        WHERE shape_id = %s
          AND shape_pt_lat IS NOT NULL
          AND shape_pt_lon IS NOT NULL
        ORDER BY shape_pt_sequence
        """,
        (shape_id,),
    )
    out: list[tuple[float, float]] = []
    for row in cur.fetchall():
        lat = row.get("shape_pt_lat") if isinstance(row, dict) else row[0]
        lon = row.get("shape_pt_lon") if isinstance(row, dict) else row[1]
        if lat is None or lon is None:
            continue
        out.append((float(lat), float(lon)))
    return out


def _bus_shape_path(cur, trip_id: str, from_stop_id: str, to_stop_id: str) -> list[list[float]]:
    cur.execute(
        """
        SELECT t.shape_id, sf.stop_lat, sf.stop_lon, st.stop_lat, st.stop_lon
        FROM gtfs_trips t
        JOIN stops sf ON sf.stop_id = %s
        JOIN stops st ON st.stop_id = %s
        WHERE t.trip_id = %s
        LIMIT 1
        """,
        (from_stop_id, to_stop_id, trip_id),
    )
    row = cur.fetchone()
    if not row:
        return []
    if isinstance(row, dict):
        shape_id = str(row.get("shape_id") or "").strip()
        from_lat = float(row["stop_lat"])
        from_lon = float(row["stop_lon"])
        to_lat = float(row["stop_lat"])
        to_lon = float(row["stop_lon"])
    else:
        shape_id = str(row[0] or "").strip()
        from_lat = float(row[1])
        from_lon = float(row[2])
        to_lat = float(row[3])
        to_lon = float(row[4])

    if not shape_id:
        return [[from_lat, from_lon], [to_lat, to_lon]]

    shape_points = _load_shape_points(cur, shape_id)
    if len(shape_points) < 2:
        return [[from_lat, from_lon], [to_lat, to_lon]]

    start_idx = _nearest_shape_index(shape_points, from_lat, from_lon)
    end_idx = _nearest_shape_index(shape_points, to_lat, to_lon)
    if start_idx > end_idx:
        start_idx, end_idx = end_idx, start_idx
    if end_idx - start_idx < 1:
        return [[from_lat, from_lon], [to_lat, to_lon]]

    segment = [[lat, lon] for lat, lon in shape_points[start_idx : end_idx + 1]]
    if segment:
        segment[0] = [from_lat, from_lon]
        segment[-1] = [to_lat, to_lon]
    return segment


def _build_bus_path(
    cur,
    *,
    from_stop_id: str,
    to_stop_id: str,
    transfer_stop_id: str | None,
) -> list[list[float]]:
    if transfer_stop_id and transfer_stop_id not in {from_stop_id, to_stop_id}:
        trip_a = _find_trip_between_stops(cur, from_stop_id, transfer_stop_id)
        trip_b = _find_trip_between_stops(cur, transfer_stop_id, to_stop_id)
        path: list[list[float]] = []
        if trip_a:
            path.extend(_bus_shape_path(cur, trip_a, from_stop_id, transfer_stop_id))
        if trip_b:
            seg_b = _bus_shape_path(cur, trip_b, transfer_stop_id, to_stop_id)
            if path and seg_b:
                if path[-1] == seg_b[0]:
                    path.extend(seg_b[1:])
                else:
                    path.extend(seg_b)
            else:
                path.extend(seg_b)
        if len(path) >= 2:
            return path

    trip_id = _find_direct_trip_id(cur, from_stop_id, to_stop_id)
    if not trip_id:
        cur.execute(
            "SELECT stop_lat, stop_lon FROM stops WHERE stop_id = %s",
            (from_stop_id,),
        )
        row_a = cur.fetchone()
        cur.execute(
            "SELECT stop_lat, stop_lon FROM stops WHERE stop_id = %s",
            (to_stop_id,),
        )
        row_b = cur.fetchone()
        if row_a and row_b:
            return [
                [float(row_a["stop_lat"] if isinstance(row_a, dict) else row_a[0]),
                 float(row_a["stop_lon"] if isinstance(row_a, dict) else row_a[1])],
                [float(row_b["stop_lat"] if isinstance(row_b, dict) else row_b[0]),
                 float(row_b["stop_lon"] if isinstance(row_b, dict) else row_b[1])],
            ]
        return []

    return _bus_shape_path(cur, trip_id, from_stop_id, to_stop_id)


def _walk_path(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> list[list[float]]:
    result = get_walk_leg(from_lat, from_lon, to_lat, to_lon)
    points = result.get("path_points") or []
    if len(points) >= 2:
        return points
    return [[from_lat, from_lon], [to_lat, to_lon]]


def _attach_leg_geometry(cur, leg: dict[str, Any]) -> dict[str, Any]:
    if leg.get("mode") == "unavailable":
        leg["walk_to_stop_path"] = []
        leg["bus_path"] = []
        leg["walk_to_dest_path"] = []
        return leg

    from_lat = leg.get("from_lat")
    from_lon = leg.get("from_lon")
    to_lat = leg.get("to_lat")
    to_lon = leg.get("to_lon")
    from_stop_lat = leg.get("from_stop_lat")
    from_stop_lon = leg.get("from_stop_lon")
    to_stop_lat = leg.get("to_stop_lat")
    to_stop_lon = leg.get("to_stop_lon")
    from_stop_id = leg.get("from_stop_id")
    to_stop_id = leg.get("to_stop_id")
    transfer_stop_id = leg.get("transfer_stop_id")

    walk_tasks: list[tuple[str, float, float, float, float]] = []

    if (
        from_lat is not None
        and from_lon is not None
        and from_stop_lat is not None
        and from_stop_lon is not None
        and leg.get("mode") != "walk_only"
    ):
        walk_tasks.append(("walk_to_stop", float(from_lat), float(from_lon), float(from_stop_lat), float(from_stop_lon)))

    if to_stop_lat is not None and to_stop_lon is not None and to_lat is not None and to_lon is not None:
        walk_tasks.append(("walk_to_dest", float(to_stop_lat), float(to_stop_lon), float(to_lat), float(to_lon)))

    if leg.get("mode") == "walk_only" and from_lat is not None and from_lon is not None and to_lat is not None and to_lon is not None:
        walk_tasks = [("walk_only", float(from_lat), float(from_lon), float(to_lat), float(to_lon))]

    walk_results: dict[str, list[list[float]]] = {}
    if walk_tasks:
        with ThreadPoolExecutor(max_workers=min(4, len(walk_tasks))) as pool:
            futures = {
                pool.submit(_walk_path, lat1, lon1, lat2, lon2): key
                for key, lat1, lon1, lat2, lon2 in walk_tasks
            }
            for future in futures:
                key = futures[future]
                try:
                    walk_results[key] = future.result()
                except Exception:
                    task = next(item for item in walk_tasks if item[0] == key)
                    walk_results[key] = [[task[1], task[2]], [task[3], task[4]]]

    if leg.get("mode") == "walk_only":
        leg["walk_to_stop_path"] = []
        leg["bus_path"] = []
        leg["walk_to_dest_path"] = walk_results.get("walk_only", [])
        return leg

    leg["walk_to_stop_path"] = walk_results.get("walk_to_stop", [])
    leg["walk_to_dest_path"] = walk_results.get("walk_to_dest", [])

    if from_stop_id and to_stop_id and leg.get("mode") in {"direct", "transfer_hint"}:
        leg["bus_path"] = _build_bus_path(
            cur,
            from_stop_id=str(from_stop_id),
            to_stop_id=str(to_stop_id),
            transfer_stop_id=str(transfer_stop_id) if transfer_stop_id else None,
        )
    else:
        leg["bus_path"] = []

    return leg


def build_transit_leg(
    cur,
    stops: list[dict[str, Any]],
    *,
    from_lat: float,
    from_lon: float,
    from_label: str,
    to_lat: float,
    to_lon: float,
    to_label: str,
) -> dict[str, Any]:
    from_stop = _nearest_stop(stops, from_lat, from_lon)
    to_stop = _nearest_stop(stops, to_lat, to_lon)

    if not from_stop or not to_stop:
        return _attach_leg_geometry(
            cur,
            {
                "from_label": from_label,
                "to_label": to_label,
                "from_lat": from_lat,
                "from_lon": from_lon,
                "to_lat": to_lat,
                "to_lon": to_lon,
                "mode": "unavailable",
                "direct_bus_routes": [],
                "origin_bus_routes": [],
                "destination_bus_routes": [],
                "from_stop_name": from_stop.get("stop_name") if from_stop else None,
                "from_stop_lat": float(from_stop["stop_lat"]) if from_stop else None,
                "from_stop_lon": float(from_stop["stop_lon"]) if from_stop else None,
                "from_stop_distance_m": from_stop.get("distance_m") if from_stop else None,
                "to_stop_name": to_stop.get("stop_name") if to_stop else None,
                "to_stop_lat": float(to_stop["stop_lat"]) if to_stop else None,
                "to_stop_lon": float(to_stop["stop_lon"]) if to_stop else None,
                "to_stop_distance_m": to_stop.get("distance_m") if to_stop else None,
                "transfer_stop_name": None,
                "transfer_stop_lat": None,
                "transfer_stop_lon": None,
                "transfer_stop_id": None,
                "from_stop_id": from_stop.get("stop_id") if from_stop else None,
                "to_stop_id": to_stop.get("stop_id") if to_stop else None,
                "summary": f"{from_label} → {to_label}: data halte TransJakarta belum tersedia.",
            },
        )

    from_id = str(from_stop["stop_id"])
    to_id = str(to_stop["stop_id"])
    from_name = str(from_stop.get("stop_name") or "Halte")
    to_name = str(to_stop.get("stop_name") or "Halte")
    from_dist = int(from_stop["distance_m"])
    to_dist = int(to_stop["distance_m"])

    if from_id == to_id:
        origin_routes = _routes_at_stop(cur, from_id)
        summary = (
            f"{from_label} → {to_label}: area halte sama ({from_name}). "
            f"Jalan kaki antar titik; bus di halte ini: {_format_bus_list(origin_routes)}."
        )
        return _attach_leg_geometry(
            cur,
            {
                "from_label": from_label,
                "to_label": to_label,
                "from_lat": from_lat,
                "from_lon": from_lon,
                "to_lat": to_lat,
                "to_lon": to_lon,
                "mode": "walk_only",
                "direct_bus_routes": origin_routes,
                "origin_bus_routes": origin_routes,
                "destination_bus_routes": origin_routes,
                "from_stop_name": from_name,
                "from_stop_lat": float(from_stop["stop_lat"]),
                "from_stop_lon": float(from_stop["stop_lon"]),
                "from_stop_distance_m": from_dist,
                "to_stop_name": to_name,
                "to_stop_lat": float(to_stop["stop_lat"]),
                "to_stop_lon": float(to_stop["stop_lon"]),
                "to_stop_distance_m": to_dist,
                "from_stop_id": from_id,
                "to_stop_id": to_id,
                "transfer_stop_name": None,
                "transfer_stop_lat": None,
                "transfer_stop_lon": None,
                "transfer_stop_id": None,
                "summary": summary,
            },
        )

    direct = _direct_bus_routes(cur, from_id, to_id)
    origin_routes = _routes_at_stop(cur, from_id)
    dest_routes = _routes_at_stop(cur, to_id)

    transfer_stop_lat: float | None = None
    transfer_stop_lon: float | None = None
    transfer_stop_id: str | None = None

    if direct:
        summary = (
            f"{from_label} → {to_label}: jalan kaki ~{from_dist} m ke {from_name}, "
            f"naik TransJakarta {_format_bus_list(direct)} menuju {to_name} "
            f"(~{to_dist} m dari tujuan)."
        )
        mode = "direct"
        transfer_stop_name = None
    else:
        transfer = _suggest_transfer_stop(cur, from_id, to_id)
        transfer_stop_name = transfer.get("stop_name") if transfer else None
        transfer_stop_id = transfer.get("stop_id") if transfer else None
        if transfer:
            if transfer.get("stop_lat") is not None and transfer.get("stop_lon") is not None:
                transfer_stop_lat = float(transfer["stop_lat"])
                transfer_stop_lon = float(transfer["stop_lon"])
        transfer_clause = (
            f"transfer di {transfer_stop_name}"
            if transfer_stop_name
            else "transfer di halte transit"
        )
        summary = (
            f"{from_label} → {to_label}: jalan kaki ~{from_dist} m ke {from_name} "
            f"(bus: {_format_bus_list(origin_routes)}), lalu {transfer_clause} menuju {to_name} "
            f"dekat tujuan (~{to_dist} m) — bus di area tujuan: {_format_bus_list(dest_routes)}."
        )
        mode = "transfer_hint"

    return _attach_leg_geometry(
        cur,
        {
            "from_label": from_label,
            "to_label": to_label,
            "from_lat": from_lat,
            "from_lon": from_lon,
            "to_lat": to_lat,
            "to_lon": to_lon,
            "mode": mode,
            "direct_bus_routes": direct,
            "origin_bus_routes": origin_routes,
            "destination_bus_routes": dest_routes,
            "from_stop_name": from_name,
            "from_stop_lat": float(from_stop["stop_lat"]),
            "from_stop_lon": float(from_stop["stop_lon"]),
            "from_stop_distance_m": from_dist,
            "to_stop_name": to_name,
            "to_stop_lat": float(to_stop["stop_lat"]),
            "to_stop_lon": float(to_stop["stop_lon"]),
            "to_stop_distance_m": to_dist,
            "from_stop_id": from_id,
            "to_stop_id": to_id,
            "transfer_stop_name": transfer_stop_name,
            "transfer_stop_lat": transfer_stop_lat,
            "transfer_stop_lon": transfer_stop_lon,
            "transfer_stop_id": transfer_stop_id,
            "summary": summary,
        },
    )


def build_itinerary_transit(
    cur,
    *,
    hotel_lat: float,
    hotel_lon: float,
    hotel_name: str,
    days: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    stops = _load_active_stops_with_id(cur)
    result_days: list[dict[str, Any]] = []

    for day_payload in days:
        day_no = int(day_payload.get("day") or 1)
        stop_points = day_payload.get("stops") or []
        legs: list[dict[str, Any]] = []
        prev_lat = hotel_lat
        prev_lon = hotel_lon
        prev_label = hotel_name or "Hotel"

        for point in stop_points:
            to_label = str(point.get("name") or "Destinasi").strip() or "Destinasi"
            to_lat = float(point["latitude"])
            to_lon = float(point["longitude"])
            legs.append(
                build_transit_leg(
                    cur,
                    stops,
                    from_lat=prev_lat,
                    from_lon=prev_lon,
                    from_label=prev_label,
                    to_lat=to_lat,
                    to_lon=to_lon,
                    to_label=to_label,
                )
            )
            prev_lat = to_lat
            prev_lon = to_lon
            prev_label = to_label

        result_days.append({"day": day_no, "legs": legs})

    return result_days
