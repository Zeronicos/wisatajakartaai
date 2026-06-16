"""Lookup sisa POI bermasalah."""
import json, time, urllib.parse, urllib.request
UA = "WisataJakartaAI/1.0"
for q in [
    "Taman Wisata Lebah Wiladatika Cibubur",
    "Cibubur Bee Park Jl Buperta",
    "Hutan Kota RW 10 Cijantung Pasar Rebo",
    "Taman Hutan Kota Cijantung Jl RA Fadillah",
    "Bumi Perkemahan Pramuka Jl Jambore Cibubur",
    "Pantai Lagoon Beach Pool Ancol",
]:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q}, Jakarta, Indonesia", "format": "json", "limit": 2}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        hits = json.loads(r.read().decode())
    print(f"\n{q}:")
    for d in hits[:2]:
        print(f"  {d['lat']}, {d['lon']} | {d.get('display_name','')[:100]}")
    time.sleep(1.1)
