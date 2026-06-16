"""Lookup koordinat via Nominatim untuk POI bermasalah."""
import json
import time
import urllib.parse
import urllib.request

UA = "WisataJakartaAI/1.0 (coord verify)"
QUERIES = [
    ("PDF_004", "Pantai Lagoon Ancol Jakarta"),
    ("PDF_029", "Bumi Perkemahan Pramuka Cibubur Buperta"),
    ("PDF_030", "Hutan Kota Cijantung Jakarta Timur"),
    ("PDF_034", "Cibubur Bee Park Taman Wisata Lebah"),
    ("PDF_093", "Museum Bank Indonesia Pintu Besar Utara Jakarta"),
    ("PDF_106", "Taman Cattleya Jl Letjen S Parman Jakarta"),
    ("PDF_119", "Blok S Square Jakarta Selatan"),
    ("PDF_126", "Ciputra Artpreneur Kuningan Jakarta"),
    ("PDF_138", "Masjid Babah Alun Desari Jakarta"),
]

for key, q in QUERIES:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1, "countrycodes": "id"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read().decode())
    if data:
        d = data[0]
        print(f"{key} | {d['lat']}, {d['lon']}")
        print(f"  {d.get('display_name', '')[:100]}")
    else:
        print(f"{key} | NO RESULT for {q}")
    time.sleep(1.1)
