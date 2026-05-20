CREATE TABLE IF NOT EXISTS poi_enriched (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR,
    name VARCHAR,
    category VARCHAR,
    subcategory VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    nearest_stop_name VARCHAR,
    description TEXT,
    phone VARCHAR,
    website VARCHAR,
    district VARCHAR,
    source VARCHAR,
    embedding DOUBLE PRECISION[]
);

ALTER TABLE poi_enriched
ADD COLUMN IF NOT EXISTS nearest_stop_name VARCHAR;

CREATE TABLE IF NOT EXISTS stops (
    stop_id VARCHAR PRIMARY KEY,
    stop_name VARCHAR,
    stop_lat DOUBLE PRECISION,
    stop_lon DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR,
    name VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    category TEXT,
    subcategory TEXT,
    cuisine TEXT,
    brand TEXT,
    facility_type TEXT
);

CREATE TABLE IF NOT EXISTS minimarkets (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR,
    name VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    category TEXT,
    subcategory TEXT,
    cuisine TEXT,
    brand TEXT,
    facility_type TEXT
);

CREATE TABLE IF NOT EXISTS gtfs_routes (
    route_id TEXT PRIMARY KEY,
    agency_id TEXT,
    route_short_name TEXT,
    route_long_name TEXT,
    route_desc TEXT,
    route_type INTEGER,
    route_url TEXT,
    route_color TEXT,
    route_text_color TEXT
);

CREATE TABLE IF NOT EXISTS gtfs_trips (
    trip_id TEXT PRIMARY KEY,
    route_id TEXT,
    service_id TEXT,
    trip_headsign TEXT,
    direction_id INTEGER,
    shape_id TEXT
);

CREATE TABLE IF NOT EXISTS gtfs_shapes (
    shape_id TEXT NOT NULL,
    shape_pt_sequence INTEGER NOT NULL,
    shape_pt_lat DOUBLE PRECISION,
    shape_pt_lon DOUBLE PRECISION,
    shape_dist_traveled DOUBLE PRECISION,
    PRIMARY KEY (shape_id, shape_pt_sequence)
);

CREATE TABLE IF NOT EXISTS gtfs_stop_times (
    trip_id TEXT NOT NULL,
    stop_sequence INTEGER NOT NULL,
    arrival_time TEXT,
    departure_time TEXT,
    stop_id TEXT,
    PRIMARY KEY (trip_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_poi_enriched_coords
ON poi_enriched (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_stops_coords
ON stops (stop_lat, stop_lon);

CREATE INDEX IF NOT EXISTS idx_restaurants_coords
ON restaurants (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_minimarkets_coords
ON minimarkets (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_gtfs_trips_route_id
ON gtfs_trips (route_id);

CREATE INDEX IF NOT EXISTS idx_gtfs_trips_shape_id
ON gtfs_trips (shape_id);

CREATE INDEX IF NOT EXISTS idx_gtfs_shapes_shape_id
ON gtfs_shapes (shape_id);

CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times_trip_id
ON gtfs_stop_times (trip_id);

-- Admin (dipakai subquery filter non-aktif di /search dan fallback)
CREATE TABLE IF NOT EXISTS admin_cities (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_destinations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    city_id INTEGER NOT NULL REFERENCES admin_cities(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES admin_categories(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_osm_pdf BOOLEAN NOT NULL DEFAULT FALSE,
    is_osm_only BOOLEAN NOT NULL DEFAULT FALSE,
    source_flags_synced BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (name, city_id, category_id)
);
ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS is_osm_pdf BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS is_osm_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_destinations ADD COLUMN IF NOT EXISTS source_flags_synced BOOLEAN NOT NULL DEFAULT FALSE;
