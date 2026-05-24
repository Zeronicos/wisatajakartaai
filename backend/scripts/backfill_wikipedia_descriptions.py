"""Isi poi_enriched.description dari Wikipedia untuk POI yang belum punya deskripsi."""

from __future__ import annotations

import argparse

from database import get_connection
from services.wikipedia_description_service import fetch_wikipedia_description


def fetch_rows(limit: int | None, only_missing: bool) -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()
    where_clause = "WHERE description IS NULL OR TRIM(description) = ''" if only_missing else ""
    limit_clause = f"LIMIT {int(limit)}" if limit is not None else ""
    cur.execute(
        f"""
        SELECT id, name, district
        FROM poi_enriched
        {where_clause}
        ORDER BY id
        {limit_clause}
        """
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def update_description(poi_id: int, description: str) -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE poi_enriched SET description = %s WHERE id = %s", (description, poi_id))
    conn.commit()
    cur.close()
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill deskripsi POI dari Wikipedia.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--only-missing", action="store_true", default=True)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--continue-on-error", action="store_true")
    parser.add_argument(
        "--write-ids",
        type=str,
        default=None,
        help="Simpan poi_id yang berhasil di-update ke file (untuk langkah embedding berikutnya).",
    )
    args = parser.parse_args()

    only_missing = not args.overwrite if args.overwrite else args.only_missing
    rows = fetch_rows(args.limit, only_missing=only_missing)
    print(f"POI diproses: {len(rows)}")

    ok = 0
    miss = 0
    fail = 0
    updated_ids: list[int] = []
    for idx, row in enumerate(rows, start=1):
        name = str(row.get("name") or "").strip()
        district = str(row.get("district") or "").strip() or None
        try:
            result = fetch_wikipedia_description(name, district=district)
            if not result:
                miss += 1
                print(f"[{idx}/{len(rows)}] skip id={row['id']} ({name}) — artikel tidak ditemukan")
                continue
            update_description(int(row["id"]), result.description)
            updated_ids.append(int(row["id"]))
            ok += 1
            print(f"[{idx}/{len(rows)}] updated id={row['id']} ({name}) via {result.language}:{result.title}")
        except Exception as exc:
            fail += 1
            print(f"[{idx}/{len(rows)}] gagal id={row['id']}: {exc}")
            if not args.continue_on_error:
                break

    print(f"Backfill Wikipedia selesai. updated={ok}, not_found={miss}, failed={fail}")
    if updated_ids:
        print(f"POI terupdate: {','.join(str(item) for item in updated_ids)}")
    if args.write_ids and updated_ids:
        from pathlib import Path

        output_path = Path(args.write_ids)
        output_path.write_text(",".join(str(item) for item in updated_ids), encoding="utf-8")
        print(f"Daftar poi_id disimpan ke {output_path}")


if __name__ == "__main__":
    main()
