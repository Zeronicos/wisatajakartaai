"""Generate pdf140_google_place_queries.json dari nama destinasi aktual."""

from __future__ import annotations

import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
COORDS = BACKEND / "data" / "pdf140_google_coords.json"
OUT = BACKEND / "data" / "pdf140_google_place_queries.json"

# Override query untuk nama ambigu / singkat
OVERRIDES: dict[str, str] = {
    "Dunia Fantasi": "Dunia Fantasi Ancol Jakarta",
    "Graha Bakti Antara Museum": "Museum Antara Jakarta",
    "National Museum of Indonesia": "Museum Nasional Indonesia Jakarta",
    "Jetski Cafe": "Jetski Cafe Pantai Mutiara Jakarta",
    "Proclamation Park": "Taman Proklamasi Jakarta",
    "Proclamation Text Making Museum": "Museum Perumusan Naskah Proklamasi Jakarta",
    "National Monument (Monas)": "Monumen Nasional Monas Jakarta",
    "Jakarta History Museum": "Museum Sejarah Jakarta Fatahillah",
    "Kali Besar Area": "Kali Besar Jakarta Kota Tua",
    "Kota Intan Drawbridge": "Jembatan Kota Intan Jakarta",
    "GPIB Sion Jakarta Church": "GPIB Sion Jakarta",
    "Kopi Es Tak Kie": "Kopi Es Tak Kie Glodok Jakarta",
    "Cattleya City Park": "Taman Cattleya Jakarta Barat",
    "Premium Dining at Senopati": "Senopati Jakarta Selatan",
    "Senopati Korea Town": "Korea Town Senopati Jakarta",
    "Ciputra Artpreneur": "Ciputra Artpreneur Kuningan Jakarta",
    "M Bloc Space": "M Bloc Space Jakarta Selatan",
    "Little Tokyo Blok M": "Little Tokyo Blok M Jakarta",
    '"Pelangi, Sepa and Putri Islands"': "Pulau Putri Kepulauan Seribu",
    "Onrust-Cipir-Kelor Islands": "Pulau Onrust Kepulauan Seribu",
    "Harapan Island": "Pulau Harapan Kepulauan Seribu",
    "Pramuka Island": "Pulau Pramuka Kepulauan Seribu",
    "Tidung Island": "Pulau Tidung Kepulauan Seribu",
    "Untung Jawa Island": "Pulau Untung Jawa Kepulauan Seribu",
    "Bidadari Island": "Pulau Bidadari Kepulauan Seribu",
    "Macan Island": "Pulau Macan Kepulauan Seribu",
    "Jakarta City Hall": "Balai Kota DKI Jakarta",
    "National Archive Building": "Arsip Nasional Republik Indonesia Jakarta",
    "Pecenongan Culinary District": "Kawasan Kuliner Pecenongan Jakarta",
    "Sin Tek Bio Temple": "Klenteng Sin Tek Bio Glodok Jakarta",
    "Vihara Dharma Jaya Toa Se Bio": "Vihara Dharma Bhakti Glodok Jakarta",
    "Istana Susu Cibubur Garden Dairy": "Istana Susu Cibubur Jakarta",
    "Cibubur Bee Park": "Cibubur Bee Park Jakarta Timur",
    "Kampoeng Maen": "Kampoeng Maen Cikini Jakarta",
    "Ancol Lagoon Beach": "Pantai Lagoon Ancol Jakarta",
    "Muara Baru Modern Fish Market": "Pasar Ikan Modern Muara Baru Jakarta",
    "Urban Farm PIK": "Urban Farm PIK Jakarta Utara",
    "Jakarta International Stadium": "JIS Stadion Jakarta International Stadium",
    "Kidzania": "Kidzania Ancol Jakarta",
    "Jakarta Aquarium & Safari": "Jakarta Aquarium Safari Jakarta",
}


def query_for(name: str) -> str:
    n = name.strip()
    if n in OVERRIDES:
        return OVERRIDES[n]
    return f"{n}, DKI Jakarta, Indonesia"


def main() -> int:
    coords = json.loads(COORDS.read_text(encoding="utf-8"))
    queries = {key: query_for(str(entry.get("name") or "")) for key, entry in coords.items()}
    OUT.write_text(json.dumps(queries, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(queries)} queries -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
