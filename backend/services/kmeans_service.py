import random
from typing import Any

import numpy as np


def _load_sklearn():
    """Lazy import supaya startup FastAPI tidak tertahan import scipy/sklearn."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import davies_bouldin_score, silhouette_score
    from sklearn.preprocessing import StandardScaler

    return KMeans, davies_bouldin_score, silhouette_score, StandardScaler


def zscore_normalize(feature_matrix: list[list[float]]) -> tuple[np.ndarray, Any]:
    _, _, _, StandardScaler = _load_sklearn()
    scaler = StandardScaler()
    normalized = scaler.fit_transform(np.array(feature_matrix, dtype=float))
    return normalized, scaler


def euclidean_distance(point: np.ndarray, centroid: np.ndarray) -> float:
    return float(np.sqrt(np.sum((point - centroid) ** 2)))


def calculate_wcss(data: np.ndarray, centroids: np.ndarray, labels: np.ndarray) -> float:
    wcss = 0.0
    for i, point in enumerate(data):
        wcss += np.sum((point - centroids[labels[i]]) ** 2)
    return float(wcss)


def intelligent_init_centroids(data: np.ndarray, k: int) -> np.ndarray:
    n_samples = data.shape[0]
    centroids = []

    first_idx = random.randint(0, n_samples - 1)
    centroids.append(data[first_idx].copy())

    for _ in range(1, k):
        distances_squared = []
        for point in data:
            min_dist_sq = min(np.sum((point - c) ** 2) for c in centroids)
            distances_squared.append(min_dist_sq)

        distances_squared = np.array(distances_squared, dtype=float)
        total = float(np.sum(distances_squared))

        if total == 0:
            next_idx = random.randint(0, n_samples - 1)
        else:
            probabilities = distances_squared / total
            next_idx = int(np.random.choice(n_samples, p=probabilities))
        centroids.append(data[next_idx].copy())

    return np.array(centroids)


def intelligent_kmeans(
    data: np.ndarray,
    k: int,
    max_iter: int = 300,
    tolerance: float = 1e-4,
) -> dict:
    _, davies_bouldin_score, silhouette_score, _ = _load_sklearn()
    n_samples = data.shape[0]
    centroids = intelligent_init_centroids(data, k)
    labels = np.zeros(n_samples, dtype=int)

    iteration = 0
    for iteration in range(max_iter):
        old_labels = labels.copy()

        for i, point in enumerate(data):
            distances = [euclidean_distance(point, c) for c in centroids]
            labels[i] = int(np.argmin(distances))

        new_centroids = np.zeros_like(centroids)
        for j in range(k):
            cluster_points = data[labels == j]
            if len(cluster_points) > 0:
                new_centroids[j] = np.mean(cluster_points, axis=0)
            else:
                new_centroids[j] = centroids[j]

        centroid_shift = np.max(np.abs(new_centroids - centroids))
        centroids = new_centroids

        if np.all(old_labels == labels) or centroid_shift < tolerance:
            break

    if len(np.unique(labels)) > 1:
        sil = float(silhouette_score(data, labels))
        dbi = float(davies_bouldin_score(data, labels))
    else:
        sil = 0.0
        dbi = float("inf")

    wcss = calculate_wcss(data, centroids, labels)

    return {
        "labels": labels.tolist(),
        "centroids": centroids.tolist(),
        "silhouette_score": sil,
        "davies_bouldin_index": dbi,
        "wcss": wcss,
        "iterations": iteration + 1,
    }


def standard_kmeans(
    data: np.ndarray,
    k: int,
    max_iter: int = 300,
    random_state: int = 42,
) -> dict:
    KMeans, davies_bouldin_score, silhouette_score, _ = _load_sklearn()
    model = KMeans(
        n_clusters=k,
        init="random",
        n_init=10,
        max_iter=max_iter,
        random_state=random_state,
    )
    labels = model.fit_predict(data)

    if len(np.unique(labels)) > 1:
        sil = float(silhouette_score(data, labels))
        dbi = float(davies_bouldin_score(data, labels))
    else:
        sil = 0.0
        dbi = float("inf")

    return {
        "labels": labels.tolist(),
        "centroids": model.cluster_centers_.tolist(),
        "silhouette_score": sil,
        "davies_bouldin_index": dbi,
        "wcss": float(model.inertia_),
        "iterations": int(model.n_iter_),
    }


def find_optimal_k(data: np.ndarray, max_k: int) -> dict:
    upper = min(max_k, len(data), 10)
    if upper < 2:
        return {
            "optimal_k": 1,
            "k_range": [1],
            "wcss_values": [0.0],
            "silhouette_values": [0.0],
        }

    k_range = list(range(2, upper + 1))
    wcss_values = []
    silhouette_values = []

    for k in k_range:
        result = intelligent_kmeans(data, k)
        wcss_values.append(result["wcss"])
        silhouette_values.append(result["silhouette_score"])

    best_idx = int(np.argmax(np.array(silhouette_values)))
    optimal_k = k_range[best_idx]

    return {
        "optimal_k": optimal_k,
        "k_range": k_range,
        "wcss_values": wcss_values,
        "silhouette_values": silhouette_values,
    }
