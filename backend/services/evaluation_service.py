def precision_at_k(retrieved: list[dict], relevant: list[int], k: int) -> float:
    if k <= 0:
        return 0.0
    top_k = retrieved[:k]
    relevant_set = set(relevant)
    relevant_in_top_k = sum(1 for item in top_k if item["poi_id"] in relevant_set)
    return round(relevant_in_top_k / k, 4)


def recall_at_k(retrieved: list[dict], relevant: list[int], k: int) -> float:
    if not relevant:
        return 0.0
    top_k = retrieved[:k]
    relevant_set = set(relevant)
    relevant_in_top_k = sum(1 for item in top_k if item["poi_id"] in relevant_set)
    return round(relevant_in_top_k / len(relevant), 4)


def mean_reciprocal_rank(queries_results: list[dict]) -> float:
    if not queries_results:
        return 0.0

    reciprocal_ranks = []
    for query_result in queries_results:
        retrieved = query_result.get("retrieved", [])
        relevant_set = set(query_result.get("relevant", []))
        rank = 0
        for idx, item in enumerate(retrieved, start=1):
            if item["poi_id"] in relevant_set:
                rank = idx
                break
        reciprocal_ranks.append(1.0 / rank if rank > 0 else 0.0)

    return round(sum(reciprocal_ranks) / len(reciprocal_ranks), 4)
