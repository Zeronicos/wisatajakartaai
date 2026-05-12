import math


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Haversine Formula (Persamaan 2.11)
    Return jarak dalam meter.
    """
    r = 6371000.0

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))

    return r * c
