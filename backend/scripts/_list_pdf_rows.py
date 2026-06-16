import csv
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection

p = Path(__file__).resolve().parents[2] / "poi_lengkap_final.csv"
print("=== CSV PDF_0001-0140 ===")
with p.open("r", encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):
        rid = (row.get("id_poi") or "").strip()
        if not rid.startswith("PDF_"):
            continue
        num = int(rid.split("_")[1])
        if num > 140:
            continue
        lat = normalize_coordinate(row.get("latitude", ""), True)
        lon = normalize_coordinate(row.get("longitude", ""), False)
        print(f"{rid} | {row.get('nama','')[:50]} | {lat},{lon} | {row.get('district','')}")

cur = get_connection().cursor()
print("\n=== DB source PDF_001-020 ===")
cur.execute(
    """
    SELECT source_id, name, latitude, longitude, district
    FROM poi_enriched
    WHERE source_id ~ '^PDF_[0-9]{3}$'
    ORDER BY source_id
    LIMIT 20
    """
)
for r in cur.fetchall():
    print(dict(r))

print("\n=== DB id PDF_0001-0010 (pdf_bulk) ===")
cur.execute(
    """
    SELECT source_id, name, latitude, longitude, district
    FROM poi_enriched
    WHERE source_id LIKE 'PDF_00%%'
    ORDER BY source_id
    LIMIT 10
    """
)
for r in cur.fetchall():
    print(dict(r))
