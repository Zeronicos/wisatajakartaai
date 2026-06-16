"""
Samakan destinasi aktif PDF_001–PDF_140 dengan lokal (CSV + JSON koordinat).

Aman untuk server:
- TIDAK TRUNCATE / DELETE poi_enriched
- TIDAK DELETE admin_destinations
- Hanya UPSERT baris PDF_001–140, perbarui koordinat, lalu set is_active

Alur:
  1. Upsert poi_enriched dari poi_lengkap_final.csv (PDF_0001–0140)
  2. Terapkan koordinat kanon dari pdf140_google_coords.json
  3. Pastikan admin_destinations ada + aktif hanya PDF_001–140

Penggunaan:
  cd backend
  .\\venv\\Scripts\\python.exe scripts/sync_pdf140_active_destinations.py
  .\\venv\\Scripts\\python.exe scripts/sync_pdf140_active_destinations.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import first_nonempty, normalize_coordinate
from database import get_connection
from routers.admin_master import (
    _enforce_source_status_rules,
    _ensure_master_tables,
    _sync_destination_source_flags,
)
from scripts.refine_pdf140_google_coords import _row_id

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
COORDS_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"
PDF_BATCH = 140


def load_coords() -> dict[str, dict]:
    if not COORDS_PATH.exists():
        raise FileNotFoundError(f"Tidak ada {COORDS_PATH}")
    return json.loads(COORDS_PATH.read_text(encoding="utf-8"))


def pdf_source_id(raw_id: str) -> str | None:
    match = re.fullmatch(r"PDF_(\d{4})", (raw_id or "").strip())
    if not match:
        return None
    num = int(match.group(1))
    if num < 1 or num > PDF_BATCH:
        return None
    return f"PDF_{num:03d}"


def parse_csv_row(row: dict, coords: dict[str, dict]) -> tuple[str, dict] | None:
    rid = _row_id(row)
    source_id = pdf_source_id(rid)
    if not source_id:
        return None

    name = first_nonempty(row, ["name", "nama", "nama_id", "nama_en"])
    category = first_nonempty(row, ["category", "kategori"])
    subcategory = first_nonempty(row, ["subcategory", "sub_kategori"])
    nearest_stop_name = first_nonempty(
        row,
        ["nearest_stop_name", "halte_terdekat", "nearest_stop", "stop_name_terdekat"],
    )
    description = first_nonempty(row, ["description", "deskripsi", "teks_gabungan"])
    phone = first_nonempty(row, ["phone", "telepon"])
    website = first_nonempty(row, ["website"])

    geo = coords.get(source_id) or {}
    lat = geo.get("lat")
    lon = geo.get("lon")
    if lat is None or lon is None:
        lat = normalize_coordinate(first_nonempty(row, ["latitude", "lat"]), is_lat=True)
        lon = normalize_coordinate(first_nonempty(row, ["longitude", "lon", "lng"]), is_lat=False)
    else:
        lat = float(lat)
        lon = float(lon)

    district = (geo.get("district") or first_nonempty(row, ["district", "kota", "kabupaten"]) or "").strip()

    if not name or lat is None or lon is None or not district or not category:
        return None

    payload = {
        "source_id": source_id,
        "name": name,
        "category": category,
        "subcategory": subcategory,
        "latitude": float(lat),
        "longitude": float(lon),
        "nearest_stop_name": nearest_stop_name,
        "description": description,
        "phone": phone,
        "website": website,
        "district": district,
        "source": "pdf_active",
    }
    return source_id, payload


def upsert_pdf_pois(cur, coords: dict[str, dict], dry_run: bool) -> dict[str, int]:
    stats = {"inserted": 0, "updated": 0, "skipped": 0}

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            parsed = parse_csv_row(row, coords)
            if not parsed:
                continue
            source_id, payload = parsed

            cur.execute(
                "SELECT id FROM poi_enriched WHERE source_id = %s ORDER BY id LIMIT 1",
                (source_id,),
            )
            existing = cur.fetchone()

            if dry_run:
                if existing:
                    stats["updated"] += 1
                else:
                    stats["inserted"] += 1
                continue

            if existing:
                cur.execute(
                    """
                    UPDATE poi_enriched
                    SET name = %s,
                        category = %s,
                        subcategory = %s,
                        latitude = %s,
                        longitude = %s,
                        nearest_stop_name = %s,
                        phone = %s,
                        website = %s,
                        district = %s,
                        source = %s
                    WHERE source_id = %s
                    """,
                    (
                        payload["name"],
                        payload["category"],
                        payload["subcategory"],
                        payload["latitude"],
                        payload["longitude"],
                        payload["nearest_stop_name"],
                        payload["phone"],
                        payload["website"],
                        payload["district"],
                        payload["source"],
                        source_id,
                    ),
                )
                stats["updated"] += cur.rowcount
            else:
                cur.execute(
                    """
                    INSERT INTO poi_enriched
                    (source_id, name, category, subcategory, latitude, longitude, nearest_stop_name,
                     description, phone, website, district, source)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        payload["source_id"],
                        payload["name"],
                        payload["category"],
                        payload["subcategory"],
                        payload["latitude"],
                        payload["longitude"],
                        payload["nearest_stop_name"],
                        payload["description"],
                        payload["phone"],
                        payload["website"],
                        payload["district"],
                        payload["source"],
                    ),
                )
                stats["inserted"] += 1

    return stats


def apply_coords_from_json(cur, coords: dict[str, dict], dry_run: bool) -> int:
    updated = 0
    for key, geo in coords.items():
        if not re.fullmatch(r"PDF_\d{3}", key):
            continue
        num = int(key.split("_")[1])
        if num < 1 or num > PDF_BATCH:
            continue
        if dry_run:
            updated += 1
            continue
        cur.execute(
            """
            UPDATE poi_enriched
            SET latitude = %s,
                longitude = %s,
                district = COALESCE(%s, district)
            WHERE source_id = %s
            """,
            (float(geo["lat"]), float(geo["lon"]), geo.get("district"), key),
        )
        updated += cur.rowcount
    return updated


def activate_pdf140(cur, dry_run: bool) -> None:
    cur.execute(
        """
        INSERT INTO admin_cities(name)
        SELECT DISTINCT TRIM(district)
        FROM poi_enriched
        WHERE district IS NOT NULL AND TRIM(district) <> ''
        ON CONFLICT (name) DO NOTHING
        """
    )
    cur.execute(
        """
        INSERT INTO admin_categories(name)
        SELECT DISTINCT TRIM(category)
        FROM poi_enriched
        WHERE category IS NOT NULL AND TRIM(category) <> ''
        ON CONFLICT (name) DO NOTHING
        """
    )
    cur.execute(
        """
        INSERT INTO admin_destinations (name, city_id, category_id, is_active, is_osm_pdf, is_osm_only, source_flags_synced)
        SELECT DISTINCT
            TRIM(p.name),
            c.id,
            k.id,
            FALSE,
            FALSE,
            FALSE,
            FALSE
        FROM poi_enriched p
        JOIN admin_cities c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.district))
        JOIN admin_categories k ON LOWER(TRIM(k.name)) = LOWER(TRIM(p.category))
        WHERE TRIM(p.name) <> ''
          AND p.source_id ~ '^PDF_[0-9]{3}$'
          AND REPLACE(p.source_id, 'PDF_', '')::int BETWEEN 1 AND %s
        ON CONFLICT (name, city_id, category_id)
        DO UPDATE SET source_flags_synced = FALSE
        """,
        (PDF_BATCH,),
    )

    if dry_run:
        return

    cur.execute("UPDATE admin_destinations SET is_active = FALSE")
    cur.execute(
        """
        UPDATE admin_destinations d
        SET is_active = TRUE
        WHERE EXISTS (
            SELECT 1
            FROM poi_enriched p
            JOIN admin_cities c ON LOWER(TRIM(c.name)) = LOWER(TRIM(p.district))
            JOIN admin_categories k ON LOWER(TRIM(k.name)) = LOWER(TRIM(p.category))
            WHERE LOWER(TRIM(d.name)) = LOWER(TRIM(p.name))
              AND d.city_id = c.id
              AND d.category_id = k.id
              AND p.source_id ~ '^PDF_[0-9]{3}$'
              AND REPLACE(p.source_id, 'PDF_', '')::int BETWEEN 1 AND %s
        )
        """,
        (PDF_BATCH,),
    )
    _sync_destination_source_flags(cur)
    _enforce_source_status_rules(cur)


def dedupe_admin_destinations(cur, dry_run: bool) -> int:
    cur.execute(
        """
        WITH ranked AS (
            SELECT
                d.id,
                d.is_active,
                ROW_NUMBER() OVER (
                    PARTITION BY LOWER(TRIM(d.name)), d.city_id, d.category_id
                    ORDER BY
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM poi_enriched p
                                JOIN admin_cities c ON c.id = d.city_id
                                JOIN admin_categories k ON k.id = d.category_id
                                WHERE p.source_id ~ '^PDF_[0-9]{3}$'
                                  AND (REPLACE(p.source_id, 'PDF_', ''))::int BETWEEN 1 AND %s
                                  AND LOWER(TRIM(p.name)) = LOWER(TRIM(d.name))
                                  AND LOWER(TRIM(p.district)) = LOWER(TRIM(c.name))
                                  AND LOWER(TRIM(p.category)) = LOWER(TRIM(k.name))
                            ) THEN 0
                            WHEN d.is_active THEN 1
                            ELSE 2
                        END,
                        d.id ASC
                ) AS rn
            FROM admin_destinations d
        )
        SELECT id FROM ranked WHERE rn > 1 AND is_active = TRUE
        """,
        (PDF_BATCH,),
    )
    ids = [int(r["id"]) for r in cur.fetchall()]
    if ids and not dry_run:
        cur.execute(
            "UPDATE admin_destinations SET is_active = FALSE WHERE id = ANY(%s)",
            (ids,),
        )
    return len(ids)


def collect_stats(cur) -> dict[str, int]:
    cur.execute(
        """
        SELECT COUNT(*) AS c
        FROM poi_enriched
        WHERE source_id ~ '^PDF_[0-9]{3}$'
          AND REPLACE(source_id, 'PDF_', '')::int BETWEEN 1 AND %s
        """,
        (PDF_BATCH,),
    )
    pdf_poi = int(cur.fetchone()["c"])
    cur.execute(
        """
        SELECT COUNT(DISTINCT source_id) AS c
        FROM poi_enriched
        WHERE source_id ~ '^PDF_[0-9]{3}$'
          AND REPLACE(source_id, 'PDF_', '')::int BETWEEN 1 AND %s
        """,
        (PDF_BATCH,),
    )
    pdf_distinct = int(cur.fetchone()["c"])
    cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = TRUE")
    active = int(cur.fetchone()["c"])
    cur.execute("SELECT COUNT(*) AS c FROM admin_destinations WHERE is_active = FALSE")
    inactive = int(cur.fetchone()["c"])
    cur.execute("SELECT COUNT(*) AS c FROM poi_enriched")
    poi_total = int(cur.fetchone()["c"])
    return {
        "pdf_poi_rows": pdf_poi,
        "pdf_distinct": pdf_distinct,
        "active_destinations": active,
        "inactive_destinations": inactive,
        "poi_total": poi_total,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Simulasi tanpa menulis DB")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        print(f"Berkas tidak ada: {CSV_PATH}", file=sys.stderr)
        return 1

    coords = load_coords()
    conn = get_connection()
    cur = conn.cursor()

    try:
        _ensure_master_tables(cur)
        poi_stats = upsert_pdf_pois(cur, coords, args.dry_run)
        coord_updates = apply_coords_from_json(cur, coords, args.dry_run)
        activate_pdf140(cur, args.dry_run)
        admin_deduped = dedupe_admin_destinations(cur, args.dry_run)
        stats = collect_stats(cur)

        if args.dry_run:
            conn.rollback()
            print("[DRY-RUN] Tidak ada perubahan disimpan.")
        else:
            conn.commit()
            print("Perubahan disimpan.")

        print("\n=== Sinkron destinasi aktif PDF_140 (tanpa hapus data) ===")
        print(f"POI PDF insert: {poi_stats['inserted']} | update: {poi_stats['updated']} | skip: {poi_stats['skipped']}")
        print(f"Koordinat JSON diterapkan: {coord_updates} baris")
        print(f"Admin duplikat dinonaktifkan: {admin_deduped}")
        print(f"poi_enriched total: {stats['poi_total']} (tetap utuh, tidak dihapus)")
        print(f"POI panduan PDF_001–140: {stats['pdf_poi_rows']} baris ({stats['pdf_distinct']} source_id unik)")
        print(f"admin_destinations aktif: {stats['active_destinations']}")
        print(f"admin_destinations nonaktif: {stats['inactive_destinations']}")

        if stats["pdf_distinct"] != PDF_BATCH:
            print(f"PERINGATAN: target {PDF_BATCH} source_id unik, dapat {stats['pdf_distinct']}", file=sys.stderr)
            return 1
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
