from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_connection
from services.haversine_service import haversine

router = APIRouter()


class POIItem(BaseModel):
    poi_id: int
    name: str
    latitude: float
    longitude: float
    semantic_score: float
    category: str
    subcategory: str
    description: str
    district: str


class FeatureRequest(BaseModel):
    poi_candidates: List[POIItem]
    hotel_lat: float
    hotel_lon: float


@router.post("/features")
async def extract_spatial_features(request: FeatureRequest):
    try:
        if not request.poi_candidates:
            return {
                "status": "error",
                "message": "Tidak ada kandidat POI dari pencarian (langkah Search kosong).",
                "feature_matrix": [],
                "enriched_pois": [],
            }

        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT stop_name, stop_lat, stop_lon FROM stops")
        stops = cur.fetchall()

        cur.execute("SELECT latitude, longitude FROM restaurants")
        restaurants = cur.fetchall()

        cur.execute("SELECT latitude, longitude FROM minimarkets")
        minimarkets = cur.fetchall()

        cur.close()
        conn.close()

        feature_matrix = []
        enriched_pois = []

        for poi in request.poi_candidates:
            dist_hotel = haversine(poi.latitude, poi.longitude, request.hotel_lat, request.hotel_lon)

            nearest_stop_name = "-"
            dist_stop = 99999.0
            if stops:
                for stop in stops:
                    current_dist = haversine(poi.latitude, poi.longitude, stop["stop_lat"], stop["stop_lon"])
                    if current_dist < dist_stop:
                        dist_stop = current_dist
                        nearest_stop_name = (stop.get("stop_name") or "-").strip() or "-"

            resto_count = sum(
                1
                for restaurant in restaurants
                if haversine(
                    poi.latitude,
                    poi.longitude,
                    restaurant["latitude"],
                    restaurant["longitude"],
                )
                <= 500
            )

            minimarket_count = sum(
                1
                for minimarket in minimarkets
                if haversine(
                    poi.latitude,
                    poi.longitude,
                    minimarket["latitude"],
                    minimarket["longitude"],
                )
                <= 500
            )

            features = [
                poi.latitude,
                poi.longitude,
                poi.semantic_score,
                dist_hotel,
                dist_stop,
                resto_count,
                minimarket_count,
            ]
            feature_matrix.append(features)
            enriched_pois.append(
                {
                    **poi.model_dump(),
                    "dist_to_hotel_m": round(dist_hotel),
                    "dist_to_stop_m": round(dist_stop),
                    "nearest_stop_name": nearest_stop_name,
                    "resto_count": resto_count,
                    "minimarket_count": minimarket_count,
                }
            )

        return {
            "status": "success",
            "feature_matrix": feature_matrix,
            "enriched_pois": enriched_pois,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
