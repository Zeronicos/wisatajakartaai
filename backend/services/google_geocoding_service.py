"""Google Geocoding / Places API untuk koordinat persis Google Maps."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Any

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def _api_key() -> str | None:
    key = (
        os.getenv("GOOGLE_MAPS_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("GOOGLE_GEOCODING_API_KEY")
    )
    return key.strip() if key and key.strip() else None


def _get_json(url: str, params: dict[str, str]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def geocode_google(query: str, *, region: str = "id") -> dict[str, Any] | None:
    """Geocode alamat/nama tempat via Google Geocoding API."""
    key = _api_key()
    if not key:
        return None

    data = _get_json(
        GEOCODE_URL,
        {
            "address": query,
            "key": key,
            "region": region,
            "components": "country:ID|administrative_area:DKI Jakarta",
        },
    )
    if data.get("status") != "OK" or not data.get("results"):
        return None

    hit = data["results"][0]
    loc = hit["geometry"]["location"]
    components = hit.get("address_components", [])
    district = _extract_component(components, {"administrative_area_level_2", "locality"})
    subdistrict = _extract_component(components, {"administrative_area_level_3", "sublocality_level_1"})
    postcode = _extract_component(components, {"postal_code"})

    return {
        "lat": float(loc["lat"]),
        "lon": float(loc["lng"]),
        "district": district or "",
        "subdistrict": subdistrict or "",
        "postcode": postcode or "",
        "formatted_address": hit.get("formatted_address", ""),
        "place_id": hit.get("place_id", ""),
        "source": "google_geocoding_api",
    }


def find_place_google(name: str, *, region: str = "id") -> dict[str, Any] | None:
    """Cari tempat via Google Places Find Place + Details (lebih presisi untuk POI)."""
    key = _api_key()
    if not key:
        return None

    find = _get_json(
        FIND_PLACE_URL,
        {
            "input": f"{name}, DKI Jakarta, Indonesia",
            "inputtype": "textquery",
            "fields": "place_id,name,geometry,formatted_address",
            "locationbias": "circle:50000@-6.2,106.8",
            "key": key,
        },
    )
    if find.get("status") != "OK" or not find.get("candidates"):
        return geocode_google(f"{name}, DKI Jakarta, Indonesia")

    candidate = find["candidates"][0]
    place_id = candidate.get("place_id")
    if not place_id:
        loc = candidate["geometry"]["location"]
        return {
            "lat": float(loc["lat"]),
            "lon": float(loc["lng"]),
            "district": "",
            "subdistrict": "",
            "postcode": "",
            "formatted_address": candidate.get("formatted_address", ""),
            "place_id": "",
            "source": "google_find_place",
        }

    details = _get_json(
        PLACE_DETAILS_URL,
        {
            "place_id": place_id,
            "fields": "geometry,formatted_address,address_components,name",
            "key": key,
        },
    )
    if details.get("status") != "OK":
        loc = candidate["geometry"]["location"]
        return {
            "lat": float(loc["lat"]),
            "lon": float(loc["lng"]),
            "district": "",
            "subdistrict": "",
            "postcode": "",
            "formatted_address": candidate.get("formatted_address", ""),
            "place_id": place_id,
            "source": "google_find_place",
        }

    result = details["result"]
    loc = result["geometry"]["location"]
    components = result.get("address_components", [])
    return {
        "lat": float(loc["lat"]),
        "lon": float(loc["lng"]),
        "district": _extract_component(components, {"administrative_area_level_2", "locality"}) or "",
        "subdistrict": _extract_component(components, {"administrative_area_level_3", "sublocality_level_1"}) or "",
        "postcode": _extract_component(components, {"postal_code"}) or "",
        "formatted_address": result.get("formatted_address", ""),
        "place_id": place_id,
        "source": "google_place_details",
    }


def _extract_component(components: list[dict], type_names: set[str]) -> str | None:
    for comp in components:
        types = set(comp.get("types", []))
        if types & type_names:
            return str(comp.get("long_name") or comp.get("short_name") or "").strip() or None
    return None
