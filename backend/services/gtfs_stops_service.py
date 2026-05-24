"""Helper GTFS: halte yang hanya dilayani route aktif."""

from __future__ import annotations

from typing import Any


def ensure_gtfs_route_active_column(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS gtfs_routes (
            route_id TEXT PRIMARY KEY,
            is_active BOOLEAN NOT NULL DEFAULT TRUE
        )
        """
    )
    cur.execute(
        """
        ALTER TABLE gtfs_routes
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE
        """
    )


def gtfs_link_tables_ready(cur) -> bool:
    cur.execute(
        """
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('gtfs_routes', 'gtfs_trips', 'gtfs_stop_times', 'stops')
        """
    )
    if int(cur.fetchone()["count"]) < 4:
        return False
    cur.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM gtfs_routes) AS routes,
            (SELECT COUNT(*) FROM gtfs_trips) AS trips,
            (SELECT COUNT(*) FROM gtfs_stop_times) AS stop_times
        """
    )
    row = dict(cur.fetchone())
    return int(row.get("routes") or 0) > 0 and int(row.get("trips") or 0) > 0 and int(row.get("stop_times") or 0) > 0


def _load_all_stops(cur) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT stop_name, stop_lat, stop_lon
        FROM stops
        WHERE stop_lat IS NOT NULL
          AND stop_lon IS NOT NULL
        """
    )
    return [dict(row) for row in cur.fetchall()]


def load_stops_for_active_routes(cur) -> list[dict[str, Any]]:
    """
    Halte yang dilayani minimal satu route GTFS aktif.
    Fallback ke semua halte bila relasi GTFS belum tersedia.
    """
    ensure_gtfs_route_active_column(cur)

    if not gtfs_link_tables_ready(cur):
        return _load_all_stops(cur)

    cur.execute(
        """
        SELECT DISTINCT s.stop_name, s.stop_lat, s.stop_lon
        FROM stops s
        INNER JOIN gtfs_stop_times st ON st.stop_id = s.stop_id
        INNER JOIN gtfs_trips t ON t.trip_id = st.trip_id
        INNER JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE s.stop_lat IS NOT NULL
          AND s.stop_lon IS NOT NULL
          AND COALESCE(r.is_active, TRUE) = TRUE
        """
    )
    active_stops = [dict(row) for row in cur.fetchall()]
    if active_stops:
        return active_stops

    return _load_all_stops(cur)


def count_stops_for_active_routes(
    cur,
    *,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
) -> int:
    ensure_gtfs_route_active_column(cur)

    bounds_sql = ""
    params: list[Any] = []
    if None not in (min_lat, max_lat, min_lon, max_lon):
        bounds_sql = """
          AND s.stop_lat BETWEEN %s AND %s
          AND s.stop_lon BETWEEN %s AND %s
        """
        params.extend([min_lat, max_lat, min_lon, max_lon])

    if not gtfs_link_tables_ready(cur):
        cur.execute(
            f"""
            SELECT COUNT(*) AS count
            FROM stops s
            WHERE s.stop_lat IS NOT NULL
              AND s.stop_lon IS NOT NULL
              {bounds_sql}
            """,
            tuple(params),
        )
        return int(cur.fetchone()["count"])

    cur.execute(
        f"""
        SELECT COUNT(DISTINCT s.stop_id) AS count
        FROM stops s
        INNER JOIN gtfs_stop_times st ON st.stop_id = s.stop_id
        INNER JOIN gtfs_trips t ON t.trip_id = st.trip_id
        INNER JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE s.stop_lat IS NOT NULL
          AND s.stop_lon IS NOT NULL
          AND COALESCE(r.is_active, TRUE) = TRUE
          {bounds_sql}
        """,
        tuple(params),
    )
    active_count = int(cur.fetchone()["count"])
    if active_count > 0:
        return active_count

    cur.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM stops s
        WHERE s.stop_lat IS NOT NULL
          AND s.stop_lon IS NOT NULL
          {bounds_sql}
        """,
        tuple(params),
    )
    return int(cur.fetchone()["count"])


def load_stop_locations_for_active_routes(
    cur,
    *,
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    limit: int = 500,
) -> list[dict[str, Any]]:
    ensure_gtfs_route_active_column(cur)
    params: list[Any] = [min_lat, max_lat, min_lon, max_lon, limit]

    if not gtfs_link_tables_ready(cur):
        cur.execute(
            """
            SELECT stop_name, stop_lat, stop_lon
            FROM stops
            WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL
              AND stop_lat BETWEEN %s AND %s
              AND stop_lon BETWEEN %s AND %s
            LIMIT %s
            """,
            tuple(params),
        )
        return [dict(row) for row in cur.fetchall()]

    cur.execute(
        """
        SELECT DISTINCT s.stop_name, s.stop_lat, s.stop_lon
        FROM stops s
        INNER JOIN gtfs_stop_times st ON st.stop_id = s.stop_id
        INNER JOIN gtfs_trips t ON t.trip_id = st.trip_id
        INNER JOIN gtfs_routes r ON r.route_id = t.route_id
        WHERE s.stop_lat IS NOT NULL AND s.stop_lon IS NOT NULL
          AND s.stop_lat BETWEEN %s AND %s
          AND s.stop_lon BETWEEN %s AND %s
          AND COALESCE(r.is_active, TRUE) = TRUE
        LIMIT %s
        """,
        tuple(params),
    )
    rows = [dict(row) for row in cur.fetchall()]
    if rows:
        return rows

    cur.execute(
        """
        SELECT stop_name, stop_lat, stop_lon
        FROM stops
        WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL
          AND stop_lat BETWEEN %s AND %s
          AND stop_lon BETWEEN %s AND %s
        LIMIT %s
        """,
        tuple(params),
    )
    return [dict(row) for row in cur.fetchall()]
