"""Sekali pakai / diagnosa — hitung baris utama."""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from database import get_connection

QUERIES = [
    ("poi_enriched", "SELECT COUNT(*) AS c FROM poi_enriched"),
    ("poi_embedding_terisi", "SELECT COUNT(*) AS c FROM poi_enriched WHERE embedding IS NOT NULL"),
    ("stops", "SELECT COUNT(*) AS c FROM stops"),
    ("restaurants", "SELECT COUNT(*) AS c FROM restaurants"),
    ("minimarkets", "SELECT COUNT(*) AS c FROM minimarkets"),
]


def main() -> None:
    conn = get_connection()
    cur = conn.cursor()
    for label, sql in QUERIES:
        cur.execute(sql)
        row = cur.fetchone()
        n = row["c"] if row else 0
        print(f"{label}: {n} baris")
    cur.close()
    conn.close()
    print("(selesai)")


if __name__ == "__main__":
    main()
