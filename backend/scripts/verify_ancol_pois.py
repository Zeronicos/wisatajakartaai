import csv
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from data_preprocessing.load_data import normalize_coordinate
from database import get_connection

CHECKS = [
    "Allianz Ecopark & Faunaland",
    "Ocean Dream Samudera",
    "Ancol Art Market",
    "Sea World Ancol",
    "SeaWorld Ancol",
    "Dunia Fantasi",
    "Atlantis Water Adventures Ancol",
    "Ancol Lagoon Beach",
    "Putri Duyung Resort",
    "Candi Kul Kul",
    "Taman Gazebo",
    "Tebet EcoPark",
]

p = Path(__file__).resolve().parents[2] / "poi_lengkap_final.csv"
print("=== CSV ===")
with p.open("r", encoding="utf-8", newline="") as f:
    for row in csv.DictReader(f, delimiter=";"):
        n = (row.get("nama") or "").strip()
        if n in CHECKS:
            lat = normalize_coordinate(row.get("latitude", ""), True)
            lon = normalize_coordinate(row.get("longitude", ""), False)
            print(f"{n} | {row.get('district')} | {lat}, {lon}")

cur = get_connection().cursor()
print("=== DB ===")
for n in CHECKS:
    cur.execute(
        "SELECT id, name, latitude, longitude, district FROM poi_enriched WHERE name = %s",
        (n,),
    )
    r = cur.fetchone()
    if r:
        print(dict(r))

cur.execute(
    "SELECT id, name, latitude, longitude, district FROM poi_enriched WHERE name ILIKE %s",
    ("%Sea%World%Ancol%",),
)
print("=== SeaWorld variants ===")
for r in cur.fetchall():
    print(dict(r))
