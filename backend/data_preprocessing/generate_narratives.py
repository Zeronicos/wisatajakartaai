import argparse

import ollama

from database import get_connection


PROMPT_TEMPLATE = """
Anda adalah asisten wisata Jakarta.
Tulis deskripsi singkat (maksimal 2 kalimat, bahasa Indonesia) untuk POI berikut:

Nama: {name}
Kategori: {category}
Subkategori: {subcategory}
Wilayah: {district}

Fokus pada daya tarik wisata dan suasana tempat.
""".strip()


def fetch_rows(limit: int | None) -> list[dict]:
    conn = get_connection()
    cur = conn.cursor()
    limit_clause = f"LIMIT {int(limit)}" if limit is not None else ""
    cur.execute(
        f"""
        SELECT id, name, category, subcategory, district
        FROM poi_enriched
        WHERE description IS NULL OR TRIM(description) = ''
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
    parser = argparse.ArgumentParser(description="Generate narrative descriptions via Ollama llama3.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--continue-on-error", action="store_true")
    args = parser.parse_args()

    rows = fetch_rows(args.limit)
    print(f"POI tanpa deskripsi: {len(rows)}")

    ok = 0
    fail = 0
    for idx, row in enumerate(rows, start=1):
        prompt = PROMPT_TEMPLATE.format(
            name=row["name"] or "-",
            category=row["category"] or "-",
            subcategory=row["subcategory"] or "-",
            district=row["district"] or "-",
        )
        try:
            resp = ollama.generate(model="llama3", prompt=prompt)
            text = (resp.get("response", "") or "").strip()
            if not text:
                raise RuntimeError("Empty response from llama3")
            update_description(row["id"], text)
            ok += 1
            if idx % 20 == 0 or idx == len(rows):
                print(f"Progress {idx}/{len(rows)} | updated={ok} failed={fail}")
        except Exception as exc:
            fail += 1
            print(f"[{idx}/{len(rows)}] gagal id={row['id']}: {exc}")
            if not args.continue_on_error:
                break

    print(f"Narrative generation selesai. updated={ok}, failed={fail}")


if __name__ == "__main__":
    main()
