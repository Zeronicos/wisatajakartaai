"""
Perbaiki koordinat PDF_0001–PDF_0140 agar valid & selaras Google Maps.

Urutan sumber koordinat:
1. Override manual terverifikasi (Ancol, Seribu, landmark ikonik)
2. Lookup OSM via Nominatim (osm_id dari CSV → titik pasti di peta)
3. Pencarian Nominatim: "{nama}, {wilayah}, DKI Jakarta, Indonesia"
4. Perbaikan koordinat rusak (lon 10.x, lat -614, dll.)

Memperbarui poi_lengkap_final.csv + poi_enriched + admin_destinations (district).
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection
from scripts.fix_kepulauan_seribu_pdf import SERIBU_DISTRICT, SERIBU_PDF_FIXES, format_coord

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
REPORT_PATH = BACKEND_ROOT / "scripts" / "pdf140_refine_report.json"

LAT_MIN, LAT_MAX = -6.45, -5.35
LON_MIN, LON_MAX = 106.45, 107.05

NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOMINATIM_LOOKUP = "https://nominatim.openstreetmap.org/lookup"
USER_AGENT = "WisataJakartaAI/1.0 (PDF140 coord refine; admin@wisatajakartaai.com)"

JAKARTA_DISTRICTS = {
    "jakarta utara": "Jakarta Utara",
    "north jakarta": "Jakarta Utara",
    "jakarta barat": "Jakarta Barat",
    "west jakarta": "Jakarta Barat",
    "jakarta selatan": "Jakarta Selatan",
    "south jakarta": "Jakarta Selatan",
    "jakarta timur": "Jakarta Timur",
    "east jakarta": "Jakarta Timur",
    "jakarta pusat": "Jakarta Pusat",
    "central jakarta": "Jakarta Pusat",
    "kepulauan seribu": "Kepulauan Seribu",
}


def _ancol(lat: float, lon: float) -> dict[str, str | float]:
    return {
        "lat": lat,
        "lon": lon,
        "district": "Jakarta Utara",
        "subdistrict": "Pademangan",
        "village": "Ancol",
        "postcode": "14430",
        "source": "manual_google",
    }


# Titik Google Maps / OSM terverifikasi untuk destinasi yang sering salah geocode
MANUAL_BY_NAME: dict[str, dict[str, str | float]] = {
    "Ancol Art Market": _ancol(-6.126657, 106.839134),
    "Allianz Ecopark & Faunaland": _ancol(-6.125928, 106.836324),
    "Dunia Fantasi": _ancol(-6.123834, 106.832393),
    "Ancol Lagoon Beach": _ancol(-6.127200, 106.844000),
    "Ocean Dream Samudera": _ancol(-6.125018, 106.843600),
    "Putri Duyung Resort": _ancol(-6.121768, 106.840231),
    "Atlantis Water Adventures Ancol": _ancol(-6.124500, 106.839500),
    "Sea World Ancol": _ancol(-6.125843, 106.842842),
    "Muara Baru Modern Fish Market": {
        "lat": -6.107500,
        "lon": 106.779500,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Pluit",
        "postcode": "14440",
        "source": "manual_google",
    },
    "Urban Farm PIK": {
        "lat": -6.112500,
        "lon": 106.738000,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Pantai Indah Kapuk",
        "postcode": "14470",
        "source": "manual_google",
    },
    "Angke Kapuk Mangrove Tourism": {
        "lat": -6.104722,
        "lon": 106.757399,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Kapuk Muara",
        "postcode": "14460",
        "source": "manual_google",
    },
    "National Monument (Monas)": {
        "lat": -6.175392,
        "lon": 106.827153,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10110",
        "source": "manual_google",
    },
    "Ragunan Zoological Park": {
        "lat": -6.311944,
        "lon": 106.820833,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "village": "Ragunan",
        "postcode": "12550",
        "source": "manual_google",
    },
    "Taman Mini Indonesia Indah": {
        "lat": -6.302445,
        "lon": 106.895095,
        "district": "Jakarta Timur",
        "subdistrict": "Cipayung",
        "village": "Ceger",
        "postcode": "13810",
        "source": "manual_google",
    },
    "Glodok Chinatown": {
        "lat": -6.135983,
        "lon": 106.813430,
        "district": "Jakarta Barat",
        "subdistrict": "Taman Sari",
        "village": "Glodok",
        "postcode": "11120",
        "source": "manual_google",
    },
    "Sunda Kelapa Harbor": {
        "lat": -6.127567,
        "lon": 106.807975,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Penjaringan",
        "postcode": "14440",
        "source": "manual_google",
    },
    "Tugu Kunstkring Paleis": {
        "lat": -6.194583,
        "lon": 106.822750,
        "district": "Jakarta Pusat",
        "subdistrict": "Menteng",
        "village": "Gondangdia",
        "postcode": "10350",
        "source": "manual_google",
    },
    "National Library of Republic of Indonesia": {
        "lat": -6.214478,
        "lon": 106.826892,
        "district": "Jakarta Pusat",
        "subdistrict": "Menteng",
        "village": "Gondangdia",
        "postcode": "10310",
        "source": "manual_google",
    },
    "National Gallery of Indonesia": {
        "lat": -6.171389,
        "lon": 106.821667,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10110",
        "source": "manual_google",
    },
    "Kemayoran City Forest": {
        "lat": -6.157222,
        "lon": 106.846389,
        "district": "Jakarta Pusat",
        "subdistrict": "Kemayoran",
        "village": "Kemayoran",
        "postcode": "10620",
        "source": "manual_google",
    },
    "Istiqlal Mosque": {
        "lat": -6.170219,
        "lon": 106.831003,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10110",
        "source": "manual_google",
    },
    "Gedung Kesenian Jakarta": {
        "lat": -6.175392,
        "lon": 106.834466,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10710",
        "source": "manual_google",
    },
    "SCBD Complex": {
        "lat": -6.224574,
        "lon": 106.809326,
        "district": "Jakarta Selatan",
        "subdistrict": "Kebayoran Baru",
        "village": "Senayan",
        "postcode": "12190",
        "source": "manual_google",
    },
    "Ragunan Agro Edutourism": {
        "lat": -6.303500,
        "lon": 106.820500,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "village": "Ragunan",
        "postcode": "12550",
        "source": "manual_google",
    },
    "Jakarta International Equestrian Park": {
        "lat": -6.152894,
        "lon": 106.897103,
        "district": "Jakarta Timur",
        "subdistrict": "Pulo Gadung",
        "village": "Jati",
        "postcode": "13220",
        "source": "manual_google",
    },
    "Ragunan Camping Ground": {
        "lat": -6.303800,
        "lon": 106.821200,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "village": "Ragunan",
        "postcode": "12550",
        "source": "manual_google",
    },
}

# Query Nominatim khusus bila nama generik / ambigu
SEARCH_QUERY_OVERRIDES: dict[str, str] = {
    "Jakarta International Stadium": "Jakarta International Stadium JIS Rawamangun",
    "Jakarta International Velodrome": "Jakarta International Velodrome Rawamangun",
    "Jakarta International Equestrian Park": "Jakarta International Equestrian Park Pulomas",
    "Royale Jakarta Golf Club": "Royale Jakarta Golf Club Halim",
    "Cibubur Bee Park": "Cibubur Bee Park Jakarta Timur",
    "Proclamation Park": "Taman Proklamasi Jakarta",
    "Proclamation Text Making Museum": "Museum Perumusan Naskah Proklamasi Jakarta",
    "Merdeka Palace": "Istana Merdeka Jakarta",
    "Jakarta City Hall": "Balai Kota DKI Jakarta",
    "Gelora Bung Karno Main Stadium": "Stadion Utama Gelora Bung Karno",
    "Senayan City": "Senayan City mall Jakarta",
    "Pacific Place Mall": "Pacific Place Jakarta",
    "Kidzania": "Kidzania Pacific Place Jakarta",
    "Jakarta Aquarium & Safari": "Jakarta Aquarium Safari Jakarta",
    "Sky Rink Taman Anggrek": "Sky Rink Mall Taman Anggrek",
    "M Bloc Space": "M Bloc Space Jakarta Selatan",
    "Little Tokyo Blok M": "Little Tokyo Blok M Jakarta",
    "MACAN Museum": "Museum MACAN Jakarta",
    "Petak Enam": "Petak Enam Glodok Jakarta",
    "Pantjoran Tea House": "Pantjoran Tea House Glodok",
    "Wayang Museum": "Museum Wayang Kota Tua Jakarta",
    "Jakarta History Museum": "Museum Sejarah Jakarta Fatahillah",
    "Maritime Museum": "Museum Bahari Jakarta",
    "Fine Arts and Ceramics Museum": "Museum Seni Rupa dan Keramik Jakarta",
    "Bank Indonesia Museum": "Museum Bank Indonesia Jakarta",
    "National Museum of Indonesia": "Museum Nasional Indonesia Jakarta",
    "Textile Museum": "Museum Tekstil Jakarta",
    "Polri Museum": "Museum Polri Jakarta",
    "Satria Mandala Museum": "Museum Satria Mandala Jakarta",
    "Harry Darsono Museum": "Museum Harry Darsono Jakarta",
    "Basoeki Abdullah Museum": "Museum Basoeki Abdullah Jakarta",
    "Graha Bakti Antara Museum": "Museum Antara Jakarta",
    "Prasasti Park Museum": "Taman Prasasti Museum Jakarta",
    '"Pelangi, Sepa and Putri Islands"': "Pulau Putri Kepulauan Seribu",
    "Langsat Park": "Taman Langsat Jakarta Selatan",
    "Art: 1 New Museum": "Art1 Museum Jakarta",
    "Cijantung City Forest": "Hutan Kota Cijantung Jakarta Timur",
    "Gelora Bung Karno City Forest": "Hutan Kota GBK Senayan Jakarta",
    "Manggala Wanabakti National Forestry Museum": "Museum Kehutanan Manggala Wanabakti Jakarta",
    "Srengseng City Forest": "Hutan Kota Srengseng Jakarta Barat",
    "Taman Cattleya Cibubur": "Taman Cattleya Cibubur Jakarta",
    "Taman Benyamin Sueb": "Taman Benyamin Sueb Kemayoran Jakarta",
    "Jatinegara Station": "Stasiun Jatinegara Jakarta",
    "Jakarta Gems Center": "Jakarta Gems Center Rawamangun",
    "Vihara Dharma Bakti": "Vihara Dharma Bakti Glodok",
    "Vihara Dharma Jaya Toa Se Bio": "Vihara Dharma Jaya Toa Se Bio Jakarta",
    "Pniel Jakarta GPIB Church": "GPIB Pniel Jakarta",
    "GPIB Sion Jakarta Church": "GPIB Sion Jakarta",
    "Ragusa Italian Ice Cream": "Ragusa Es Italia Jakarta",
    "Al-Azhar Great Mosque": "Masjid Agung Al Azhar Jakarta",
    "Senayan National Golf Club": "Senayan National Golf Club Jakarta",
    "Senayan Park": "Taman Senayan GBK Jakarta",
    "Pantjoran PIK": "Pantjoran PIK Jakarta",
    "Jetski Cafe": "Jetski Cafe Pantai Mutiara Jakarta",
    "PIK Shiva Mandir Temple": "Shiva Mandir PIK Jakarta",
    "Sedayu Indo Golf": "Sedayu Indo Golf PIK Jakarta",
    "Baywalk Mall": "Baywalk Mall Pluit Jakarta",
    "Sunter Lake": "Danau Sunter Jakarta",
    "Mall of Indonesia": "Mall of Indonesia Kelapa Gading",
    "JIEXPO": "JIEXPO Kemayoran Jakarta",
    "Pancasila Sakti Monument": "Monumen Pancasila Sakti Lubang Buaya",
    "Cibubur Scout Camping Ground": "Pramuka Cibubur Jakarta",
    "Cijantung Skate Park": "Skate Park Cijantung Jakarta",
    "Kampoeng Maen": "Kampoeng Maen Jakarta",
    "Istana Susu Cibubur Garden Dairy": "Istana Susu Cibubur",
    "Teras Rimbun": "Taman Rimbun Jakarta",
    "Koinonia Church": "Gereja Koinonia Jakarta",
    "Prince Jayakarta Tomb": "Makam Prince Jayakarta Jakarta",
    "Jakarta Cathedral": "Katedral Jakarta",
    "Sin Tek Bio Temple": "Klenteng Sin Tek Bio Jakarta",
    "Pecenongan Culinary District": "Kawasan Kuliner Pecenongan Jakarta",
    "Lapangan Banteng Park": "Taman Lapangan Banteng Jakarta",
    "Bakoel Koffie": "Bakoel Koffie Jakarta",
    "Metropole XXI": "Metropole XXI Jakarta",
    "Jami Al Makmur Mosque": "Masjid Jami Al Makmur Jakarta",
    "Surabaya Street Antique Shops": "Jalan Surabaya Antik Jakarta",
    "Tanah Abang Market": "Pasar Tanah Abang Jakarta",
    "JCC Senayan": "JCC Senayan Jakarta",
    "Kali Besar Area": "Kali Besar Kota Tua Jakarta",
    "Kota Intan Drawbridge": "Jembatan Kota Intan Jakarta",
    "Candra Naya Mansion": "Candi Candra Naya Jakarta",
    "National Archive Building": "Arsip Nasional Jakarta",
    "Jami Kebun Jeruk Mosque": "Masjid Jami Kebon Jeruk Jakarta",
    "Rawa Belong Flower Market": "Pasar Bunga Rawa Belong Jakarta",
    "Cattleya City Park": "Taman Cattleya Jakarta",
    "Tribeca Park": "Taman Tribeca Jakarta",
    "Coffee Street Cipete Raya": "Coffee Street Cipete Jakarta",
    "Premium Dining at Senopati": "Senopati Jakarta kuliner",
    "Astha District 8": "District 8 SCBD Jakarta",
    "Senopati Korea Town": "Korea Town Senopati Jakarta",
    "Blok S Culinary Area": "Blok S kuliner Jakarta",
    "Blok M Square": "Blok M Square Jakarta",
    "Ciputra Artpreneur": "Ciputra Artpreneur Jakarta",
    "Ereveld Menteng Pulo": "Ereveld Menteng Pulo Jakarta",
    "Rasuna Said Park": "Taman Rasuna Said Jakarta",
    "Mega Kuningan Area": "Mega Kuningan Jakarta",
    "Kuningan City": "Kuningan City mall Jakarta",
    "Setu Babakan Betawi Cultural Village": "Setu Babakan Jakarta",
    "Ragunan Orchard Garden": "Kebun Ragunan Jakarta",
    "Tabebuya Park": "Taman Tabebuya Jakarta",
    "Babah Alun Desari Mosque": "Masjid Babah Alun Desari Jakarta",
    "Spathodea Park": "Taman Spathodea Jakarta",
    "Ramlie Musofa Mosque": "Masjid Ramlie Musofa Sunter Jakarta",
}


def in_bounds(lat: float, lon: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def normalize_district(raw: str) -> str | None:
    key = (raw or "").strip().lower()
    if not key or key in {"-", "nan", "dki jakarta"}:
        return None
    for token, label in JAKARTA_DISTRICTS.items():
        if token in key:
            return label
    if key.startswith("jakarta "):
        parts = key.title().split()
        if len(parts) >= 2:
            return f"Jakarta {parts[1].title()}"
    return None


def repair_coordinates(lat: float | None, lon: float | None) -> tuple[float | None, float | None]:
    if lat is None or lon is None:
        return lat, lon
    if abs(lat) > 10 and abs(lat) <= 100:
        trial = lat / 10
        if abs(trial) <= 90:
            lat = trial
    if abs(lat) > 90 and abs(lat) <= 900:
        trial = lat / 100
        if abs(trial) <= 90:
            lat = trial
    if -6.45 <= lat <= -5.35 and 10.0 <= lon <= 11.0:
        lon = lon * 10.0
    if -6.45 <= lat <= -5.35 and 1.0 <= lon <= 2.0:
        lon = lon * 100.0
    return lat, lon


def parse_osm_id(raw: str | None) -> tuple[str, int] | None:
    if not raw or raw in {"-", "nan"}:
        return None
    match = re.search(r"'(\w+)',\s*(\d+)", raw)
    if not match:
        return None
    return match.group(1), int(match.group(2))


def _nominatim_get(url: str, params: dict) -> list[dict]:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data if isinstance(data, list) else []


def lookup_osm_coords(osm_type: str, osm_id: int) -> dict | None:
    prefix = {"node": "N", "way": "W", "relation": "R"}.get(osm_type.lower())
    if not prefix:
        return None
    hits = _nominatim_get(NOMINATIM_LOOKUP, {"osm_ids": f"{prefix}{osm_id}", "format": "json"})
    if not hits:
        return None
    hit = hits[0]
    lat = float(hit["lat"])
    lon = float(hit["lon"])
    if not in_bounds(lat, lon):
        return None
    district = normalize_district(str(hit.get("address", {}).get("city_district", "")))
    if not district:
        district = normalize_district(str(hit.get("address", {}).get("state", "")))
    return {
        "lat": lat,
        "lon": lon,
        "district": district or "",
        "display_name": hit.get("display_name", ""),
        "source": f"osm_{osm_type}_{osm_id}",
    }


def search_nominatim(query: str) -> dict | None:
    hits = _nominatim_get(
        NOMINATIM_SEARCH,
        {
            "q": query,
            "format": "json",
            "limit": 3,
            "countrycodes": "id",
            "addressdetails": 1,
        },
    )
    for hit in hits:
        lat = float(hit["lat"])
        lon = float(hit["lon"])
        if not in_bounds(lat, lon):
            continue
        addr = hit.get("address", {})
        district = None
        for key in ("city_district", "borough", "municipality", "city", "county", "state_district"):
            district = normalize_district(str(addr.get(key, "")))
            if district:
                break
        return {
            "lat": lat,
            "lon": lon,
            "district": district or "",
            "display_name": hit.get("display_name", ""),
            "source": "nominatim_search",
            "query": query,
        }
    return None


def _row_id(row: dict) -> str:
    for key, val in row.items():
        if key.lstrip("\ufeff").strip() == "id_poi":
            return (val or "").strip()
    return (row.get("id_poi") or "").strip()


def resolve_coords(row: dict, pdf_id: str, shared_osm: set[str]) -> dict | None:
    name = (row.get("nama") or "").strip()
    district = normalize_district(row.get("district") or "") or ""
    osm_raw = (row.get("osm_id") or "").strip()

    if pdf_id in SERIBU_PDF_FIXES:
        fix = dict(SERIBU_PDF_FIXES[pdf_id])
        fix["district"] = SERIBU_DISTRICT
        fix["source"] = "manual_seribu"
        return fix

    if name in MANUAL_BY_NAME:
        return dict(MANUAL_BY_NAME[name])

    osm = parse_osm_id(osm_raw)
    if osm and osm_raw not in shared_osm:
        try:
            result = lookup_osm_coords(*osm)
        except Exception:
            result = None
        if result:
            if not result.get("district") and district:
                result["district"] = district
            return result
        time.sleep(1.1)

    queries = []
    if name in SEARCH_QUERY_OVERRIDES:
        queries.append(f"{SEARCH_QUERY_OVERRIDES[name]}, Indonesia")
    if district:
        queries.append(f"{name}, {district}, DKI Jakarta, Indonesia")
    queries.append(f"{name}, DKI Jakarta, Indonesia")

    seen: set[str] = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        try:
            result = search_nominatim(q)
        except Exception:
            result = None
        if result:
            if not result.get("district") and district:
                result["district"] = district
            return result
        time.sleep(1.1)

    lat = normalize_coordinate(row.get("latitude", ""), True)
    lon = normalize_coordinate(row.get("longitude", ""), False)
    lat, lon = repair_coordinates(lat, lon)
    if lat is not None and lon is not None and in_bounds(lat, lon):
        return {
            "lat": lat,
            "lon": lon,
            "district": district or "Jakarta Pusat",
            "source": "repaired_existing",
        }
    return None


def apply_to_row(row: dict, geo: dict) -> bool:
    changed = False
    lat_s = format_coord(float(geo["lat"]), True)
    lon_s = format_coord(float(geo["lon"]), False)
    district = geo.get("district") or row.get("district") or ""
    for key, val in [
        ("latitude", lat_s),
        ("longitude", lon_s),
        ("district", district),
        ("subdistrict", geo.get("subdistrict") or row.get("subdistrict")),
        ("village", geo.get("village") or row.get("village")),
        ("postcode", geo.get("postcode") or row.get("postcode")),
        ("kode_pos", geo.get("postcode") or row.get("kode_pos")),
    ]:
        if val and row.get(key) != val:
            row[key] = val
            changed = True
    return changed


def load_pdf_rows() -> tuple[list[str], list[dict], set[str]]:
    rows: list[dict] = []
    fieldnames: list[str] = []
    osm_usage: dict[str, list[str]] = {}
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rid = _row_id(row)
            if re.fullmatch(r"PDF_(\d{4})", rid):
                num = int(rid.split("_")[1])
                if 1 <= num <= 140:
                    rows.append(row)
                    osm_raw = (row.get("osm_id") or "").strip()
                    if osm_raw and osm_raw not in {"-", "nan"}:
                        osm_usage.setdefault(osm_raw, []).append(rid)
    shared_osm = {key for key, ids in osm_usage.items() if len(ids) > 1}
    return fieldnames, rows, shared_osm


def update_database(pdf_rows: list[dict], report: list[dict]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    updated = 0
    try:
        cur.execute(
            """
            INSERT INTO admin_cities(name)
            SELECT DISTINCT TRIM(district)
            FROM poi_enriched
            WHERE district IS NOT NULL AND TRIM(district) <> ''
            ON CONFLICT (name) DO NOTHING
            """
        )
        for row, item in zip(pdf_rows, report, strict=True):
            if item.get("status") != "updated":
                continue
            geo = item.get("geo") or item.get("new")
            if not geo:
                continue
            pdf_num = int(_row_id(row).split("_")[1])
            source_id = f"PDF_{pdf_num:03d}"
            cur.execute(
                """
                UPDATE poi_enriched
                SET latitude = %s,
                    longitude = %s,
                    district = %s
                WHERE source_id = %s
                """,
                (float(geo["lat"]), float(geo["lon"]), geo.get("district") or row.get("district"), source_id),
            )
            updated += cur.rowcount
        conn.commit()
        return updated
    finally:
        cur.close()
        conn.close()


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    fieldnames, pdf_rows, shared_osm = load_pdf_rows()
    if not pdf_rows:
        print("Tidak ada baris PDF_0001–PDF_0140.")
        return 1
    print(f"osm_id duplikat (diabaikan): {len(shared_osm)}")
    if args.limit > 0:
        pdf_rows = pdf_rows[: args.limit]

    report: list[dict] = []
    changed = 0
    coord_buckets: dict[tuple[float, float], list[str]] = {}

    for idx, row in enumerate(pdf_rows, start=1):
        rid = _row_id(row)
        name = row.get("nama")
        old_lat = normalize_coordinate(row.get("latitude", ""), True)
        old_lon = normalize_coordinate(row.get("longitude", ""), False)
        print(f"[{idx}/{len(pdf_rows)}] {rid} | {name}")

        geo = resolve_coords(row, rid, shared_osm)
        if not geo:
            report.append({"id": rid, "name": name, "status": "failed"})
            continue

        bucket = (round(float(geo["lat"]), 5), round(float(geo["lon"]), 5))
        coord_buckets.setdefault(bucket, []).append(name or rid)

        item = {
            "id": rid,
            "name": name,
            "status": "updated",
            "source": geo.get("source"),
            "old": {"lat": old_lat, "lon": old_lon, "district": row.get("district")},
            "new": {"lat": geo["lat"], "lon": geo["lon"], "district": geo.get("district")},
            "geo": geo,
        }
        if not args.dry_run and apply_to_row(row, geo):
            changed += 1
        elif args.dry_run:
            changed += 1
        report.append(item)

    if not args.dry_run:
        pdf_map = {_row_id(r): r for r in pdf_rows}
        all_rows: list[dict] = []
        with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                rid = _row_id(row)
                all_rows.append(pdf_map.get(rid, row))
        with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
            writer.writeheader()
            writer.writerows(all_rows)
        db_updated = update_database(pdf_rows, report)
    else:
        db_updated = 0

    dupes = {k: v for k, v in coord_buckets.items() if len(v) > 1}
    if dupes:
        print("\n[Peringatan] Titik identik (perlu cek manual):")
        for coords, names in sorted(dupes.items(), key=lambda x: -len(x[1]))[:15]:
            safe = [str(n).encode("ascii", "replace").decode("ascii") for n in names[:4]]
            print(f"  {coords}: {len(names)} destinasi -> {safe}")

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    failed = sum(1 for r in report if r.get("status") == "failed")
    ok = sum(1 for r in report if r.get("status") == "updated")
    print("\n=== Selesai ===")
    print(f"Berhasil: {ok} | Gagal: {failed} | CSV: {changed} | DB: {db_updated}")
    print(f"Laporan: {REPORT_PATH}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
