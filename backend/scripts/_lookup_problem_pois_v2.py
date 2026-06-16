"""Lookup koordinat via Nominatim (multi query)."""
import json
import time
import urllib.parse
import urllib.request

UA = "WisataJakartaAI/1.0 (coord verify v2)"

SEARCHES = {
    "PDF_004": [
        "Beach Pool Ancol",
        "Pantai Lagoon Ancol Pademangan",
        "Ancol Lagoon Beach",
    ],
    "PDF_029": [
        "Buperta Cibubur",
        "Bumi Perkemahan Pramuka Pondok Ranggon",
        "Cibubur Scout Camping Ground",
    ],
    "PDF_030": [
        "Hutan Kota Cijantung Pasar Rebo",
        "Taman Hutan Kota Cijantung",
    ],
    "PDF_034": [
        "Taman Wisata Lebah Cibubur",
        "Cibubur Bee Park Pondok Ranggon",
    ],
    "PDF_106": [
        "Taman Cattleya Palmerah",
        "Taman Cattleya Slipi Jakarta Barat",
    ],
    "PDF_119": [
        "Blok S Melawai",
        "Pasar Blok S Jakarta",
        "Blok S Square",
    ],
    "PDF_126": [
        "Ciputra World Kuningan",
        "Ciputra Artpreneur Prof Dr Satrio",
    ],
}


def search(q: str):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q}, DKI Jakarta, Indonesia", "format": "json", "limit": 3, "countrycodes": "id"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


for key, queries in SEARCHES.items():
    print(f"\n=== {key} ===")
    for q in queries:
        try:
            hits = search(q)
        except Exception as e:
            print(f"  ERR {q}: {e}")
            time.sleep(1.1)
            continue
        if hits:
            d = hits[0]
            print(f"  OK  {q}")
            print(f"      {d['lat']}, {d['lon']} | {d.get('display_name','')[:110]}")
        else:
            print(f"  --- {q}")
        time.sleep(1.1)
