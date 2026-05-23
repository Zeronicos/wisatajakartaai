import json
import os
from typing import Any, TYPE_CHECKING

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from threading import Lock
import time

from database import get_connection
from geo_utils import normalize_jakarta_coordinate
from poi_visibility_sql import SQL_AND_VISIBLE_IN_ADMIN
from services.embedding_service import cosine_similarity, generate_embedding
from services.query_preference_service import (
    QUERY_UNDETECTED_MESSAGE,
    apply_destination_name_semantic_blend,
    validate_preference_query,
)

router = APIRouter()

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection

COLLECTION_NAME = "poi_session_collection"


def _env_int(name: str, default: int, min_value: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if min_value is not None and value < min_value:
        return min_value
    return value


def _env_float(name: str, default: float, min_value: float | None = None, max_value: float | None = None) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if min_value is not None and value < min_value:
        value = min_value
    if max_value is not None and value > max_value:
        value = max_value
    return value


MIN_QUERY_CHARS = _env_int("SEARCH_MIN_QUERY_CHARS", 5, min_value=2)
MIN_QUERY_ALPHA_RATIO = _env_float("SEARCH_MIN_QUERY_ALPHA_RATIO", 0.55, min_value=0.1, max_value=1.0)
MIN_SEMANTIC_SCORE = _env_float("SEARCH_MIN_SEMANTIC_SCORE", 0.2, min_value=0.0, max_value=1.0)
MIN_CONFIDENT_RESULTS = _env_int("SEARCH_MIN_CONFIDENT_RESULTS", 3, min_value=1)

# Hanya POI dengan embedding yang masih "terlihat" di admin (bukan inactive triple).
_SQL_FROM_SEARCHABLE_POIS = f"""
FROM poi_enriched p
WHERE p.embedding IS NOT NULL
{SQL_AND_VISIBLE_IN_ADMIN}
"""
INDEX_TTL_SECONDS = 300

_index_lock = Lock()


def _new_chroma_client():
    import chromadb

    # Gunakan ephemeral client agar tidak bergantung pada sqlite file lokal
    # yang bisa rusak / tidak kompatibel antar versi.
    return chromadb.EphemeralClient()


_chroma_cached = None


def _get_active_chroma():
    """Lazy init — EphemeralClient berat di Windows; jangan bangun sampai ada request search."""
    global _chroma_cached
    if _chroma_cached is None:
        _chroma_cached = _new_chroma_client()
    return _chroma_cached


def _reset_chroma_client():
    """Client korup atau error — pakai instance baru."""
    global _chroma_cached
    _chroma_cached = _new_chroma_client()


_poi_collection: "Collection | None" = None
_indexed_count = 0
_last_index_refresh = 0.0


class SearchRequest(BaseModel):
    preference: str = Field(min_length=2)
    top_k: int = 50


def _normalize_embedding(raw: Any) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [float(x) for x in parsed]
        except Exception:
            return []
    return []


def _get_poi_count() -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) AS total {_SQL_FROM_SEARCHABLE_POIS}")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return 0
    return int(row["total"])


def _fetch_all_pois():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT p.id, p.name, p.category, p.subcategory, p.latitude, p.longitude,
               p.description, p.district, p.embedding
        {_SQL_FROM_SEARCHABLE_POIS}
        """
    )
    pois = cur.fetchall()
    cur.close()
    conn.close()
    return pois


def _rebuild_collection(pois) -> "Collection":
    client = _get_active_chroma()
    try:
        existing = client.list_collections()
    except Exception:
        # Recovery jika state internal chroma client korup.
        _reset_chroma_client()
        client = _get_active_chroma()
        existing = client.list_collections()
    if any(col.name == COLLECTION_NAME for col in existing):
        client.delete_collection(COLLECTION_NAME)

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    ids = []
    embeddings = []
    metadatas = []
    docs = []
    for poi in pois:
        emb = _normalize_embedding(poi["embedding"])
        if not emb:
            continue
        ids.append(str(poi["id"]))
        embeddings.append(emb)
        normalized = normalize_jakarta_coordinate(poi.get("latitude"), poi.get("longitude"))
        if normalized is None:
            continue
        lat, lon = normalized
        metadatas.append(
            {
                "poi_id": poi["id"],
                "name": poi["name"] or "",
                "category": poi["category"] or "",
                "subcategory": poi["subcategory"] or "",
                "latitude": lat,
                "longitude": lon,
                "district": poi["district"] or "",
            }
        )
        docs.append((poi["description"] or "")[:2000])

    batch_size = 1000
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        collection.add(
            ids=ids[start:end],
            embeddings=embeddings[start:end],
            metadatas=metadatas[start:end],
            documents=docs[start:end],
        )

    return collection


def _get_or_refresh_collection() -> tuple["Collection | None", int]:
    global _poi_collection, _indexed_count, _last_index_refresh

    now = time.time()
    needs_refresh = (
        _poi_collection is None
        or (now - _last_index_refresh) >= INDEX_TTL_SECONDS
    )
    if not needs_refresh:
        return _poi_collection, _indexed_count

    with _index_lock:
        # Double-check setelah mendapatkan lock
        now = time.time()
        needs_refresh = (
            _poi_collection is None
            or (now - _last_index_refresh) >= INDEX_TTL_SECONDS
        )
        if not needs_refresh:
            return _poi_collection, _indexed_count

        current_count = _get_poi_count()
        if _poi_collection is not None and current_count == _indexed_count:
            _last_index_refresh = now
            return _poi_collection, _indexed_count

        pois = _fetch_all_pois()
        if not pois:
            _poi_collection = None
            _indexed_count = 0
            _last_index_refresh = now
            return None, 0

        try:
            _poi_collection = _rebuild_collection(pois)
        except Exception:
            # Retry sekali dengan fresh client untuk kasus schema/table chroma bermasalah.
            _reset_chroma_client()
            _poi_collection = _rebuild_collection(pois)
        _indexed_count = len(pois)
        _last_index_refresh = now
        return _poi_collection, _indexed_count


def _invalidate_collection_cache():
    global _poi_collection, _indexed_count, _last_index_refresh
    _poi_collection = None
    _indexed_count = 0
    _last_index_refresh = 0.0


def invalidate_poi_search_index_cache() -> None:
    """Panggil setelah mengubah admin_destinations.is_active agar indeks Chroma di-rebuild."""
    _invalidate_collection_cache()


def _search_without_chroma(query_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
    pois = _fetch_all_pois()
    rows: list[dict[str, Any]] = []
    for poi in pois:
        emb = _normalize_embedding(poi.get("embedding"))
        if not emb:
            continue
        score = cosine_similarity(query_embedding, emb)
        normalized = normalize_jakarta_coordinate(poi.get("latitude"), poi.get("longitude"))
        if normalized is None:
            continue
        lat, lon = normalized
        rows.append(
            {
                "poi_id": int(poi["id"]),
                "name": poi.get("name") or "",
                "category": poi.get("category") or "",
                "subcategory": poi.get("subcategory") or "",
                "latitude": lat,
                "longitude": lon,
                "description": (poi.get("description") or "")[:2000],
                "district": poi.get("district") or "",
                "semantic_score": round(float(score), 6),
            }
        )
    rows.sort(key=lambda x: x["semantic_score"], reverse=True)
    return rows[: max(1, top_k)]


def _fallback_bounded_pois(top_k: int) -> list[dict[str, Any]]:
    """Jika tidak ada embedding / indeks vektor — tetap kembalikan POI Jakarta dari DB (skor tetap)."""
    from routers.eda import JAKARTA_BOUNDS

    limit = max(1, min(int(top_k), 200))
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT p.id, p.name, p.category, p.subcategory, p.latitude, p.longitude,
               COALESCE(p.description, '') AS description, p.district
        FROM poi_enriched p
        WHERE p.latitude BETWEEN %s AND %s
          AND p.longitude BETWEEN %s AND %s
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
        {SQL_AND_VISIBLE_IN_ADMIN}
        ORDER BY p.id ASC
        LIMIT %s
        """,
        (
            JAKARTA_BOUNDS["min_lat"],
            JAKARTA_BOUNDS["max_lat"],
            JAKARTA_BOUNDS["min_lon"],
            JAKARTA_BOUNDS["max_lon"],
            limit,
        ),
    )
    rows_out: list[dict[str, Any]] = []
    for row in cur.fetchall():
        rows_out.append(
            {
                "poi_id": int(row["id"]),
                "name": row.get("name") or "",
                "category": row.get("category") or "",
                "subcategory": row.get("subcategory") or "",
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "description": (row.get("description") or "")[:2000],
                "district": row.get("district") or "",
                "semantic_score": 0.0,
            }
        )
    cur.close()
    conn.close()
    return rows_out

@router.post("/search")
async def vector_similarity_search(request: SearchRequest):
    try:
        query_embedding = generate_embedding(request.preference)
        ok, validation_message, _hints = validate_preference_query(
            request.preference,
            min_chars=MIN_QUERY_CHARS,
            min_alpha_ratio=MIN_QUERY_ALPHA_RATIO,
            query_embedding=query_embedding or None,
        )
        if not ok:
            return {
                "status": "error",
                "message": validation_message or QUERY_UNDETECTED_MESSAGE,
                "total_candidates": 0,
                "top_k": request.top_k,
                "results": [],
            }

        fallback_used = False
        rows: list[dict[str, Any]] = []

        if query_embedding:
            try:
                collection, indexed_count = _get_or_refresh_collection()
                if collection is not None and indexed_count > 0:
                    n_results = min(max(request.top_k, 1), indexed_count)
                    try:
                        result = collection.query(
                            query_embeddings=[query_embedding], n_results=n_results
                        )
                    except Exception:
                        _invalidate_collection_cache()
                        collection, indexed_count = _get_or_refresh_collection()
                        if collection is not None and indexed_count > 0:
                            n_results = min(max(request.top_k, 1), indexed_count)
                            result = collection.query(
                                query_embeddings=[query_embedding], n_results=n_results
                            )
                        else:
                            result = None

                    if result is not None:
                        metadatas_out = result.get("metadatas", [[]])[0]
                        documents_out = result.get("documents", [[]])[0]
                        distances_out = result.get("distances", [[]])[0]
                        for meta, doc, distance in zip(
                            metadatas_out, documents_out, distances_out
                        ):
                            normalized = normalize_jakarta_coordinate(meta["latitude"], meta["longitude"])
                            if normalized is None:
                                continue
                            lat, lon = normalized
                            rows.append(
                                {
                                    "poi_id": int(meta["poi_id"]),
                                    "name": meta["name"],
                                    "category": meta["category"],
                                    "subcategory": meta["subcategory"],
                                    "latitude": lat,
                                    "longitude": lon,
                                    "description": doc or "",
                                    "district": meta["district"],
                                    "semantic_score": round(float(1.0 - distance), 6),
                                }
                            )
            except Exception:
                rows = []

            if not rows:
                rows = _search_without_chroma(query_embedding, request.top_k)

        # Tanpa embedding query (Ollama mati / error) atau semua jalur vektor kosong.
        # Demi kualitas rekomendasi, jangan lanjutkan pipeline dengan hasil tanpa ranking semantic.
        if not rows:
            rows = _fallback_bounded_pois(request.top_k)
            if rows:
                fallback_used = True

        if not rows:
            return {
                "status": "error",
                "message": (
                    "Tidak ada baris destinasi dalam `poi_enriched` di wilayah Jakarta, "
                    "atau gagal akses basis data. Pastikan data sudah diimpor dan skema "
                    "sesuai. Untuk ranking vektor, isi kolom embedding (skrip generate_embeddings) "
                    "dan jalankan Ollama dengan model `nomic-embed-text`."
                ),
                "total_candidates": 0,
                "top_k": request.top_k,
                "results": [],
            }

        rows = apply_destination_name_semantic_blend(rows, request.preference)

        # Hanya lanjutkan hasil dengan confidence semantic yang cukup.
        confident_rows = [row for row in rows if float(row.get("semantic_score", 0.0)) >= MIN_SEMANTIC_SCORE]
        if len(confident_rows) < min(MIN_CONFIDENT_RESULTS, max(1, request.top_k)):
            return {
                "status": "error",
                "message": (
                    "Kecocokan semantic terlalu rendah untuk dijadikan rekomendasi optimal. "
                    "Mohon perjelas preferensi (contoh: tema wisata, suasana, akses transportasi)."
                ),
                "total_candidates": len(confident_rows),
                "top_k": request.top_k,
                "results": [],
            }

        resp: dict[str, Any] = {
            "status": "success",
            "total_candidates": len(confident_rows),
            "top_k": request.top_k,
            "results": confident_rows[: request.top_k],
        }
        if fallback_used:
            return {
                "status": "error",
                "message": (
                    "Embedding query gagal atau indeks semantic tidak siap. "
                    "Demi menjaga kualitas, hasil tanpa semantic ranking tidak ditampilkan sebagai rekomendasi."
                ),
                "total_candidates": 0,
                "top_k": request.top_k,
                "results": [],
            }
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
