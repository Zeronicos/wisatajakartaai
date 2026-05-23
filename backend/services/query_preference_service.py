"""Validasi preferensi pencarian dan blending skor semantik untuk lookup nama destinasi."""

from __future__ import annotations

import os
import re
from typing import Any

from services.embedding_service import cosine_similarity, generate_embedding

QUERY_UNDETECTED_MESSAGE = "Sistem tidak dapat mendeteksi permintaan."

DESTINATION_NAME_ANCHOR_SCORE = 1.0

TOURISM_KEYWORDS = {
    "wisata",
    "liburan",
    "rekreasi",
    "jalan",
    "jalan-jalan",
    "jalan jalan",
    "kunjung",
    "kunjungan",
    "destinasi",
    "tempat",
    "lokasi",
    "museum",
    "galeri",
    "kuliner",
    "makan",
    "jajanan",
    "cafe",
    "kafe",
    "restoran",
    "taman",
    "alam",
    "budaya",
    "sejarah",
    "edukasi",
    "keluarga",
    "anak",
    "romantis",
    "instagram",
    "foto",
    "photogenic",
    "outdoor",
    "indoor",
    "shopping",
    "belanja",
    "mall",
    "pasar",
    "monumen",
    "candi",
    "masjid",
    "gereja",
    "vihara",
    "pura",
    "heritage",
    "jakarta",
    "jakart",
    "ancol",
    "monas",
    "kota tua",
    "blok m",
    "ragunan",
    "dufan",
    "transjakarta",
    "halte",
    "transportasi",
    "dekat",
    "terdekat",
    "sekitar",
    "area",
    "rekomendasi",
    "itinerary",
    "perjalanan",
    "tur",
    "city walk",
    "hidden gem",
    "staycation",
    "enjoy",
    "cozy",
    "places",
    "place",
    "travel",
    "travelling",
    "traveling",
    "tourist",
    "tourism",
    "vacation",
    "holiday",
    "sightseeing",
    "restaurant",
    "food",
    "nature",
    "culture",
    "history",
    "family",
    "romantic",
    "walking",
    "walk",
    "explore",
    "leisure",
    "attraction",
    "landmark",
}

PREFERENCE_THEME_KEYWORDS = {
    "museum",
    "kuliner",
    "sejarah",
    "keluarga",
    "alam",
    "budaya",
    "rekreasi",
    "edukasi",
    "romantis",
    "instagram",
    "outdoor",
    "indoor",
    "shopping",
    "makan",
    "cafe",
    "kafe",
    "taman",
    "wisata",
    "liburan",
}

NON_TOURISM_PHRASES = (
    "beli pulsa",
    "top up",
    "topup",
    "transfer bank",
    "pinjaman",
    "kripto",
    "crypto",
    "bitcoin",
    "password",
    "reset password",
    "otp",
    "whatsapp",
    "telegram bot",
    "script hack",
    "sql injection",
    "drop table",
    "npm install",
    "git clone",
    "hello world",
    "lorem ipsum",
    "asdfgh",
    "qwerty",
    "test test test",
    "xxx",
)

QUERY_STOPWORDS = {
    "dekat",
    "terdekat",
    "sekitar",
    "area",
    "lokasi",
    "tempat",
    "ke",
    "di",
    "dan",
    "atau",
    "yang",
    "dengan",
    "untuk",
    "saya",
    "mau",
    "ingin",
    "cari",
    "rekomendasi",
    "rekomendasikan",
    "tolong",
    "please",
    "wisata",
    "destinasi",
    "jakarta",
    "please",
}

_TOURISM_ANCHOR_TEXT = (
    "preferensi wisata liburan rekreasi museum kuliner taman budaya sejarah keluarga destinasi jakarta "
    "travel tourism cozy places shopping mall sightseeing vacation holiday explore leisure"
)
_tourism_anchor_embedding: list[float] | None = None


def _env_float(name: str, default: float, min_value: float | None = None, max_value: float | None = None) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if min_value is not None and value < min_value:
        value = min_value
    if max_value is not None and value > max_value:
        value = max_value
    return value


MIN_TOURISM_EMBEDDING_SIM = _env_float("SEARCH_MIN_TOURISM_EMBEDDING_SIM", 0.32, min_value=0.0, max_value=1.0)


def clean_query_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def extract_destination_hints(text: str) -> list[str]:
    cleaned = clean_query_text(text).lower()
    for prefix in ("terdekat ", "dekat ", "sekitar ", "area ", "lokasi ", "tempat "):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :]
    if cleaned.startswith("ke "):
        cleaned = cleaned[3:]
    if cleaned.startswith("di "):
        cleaned = cleaned[3:]

    hints: list[str] = []
    if len(cleaned) >= 2:
        hints.append(cleaned)

    for token in cleaned.split():
        if token in QUERY_STOPWORDS or len(token) < 2:
            continue
        hints.append(token)

    unique: list[str] = []
    seen: set[str] = set()
    for hint in hints:
        if hint not in seen:
            seen.add(hint)
            unique.append(hint)
    return unique


def poi_matches_destination_hints(poi_name: str, hints: list[str]) -> bool:
    if not hints:
        return False
    name_l = (poi_name or "").lower().strip()
    if not name_l:
        return False
    for hint in hints:
        if hint in name_l or name_l in hint:
            return True
        hint_tokens = [t for t in hint.split() if len(t) >= 2]
        if hint_tokens and all(token in name_l for token in hint_tokens):
            return True
    return False


def is_destination_lookup_query(hints: list[str]) -> bool:
    if not hints:
        return False
    for hint in hints:
        if hint in PREFERENCE_THEME_KEYWORDS:
            continue
        if len(hint) >= 2 and not hint.isdigit():
            return True
    return False


def _keyword_matches(lowered: str, keyword: str) -> bool:
    if " " in keyword or len(keyword) >= 5:
        return keyword in lowered
    return re.search(rf"\b{re.escape(keyword)}\b", lowered) is not None


def _contains_tourism_keyword(text: str) -> bool:
    lowered = clean_query_text(text).lower()
    if any(phrase in lowered for phrase in NON_TOURISM_PHRASES):
        return False
    if any(_keyword_matches(lowered, keyword) for keyword in TOURISM_KEYWORDS):
        return True
    return False


def _contains_non_tourism_phrase(text: str) -> bool:
    lowered = clean_query_text(text).lower()
    return any(phrase in lowered for phrase in NON_TOURISM_PHRASES)


def _get_tourism_anchor_embedding() -> list[float]:
    global _tourism_anchor_embedding
    if _tourism_anchor_embedding is None:
        _tourism_anchor_embedding = generate_embedding(_TOURISM_ANCHOR_TEXT) or []
    return _tourism_anchor_embedding


def is_tourism_related(text: str, query_embedding: list[float] | None, hints: list[str]) -> bool:
    if _contains_non_tourism_phrase(text):
        return False
    if _contains_tourism_keyword(text):
        return True
    if is_destination_lookup_query(hints):
        return True
    if query_embedding:
        anchor = _get_tourism_anchor_embedding()
        if anchor:
            similarity = cosine_similarity(query_embedding, anchor)
            if similarity >= MIN_TOURISM_EMBEDDING_SIM:
                return True
    return False


def blend_destination_semantic_score(original_score: float, anchor_score: float = DESTINATION_NAME_ANCHOR_SCORE) -> float:
    original = max(0.0, min(1.0, float(original_score)))
    anchor = max(0.0, min(1.0, float(anchor_score)))
    return round((anchor + original) / 2.0, 6)


def apply_destination_name_semantic_blend(rows: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    hints = extract_destination_hints(query)
    if not is_destination_lookup_query(hints):
        return rows

    updated: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        if poi_matches_destination_hints(str(item.get("name") or ""), hints):
            original = float(item.get("semantic_score") or 0.0)
            item["semantic_score"] = blend_destination_semantic_score(original)
        updated.append(item)

    updated.sort(key=lambda x: float(x.get("semantic_score") or 0.0), reverse=True)
    return updated


def validate_preference_query(
    text: str,
    *,
    min_chars: int,
    min_alpha_ratio: float,
    query_embedding: list[float] | None = None,
) -> tuple[bool, str, list[str]]:
    cleaned = clean_query_text(text)
    hints = extract_destination_hints(cleaned)

    if len(cleaned) < min_chars:
        return False, QUERY_UNDETECTED_MESSAGE, hints

    alnum_chars = [ch for ch in cleaned if ch.isalnum()]
    if not alnum_chars:
        return False, QUERY_UNDETECTED_MESSAGE, hints

    alpha_chars = [ch for ch in cleaned if ch.isalpha()]
    alpha_ratio = len(alpha_chars) / max(1, len(alnum_chars))
    if alpha_ratio < min_alpha_ratio:
        return False, QUERY_UNDETECTED_MESSAGE, hints

    letters_only = "".join(alpha_chars).lower()
    if letters_only:
        freq: dict[str, int] = {}
        for ch in letters_only:
            freq[ch] = freq.get(ch, 0) + 1
        max_ratio = max(freq.values()) / len(letters_only)
        if max_ratio > 0.7:
            return False, QUERY_UNDETECTED_MESSAGE, hints

    if not is_tourism_related(cleaned, query_embedding, hints):
        return False, QUERY_UNDETECTED_MESSAGE, hints

    return True, "", hints
