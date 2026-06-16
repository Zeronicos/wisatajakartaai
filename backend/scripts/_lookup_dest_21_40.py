"""Lookup koordinat destinasi #21-40 (alfabet UI)."""
import json, time, urllib.parse, urllib.request
UA = "WisataJakartaAI/1.0 (verify 21-40)"
QUERIES = [
    ("PDF_034", "Cibubur Bee Park Taman Wisata Lebah Buperta"),
    ("PDF_029", "Bumi Perkemahan Pramuka Buperta Cibubur"),
    ("PDF_030", "Hutan Kota Cijantung Pasar Rebo"),
    ("PDF_031", "Skate Park Cijantung TB Simatupang"),
    ("PDF_126", "Ciputra Artpreneur Ciputra World Kuningan"),
    ("PDF_110", "Coffee Street Cipete Raya"),
    ("PDF_003", "Dunia Fantasi Ancol"),
    ("PDF_127", "Ereveld Menteng Pulo Tebet"),
    ("PDF_088", "Museum Seni Rupa dan Keramik Fatahillah"),
    ("PDF_048", "Gedung Kesenian Jakarta"),
    ("PDF_071", "Hutan Kota Gelora Bung Karno"),
    ("PDF_069", "Stadion Utama Gelora Bung Karno"),
    ("PDF_095", "Glodok Chinatown Jakarta"),
    ("PDF_090", "GPIB Sion Jakarta"),
    ("PDF_049", "Museum Antara Graha Bakti Antara"),
    ("PDF_077", "Pulau Harapan Kepulauan Seribu"),
    ("PDF_111", "Museum Harry Darsono Cilandak"),
    ("PDF_033", "Istana Susu Cibubur Garden Dairy"),
    ("PDF_051", "Masjid Istiqlal Jakarta"),
]
for key, q in QUERIES:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q}, DKI Jakarta, Indonesia", "format": "json", "limit": 1, "countrycodes": "id"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            hits = json.loads(r.read().decode())
    except Exception as e:
        print(f"{key} ERR {e}")
        time.sleep(1.1)
        continue
    if hits:
        d = hits[0]
        print(f"{key}|{d['lat']},{d['lon']}|{d.get('display_name','')[:95]}")
    else:
        print(f"{key}|NO RESULT|{q}")
    time.sleep(1.1)
