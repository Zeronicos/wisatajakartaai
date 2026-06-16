"""Geocode PDF_0001–PDF_0140 via Nominatim (OSM, selaras Google Maps) dan perbarui CSV + DB."""

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

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
REPORT_PATH = BACKEND_ROOT / "scripts" / "pdf140_geocode_report.json"

LAT_MIN, LAT_MAX = -6.40, -5.95
LON_MIN, LON_MAX = 106.68, 107.04

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

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "WisataJakartaAI/1.0 (thesis POI geocoding; contact: admin@wisatajakartaai.com)"

def _ancol(name: str, lat: float, lon: float) -> dict[str, str | float]:
    return {
        "lat": lat,
        "lon": lon,
        "district": "Jakarta Utara",
        "subdistrict": "Pademangan",
        "village": "Ancol",
        "postcode": "14430",
    }


# Override manual (Google Maps / OSM) untuk destinasi yang sering salah geocode dari PDF
MANUAL_OVERRIDES: dict[str, dict[str, str | float]] = {
    "Ancol Art Market": _ancol("Ancol Art Market", -6.126657, 106.839134),
    "Allianz Ecopark & Faunaland": _ancol("Allianz Ecopark & Faunaland", -6.125928, 106.836324),
    "Dunia Fantasi": _ancol("Dunia Fantasi", -6.123834, 106.832393),
    "Ancol Lagoon Beach": _ancol("Ancol Lagoon Beach", -6.127200, 106.844000),
    "Ocean Dream Samudera": _ancol("Ocean Dream Samudera", -6.125018, 106.843600),
    "Putri Duyung Resort": _ancol("Putri Duyung Resort", -6.121768, 106.840231),
    "Atlantis Water Adventures Ancol": _ancol("Atlantis Water Adventures Ancol", -6.124500, 106.839500),
    "Sea World Ancol": _ancol("Sea World Ancol", -6.125843, 106.842842),
    "Muara Baru Modern Fish Market": {
        "lat": -6.107500,
        "lon": 106.779500,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Pluit",
        "postcode": "14440",
    },
    "Urban Farm PIK": {
        "lat": -6.112500,
        "lon": 106.738000,
        "district": "Jakarta Utara",
        "subdistrict": "Penjaringan",
        "village": "Pantai Indah Kapuk",
        "postcode": "14470",
    },
    "Ragunan Agro Edutourism": {
        "lat": -6.303500,
        "lon": 106.820500,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "village": "Ragunan",
        "postcode": "12550",
    },
    "Ragunan Camping Ground": {
        "lat": -6.303800,
        "lon": 106.821200,
        "district": "Jakarta Selatan",
        "subdistrict": "Pasar Minggu",
        "village": "Ragunan",
        "postcode": "12550",
    },
    "Istiqlal Mosque": {
        "lat": -6.170219,
        "lon": 106.831003,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10110",
    },
    "Gedung Kesenian Jakarta": {
        "lat": -6.175392,
        "lon": 106.834466,
        "district": "Jakarta Pusat",
        "subdistrict": "Gambir",
        "village": "Gambir",
        "postcode": "10710",
    },
    "SCBD Complex": {
        "lat": -6.224574,
        "lon": 106.809326,
        "district": "Jakarta Selatan",
        "subdistrict": "Kebayoran Baru",
        "village": "Senayan",
        "postcode": "12190",
    },
}


def in_jakarta(lat: float, lon: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def format_coord(value: float, is_lat: bool) -> str:
    sign = "-" if value < 0 else ""
    abs_v = abs(value)
    whole = int(abs_v)
    frac = abs_v - whole
    frac_str = f"{frac:.6f}".split(".")[1].rstrip("0")
    if not frac_str:
        return f"{sign}{whole}"
    if is_lat:
        return (
            f"{sign}{whole}.{frac_str[:3]}.{frac_str[3:]}"
            if len(frac_str) > 3
            else f"{sign}{whole}.{frac_str}"
        )
    return f"{whole}.{frac_str[:3]}.{frac_str[3:]}" if len(frac_str) > 3 else f"{whole}.{frac_str}"


def normalize_district(raw: str) -> str | None:
    key = (raw or "").strip().lower()
    if not key:
        return None
    for token, label in JAKARTA_DISTRICTS.items():
        if token in key:
            return label
    if key.startswith("jakarta "):
        parts = key.title().split()
        if len(parts) >= 2:
            return f"Jakarta {parts[1].title()}"
    return None


def extract_admin_from_address(address: dict) -> tuple[str | None, str | None, str | None, str | None]:
    district = None
    for key in ("city_district", "borough", "municipality", "city", "county", "state_district"):
        district = normalize_district(str(address.get(key, "")))
        if district:
            break

    subdistrict = None
    for key in ("suburb", "city_district", "district"):
        val = str(address.get(key, "")).strip()
        if val and val.lower() not in {d.lower() for d in JAKARTA_DISTRICTS.values()}:
            subdistrict = val.title() if val.islower() else val
            break

    village = str(address.get("neighbourhood") or address.get("village") or address.get("quarter") or "").strip() or None
    postcode = str(address.get("postcode") or "").strip() or None
    return district, subdistrict, village, postcode


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

    if -6.45 <= lat <= -5.95 and 10.0 <= lon <= 11.0:
        lon = lon * 10.0

    if -6.45 <= lat <= -5.95 and 1.0 <= lon <= 2.0:
        lon = lon * 100.0

    return lat, lon


def is_unusable_address(address: str, name: str) -> bool:
    if not address or address in {"-", "nan"}:
        return True
    bad_markers = (
        "Kuningan Barat",
        "Gatot Subroto",
        "17431",
        "Pantai Indah, Kawasan Wisata Ancol",
        "Kawasan Wisata Ancol, Ancol",
    )
    if any(m in address for m in bad_markers) and name.lower() not in address.lower():
        return True
    if "Kawasan Wisata Ancol" in address and name.lower() not in address.lower():
        return True
    return False


def build_queries(row: dict) -> list[str]:
    name = (row.get("nama") or "").strip()
    full_address = (row.get("full_address") or "").strip()
    structured = (row.get("alamat_terstruktur") or "").strip()
    district = (row.get("district") or "").strip()
    subdistrict = (row.get("subdistrict") or "").strip()

    queries: list[str] = [f"{name}, DKI Jakarta, Indonesia"]

    if district and district not in {"-", "nan", "DKI Jakarta"}:
        queries.append(f"{name}, {subdistrict}, {district}, DKI Jakarta, Indonesia")

    if structured and not is_unusable_address(structured, name) and "Jakarta" in structured:
        queries.append(f"{structured}, Indonesia")

    if full_address and not is_unusable_address(full_address, name) and "Jakarta" in full_address:
        addr = full_address if full_address.endswith("Indonesia") else f"{full_address}, Indonesia"
        queries.append(addr)

    # dedupe preserve order
    seen: set[str] = set()
    unique: list[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)
    return unique


def nominatim_search(query: str) -> dict | None:
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "limit": 1,
            "countrycodes": "id",
            "addressdetails": 1,
        }
    )
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data:
        return None
    hit = data[0]
    lat = float(hit["lat"])
    lon = float(hit["lon"])
    if not in_jakarta(lat, lon):
        return None
    district, subdistrict, village, postcode = extract_admin_from_address(hit.get("address", {}))
    return {
        "lat": lat,
        "lon": lon,
        "district": district or "Jakarta Pusat",
        "subdistrict": subdistrict or "",
        "village": village or "",
        "postcode": postcode or "",
        "display_name": hit.get("display_name", ""),
        "query": query,
    }


def geocode_row(row: dict) -> dict | None:
    name = (row.get("nama") or "").strip()
    if name in MANUAL_OVERRIDES:
        return dict(MANUAL_OVERRIDES[name])

    queries = build_queries(row)
    last_error: str | None = None

    for q in queries:
        try:
            result = nominatim_search(q)
        except Exception as exc:  # noqa: BLE001
            result = None
            last_error = str(exc)
        if result:
            return result
        time.sleep(1.1)

    lat = normalize_coordinate(row.get("latitude", ""), True)
    lon = normalize_coordinate(row.get("longitude", ""), False)
    lat, lon = repair_coordinates(lat, lon)
    if lat is not None and lon is not None and in_jakarta(lat, lon):
        district = normalize_district(row.get("district") or "") or "Jakarta Pusat"
        return {
            "lat": lat,
            "lon": lon,
            "district": district,
            "subdistrict": row.get("subdistrict") or "",
            "village": row.get("village") or "",
            "postcode": row.get("postcode") or row.get("kode_pos") or "",
            "source": "repaired_existing",
        }

    return {"error": last_error or "not found", "query": queries[0]}


def _row_id(row: dict) -> str:
    for key, val in row.items():
        if key.lstrip("\ufeff").strip() == "id_poi":
            return (val or "").strip()
    return (row.get("id_poi") or "").strip()


def load_pdf_rows() -> tuple[list[str], list[dict]]:
    rows: list[dict] = []
    fieldnames: list[str] = []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rid = _row_id(row)
            if re.fullmatch(r"PDF_(\d{4})", rid):
                num = int(rid.split("_")[1])
                if 1 <= num <= 140:
                    rows.append(row)
    return fieldnames, rows


def apply_geocode_to_row(row: dict, geo: dict) -> bool:
    if "error" in geo:
        return False
    changed = False
    lat_s = format_coord(float(geo["lat"]), True)
    lon_s = format_coord(float(geo["lon"]), False)
    for key, val in [
        ("latitude", lat_s),
        ("longitude", lon_s),
        ("district", geo["district"]),
        ("subdistrict", geo.get("subdistrict") or row.get("subdistrict")),
        ("village", geo.get("village") or row.get("village")),
        ("postcode", geo.get("postcode") or row.get("postcode")),
        ("kode_pos", geo.get("postcode") or row.get("kode_pos")),
    ]:
        if val and row.get(key) != val:
            row[key] = val
            changed = True

    display = geo.get("display_name")
    if display and row.get("full_address") != display:
        row["full_address"] = display
        changed = True

    tg = row.get("teks_gabungan") or ""
    if geo.get("district") and geo["district"] in tg:
        pass
    elif geo.get("district"):
        prefix = f"Nama: {row.get('nama')}. Lokasi:"
        if prefix in tg:
            parts = tg.split("Lokasi:")
            row["teks_gabungan"] = f"{parts[0]}Lokasi: {geo.get('subdistrict') or ''}, {geo['district']}, DKI Jakarta"
            changed = True
    return changed


def update_database(pdf_rows: list[dict], report: list[dict]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    updated = 0
    try:
        for row, item in zip(pdf_rows, report, strict=True):
            if item.get("status") != "updated":
                continue
            geo = item["geo"]
            name = row.get("nama")
            cur.execute(
                """
                UPDATE poi_enriched
                SET latitude = %s,
                    longitude = %s,
                    district = %s
                WHERE name = %s
                """,
                (float(geo["lat"]), float(geo["lon"]), geo["district"], name),
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

    fieldnames, pdf_rows = load_pdf_rows()
    if not pdf_rows:
        print("Tidak ada baris PDF_0001–PDF_0140.")
        return 1

    if args.limit > 0:
        pdf_rows = pdf_rows[: args.limit]

    report: list[dict] = []
    changed_rows = 0

    for idx, row in enumerate(pdf_rows, start=1):
        rid = _row_id(row)
        name = row.get("nama")
        old_lat = normalize_coordinate(row.get("latitude", ""), True)
        old_lon = normalize_coordinate(row.get("longitude", ""), False)
        print(f"[{idx}/{len(pdf_rows)}] {rid} | {name}")

        geo = geocode_row(row)
        if not geo or "error" in geo:
            report.append(
                {
                    "id": rid,
                    "name": name,
                    "status": "failed",
                    "error": geo.get("error") if geo else "unknown",
                    "query": geo.get("query") if geo else build_queries(row)[0],
                }
            )
            time.sleep(1.1)
            continue

        item = {
            "id": rid,
            "name": name,
            "status": "updated",
            "old": {"lat": old_lat, "lon": old_lon, "district": row.get("district")},
            "geo": geo,
        }

        if not args.dry_run:
            if apply_geocode_to_row(row, geo):
                changed_rows += 1
        else:
            changed_rows += 1

        report.append(item)
        time.sleep(1.1)

    if not args.dry_run:
        # Tulis ulang CSV: pertahankan urutan, ganti baris PDF
        pdf_map = {_row_id(r): r for r in pdf_rows}
        all_rows: list[dict] = []
        with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            for row in reader:
                rid = _row_id(row)
                if rid in pdf_map:
                    all_rows.append(pdf_map[rid])
                else:
                    all_rows.append(row)
        with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
            writer.writeheader()
            writer.writerows(all_rows)

        db_updated = update_database(pdf_rows, report)
    else:
        db_updated = 0

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    failed = sum(1 for r in report if r.get("status") == "failed")
    ok = sum(1 for r in report if r.get("status") == "updated")
    print("=== Selesai ===")
    print(f"Berhasil: {ok} | Gagal: {failed} | CSV diubah: {changed_rows} | DB diubah: {db_updated}")
    print(f"Laporan: {REPORT_PATH}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
