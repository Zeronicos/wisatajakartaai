"""Fragmen SQL: lakukan penyaringan poi_enriched sebagai alias ``p``.

Korelasi triple (nama + district + kategori) dengan baris ``admin_destinations``
berstatus tidak aktif — dipakai /search dan /eda agar perilaku konsisten.
"""

SQL_AND_VISIBLE_IN_ADMIN = """
  AND NOT EXISTS (
    SELECT 1
    FROM admin_destinations d
    JOIN admin_cities c ON c.id = d.city_id
    JOIN admin_categories k ON k.id = d.category_id
    WHERE d.is_active = FALSE
      AND TRIM(COALESCE(p.name, '')) <> ''
      AND TRIM(COALESCE(p.district, '')) <> ''
      AND TRIM(COALESCE(p.category, '')) <> ''
      AND LOWER(TRIM(COALESCE(p.name, ''))) = LOWER(TRIM(COALESCE(d.name, '')))
      AND LOWER(TRIM(COALESCE(c.name, ''))) = LOWER(TRIM(COALESCE(p.district, '')))
      AND LOWER(TRIM(COALESCE(k.name, ''))) = LOWER(TRIM(COALESCE(p.category, '')))
  )
"""
