"""
Terapkan deskripsi kanon (JSON) ke poi_enriched + kolom deskripsi CSV.

Penggunaan:
  cd backend
  .\\venv\\Scripts\\python.exe scripts/apply_pdf140_descriptions.py
  .\\venv\\Scripts\\python.exe scripts/apply_pdf140_descriptions.py --file data/pdf140_descriptions_full.json
  .\\venv\\Scripts\\python.exe scripts/apply_pdf140_descriptions.py --dry-run
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

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection
from scripts.refine_pdf140_google_coords import _row_id

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
DEFAULT_JSON = BACKEND_ROOT / "data" / "pdf140_descriptions_full.json"


def pdf_key_from_row_id(rid: str) -> str | None:
    match = re.fullmatch(r"PDF_(\d{4})", (rid or "").strip())
    if not match:
        return None
    num = int(match.group(1))
    return f"PDF_{num:03d}"


def load_descriptions(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: str(v).strip() for k, v in data.items() if str(v).strip()}


def apply_db(cur, descriptions: dict[str, str], dry_run: bool) -> int:
    updated = 0
    for source_id, text in sorted(descriptions.items()):
        cur.execute(
            "UPDATE poi_enriched SET description = %s WHERE source_id = %s",
            (text, source_id),
        )
        updated += cur.rowcount
    if dry_run:
        return updated
    return updated


def apply_csv(descriptions: dict[str, str], dry_run: bool) -> int:
    if not CSV_PATH.exists():
        return 0

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    changed = 0
    for row in rows:
        key = pdf_key_from_row_id(_row_id(row))
        if not key or key not in descriptions:
            continue
        text = descriptions[key]
        for col in ("deskripsi", "description"):
            if col in row and row.get(col) != text:
                row[col] = text
                changed += 1
                break
        else:
            if "deskripsi" in fieldnames:
                row["deskripsi"] = text
                changed += 1

    if not dry_run and changed > 0:
        with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    return changed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=DEFAULT_JSON)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.file.exists():
        print(f"Berkas tidak ada: {args.file}", file=sys.stderr)
        return 1

    descriptions = load_descriptions(args.file)
    print(f"Entri deskripsi: {len(descriptions)}")

    conn = get_connection()
    cur = conn.cursor()
    try:
        db_rows = apply_db(cur, descriptions, args.dry_run)
        csv_rows = apply_csv(descriptions, args.dry_run)
        if args.dry_run:
            conn.rollback()
            print(f"[DRY-RUN] DB akan update: {db_rows} | CSV kolom: {csv_rows}")
        else:
            conn.commit()
            print(f"DB diperbarui: {db_rows} baris | CSV diperbarui: {csv_rows} kolom")
        return 0
    except Exception as exc:
        conn.rollback()
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
