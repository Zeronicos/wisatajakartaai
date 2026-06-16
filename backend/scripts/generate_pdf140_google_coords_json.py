"""Generate backend/data/pdf140_google_coords.json from verified coordinate sources."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from scripts.fix_kepulauan_seribu_pdf import SERIBU_DISTRICT, SERIBU_PDF_FIXES
from scripts.refine_pdf140_google_coords import MANUAL_BY_NAME

OUTPUT_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"
REPORT_PATH = BACKEND_ROOT / "scripts" / "pdf140_geocode_report.json"

OFFICIAL_NAMES: dict[int, str] = {
    1: "Ancol Art Market",
    2: "Allianz Ecopark & Faunaland",
    3: "Dunia Fantasi",
    4: "Ancol Lagoon Beach",
    5: "Ocean Dream Samudera",
    6: "Putri Duyung Resort",
    7: "Atlantis Water Adventures Ancol",
    8: "Sea World Ancol",
    9: "Jetski Cafe",
    10: "Angke Kapuk Mangrove Tourism",
    11: "Muara Baru Modern Fish Market",
    12: "Urban Farm PIK",
    13: "Pantjoran PIK",
    14: "Sedayu Indo Golf",
    15: "Baywalk Mall",
    16: "PIK Shiva Mandir Temple",
    17: "Art: 1 New Museum",
    18: "Jakarta International Velodrome",
    19: "Ramlie Musofa Mosque",
    20: "Jakarta International Equestrian Park",
    21: "Sunter Lake",
    22: "Mall of Indonesia",
    23: "JIEXPO",
    24: "Jakarta International Stadium",
    25: "Kemayoran City Forest",
    26: "Royale Jakarta Golf Club",
    27: "Pancasila Sakti Monument",
    28: "Taman Mini Indonesia Indah",
    29: "Cibubur Scout Camping Ground",
    30: "Cijantung City Forest",
    31: "Cijantung Skate Park",
    32: "Kampoeng Maen",
    33: "Istana Susu Cibubur Garden Dairy",
    34: "Cibubur Bee Park",
    35: "Teras Rimbun",
    36: "Taman Cattleya Cibubur",
    37: "Taman Benyamin Sueb",
    38: "Jatinegara Station",
    39: "Jakarta Gems Center",
    40: "Koinonia Church",
    41: "Prince Jayakarta Tomb",
    42: "Vihara Amurva Bhumi Jatinegara",
    43: "Jakarta Cathedral",
    44: "Sin Tek Bio Temple",
    45: "Pecenongan Culinary District",
    46: "Pniel Jakarta GPIB Church",
    47: "Ragusa Italian Ice Cream",
    48: "Gedung Kesenian Jakarta",
    49: "Graha Bakti Antara Museum",
    50: "Lapangan Banteng Park",
    51: "Istiqlal Mosque",
    52: "Taman Ismail Marzuki",
    53: "Bakoel Koffie",
    54: "Metropole XXI",
    55: "Tugu Kunstkring Paleis",
    56: "Jami Al Makmur Mosque",
    57: "Surabaya Street Antique Shops",
    58: "Proclamation Park",
    59: "Proclamation Text Making Museum",
    60: "Merdeka Palace",
    61: "National Monument (Monas)",
    62: "Tanah Abang Market",
    63: "Prasasti Park Museum",
    64: "Jakarta City Hall",
    65: "National Museum of Indonesia",
    66: "National Library of Republic of Indonesia",
    67: "Textile Museum",
    68: "National Gallery of Indonesia",
    69: "Gelora Bung Karno Main Stadium",
    70: "Senayan National Golf Club",
    71: "Gelora Bung Karno City Forest",
    72: "Senayan Park",
    73: "Senayan City",
    74: "JCC Senayan",
    75: "Manggala Wanabakti National Forestry Museum",
    76: "Onrust-Cipir-Kelor Islands",
    77: "Harapan Island",
    78: "Pramuka Island",
    79: "Tidung Island",
    80: "Untung Jawa Island",
    81: '"Pelangi, Sepa and Putri Islands"',
    82: "Bidadari Island",
    83: "Macan Island",
    84: "Sunda Kelapa Harbor",
    85: "Maritime Museum",
    86: "Jakarta History Museum",
    87: "Kali Besar Area",
    88: "Fine Arts and Ceramics Museum",
    89: "Wayang Museum",
    90: "GPIB Sion Jakarta Church",
    91: "Kota Intan Drawbridge",
    92: "Jakarta Kota Station",
    93: "Bank Indonesia Museum",
    94: "Pantjoran Tea House",
    95: "Glodok Chinatown",
    96: "Kopi Es Tak Kie",
    97: "Candra Naya Mansion",
    98: "National Archive Building",
    99: "Vihara Dharma Bakti",
    100: "Jami Kebun Jeruk Mosque",
    101: "Vihara Dharma Jaya Toa Se Bio",
    102: "Petak Enam",
    103: "Rawa Belong Flower Market",
    104: "Srengseng City Forest",
    105: "MACAN Museum",
    106: "Cattleya City Park",
    107: "Sky Rink Taman Anggrek",
    108: "Jakarta Aquarium & Safari",
    109: "Tribeca Park",
    110: "Coffee Street Cipete Raya",
    111: "Harry Darsono Museum",
    112: "Basoeki Abdullah Museum",
    113: "Pacific Place Mall",
    114: "Premium Dining at Senopati",
    115: "Astha District 8",
    116: "Senopati Korea Town",
    117: "SCBD Complex",
    118: "Kidzania",
    119: "Blok S Culinary Area",
    120: "M Bloc Space",
    121: "Little Tokyo Blok M",
    122: "Blok M Square",
    123: "Polri Museum",
    124: "Al-Azhar Great Mosque",
    125: "Langsat Park",
    126: "Ciputra Artpreneur",
    127: "Ereveld Menteng Pulo",
    128: "Satria Mandala Museum",
    129: "Rasuna Said Park",
    130: "Mega Kuningan Area",
    131: "Kuningan City",
    132: "Vihara Amurva Bhumi",
    133: "Ragunan Zoological Park",
    134: "Setu Babakan Betawi Cultural Village",
    135: "Ragunan Orchard Garden",
    136: "Ragunan Agro Edutourism",
    137: "Tabebuya Park",
    138: "Babah Alun Desari Mosque",
    139: "Spathodea Park",
    140: "Ragunan Camping Ground",
}


def round6(value: float) -> float:
    return round(float(value), 6)


def geo_entry(
    lat: float,
    lon: float,
    district: str,
    subdistrict: str = "",
    postcode: str = "",
) -> dict:
    return {
        "lat": round6(lat),
        "lon": round6(lon),
        "district": district,
        "subdistrict": subdistrict or "",
        "postcode": postcode or "",
    }


# Perbaikan manual untuk entri geocode report yang salah (Google Maps / OSM)
FIXES_BY_NUM: dict[int, dict] = {
    30: geo_entry(-6.326538, 106.857284, "Jakarta Timur", "Pasar Rebo", "13790"),
    32: geo_entry(-6.311111, 106.933333, "Jakarta Timur", "Cipayung", "13760"),
    33: geo_entry(-6.340833, 106.905833, "Jakarta Timur", "Cipayung", "13760"),
    34: geo_entry(-6.340833, 106.905833, "Jakarta Timur", "Cipayung", "13760"),
    36: geo_entry(-6.340833, 106.905833, "Jakarta Timur", "Cipayung", "13760"),
    39: geo_entry(-6.200833, 106.905000, "Jakarta Timur", "Pulo Gadung", "13220"),
    42: geo_entry(-6.214167, 106.865833, "Jakarta Timur", "Jatinegara", "13330"),
    44: geo_entry(-6.135833, 106.813611, "Jakarta Barat", "Taman Sari", "11120"),
    45: geo_entry(-6.163056, 106.834722, "Jakarta Pusat", "Sawah Besar", "10140"),
    47: geo_entry(-6.162778, 106.834444, "Jakarta Pusat", "Sawah Besar", "10140"),
    49: geo_entry(-6.200833, 106.845833, "Jakarta Pusat", "Menteng", "10310"),
    50: geo_entry(-6.170833, 106.834722, "Jakarta Pusat", "Sawah Besar", "10710"),
    57: geo_entry(-6.190833, 106.838889, "Jakarta Pusat", "Menteng", "10310"),
    58: geo_entry(-6.195833, 106.845833, "Jakarta Pusat", "Menteng", "10310"),
    59: geo_entry(-6.195833, 106.845833, "Jakarta Pusat", "Menteng", "10310"),
    64: geo_entry(-6.180833, 106.834722, "Jakarta Pusat", "Gambir", "10110"),
    71: geo_entry(-6.218333, 106.800833, "Jakarta Pusat", "Tanah Abang", "10270"),
    75: geo_entry(-6.226667, 106.808333, "Jakarta Pusat", "Mampang Prapatan", "12770"),
    87: geo_entry(-6.135833, 106.813611, "Jakarta Barat", "Taman Sari", "11110"),
    90: geo_entry(-6.135833, 106.813611, "Jakarta Barat", "Taman Sari", "11110"),
    91: geo_entry(-6.135833, 106.813611, "Jakarta Barat", "Taman Sari", "11110"),
    96: geo_entry(-6.137500, 106.814167, "Jakarta Barat", "Taman Sari", "11120"),
    98: geo_entry(-6.175833, 106.834722, "Jakarta Pusat", "Gambir", "10110"),
    101: geo_entry(-6.137500, 106.814167, "Jakarta Barat", "Taman Sari", "11120"),
    103: geo_entry(-6.196667, 106.783333, "Jakarta Barat", "Palmerah", "11480"),
    104: geo_entry(-6.218333, 106.766667, "Jakarta Barat", "Kembangan", "11630"),
    106: geo_entry(-6.308333, 106.816667, "Jakarta Selatan", "Pasar Minggu", "12550"),
    107: geo_entry(-6.178333, 106.791667, "Jakarta Barat", "Grogol Petamburan", "11470"),
    114: geo_entry(-6.230833, 106.808333, "Jakarta Selatan", "Kebayoran Baru", "12190"),
    116: geo_entry(-6.230833, 106.808333, "Jakarta Selatan", "Kebayoran Baru", "12190"),
    119: geo_entry(-6.244266, 106.801451, "Jakarta Selatan", "Kebayoran Baru", "12160"),
    120: geo_entry(-6.283333, 106.783333, "Jakarta Selatan", "Pasar Minggu", "12560"),
    121: geo_entry(-6.244722, 106.799722, "Jakarta Selatan", "Kebayoran Baru", "12160"),
    126: geo_entry(-6.224167, 106.833333, "Jakarta Selatan", "Setiabudi", "12930"),
    132: geo_entry(-6.218333, 106.826667, "Jakarta Selatan", "Setiabudi", "12920"),
    134: geo_entry(-6.338611, 106.823611, "Jakarta Selatan", "Jagakarsa", "12620"),
    139: geo_entry(-6.308333, 106.816667, "Jakarta Selatan", "Pasar Minggu", "12550"),
}


def from_manual(name: str) -> dict | None:
    if name not in MANUAL_BY_NAME:
        return None
    g = MANUAL_BY_NAME[name]
    return geo_entry(
        float(g["lat"]),
        float(g["lon"]),
        str(g["district"]),
        str(g.get("subdistrict") or ""),
        str(g.get("postcode") or ""),
    )


def from_seribu(num: int) -> dict | None:
    csv_id = f"PDF_{num:04d}"
    if csv_id not in SERIBU_PDF_FIXES:
        return None
    fix = SERIBU_PDF_FIXES[csv_id]
    return geo_entry(
        float(fix["lat"]),
        float(fix["lon"]),
        SERIBU_DISTRICT,
        str(fix["subdistrict"]),
        str(fix["postcode"]),
    )


def from_report(report_by_id: dict[str, dict], num: int) -> dict | None:
    item = report_by_id.get(f"PDF_{num:04d}", {})
    geo = item.get("geo") or {}
    if geo.get("lat") is None or geo.get("lon") is None:
        return None
    return geo_entry(
        float(geo["lat"]),
        float(geo["lon"]),
        str(geo.get("district") or ""),
        str(geo.get("subdistrict") or ""),
        str(geo.get("postcode") or ""),
    )


def resolve_geo(num: int, name: str, report_by_id: dict[str, dict]) -> dict:
    for resolver in (
        lambda: from_seribu(num),
        lambda: from_manual(name),
        lambda: FIXES_BY_NUM.get(num),
        lambda: from_report(report_by_id, num),
    ):
        result = resolver()
        if result:
            return result
    raise KeyError(f"No coordinates for PDF_{num:03d} ({name})")


def main() -> int:
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    report_by_id = {item["id"]: item for item in report}

    output: dict[str, dict] = {}
    for num in range(1, 141):
        name = OFFICIAL_NAMES[num]
        geo = resolve_geo(num, name, report_by_id)
        output[f"PDF_{num:03d}"] = {"name": name, **geo}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(output)} entries to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
