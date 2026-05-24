"""Saran transportasi umum (TransJakarta) antar titik itinerary."""

from __future__ import annotations

from typing import Any

from services.gtfs_stops_service import ensure_gtfs_route_active_column, gtfs_link_tables_ready
from services.haversine_service import haversine


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


def _suggest_transfer_stop(cur, from_stop_id: str, to_stop_id: str) -> str | None:
    """Halte perantara untuk satu kali transfer antar dua halte (trip berbeda)."""
    cur.execute(
        """
        SELECT s.stop_name
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
        return str(row.get("stop_name") or "").strip() or None
    return str(row[0]).strip() or None


def _format_bus_list(routes: list[str]) -> str:
    if not routes:
        return "—"
    return ", ".join(routes)


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
        return {
            "from_label": from_label,
            "to_label": to_label,
            "mode": "unavailable",
            "direct_bus_routes": [],
            "origin_bus_routes": [],
            "destination_bus_routes": [],
            "from_stop_name": from_stop.get("stop_name") if from_stop else None,
            "from_stop_distance_m": from_stop.get("distance_m") if from_stop else None,
            "to_stop_name": to_stop.get("stop_name") if to_stop else None,
            "to_stop_distance_m": to_stop.get("distance_m") if to_stop else None,
            "transfer_stop_name": None,
            "summary": f"{from_label} → {to_label}: data halte TransJakarta belum tersedia.",
        }

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
        return {
            "from_label": from_label,
            "to_label": to_label,
            "mode": "walk_only",
            "direct_bus_routes": origin_routes,
            "origin_bus_routes": origin_routes,
            "destination_bus_routes": origin_routes,
            "from_stop_name": from_name,
            "from_stop_distance_m": from_dist,
            "to_stop_name": to_name,
            "to_stop_distance_m": to_dist,
            "transfer_stop_name": None,
            "summary": summary,
        }

    direct = _direct_bus_routes(cur, from_id, to_id)
    origin_routes = _routes_at_stop(cur, from_id)
    dest_routes = _routes_at_stop(cur, to_id)

    if direct:
        summary = (
            f"{from_label} → {to_label}: jalan kaki ~{from_dist} m ke {from_name}, "
            f"naik TransJakarta {_format_bus_list(direct)} menuju {to_name} "
            f"(~{to_dist} m dari tujuan)."
        )
        mode = "direct"
        transfer_stop_name = None
    else:
        transfer_stop_name = _suggest_transfer_stop(cur, from_id, to_id)
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

    return {
        "from_label": from_label,
        "to_label": to_label,
        "mode": mode,
        "direct_bus_routes": direct,
        "origin_bus_routes": origin_routes,
        "destination_bus_routes": dest_routes,
        "from_stop_name": from_name,
        "from_stop_distance_m": from_dist,
        "to_stop_name": to_name,
        "to_stop_distance_m": to_dist,
        "transfer_stop_name": transfer_stop_name,
        "summary": summary,
    }


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
