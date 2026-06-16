"""
Pulihkan kolom description PDF_001–PDF_140 dari CSV (tanpa ubah koordinat/status).

Deskripsi manual via Admin UI tidak disimpan otomatis ke riwayat.
Sumber pemulihan yang tersedia:
  1. CSV / git commit lama (poi_lengkap_final.csv kolom deskripsi)
  2. Backup PostgreSQL server (lihat README di bawah)

Penggunaan:
  cd backend
  .\\venv\\Scripts\\python.exe scripts/restore_pdf140_descriptions.py --dry-run
  .\\venv\\Scripts\\python.exe scripts/restore_pdf140_descriptions.py
  .\\venv\\Scripts\\python.exe scripts/restore_pdf140_descriptions.py --compare
  .\\venv\\Scripts\\python.exe scripts/restore_pdf140_descriptions.py --csv ..\\poi_lengkap_final.csv
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from data_preprocessing.load_data import first_nonempty
from database import get_connection
from scripts.refine_pdf140_google_coords import _row_id

CSV_PATH = BACKEND_ROOT.parent / "poi_lengkap_final.csv"
PDF_BATCH = 140


def load_csv_descriptions(csv_path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            rid = _row_id(row)
            match = re.fullmatch(r"PDF_(\d{4})", (rid or "").strip())
            if not match:
                continue
            num = int(match.group(1))
            if num < 1 or num > PDF_BATCH:
                continue
            source_id = f"PDF_{num:03d}"
            desc = first_nonempty(row, ["description", "deskripsi", "teks_gabungan"]) or ""
            out[source_id] = desc.strip()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=CSV_PATH)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--compare",
        action="store_true",
        help="Tampilkan perbedaan DB vs CSV tanpa menulis.",
    )
    args = ap.parse_args()

    if not args.csv.exists():
        print(f"Berkas tidak ada: {args.csv}", file=sys.stderr)
        return 1

    csv_desc = load_csv_descriptions(args.csv)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT source_id, name, description
        FROM poi_enriched
        WHERE source_id ~ '^PDF_[0-9]{3}$'
          AND (REPLACE(source_id, 'PDF_', ''))::int BETWEEN 1 AND %s
        ORDER BY source_id
        """,
        (PDF_BATCH,),
    )
    rows = cur.fetchall()

    changed = 0
    same = 0
    missing_csv = 0

    for row in rows:
        source_id = row["source_id"]
        db_desc = (row["description"] or "").strip()
        csv_val = csv_desc.get(source_id)
        if csv_val is None:
            missing_csv += 1
            continue
        if db_desc == csv_val:
            same += 1
            continue
        changed += 1
        if args.compare or args.dry_run:
            print(f"[{source_id}] {row['name']}")
            print(f"  DB ({len(db_desc)} char): {db_desc[:120]}{'...' if len(db_desc) > 120 else ''}")
            print(f"  CSV ({len(csv_val)} char): {csv_val[:120]}{'...' if len(csv_val) > 120 else ''}")
            continue
        cur.execute(
            "UPDATE poi_enriched SET description = %s WHERE source_id = %s",
            (csv_val or None, source_id),
        )

    if args.compare:
        print(f"\nBerbeda: {changed} | Sama: {same} | Tanpa CSV: {missing_csv}")
        cur.close()
        conn.close()
        return 0

    if args.dry_run:
        conn.rollback()
        print(f"\n[DRY-RUN] Akan update: {changed} | Sama: {same} | Tanpa CSV: {missing_csv}")
    else:
        conn.commit()
        print(f"Description diperbarui: {changed} | Sama: {same} | Tanpa CSV: {missing_csv}")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
