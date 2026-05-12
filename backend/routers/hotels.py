from fastapi import APIRouter, HTTPException, Query

from database import get_connection
from geo_utils import normalize_jakarta_coordinate

router = APIRouter()

# Akomodasi / penginapan (ID + EN) — data admin kosong tidak masalah: sumber utama poi_enriched.
_ACCOMM_REGEX = (
    "(hotel|penginapan|losmen|resort|hostel|motel|homestay|villa|guesthouse|"
    "guest house|guest-house|penginap|akomodasi|apartment|apartemen|inn|bungalow|suite)"
)


@router.get("/hotels")
async def list_hotels(
    q: str = Query(default="", description="Keyword pencarian hotel"),
    limit: int = Query(default=50, ge=1, le=200),
):
    try:
        conn = get_connection()
        cur = conn.cursor()

        kw_stripped = (q or "").strip()
        if kw_stripped:
            keyword = f"%{kw_stripped}%"
            text_filter_sql = "(name ILIKE %s OR district ILIKE %s OR description ILIKE %s)"
            kw_params = [keyword, keyword, keyword]
        else:
            text_filter_sql = "TRUE"
            kw_params = []

        cur.execute(
            f"""
            SELECT id, name, category, subcategory, latitude, longitude, district
            FROM poi_enriched
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND (
                   COALESCE(subcategory, '') ~* %s
                OR COALESCE(category, '') ~* %s
                OR COALESCE(name, '') ~* %s
                OR COALESCE(description, '') ~* %s
              )
              AND ({text_filter_sql})
            ORDER BY name ASC
            LIMIT %s
            """,
            (
                _ACCOMM_REGEX,
                _ACCOMM_REGEX,
                _ACCOMM_REGEX,
                _ACCOMM_REGEX,
                *kw_params,
                limit,
            ),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        hotels = []
        for row in rows:
            normalized = normalize_jakarta_coordinate(row["latitude"], row["longitude"])
            if normalized is None:
                continue
            lat, lon = normalized
            hotels.append(
                {
                    "id": int(row["id"]),
                    "name": row["name"] or "Hotel tanpa nama",
                    "category": row["category"] or "",
                    "subcategory": row["subcategory"] or "",
                    "latitude": lat,
                    "longitude": lon,
                    "district": row["district"] or "",
                }
            )

        return {
            "status": "success",
            "total": len(hotels),
            "results": hotels,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": str(e)})
