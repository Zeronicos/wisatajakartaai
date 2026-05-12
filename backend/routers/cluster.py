import math
from typing import Any, List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.kmeans_service import find_optimal_k, intelligent_kmeans, standard_kmeans, zscore_normalize

router = APIRouter()


def _metric_round(x: Any, ndigits: int = 4) -> float:
    """Hindari OverflowError dari round(inf/nan); metrik clustering kadang inf untuk satu-cluster."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(v):
        return 0.0
    return round(v, ndigits)


class ClusterRequest(BaseModel):
    feature_matrix: List[List[float]]
    enriched_pois: List[dict[str, Any]]
    num_days: int = Field(ge=1, le=7)
    hotel_lat: float
    hotel_lon: float


@router.post("/cluster")
async def run_intelligent_kmeans(request: ClusterRequest):
    try:
        if not request.feature_matrix or not request.enriched_pois:
            stub_eval = {
                "silhouette_score": 0.0,
                "davies_bouldin_index": 0.0,
                "wcss": 0.0,
                "k_optimal": 0,
                "iterations": 0,
            }
            return {
                "status": "error",
                "message": "feature_matrix dan enriched_pois tidak boleh kosong.",
                "clusters": {},
                "evaluation": stub_eval,
                "baseline_evaluation": stub_eval,
                "k_analysis": {
                    "k_range": [],
                    "wcss_values": [],
                    "silhouette_values": [],
                },
            }

        data = np.array(request.feature_matrix, dtype=float)
        normalized_data, _ = zscore_normalize(data.tolist())

        if len(normalized_data) == 1:
            only = request.enriched_pois[0]
            single_eval = {
                "silhouette_score": 0.0,
                "davies_bouldin_index": 0.0,
                "wcss": 0.0,
                "k_optimal": 1,
                "iterations": 1,
            }
            return {
                "status": "success",
                "clusters": {
                    "0": {
                        "day": 1,
                        "pois": [only],
                        "summary": {
                            "member_count": 1,
                            "avg_semantic_score": round(float(only["semantic_score"]), 4),
                            "avg_dist_to_stop_m": int(only["dist_to_stop_m"]),
                            "avg_resto_count": float(only["resto_count"]),
                            "dominant_category": only["subcategory"],
                        },
                    }
                },
                "evaluation": single_eval,
                "baseline_evaluation": single_eval,
                "k_analysis": {
                    "k_range": [1],
                    "wcss_values": [0.0],
                    "silhouette_values": [0.0],
                },
            }

        k_analysis = find_optimal_k(normalized_data, request.num_days)
        optimal_k = int(min(k_analysis["optimal_k"], request.num_days))

        kmeans_result = intelligent_kmeans(normalized_data, optimal_k)
        baseline_result = standard_kmeans(normalized_data, optimal_k)
        labels = kmeans_result["labels"]

        clusters = {}
        for cluster_id in range(optimal_k):
            cluster_pois = [
                request.enriched_pois[idx]
                for idx, label in enumerate(labels)
                if int(label) == cluster_id
            ]
            if not cluster_pois:
                continue

            avg_semantic = sum(float(p["semantic_score"]) for p in cluster_pois) / len(cluster_pois)
            avg_dist_stop = sum(float(p["dist_to_stop_m"]) for p in cluster_pois) / len(cluster_pois)
            avg_resto = sum(float(p["resto_count"]) for p in cluster_pois) / len(cluster_pois)
            categories = [str(p["subcategory"]) for p in cluster_pois]
            dominant_category = max(set(categories), key=categories.count)

            clusters[str(cluster_id)] = {
                "day": cluster_id + 1,
                "pois": cluster_pois,
                "summary": {
                    "member_count": len(cluster_pois),
                    "avg_semantic_score": round(avg_semantic, 4),
                    "avg_dist_to_stop_m": round(avg_dist_stop),
                    "avg_resto_count": round(avg_resto, 2),
                    "dominant_category": dominant_category,
                },
            }

        return {
            "status": "success",
            "clusters": clusters,
            "evaluation": {
                "silhouette_score": _metric_round(kmeans_result["silhouette_score"]),
                "davies_bouldin_index": _metric_round(kmeans_result["davies_bouldin_index"]),
                "wcss": _metric_round(kmeans_result["wcss"]),
                "k_optimal": optimal_k,
                "iterations": int(kmeans_result["iterations"]),
            },
            "baseline_evaluation": {
                "silhouette_score": _metric_round(baseline_result["silhouette_score"]),
                "davies_bouldin_index": _metric_round(baseline_result["davies_bouldin_index"]),
                "wcss": _metric_round(baseline_result["wcss"]),
                "k_optimal": optimal_k,
                "iterations": int(baseline_result["iterations"]),
            },
            "k_analysis": {
                "k_range": k_analysis["k_range"],
                "wcss_values": k_analysis["wcss_values"],
                "silhouette_values": k_analysis["silhouette_values"],
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
