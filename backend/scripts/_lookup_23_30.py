"""Lookup koordinat #23-30 untuk verifikasi Google Maps."""
import json, time, urllib.parse, urllib.request
UA = "WisataJakartaAI/1.0"
QUERIES = [
    ("PDF_030", "Hutan Kota Cijantung Jl RA Fadillah Pasar Rebo"),
    ("PDF_031", "Skate Park Cijantung Jl TB Simatupang Ciracas"),
    ("PDF_126", "Ciputra Artpreneur Ciputra World Prof Dr Satrio"),
    ("PDF_110", "Coffee Street Cipete Raya Jakarta Selatan"),
    ("PDF_003", "Dunia Fantasi Dufan Ancol"),
    ("PDF_127", "Ereveld Menteng Pulo Tebet Jakarta"),
    ("PDF_088", "Museum Seni Rupa dan Keramik Fatahillah Jakarta"),
]
for key, q in QUERIES:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q}, DKI Jakarta, Indonesia", "format": "json", "limit": 2, "countrycodes": "id"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        hits = json.loads(r.read().decode())
    print(f"\n=== {key} ===")
    for d in hits[:2]:
        print(f"  {d['lat']}, {d['lon']} | {d.get('display_name','')[:100]}")
    if not hits:
        print("  NO RESULT")
    time.sleep(1.1)
