from services.road_route_service import get_road_distance_matrix, get_road_leg


def _poi_id(poi: dict) -> int:
    return poi["poi_id"] if "poi_id" in poi else poi["id"]


def greedy_nearest_neighbor(pois: list[dict], hotel_lat: float, hotel_lon: float) -> dict:
    if not pois:
        return {
            "ordered_route": [],
            "total_distance_m": 0,
            "total_distance_km": 0.0,
        }

    coords = [(float(hotel_lat), float(hotel_lon))]
    for poi in pois:
        coords.append((float(poi["latitude"]), float(poi["longitude"])))

    matrix_result = get_road_distance_matrix(coords, fallback_haversine=False)
    if not matrix_result.get("ok"):
        raise RuntimeError(matrix_result.get("error") or "Gagal mengambil matriks jarak OSRM.")

    distances_km = matrix_result["distances_km"]
    n_pois = len(pois)
    unvisited = set(range(n_pois))
    current_matrix_idx = 0
    visit_order: list[int] = []

    while unvisited:
        best_poi_idx = -1
        best_dist_m = float("inf")
        for poi_idx in unvisited:
            matrix_j = poi_idx + 1
            dist_m = float(distances_km[current_matrix_idx][matrix_j]) * 1000.0
            if dist_m < best_dist_m:
                best_dist_m = dist_m
                best_poi_idx = poi_idx
        visit_order.append(best_poi_idx)
        current_matrix_idx = best_poi_idx + 1
        unvisited.remove(best_poi_idx)

    ordered_route = []
    corrected_total_distance = 0.0
    prev_lat = float(hotel_lat)
    prev_lon = float(hotel_lon)

    for order, poi_idx in enumerate(visit_order, start=1):
        poi = pois[poi_idx]
        current_lat = float(poi["latitude"])
        current_lon = float(poi["longitude"])

        road_leg = get_road_leg(prev_lat, prev_lon, current_lat, current_lon)
        if not road_leg["ok"]:
            poi_name = poi.get("name", "destinasi")
            raise RuntimeError(f"OSRM route gagal untuk segmen menuju {poi_name}.")

        leg_distance_m = float(road_leg["distance_m"])
        ordered_route.append(
            {
                "order": order,
                "poi_id": _poi_id(poi),
                "name": poi["name"],
                "latitude": current_lat,
                "longitude": current_lon,
                "distance_from_prev_m": round(leg_distance_m),
                "distance_from_prev_km": round(leg_distance_m / 1000.0, 2),
                "path_points": road_leg["path_points"],
                "distance_source": "road",
            }
        )
        corrected_total_distance += leg_distance_m
        prev_lat = current_lat
        prev_lon = current_lon

    return {
        "ordered_route": ordered_route,
        "total_distance_m": round(corrected_total_distance),
        "total_distance_km": round(corrected_total_distance / 1000.0, 2),
    }
