"""Unit tests for preference query validation and destination semantic blending."""

import unittest

from services.query_preference_service import (
    QUERY_UNDETECTED_MESSAGE,
    apply_destination_name_semantic_blend,
    blend_destination_semantic_score,
    extract_destination_hints,
    is_destination_lookup_query,
    poi_matches_destination_hints,
    validate_preference_query,
)


class QueryPreferenceServiceTests(unittest.TestCase):
    def test_accepts_english_tourism_preference(self):
        ok, message, _ = validate_preference_query(
            "i like to enjoy cozy places and best mall",
            min_chars=5,
            min_alpha_ratio=0.55,
            query_embedding=None,
        )
        self.assertTrue(ok)
        self.assertEqual(message, "")

    def test_rejects_unrelated_query(self):
        ok, message, _ = validate_preference_query(
            "beli pulsa murah sekarang",
            min_chars=5,
            min_alpha_ratio=0.55,
            query_embedding=None,
        )
        self.assertFalse(ok)
        self.assertEqual(message, QUERY_UNDETECTED_MESSAGE)

    def test_accepts_tourism_preference(self):
        ok, message, _ = validate_preference_query(
            "museum sejarah edukasi keluarga",
            min_chars=5,
            min_alpha_ratio=0.55,
            query_embedding=None,
        )
        self.assertTrue(ok)
        self.assertEqual(message, "")

    def test_accepts_destination_lookup_query(self):
        ok, message, hints = validate_preference_query(
            "terdekat monas",
            min_chars=5,
            min_alpha_ratio=0.55,
            query_embedding=None,
        )
        self.assertTrue(ok)
        self.assertEqual(message, "")
        self.assertIn("monas", hints)

    def test_extract_hints_for_blok_m(self):
        hints = extract_destination_hints("blok m")
        self.assertTrue(any("blok" in hint for hint in hints))

    def test_destination_lookup_detection(self):
        hints = extract_destination_hints("blok m")
        self.assertTrue(is_destination_lookup_query(hints))

    def test_poi_name_match(self):
        hints = extract_destination_hints("terdekat monas")
        self.assertTrue(poi_matches_destination_hints("Monumen Nasional (Monas)", hints))

    def test_blend_semantic_score_average(self):
        blended = blend_destination_semantic_score(0.6, 1.0)
        self.assertAlmostEqual(blended, 0.8, places=6)

    def test_apply_blend_only_for_matching_poi(self):
        rows = [
            {"poi_id": 1, "name": "Blok M Plaza", "semantic_score": 0.4},
            {"poi_id": 2, "name": "Museum Nasional", "semantic_score": 0.9},
        ]
        updated = apply_destination_name_semantic_blend(rows, "blok m")
        by_id = {row["poi_id"]: row["semantic_score"] for row in updated}
        self.assertAlmostEqual(by_id[1], 0.7, places=6)
        self.assertAlmostEqual(by_id[2], 0.9, places=6)


if __name__ == "__main__":
    unittest.main()
