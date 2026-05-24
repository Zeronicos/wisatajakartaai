"""Unit tests for Wikipedia description service."""

import json
import unittest
from unittest.mock import patch

from services.wikipedia_description_service import (
    _build_search_queries,
    _clean_extract,
    fetch_wikipedia_description,
)


class WikipediaDescriptionServiceTests(unittest.TestCase):
    def test_build_search_queries(self):
        queries = _build_search_queries("Monumen Nasional", district="Gambir")
        self.assertIn("Monumen Nasional Gambir", queries)
        self.assertIn("Monumen Nasional Jakarta", queries)
        self.assertIn("Monumen Nasional", queries)

    def test_clean_extract_truncates(self):
        text = "A " * 900
        cleaned = _clean_extract(text, max_chars=120)
        self.assertLessEqual(len(cleaned), 122)
        self.assertTrue(cleaned.endswith("…"))

    @patch("services.wikipedia_description_service._wiki_api_get")
    @patch("services.wikipedia_description_service.time.sleep", return_value=None)
    def test_fetch_wikipedia_description_success(self, _sleep, mock_api_get):
        mock_api_get.side_effect = [
            {"query": {"search": [{"title": "Monumen Nasional"}]}},
            {
                "query": {
                    "pages": {
                        "123": {
                            "pageid": 123,
                            "title": "Monumen Nasional",
                            "extract": "Monumen Nasional atau Monas adalah monumen peringatan setengah abad kemerdekaan Indonesia.",
                        }
                    }
                }
            },
        ]
        result = fetch_wikipedia_description("Monas", district="Jakarta Pusat", languages=("id",))
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("Monumen Nasional", result.description)
        self.assertEqual(result.language, "id")
        self.assertIn("wikipedia.org/wiki/", result.url)

    @patch("services.wikipedia_description_service._wiki_api_get")
    @patch("services.wikipedia_description_service.time.sleep", return_value=None)
    def test_fetch_wikipedia_description_not_found(self, _sleep, mock_api_get):
        mock_api_get.return_value = {"query": {"search": []}}
        result = fetch_wikipedia_description("Tempat Tidak Ada Artikelnya XYZ", languages=("id",))
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
