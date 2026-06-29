from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_connection
from services.gtfs_route_lines_service import load_active_bus_route_lines
from services.transit_itinerary_service import build_itinerary_transit

router = APIRouter()


class TransitStopPoint(BaseModel):
    poi_id: int | None = None
    name: str = Field(min_length=1, max_length=500)
    latitude: float
    longitude: float


class TransitDayPayload(BaseModel):
    day: int = Field(ge=1, le=60)
    stops: list[TransitStopPoint] = Field(default_factory=list)


class TransitItineraryRequest(BaseModel):
    hotel_lat: float
    hotel_lon: float
    hotel_name: str | None = Field(default=None, max_length=300)
    days: list[TransitDayPayload] = Field(default_factory=list)


@router.get("/transit/gtfs-route-lines")
async def get_gtfs_route_lines():
    """Jalur GTFS rute bus aktif — sama dengan layer Jalur Bus TJ di EDA."""
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        routes, route_type_summary = load_active_bus_route_lines(cur)
        return {
            "status": "success",
            "routes": routes,
            "route_type_summary": route_type_summary,
            "total": len(routes),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)}) from exc
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@router.post("/transit/itinerary-suggestions")
async def get_transit_itinerary_suggestions(payload: TransitItineraryRequest):
    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        days = build_itinerary_transit(
            cur,
            hotel_lat=payload.hotel_lat,
            hotel_lon=payload.hotel_lon,
            hotel_name=(payload.hotel_name or "Hotel").strip() or "Hotel",
            days=[day.model_dump() for day in payload.days],
        )
        return {"status": "success", "days": days}
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(exc)}) from exc
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
