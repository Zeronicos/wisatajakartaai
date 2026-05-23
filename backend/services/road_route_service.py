import json
from typing import Any
from urllib import error, request

from services.haversine_service import haversine

OSRM_BASE_URL = "http://router.project-osrm.org"
OSRM_TIMEOUT_SECONDS = 8
OSRM_TABLE_TIMEOUT_SECONDS = 20
MAX_TABLE_COORDINATES = 25


def _parse_points_from_geojson(geometry: dict[str, Any] | None) -> list[list[float]]:
    if not geometry:
        return []
    if geometry.get("type") != "LineString":
        return []
    coords = geometry.get("coordinates") or []
    points: list[list[float]] = []
    for item in coords:
        if not isinstance(item, list) or len(item) < 2:
            continue
        lon = float(item[0])
        lat = float(item[1])
        points.append([lat, lon])
    return points


def get_road_leg(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
) -> dict[str, Any]:
    """
    Ambil rute jalan asli dari OSRM public API untuk satu segmen perjalanan.
    Return:
      {
        "ok": bool,
        "distance_m": float,
        "path_points": [[lat, lon], ...],
      }
    """
    url = (
        f"{OSRM_BASE_URL}/route/v1/driving/"
        f"{from_lon},{from_lat};{to_lon},{to_lat}"
        "?overview=full&geometries=geojson&alternatives=false&steps=false"
    )
    req = request.Request(
        url=url,
        headers={
            "User-Agent": "wisata-jakarta-ai/1.0",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with request.urlopen(req, timeout=OSRM_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, ValueError):
        return {"ok": False, "distance_m": 0.0, "path_points": []}

    routes = payload.get("routes") or []
    if not routes:
        return {"ok": False, "distance_m": 0.0, "path_points": []}

    best_route = routes[0]
    distance_m = float(best_route.get("distance") or 0.0)
    points = _parse_points_from_geojson(best_route.get("geometry"))
    if len(points) < 2:
        return {"ok": False, "distance_m": distance_m, "path_points": []}

    return {
        "ok": True,
        "distance_m": distance_m,
        "path_points": points,
    }


def _haversine_matrix_km(coords: list[tuple[float, float]]) -> tuple[list[list[float]], list[list[str]]]:
    """Matriks jarak lurus (km) + sumber sel `haversine` / `same`."""
    n = len(coords)
    km: list[list[float]] = []
    src: list[list[str]] = []
    for i in range(n):
        row_km: list[float] = []
        row_s: list[str] = []
        for j in range(n):
            if i == j:
                row_km.append(0.0)
                row_s.append("same")
            else:
                la1, lo1 = coords[i]
                la2, lo2 = coords[j]
                d = haversine(la1, lo1, la2, lo2)
                row_km.append(round(d / 1000.0, 2))
                row_s.append("haversine")
        km.append(row_km)
        src.append(row_s)
    return km, src


def get_road_distance_matrix(
    coords: list[tuple[float, float]],
    *,
    fallback_haversine: bool = True,
) -> dict[str, Any]:
    """
    Matriks jarak perjalanan mengemut (meter → km) via OSRM Table API.
    Sel yang null / gagal diganti Haversine (label `haversine`) bila fallback_haversine=True.
    """
    n = len(coords)
    if n == 0:
        return {"ok": True, "distances_km": [], "sources": [], "provider": "none"}
    if n > MAX_TABLE_COORDINATES:
        return {
            "ok": False,
            "distances_km": [],
            "sources": [],
            "provider": "none",
            "error": f"Maksimal {MAX_TABLE_COORDINATES} titik.",
        }
    if n == 1:
        return {
            "ok": True,
            "distances_km": [[0.0]],
            "sources": [["same"]],
            "provider": "osrm",
        }

    parts = [f"{lon},{lat}" for lat, lon in coords]
    coord_str = ";".join(parts)
    url = (
        f"{OSRM_BASE_URL}/table/v1/driving/{coord_str}"
        "?annotations=distance"
    )
    req = request.Request(
        url=url,
        headers={
            "User-Agent": "wisata-jakarta-ai/1.0",
            "Accept": "application/json",
        },
        method="GET",
    )

    raw_matrix: list[list[Any]] | None = None
    try:
        with request.urlopen(req, timeout=OSRM_TABLE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
        raw_matrix = payload.get("distances")
    except (error.URLError, TimeoutError, ValueError, OSError):
        raw_matrix = None

    if not raw_matrix or not isinstance(raw_matrix, list) or len(raw_matrix) != n:
        if not fallback_haversine:
            return {
                "ok": False,
                "distances_km": [],
                "sources": [],
                "provider": "none",
                "error": "OSRM Table tidak tersedia.",
            }
        km, src = _haversine_matrix_km(coords)
        return {
            "ok": True,
            "distances_km": km,
            "sources": src,
            "provider": "haversine_only",
            "note": "OSRM Table tidak tersedia; memakai Haversine untuk semua pasangan.",
        }

    distances_km: list[list[float]] = []
    sources: list[list[str]] = []
    any_road = False
    for i in range(n):
        row_raw = raw_matrix[i] if i < len(raw_matrix) else None
        row_km: list[float] = []
        row_src: list[str] = []
        for j in range(n):
            if i == j:
                row_km.append(0.0)
                row_src.append("same")
                continue
            cell = None
            if isinstance(row_raw, list) and j < len(row_raw):
                cell = row_raw[j]
            if cell is not None:
                try:
                    m = float(cell)
                    if m >= 0:
                        row_km.append(round(m / 1000.0, 2))
                        row_src.append("road")
                        any_road = True
                        continue
                except (TypeError, ValueError):
                    pass
            if not fallback_haversine:
                return {
                    "ok": False,
                    "distances_km": [],
                    "sources": [],
                    "provider": "none",
                    "error": "OSRM Table tidak mengembalikan jarak jalan yang valid.",
                }
            la1, lo1 = coords[i]
            la2, lo2 = coords[j]
            d = haversine(la1, lo1, la2, lo2)
            row_km.append(round(d / 1000.0, 2))
            row_src.append("haversine")
        distances_km.append(row_km)
        sources.append(row_src)

    return {
        "ok": True,
        "distances_km": distances_km,
        "sources": sources,
        "provider": "osrm" if any_road else "haversine_only",
    }

