import argparse
from dataclasses import dataclass
from typing import Optional

from database import get_connection


# Bounding box administratif DKI Jakarta (aproksimasi aman untuk cleansing awal)
LAT_MIN = -6.40
LAT_MAX = -5.95
LON_MIN = 106.68
LON_MAX = 107.04


@dataclass
class TableConfig:
    table: str
    id_col: str
    lat_col: str
    lon_col: str
    district_col: Optional[str] = None


TABLES = [
    TableConfig("poi_enriched", "id", "latitude", "longitude", district_col="district"),
    TableConfig("restaurants", "id", "latitude", "longitude"),
    TableConfig("minimarkets", "id", "latitude", "longitude"),
    TableConfig("stops", "stop_id", "stop_lat", "stop_lon"),
]


def in_jakarta_sql(lat_col: str, lon_col: str) -> str:
    return f"({lat_col} BETWEEN {LAT_MIN} AND {LAT_MAX} AND {lon_col} BETWEEN {LON_MIN} AND {LON_MAX})"


def ensure_log_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS coordinate_corrections_log (
            id BIGSERIAL PRIMARY KEY,
            table_name VARCHAR NOT NULL,
            row_id VARCHAR NOT NULL,
            old_lat DOUBLE PRECISION,
            old_lon DOUBLE PRECISION,
            new_lat DOUBLE PRECISION,
            new_lon DOUBLE PRECISION,
            reason VARCHAR NOT NULL,
            corrected_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def count_outside(cur, cfg: TableConfig) -> int:
    cur.execute(
        f"""
        SELECT COUNT(*) AS total
        FROM {cfg.table}
        WHERE {cfg.lat_col} IS NOT NULL
          AND {cfg.lon_col} IS NOT NULL
          AND NOT {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
        """
    )
    return int(cur.fetchone()["total"])


def swap_if_likely_reversed(cur, cfg: TableConfig, dry_run: bool) -> int:
    """
    Perbaiki kasus lat/lon tertukar:
    - titik saat ini di luar bbox Jakarta
    - jika dibalik, masuk bbox Jakarta
    """
    if dry_run:
        cur.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM {cfg.table}
            WHERE {cfg.lat_col} IS NOT NULL
              AND {cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
              AND ({cfg.lon_col} BETWEEN {LAT_MIN} AND {LAT_MAX})
              AND ({cfg.lat_col} BETWEEN {LON_MIN} AND {LON_MAX})
            """
        )
        return int(cur.fetchone()["total"])

    cur.execute(
        f"""
        WITH candidates AS (
            SELECT
                {cfg.id_col}::text AS row_id,
                {cfg.lat_col} AS old_lat,
                {cfg.lon_col} AS old_lon
            FROM {cfg.table}
            WHERE {cfg.lat_col} IS NOT NULL
              AND {cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
              AND ({cfg.lon_col} BETWEEN {LAT_MIN} AND {LAT_MAX})
              AND ({cfg.lat_col} BETWEEN {LON_MIN} AND {LON_MAX})
        ),
        updated AS (
            UPDATE {cfg.table} t
            SET
                {cfg.lat_col} = c.old_lon,
                {cfg.lon_col} = c.old_lat
            FROM candidates c
            WHERE t.{cfg.id_col}::text = c.row_id
            RETURNING
                c.row_id,
                c.old_lat,
                c.old_lon,
                t.{cfg.lat_col} AS new_lat,
                t.{cfg.lon_col} AS new_lon
        )
        INSERT INTO coordinate_corrections_log
            (table_name, row_id, old_lat, old_lon, new_lat, new_lon, reason)
        SELECT
            %s, row_id, old_lat, old_lon, new_lat, new_lon, 'swap_lat_lon'
        FROM updated
        RETURNING 1
        """,
        (cfg.table,),
    )
    return cur.rowcount


def median_global(cur, cfg: TableConfig) -> tuple[Optional[float], Optional[float]]:
    cur.execute(
        f"""
        SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lat_col}) AS med_lat,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lon_col}) AS med_lon
        FROM {cfg.table}
        WHERE {cfg.lat_col} IS NOT NULL
          AND {cfg.lon_col} IS NOT NULL
          AND {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
        """
    )
    row = cur.fetchone()
    return row["med_lat"], row["med_lon"]


def update_outside_with_district_median(cur, cfg: TableConfig, dry_run: bool) -> int:
    if not cfg.district_col:
        return 0

    if dry_run:
        cur.execute(
            f"""
            WITH district_median AS (
                SELECT
                    {cfg.district_col} AS district,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lat_col}) AS med_lat,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lon_col}) AS med_lon
                FROM {cfg.table}
                WHERE {cfg.lat_col} IS NOT NULL
                  AND {cfg.lon_col} IS NOT NULL
                  AND {cfg.district_col} IS NOT NULL
                  AND {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
                GROUP BY {cfg.district_col}
            )
            SELECT COUNT(*) AS total
            FROM {cfg.table} t
            JOIN district_median d
              ON t.{cfg.district_col} = d.district
            WHERE t.{cfg.lat_col} IS NOT NULL
              AND t.{cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(f"t.{cfg.lat_col}", f"t.{cfg.lon_col}")}
            """
        )
        return int(cur.fetchone()["total"])

    cur.execute(
        f"""
        WITH district_median AS (
            SELECT
                {cfg.district_col} AS district,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lat_col}) AS med_lat,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY {cfg.lon_col}) AS med_lon
            FROM {cfg.table}
            WHERE {cfg.lat_col} IS NOT NULL
              AND {cfg.lon_col} IS NOT NULL
              AND {cfg.district_col} IS NOT NULL
              AND {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
            GROUP BY {cfg.district_col}
        ),
        candidates AS (
            SELECT
                t.{cfg.id_col}::text AS row_id,
                t.{cfg.lat_col} AS old_lat,
                t.{cfg.lon_col} AS old_lon,
                d.med_lat AS new_lat,
                d.med_lon AS new_lon
            FROM {cfg.table} t
            JOIN district_median d
              ON t.{cfg.district_col} = d.district
            WHERE t.{cfg.lat_col} IS NOT NULL
              AND t.{cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(f"t.{cfg.lat_col}", f"t.{cfg.lon_col}")}
        ),
        updated AS (
            UPDATE {cfg.table} t
            SET
                {cfg.lat_col} = c.new_lat,
                {cfg.lon_col} = c.new_lon
            FROM candidates c
            WHERE t.{cfg.id_col}::text = c.row_id
            RETURNING
                c.row_id,
                c.old_lat,
                c.old_lon,
                t.{cfg.lat_col} AS new_lat,
                t.{cfg.lon_col} AS new_lon
        )
        INSERT INTO coordinate_corrections_log
            (table_name, row_id, old_lat, old_lon, new_lat, new_lon, reason)
        SELECT
            %s, row_id, old_lat, old_lon, new_lat, new_lon, 'district_median_imputation'
        FROM updated
        RETURNING 1
        """,
        (cfg.table,),
    )
    return cur.rowcount


def update_outside_with_global_median(cur, cfg: TableConfig, dry_run: bool) -> int:
    med_lat, med_lon = median_global(cur, cfg)
    if med_lat is None or med_lon is None:
        return 0

    if dry_run:
        cur.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM {cfg.table}
            WHERE {cfg.lat_col} IS NOT NULL
              AND {cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
            """
        )
        return int(cur.fetchone()["total"])

    cur.execute(
        f"""
        WITH candidates AS (
            SELECT
                {cfg.id_col}::text AS row_id,
                {cfg.lat_col} AS old_lat,
                {cfg.lon_col} AS old_lon
            FROM {cfg.table}
            WHERE {cfg.lat_col} IS NOT NULL
              AND {cfg.lon_col} IS NOT NULL
              AND NOT {in_jakarta_sql(cfg.lat_col, cfg.lon_col)}
        ),
        updated AS (
            UPDATE {cfg.table} t
            SET
                {cfg.lat_col} = %s,
                {cfg.lon_col} = %s
            FROM candidates c
            WHERE t.{cfg.id_col}::text = c.row_id
            RETURNING
                c.row_id,
                c.old_lat,
                c.old_lon,
                t.{cfg.lat_col} AS new_lat,
                t.{cfg.lon_col} AS new_lon
        )
        INSERT INTO coordinate_corrections_log
            (table_name, row_id, old_lat, old_lon, new_lat, new_lon, reason)
        SELECT
            %s, row_id, old_lat, old_lon, new_lat, new_lon, 'global_median_imputation'
        FROM updated
        RETURNING 1
        """,
        (med_lat, med_lon, cfg.table),
    )
    return cur.rowcount


def process_table(cur, cfg: TableConfig, dry_run: bool) -> dict:
    before = count_outside(cur, cfg)

    fixed_swap = swap_if_likely_reversed(cur, cfg, dry_run=dry_run)
    fixed_district = update_outside_with_district_median(cur, cfg, dry_run=dry_run)
    fixed_global = update_outside_with_global_median(cur, cfg, dry_run=dry_run)

    after = count_outside(cur, cfg) if not dry_run else max(0, before - fixed_swap - fixed_district - fixed_global)
    return {
        "table": cfg.table,
        "before": before,
        "fixed_swap": fixed_swap,
        "fixed_district": fixed_district,
        "fixed_global": fixed_global,
        "after": after,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Perbaiki koordinat di luar DKI Jakarta tanpa menghapus data."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Hitung dampak tanpa melakukan update data.",
    )
    args = parser.parse_args()

    conn = get_connection()
    cur = conn.cursor()

    ensure_log_table(cur)

    summaries = []
    for cfg in TABLES:
        summaries.append(process_table(cur, cfg, dry_run=args.dry_run))

    if args.dry_run:
        conn.rollback()
        print("DRY RUN (tanpa perubahan database)")
    else:
        conn.commit()
        print("Perbaikan koordinat selesai dan tersimpan.")

    cur.close()
    conn.close()

    print(f"Batas Jakarta: lat[{LAT_MIN}, {LAT_MAX}], lon[{LON_MIN}, {LON_MAX}]")
    print("-" * 80)
    for s in summaries:
        print(
            f"{s['table']:<13} outside_before={s['before']:<6} "
            f"swap={s['fixed_swap']:<6} district={s['fixed_district']:<6} "
            f"global={s['fixed_global']:<6} outside_after={s['after']}"
        )


if __name__ == "__main__":
    main()
