"""Cek duplikat nama destinasi aktif PDF di database."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")
from database import get_connection

conn = get_connection()
cur = conn.cursor()
cur.execute("""
    SELECT pe.name, COUNT(*) AS n,
           array_agg(pe.source_id ORDER BY pe.source_id) AS ids
    FROM poi_enriched pe
    WHERE pe.source_id ~ '^PDF_[0-9]{3}$'
    GROUP BY pe.name
    HAVING COUNT(*) > 1
    ORDER BY pe.name
""")
rows = cur.fetchall()
print(f"Duplikat nama aktif: {len(rows)}")
for name, n, ids in rows:
    print(f"  {name} x{n} -> {ids}")
cur.close()
conn.close()
