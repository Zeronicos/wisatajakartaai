import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_connection

cur = get_connection().cursor()
cur.execute(
    """
    SELECT source_id, name, latitude, longitude, district
    FROM poi_enriched
    WHERE name IN ('Ancol Art Market', 'Ragunan Camping Ground', 'Muara Baru Modern Fish Market')
    ORDER BY name
    """
)
for r in cur.fetchall():
    print(dict(r))

cur.execute(
    """
    SELECT source_id, COUNT(*) c
    FROM poi_enriched
    WHERE source_id ~ '^PDF_[0-9]+$'
    GROUP BY source_id
    ORDER BY source_id
    LIMIT 5
    """
)
print("sample source ids:", [dict(r) for r in cur.fetchall()])

cur.execute(
    """
    SELECT COUNT(*) c FROM poi_enriched
    WHERE source_id LIKE 'PDF_0%'
    """
)
print("PDF_0* count:", cur.fetchone()["c"])
