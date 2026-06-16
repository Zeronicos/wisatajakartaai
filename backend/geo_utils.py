from __future__ import annotations

import math

JAKARTA_BOUNDS = {
    "min_lat": -6.45,
    "max_lat": -5.35,
    "min_lon": 106.45,
    "max_lon": 107.05,
}


def is_in_jakarta(lat: float, lon: float) -> bool:
    return (
        JAKARTA_BOUNDS["min_lat"] <= lat <= JAKARTA_BOUNDS["max_lat"]
        and JAKARTA_BOUNDS["min_lon"] <= lon <= JAKARTA_BOUNDS["max_lon"]
    )


def normalize_jakarta_coordinate(lat: float, lon: float) -> tuple[float, float] | None:
    """Normalisasi koordinat untuk konteks Jakarta.

    - Jika sudah dalam bounding box Jakarta: pakai apa adanya.
    - Jika kemungkinan tertukar (lat/lon swap): tukar jika hasilnya valid.
    - Selain itu: kembalikan None (tidak valid untuk konteks Jakarta).
    """
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return None

    if not (math.isfinite(lat_f) and math.isfinite(lon_f)):
        return None

    if is_in_jakarta(lat_f, lon_f):
        return lat_f, lon_f

    if is_in_jakarta(lon_f, lat_f):
        return lon_f, lat_f

    return None
