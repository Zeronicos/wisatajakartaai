"""Fragmen SQL: penyaringan poi_enriched (alias ``p``) selaras admin_destinations."""

SQL_AND_HAS_ACTIVE_ADMIN = """
  AND EXISTS (
    SELECT 1
    FROM admin_destinations d
    JOIN admin_cities c ON c.id = d.city_id
    JOIN admin_categories k ON k.id = d.category_id
    WHERE d.is_active = TRUE
      AND TRIM(COALESCE(p.name, '')) <> ''
      AND TRIM(COALESCE(p.district, '')) <> ''
      AND TRIM(COALESCE(p.category, '')) <> ''
      AND LOWER(TRIM(COALESCE(p.name, ''))) = LOWER(TRIM(COALESCE(d.name, '')))
      AND LOWER(TRIM(COALESCE(p.district, ''))) = LOWER(TRIM(COALESCE(c.name, '')))
      AND LOWER(TRIM(COALESCE(p.category, ''))) = LOWER(TRIM(COALESCE(k.name, '')))
  )
"""

# Sembunyikan baris OSM/non-PDF jika sudah ada baris panduan PDF_001–140 (nama+kota+kategori sama).
SQL_PREFER_PDF_OVER_OSM_DUPLICATE = """
  AND (
    p.source_id ~ '^PDF_[0-9]{3}$'
    OR NOT EXISTS (
      SELECT 1
      FROM poi_enriched p2
      WHERE LOWER(TRIM(COALESCE(p2.name, ''))) = LOWER(TRIM(COALESCE(p.name, '')))
        AND LOWER(TRIM(COALESCE(p2.district, ''))) = LOWER(TRIM(COALESCE(p.district, '')))
        AND LOWER(TRIM(COALESCE(p2.category, ''))) = LOWER(TRIM(COALESCE(p.category, '')))
        AND p2.source_id ~ '^PDF_[0-9]{3}$'
        AND (REPLACE(p2.source_id, 'PDF_', ''))::int BETWEEN 1 AND 140
    )
  )
"""

# Search & endpoint umum: aktif di admin + dedupe OSM/PDF.
SQL_AND_VISIBLE_IN_ADMIN = f"""
{SQL_AND_HAS_ACTIVE_ADMIN}
{SQL_PREFER_PDF_OVER_OSM_DUPLICATE}
"""

# EDA mengikuti admin_destinations.is_active (bukan hanya PDF_140 statis).
SQL_FOR_EDA = SQL_AND_VISIBLE_IN_ADMIN

# Legacy alias — jangan dipakai di EDA baru (abaikan toggle admin).
SQL_AND_ACTIVE_PDF140 = f"""
  AND p.source_id ~ '^PDF_[0-9]{{3}}$'
  AND (REPLACE(p.source_id, 'PDF_', ''))::int BETWEEN 1 AND 140
{SQL_AND_HAS_ACTIVE_ADMIN}
"""
