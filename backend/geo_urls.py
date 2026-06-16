"""Helper URL Google Maps (selaras dengan lib/geo.ts)."""

from __future__ import annotations

from urllib.parse import quote


def build_google_maps_url(
    latitude: float | None,
    longitude: float | None,
    name: str | None = None,
) -> str | None:
    if latitude is None or longitude is None:
        return None
    if not (-90.0 <= float(latitude) <= 90.0 and -180.0 <= float(longitude) <= 180.0):
        return None
    if float(latitude) == 0.0 and float(longitude) == 0.0:
        return None

    coords = f"{float(latitude)},{float(longitude)}"
    label = (name or "").strip()
    query = f"{label} @{coords}" if label else coords
    return f"https://www.google.com/maps/search/?api=1&query={quote(query)}"
