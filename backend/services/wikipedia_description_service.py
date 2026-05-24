"""Ambil deskripsi destinasi dari Wikipedia (API resmi, bukan scraping HTML)."""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

USER_AGENT = "WisataJakartaAI/1.0 (destination description enrichment)"
DEFAULT_MAX_CHARS = 1200
REQUEST_TIMEOUT_SECONDS = 12
REQUEST_GAP_SECONDS = 0.35


@dataclass(frozen=True)
class WikipediaDescriptionResult:
    description: str
    title: str
    url: str
    language: str
    source: str = "wikipedia"


def _clean_extract(text: str, *, max_chars: int = DEFAULT_MAX_CHARS) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    cleaned = re.sub(r"\[\d+\]", "", cleaned).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    truncated = cleaned[:max_chars].rsplit(" ", 1)[0].strip()
    return f"{truncated}…"


def _build_search_queries(name: str, district: str | None = None) -> list[str]:
    base = (name or "").strip()
    if not base:
        return []
    district_name = (district or "").strip()
    queries: list[str] = []
    if district_name:
        queries.append(f"{base} {district_name}")
    queries.append(f"{base} Jakarta")
    queries.append(base)
    unique: list[str] = []
    seen: set[str] = set()
    for query in queries:
        key = query.lower()
        if key not in seen:
            seen.add(key)
            unique.append(query)
    return unique


def _wiki_api_get(language: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode({**params, "format": "json"})
    url = f"https://{language}.wikipedia.org/w/api.php?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("Respons Wikipedia tidak valid.")
    return payload


def _search_title(language: str, query: str) -> str | None:
    payload = _wiki_api_get(
        language,
        {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": 1,
            "srnamespace": 0,
        },
    )
    hits = payload.get("query", {}).get("search", [])
    if not hits:
        return None
    title = str(hits[0].get("title") or "").strip()
    return title or None


def _fetch_extract(language: str, title: str, *, max_chars: int) -> str | None:
    payload = _wiki_api_get(
        language,
        {
            "action": "query",
            "prop": "extracts",
            "explaintext": 1,
            "exintro": 1,
            "redirects": 1,
            "titles": title,
        },
    )
    pages = payload.get("query", {}).get("pages", {})
    if not isinstance(pages, dict):
        return None
    for page in pages.values():
        if not isinstance(page, dict):
            continue
        if int(page.get("pageid", 0)) <= 0:
            continue
        extract = _clean_extract(str(page.get("extract") or ""), max_chars=max_chars)
        if len(extract) >= 40:
            return extract
    return None


def _build_article_url(language: str, title: str) -> str:
    slug = urllib.parse.quote((title or "").replace(" ", "_"), safe="()'%")
    return f"https://{language}.wikipedia.org/wiki/{slug}"


def fetch_wikipedia_description(
    name: str,
    *,
    district: str | None = None,
    languages: tuple[str, ...] = ("id", "en"),
    max_chars: int = DEFAULT_MAX_CHARS,
) -> WikipediaDescriptionResult | None:
    queries = _build_search_queries(name, district)
    if not queries:
        return None

    for language in languages:
        for query in queries:
            try:
                title = _search_title(language, query)
                if not title:
                    continue
                extract = _fetch_extract(language, title, max_chars=max_chars)
                if not extract:
                    continue
                return WikipediaDescriptionResult(
                    description=extract,
                    title=title,
                    url=_build_article_url(language, title),
                    language=language,
                )
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError):
                continue
            finally:
                time.sleep(REQUEST_GAP_SECONDS)
    return None
