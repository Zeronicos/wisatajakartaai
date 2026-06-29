from typing import Any, List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.gnn_service import greedy_nearest_neighbor
from services.road_route_service import get_road_distance_matrix, get_walk_leg

router = APIRouter()


class DistanceMatrixPoint(BaseModel):
    lat: float
    lon: float


class DistanceMatrixRequest(BaseModel):
    points: List[DistanceMatrixPoint]


@router.post("/route/distance-matrix")
async def road_distance_matrix(body: DistanceMatrixRequest):
    """
    Matriks jarak untuk analisis/perbandingan (OSRM Table + fallback Haversine per sel).
    """
    coords = [(p.lat, p.lon) for p in body.points]
    result = get_road_distance_matrix(coords)
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail={
                "status": "error",
                "message": result.get("error", "Permintaan matriks jarak ditolak."),
            },
        )
    return {
        "status": "success",
        "distances_km": result["distances_km"],
        "sources": result["sources"],
        "provider": result.get("provider", "unknown"),
        "note": result.get("note"),
    }


@router.get("/route/walk-leg")
async def walk_leg_route(
    from_lat: float = Query(...),
    from_lon: float = Query(...),
    to_lat: float = Query(...),
    to_lon: float = Query(...),
):
    """Polyline jalan kaki antar dua titik (OSRM profil foot)."""
    result = get_walk_leg(from_lat, from_lon, to_lat, to_lon)
    return {
        "status": "success",
        "ok": bool(result.get("ok")),
        "distance_m": float(result.get("distance_m") or 0),
        "path_points": result.get("path_points") or [],
        "provider": "osrm_foot",
    }


class RouteRequest(BaseModel):
    selected_pois: List[dict[str, Any]]
    hotel_lat: float
    hotel_lon: float
    day: int


@router.post("/route")
async def optimize_daily_route(request: RouteRequest):
    """
    Optimasi urutan harian via Greedy Nearest Neighbor dengan jarak OSRM
    (Table untuk pemilihan urutan, Route API untuk polyline & jarak segmen).
    """
    try:
        route_result = greedy_nearest_neighbor(
            pois=request.selected_pois,
            hotel_lat=request.hotel_lat,
            hotel_lon=request.hotel_lon,
        )

        return {
            "status": "success",
            "routing_provider": "osrm",
            "day": request.day,
            "hotel": {
                "lat": request.hotel_lat,
                "lon": request.hotel_lon,
            },
            "ordered_route": route_result["ordered_route"],
            "total_distance_m": route_result["total_distance_m"],
            "total_distance_km": route_result["total_distance_km"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
