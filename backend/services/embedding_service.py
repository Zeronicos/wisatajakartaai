from typing import Any

import numpy as np


def generate_embedding(text: str) -> list[float]:
    """
    Embedding menggunakan model Ollama nomic-embed-text.
    """
    import ollama

    response: Any = ollama.embeddings(model="nomic-embed-text", prompt=text)
    embedding = response.get("embedding", [])
    return [float(x) for x in embedding]


def build_poi_text(poi: dict) -> str:
    return (
        f"Nama: {poi.get('name', '')} | "
        f"Kategori: {poi.get('category', '')} | "
        f"Subkategori: {poi.get('subcategory', '')} | "
        f"Deskripsi: {poi.get('description', '')}"
    )


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.array(vec_a, dtype=float)
    b = np.array(vec_b, dtype=float)

    mag_a = np.linalg.norm(a)
    mag_b = np.linalg.norm(b)
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return float(np.dot(a, b) / (mag_a * mag_b))
