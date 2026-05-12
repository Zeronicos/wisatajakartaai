from services.haversine_service import haversine
from services.road_route_service import get_road_leg


def greedy_nearest_neighbor(pois: list[dict], hotel_lat: float, hotel_lon: float) -> dict:
    if not pois:
        return {
            "ordered_route": [],
            "total_distance_m": 0,
            "total_distance_km": 0.0,
        }

    unvisited = pois.copy()
    current_lat = hotel_lat
    current_lon = hotel_lon
    order = 1
    ordered_route = []

    while unvisited:
        min_distance = float("inf")
        nearest_idx = -1
        nearest_poi = None

        for idx, poi in enumerate(unvisited):
            dist = haversine(current_lat, current_lon, poi["latitude"], poi["longitude"])
            if dist < min_distance:
                min_distance = dist
                nearest_idx = idx
                nearest_poi = poi

        ordered_route.append(
            {
                "order": order,
                "poi_id": nearest_poi["poi_id"] if "poi_id" in nearest_poi else nearest_poi["id"],
                "name": nearest_poi["name"],
                "latitude": nearest_poi["latitude"],
                "longitude": nearest_poi["longitude"],
                "distance_from_prev_m": round(min_distance),
                "distance_from_prev_km": round(min_distance / 1000.0, 2),
            }
        )

        current_lat = nearest_poi["latitude"]
        current_lon = nearest_poi["longitude"]
        unvisited.pop(nearest_idx)
        order += 1

    # Setelah urutan GNN didapat, hitung ulang setiap segmen dengan rute jalan asli.
    corrected_total_distance = 0.0
    prev_lat = hotel_lat
    prev_lon = hotel_lon
    for stop in ordered_route:
        current_lat = float(stop["latitude"])
        current_lon = float(stop["longitude"])

        road_leg = get_road_leg(prev_lat, prev_lon, current_lat, current_lon)
        if road_leg["ok"]:
            leg_distance_m = float(road_leg["distance_m"])
            stop["path_points"] = road_leg["path_points"]
            stop["distance_source"] = "road"
        else:
            # Fallback aman jika provider route gagal
            leg_distance_m = haversine(prev_lat, prev_lon, current_lat, current_lon)
            stop["path_points"] = [[prev_lat, prev_lon], [current_lat, current_lon]]
            stop["distance_source"] = "haversine"

        stop["distance_from_prev_m"] = round(leg_distance_m)
        stop["distance_from_prev_km"] = round(leg_distance_m / 1000.0, 2)
        corrected_total_distance += leg_distance_m

        prev_lat = current_lat
        prev_lon = current_lon

    return {
        "ordered_route": ordered_route,
        "total_distance_m": round(corrected_total_distance),
        "total_distance_km": round(corrected_total_distance / 1000.0, 2),
    }
