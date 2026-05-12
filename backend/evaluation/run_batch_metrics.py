import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import error, request


def post_json(url: str, payload: dict[str, Any], timeout_sec: int = 120) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=timeout_sec) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text)
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} for {url}: {detail}") from exc


def parse_k_values(raw: str) -> list[int]:
    values = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        num = int(part)
        if num <= 0:
            raise ValueError("Semua K harus > 0")
        values.append(num)
    if not values:
        raise ValueError("Minimal ada satu nilai K")
    return sorted(set(values))


def read_test_cases(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or len(data) == 0:
        raise ValueError("File test case harus berupa array JSON dan tidak boleh kosong.")

    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Item ke-{idx} harus objek JSON.")

        query = str(item.get("query", "")).strip()
        if len(query) < 2:
            raise ValueError(f"Item ke-{idx} query terlalu pendek.")

        label = str(item.get("label", f"Q{idx}")).strip() or f"Q{idx}"
        rel_raw = item.get("relevant_poi_ids", [])
        if not isinstance(rel_raw, list):
            raise ValueError(f"Item ke-{idx} relevant_poi_ids harus array.")
        relevant_ids = [int(x) for x in rel_raw]

        normalized.append(
            {
                "case_id": idx,
                "label": label,
                "query": query,
                "relevant_poi_ids": relevant_ids,
            }
        )
    return normalized


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluasi batch Precision@K, Recall@K, MRR untuk beberapa query uji."
    )
    parser.add_argument(
        "--test-cases",
        required=True,
        help="Path file JSON test case (lihat template).",
    )
    parser.add_argument(
        "--api-base",
        default="http://127.0.0.1:8000/api",
        help="Base URL API backend.",
    )
    parser.add_argument(
        "--top-k-search",
        type=int,
        default=100,
        help="Jumlah kandidat yang diambil dari endpoint /search.",
    )
    parser.add_argument(
        "--k-values",
        default="5,10,20",
        help="Daftar K untuk evaluasi, dipisah koma. Contoh: 5,10,20",
    )
    parser.add_argument(
        "--output-dir",
        default="evaluation_outputs",
        help="Folder output hasil evaluasi.",
    )
    parser.add_argument(
        "--timeout-sec",
        type=int,
        default=180,
        help="Timeout request API per call (detik).",
    )
    args = parser.parse_args()

    test_cases = read_test_cases(Path(args.test_cases))
    k_values = parse_k_values(args.k_values)
    if args.top_k_search < max(k_values):
        raise ValueError("top-k-search harus >= nilai K terbesar agar evaluasi valid.")

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_root = Path(args.output_dir) / f"batch_eval_{run_id}"
    ensure_dir(out_root)

    query_rows: list[dict[str, Any]] = []
    raw_dump: dict[str, Any] = {"run_id": run_id, "config": vars(args), "cases": []}

    for case in test_cases:
        search_resp = post_json(
            f"{args.api_base}/search",
            {"preference": case["query"], "top_k": args.top_k_search},
            timeout_sec=args.timeout_sec,
        )
        if search_resp.get("status") != "success":
            raise RuntimeError(f"Search gagal untuk case {case['label']}: {search_resp}")

        retrieved = search_resp.get("results", [])
        case_dump = {
            "case_id": case["case_id"],
            "label": case["label"],
            "query": case["query"],
            "relevant_poi_ids": case["relevant_poi_ids"],
            "retrieved_count": len(retrieved),
            "top10_retrieved_ids": [item.get("poi_id") for item in retrieved[:10]],
            "per_k": {},
        }

        for k in k_values:
            eval_resp = post_json(
                f"{args.api_base}/evaluate",
                {
                    "query": case["query"],
                    "top_k_results": retrieved,
                    "ground_truth_relevant": case["relevant_poi_ids"],
                    "k": k,
                },
                timeout_sec=args.timeout_sec,
            )
            if eval_resp.get("status") != "success":
                raise RuntimeError(f"Evaluate gagal untuk case {case['label']} K={k}: {eval_resp}")

            row = {
                "case_id": case["case_id"],
                "label": case["label"],
                "query": case["query"],
                "k": k,
                "retrieved_count": len(retrieved),
                "relevant_count": len(case["relevant_poi_ids"]),
                "precision_at_k": eval_resp["precision_at_k"],
                "recall_at_k": eval_resp["recall_at_k"],
                "mrr": eval_resp["mrr"],
            }
            query_rows.append(row)
            case_dump["per_k"][str(k)] = row

        raw_dump["cases"].append(case_dump)

    summary_rows: list[dict[str, Any]] = []
    for k in k_values:
        rows_k = [r for r in query_rows if r["k"] == k]
        # Agar hemat request, bentuk data mrr dari hasil yang sudah ada di rows_k.
        # MRR global per K secara matematis sama dengan rata-rata reciprocal rank per query.
        mrr_global = avg([float(r["mrr"]) for r in rows_k])

        summary_rows.append(
            {
                "k": k,
                "num_queries": len(rows_k),
                "avg_precision_at_k": avg([float(r["precision_at_k"]) for r in rows_k]),
                "avg_recall_at_k": avg([float(r["recall_at_k"]) for r in rows_k]),
                "mrr": mrr_global,
            }
        )

    query_csv = out_root / "query_level_metrics.csv"
    summary_csv = out_root / "summary_by_k.csv"
    raw_json = out_root / "raw_results.json"

    write_csv(
        query_csv,
        [
            "case_id",
            "label",
            "query",
            "k",
            "retrieved_count",
            "relevant_count",
            "precision_at_k",
            "recall_at_k",
            "mrr",
        ],
        query_rows,
    )
    write_csv(
        summary_csv,
        ["k", "num_queries", "avg_precision_at_k", "avg_recall_at_k", "mrr"],
        summary_rows,
    )
    raw_json.write_text(json.dumps(raw_dump, indent=2, ensure_ascii=False), encoding="utf-8")

    print("Batch evaluasi selesai.")
    print(f"- Query-level CSV : {query_csv}")
    print(f"- Summary CSV     : {summary_csv}")
    print(f"- Raw JSON        : {raw_json}")
    print("\nRingkasan per K:")
    for row in summary_rows:
        print(
            f"K={row['k']:<3} | Q={row['num_queries']:<3} | "
            f"P@K={row['avg_precision_at_k']:.4f} | "
            f"R@K={row['avg_recall_at_k']:.4f} | "
            f"MRR={row['mrr']:.4f}"
        )


if __name__ == "__main__":
    main()
