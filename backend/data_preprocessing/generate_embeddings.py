import argparse
import sys
import time
from pathlib import Path

# Memungkinkan `python data_preprocessing/generate_embeddings.py` dari folder backend:
# secara default cwd yang dipakai impor adalah folder skrip ini, bukan backend.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from database import get_connection
from services.embedding_service import build_poi_text, generate_embedding


def fetch_poi_rows(limit: int | None, only_missing: bool) -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()
    where_clause = "WHERE embedding IS NULL" if only_missing else ""
    limit_clause = f"LIMIT {int(limit)}" if limit is not None else ""
    cur.execute(
        f"""
        SELECT id, name, category, subcategory, description
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate POI embeddings with Ollama nomic-embed-text.")
    parser.add_argument("--limit", type=int, default=None, help="Batasi jumlah baris (untuk test).")
    parser.add_argument("--only-missing", action="store_true", help="Embed hanya baris yang embedding-nya NULL.")
    parser.add_argument("--sleep-ms", type=int, default=0, help="Delay antar request embedding.")
    parser.add_argument("--continue-on-error", action="store_true", help="Lanjut walau ada baris gagal.")
    args = parser.parse_args()

    rows = fetch_poi_rows(args.limit, args.only_missing)
    total = len(rows)
    print(f"Total POI untuk embedding: {total}", flush=True)

    success = 0
    failed = 0
    conn = get_connection()
    cur = conn.cursor()

    for idx, row in enumerate(rows, start=1):
        text = build_poi_text(row)
        try:
            emb = generate_embedding(text)
            if not emb:
                raise RuntimeError("Empty embedding response")
            cur.execute("UPDATE poi_enriched SET embedding = %s WHERE id = %s", (emb, row["id"]))
            success += 1
        except Exception as exc:
            failed += 1
            print(f"[{idx}/{total}] gagal id={row['id']} name={row['name']}: {exc}", flush=True)
            if not args.continue_on_error:
                break

        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000.0)

        if idx % 50 == 0:
            conn.commit()
            print(f"Progress {idx}/{total} | success={success} failed={failed}", flush=True)
        elif idx == total:
            print(f"Progress {idx}/{total} | success={success} failed={failed}", flush=True)

    conn.commit()
    cur.close()
    conn.close()

    print("Embedding selesai.", flush=True)
    print(f"Success={success} Failed={failed}", flush=True)


if __name__ == "__main__":
    main()
