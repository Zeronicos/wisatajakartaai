"""
Aktifkan destinasi yang namanya cocok dengan daftar di file teks;
nonaktifkan sisanya. Hormati lock: is_osm_pdf wajib aktif, is_osm_only wajib inactive.

Usage:
  python scripts/sync_destination_whitelist.py [--dry-run] [--file path/to/list.txt]

Lingkungan: pakai backend/.env (DB_*).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# Repo root = backend/
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from database import get_connection  # noqa: E402
from routers.admin_master import (  # noqa: E402
    _enforce_source_status_rules,
    _ensure_master_tables,
    _sync_destination_source_flags,
)


def _norm(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _load_whitelist(path: Path) -> list[str]:
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        type=Path,
        default=BACKEND_ROOT / "scripts" / "destination_whitelist.txt",
        help="Satuan nama destinasi per baris",
    )
    parser.add_argument("--dry-run", action="store_true", help="Hanya cetak laporan tanpa UPDATE")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"File tidak ada: {args.file}", file=sys.stderr)
        return 1

    whitelist_raw = _load_whitelist(args.file)
    whitelist_norm = [_norm(x) for x in whitelist_raw]

    conn = get_connection()
    cur = conn.cursor()
    try:
        _ensure_master_tables(cur)
        _sync_destination_source_flags(cur)
        _enforce_source_status_rules(cur)
        conn.commit()

        cur.execute(
            """
            SELECT
                d.id,
                d.name,
                d.is_active,
                d.is_osm_pdf,
                d.is_osm_only
            FROM admin_destinations d
            """
        )
        rows = cur.fetchall()

        by_norm: dict[str, list[dict]] = {}
        for r in rows:
            key = _norm(r["name"])
            by_norm.setdefault(key, []).append(dict(r))

        matched_ids: set[int] = set()
        matches_detail: list[tuple[str, list[int]]] = []
        not_found: list[str] = []
        ambiguous: list[tuple[str, int]] = []

        for raw, wn in zip(whitelist_raw, whitelist_norm):
            if wn in by_norm:
                ids = [r["id"] for r in by_norm[wn]]
                matched_ids.update(ids)
                matches_detail.append((raw, ids))
                continue

            # Prefix match kalau nama di gambar terpotong (hanya mulai-depan atau kebalikan)
            candidates: list[dict] = []
            if len(wn) >= 5:
                for r in rows:
                    dbn = _norm(r["name"])
                    if dbn.startswith(wn) or wn.startswith(dbn):
                        candidates.append(dict(r))

            # Dedup by id
            seen: set[int] = set()
            uniq: list[dict] = []
            for c in candidates:
                if c["id"] not in seen:
                    seen.add(c["id"])
                    uniq.append(c)

            if len(uniq) == 1:
                ids = [uniq[0]["id"]]
                matched_ids.update(ids)
                matches_detail.append((raw, ids))
            elif len(uniq) == 0:
                not_found.append(raw)
            else:
                ambiguous.append((raw, len(uniq)))

        # Stats sebelum update
        cur.execute("SELECT COUNT(*) AS c FROM admin_destinations")
        total = int(cur.fetchone()["c"])

        would_activate = 0
        would_deactivate = 0
        skip_activate_osm_only = 0
        skip_deactivate_osm_pdf = 0

        for r in rows:
            rid = r["id"]
            active = r["is_active"]
            is_pdf = r["is_osm_pdf"]
            is_only = r["is_osm_only"]

            if rid in matched_ids:
                can_on = (not is_only) or is_pdf
                if can_on and not active:
                    would_activate += 1
                if not can_on:
                    skip_activate_osm_only += 1
            else:
                if is_pdf:
                    if not active:
                        skip_deactivate_osm_pdf += 1
                    continue
                if active:
                    would_deactivate += 1

        print("=== Laporan sinkronisasi whitelist destinasi ===")
        print(f"Total baris whitelist (unik teks): {len(whitelist_raw)}")
        print(f"Total baris di admin_destinations: {total}")
        print(f"ID destinasi cocok dengan daftar: {len(matched_ids)}")
        print(f"Nama whitelist tanpa match: {len(not_found)}")
        print(f"Nama whitelist ambigu (>1 kandidat): {len(ambiguous)}")
        print(f"Perkiraan baris akan di-set AKTIF: {would_activate}")
        print(f"Perkiraan baris akan di-set INAKTIF: {would_deactivate}")
        print(f"Skip aktif (osm only, bukan pdf): {skip_activate_osm_only}")
        print(f"Tetap aktif karena osm+pdf (di luar daftar): {sum(1 for r in rows if r['id'] not in matched_ids and r['is_osm_pdf'])}")

        if not_found:
            print("\n--- Tidak ketemu di DB ---")
            for n in not_found[:80]:
                print(f"  • {n}")
            if len(not_found) > 80:
                print(f"  ... dan {len(not_found) - 80} lainnya")

        if ambiguous:
            print("\n--- Ambigu (perbaiki nama di file) ---")
            for name, cnt in ambiguous[:40]:
                print(f"  • {name} ({cnt} kandidat)")

        if args.dry_run:
            print("\nDry-run: tidak ada perubahan database.")
            return 0

        allow_list = list(matched_ids)

        cur.execute(
            """
            UPDATE admin_destinations d
            SET is_active = TRUE
            WHERE d.id = ANY(%s)
              AND (d.is_osm_only = FALSE OR d.is_osm_pdf = TRUE)
              AND d.is_active IS DISTINCT FROM TRUE
            """,
            (allow_list,),
        )
        activated = cur.rowcount

        cur.execute(
            """
            UPDATE admin_destinations d
            SET is_active = FALSE
            WHERE NOT (d.id = ANY(%s::int[]))
              AND d.is_osm_pdf = FALSE
              AND d.is_active IS DISTINCT FROM FALSE
            """,
            (allow_list,),
        )
        # Fix: when allow_list empty, NOT id = ANY([]) might be wrong in PostgreSQL
        # ANY('{}') is false for all, so all ids not in empty set -> all match. Good.
        deactivated = cur.rowcount

        _sync_destination_source_flags(cur, allow_list)
        _enforce_source_status_rules(cur)

        conn.commit()

        print("\n=== Setelah commit ===")
        print(f"Baris diaktifkan (UPDATE): {activated}")
        print(f"Baris dinonaktifkan (UPDATE): {deactivated}")
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
