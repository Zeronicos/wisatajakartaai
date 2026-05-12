from typing import Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.evaluation_service import mean_reciprocal_rank, precision_at_k, recall_at_k

router = APIRouter()


class EvaluateRequest(BaseModel):
    query: str
    top_k_results: List[dict[str, Any]]
    ground_truth_relevant: List[int]
    k: int = 10


class MRRRequest(BaseModel):
    queries_results: List[dict[str, Any]]


@router.post("/evaluate")
async def evaluate_recommendation(request: EvaluateRequest):
    try:
        prec = precision_at_k(request.top_k_results, request.ground_truth_relevant, request.k)
        rec = recall_at_k(request.top_k_results, request.ground_truth_relevant, request.k)

        # Untuk evaluasi satu query, MRR = reciprocal rank item relevan pertama.
        single_query_mrr = mean_reciprocal_rank(
            [
                {
                    "retrieved": request.top_k_results,
                    "relevant": request.ground_truth_relevant,
                }
            ]
        )

        return {
            "status": "success",
            "query": request.query,
            "k": request.k,
            "precision_at_k": prec,
            "recall_at_k": rec,
            "mrr": single_query_mrr,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})


@router.post("/evaluate/mrr")
async def evaluate_mrr(request: MRRRequest):
    try:
        mrr_score = mean_reciprocal_rank(request.queries_results)
        return {
            "status": "success",
            "total_queries": len(request.queries_results),
            "mrr": mrr_score,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
