"""Cek duplikat koordinat PDF_001-140."""
import json
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
data = json.loads((BACKEND / "data" / "pdf140_google_coords.json").read_text(encoding="utf-8"))
by_coord = defaultdict(list)
for k, v in sorted(data.items()):
    c = (round(v["lat"], 6), round(v["lon"], 6))
    by_coord[c].append(k)
dups = {c: ids for c, ids in by_coord.items() if len(ids) > 1}
print(f"Total: {len(data)} | Duplikat: {len(dups)}")
for c, ids in sorted(dups.items(), key=lambda x: -len(x[1])):
    print(f"  {c}:")
    for i in ids:
        print(f"    {i} | {data[i]['name']}")
