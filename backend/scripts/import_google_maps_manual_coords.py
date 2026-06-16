"""
Impor koordinat manual dari link Google Maps ke pdf140_google_coords.json.

Format input CSV (delimiter ;):
  pdf_key;google_maps_url_or_coords;notes
  PDF_001;https://www.google.com/maps/place/.../@-6.126657,106.839134,17z;optional
  PDF_002;-6.125928,106.836324;

URL/coord yang didukung:
  - https://www.google.com/maps/place/.../@lat,lon,...
  - https://maps.google.com/?q=lat,lon
  - https://www.google.com/maps/search/?api=1&query=lat,lon
  - -6.126657,106.839134

Penggunaan:
  python scripts/import_google_maps_manual_coords.py --csv data/pdf140_manual_import.csv
  python scripts/import_google_maps_manual_coords.py --csv data/pdf140_manual_import.csv --apply
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

COORDS_PATH = BACKEND_ROOT / "data" / "pdf140_google_coords.json"
DEFAULT_CSV = BACKEND_ROOT / "data" / "pdf140_manual_import.csv"

# @lat,lon atau !3dLAT!4dLON atau q=lat,lon
PATTERNS = [
    re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)"),
    re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)"),
    re.compile(r"[?&]query=(-?\d+\.\d+)%2C(-?\d+\.\d+)"),
    re.compile(r"[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)"),
    re.compile(r"^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$"),
]


def parse_coords(text: str) -> tuple[float, float] | None:
    s = (text or "").strip()
    if not s:
        return None
    for pat in PATTERNS:
        m = pat.search(s)
        if m:
            return round(float(m.group(1)), 6), round(float(m.group(2)), 6)
    return None


def load_coords() -> dict[str, dict]:
    return json.loads(COORDS_PATH.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--apply", action="store_true", help="Jalankan apply_pdf140_google_coords.py setelah impor")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.csv.exists():
        print(f"CSV tidak ada: {args.csv}", file=sys.stderr)
        print("Buat file dengan kolom: pdf_key;url_or_coords;notes", file=sys.stderr)
        return 1
    if not COORDS_PATH.exists():
        print(f"JSON tidak ada: {COORDS_PATH}", file=sys.stderr)
        return 1

    coords = load_coords()
    updated = 0
    skipped = 0
    errors: list[str] = []

    with args.csv.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            key = (row.get("pdf_key") or row.get("key") or "").strip().upper()
            raw = (row.get("google_maps_url_or_coords") or row.get("url") or row.get("coords") or "").strip()
            if not key:
                continue
            if key not in coords:
                errors.append(f"{key}: tidak ada di JSON")
                continue
            parsed = parse_coords(raw)
            if not parsed:
                skipped += 1
                errors.append(f"{key}: tidak bisa parse '{raw[:80]}'")
                continue
            lat, lon = parsed
            old = (coords[key]["lat"], coords[key]["lon"])
            coords[key]["lat"] = lat
            coords[key]["lon"] = lon
            coords[key]["source"] = "google_maps_manual"
            if raw.startswith("http"):
                coords[key]["google_maps_url"] = raw.split("?")[0] if len(raw) < 500 else raw[:500]
            if old != (lat, lon):
                updated += 1
                print(f"[OK] {key} | {coords[key]['name']} | {old} -> ({lat}, {lon})")
            else:
                print(f"[=]  {key} | sudah sama")

    if not args.dry_run and updated > 0:
        COORDS_PATH.write_text(json.dumps(coords, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nDisimpan {updated} perubahan -> {COORDS_PATH}")

    if errors:
        print(f"\nLewati/error: {len(errors)}")
        for e in errors[:20]:
            print(f"  - {e}")

    if args.apply and updated > 0 and not args.dry_run:
        import subprocess

        subprocess.run([sys.executable, str(BACKEND_ROOT / "scripts" / "apply_pdf140_google_coords.py")], check=False)

    print(f"\nRingkas: diperbarui={updated}, lewati={skipped}")
    return 0 if not errors or updated > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
