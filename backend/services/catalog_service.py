"""Loads the group-recommender movie catalog (models/recommender/movies_catalog.csv,
built from MovieLens 25M + TMDB enrichment -- see that folder's README),
embeds every movie's text profile once at startup, and exposes:

- `similarity_to_all(vector)` -- dense cosine similarity against the whole
  catalog, used by group_scoring_service (every candidate needs a semantic
  score per user, not just an approximate top-k).
- `search(vector, top_k)` -- an actual vector index (FAISS if installed,
  else sklearn NearestNeighbors) for the session-grounded chat's retrieval step.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer

CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "recommender" / "movies_catalog.csv"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

try:
    import faiss

    _HAS_FAISS = True
except ImportError:
    from sklearn.neighbors import NearestNeighbors

    _HAS_FAISS = False


def parse_list_field(value) -> list[str]:
    if not isinstance(value, str) or not value.strip():
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


class CatalogService:
    def __init__(self, catalog_path: Path):
        self.ready = False
        self.uses_faiss = _HAS_FAISS
        self.catalog: pd.DataFrame = pd.DataFrame()
        self.known_genres: list[str] = []
        if not catalog_path.exists():
            return

        df = pd.read_csv(catalog_path)
        df["movie_id"] = df["movie_id"].astype(str)
        self.catalog = df.set_index("movie_id", drop=False)
        self._movie_ids = df["movie_id"].tolist()
        self.known_genres = sorted({g for genres in df["genres"].dropna() for g in parse_list_field(genres)})

        self.embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
        texts = df["text_profile"].fillna("").tolist()
        self.embeddings = self.embedder.encode(
            texts, show_progress_bar=False, normalize_embeddings=True
        ).astype("float32")

        if _HAS_FAISS:
            self.index = faiss.IndexFlatIP(self.embeddings.shape[1])
            self.index.add(self.embeddings)
        else:
            self.index = NearestNeighbors(
                n_neighbors=min(50, len(df)), metric="cosine"
            ).fit(self.embeddings)

        self.ready = True

    def embed_text(self, text: str) -> np.ndarray:
        return self.embedder.encode([text], normalize_embeddings=True).astype("float32")[0]

    def get_movie(self, movie_id: str) -> dict | None:
        movie_id = str(movie_id)
        if movie_id not in self.catalog.index:
            return None
        return self.catalog.loc[movie_id].to_dict()

    def find_by_title(self, title: str) -> dict | None:
        matches = self.catalog[self.catalog["title"].str.lower() == title.strip().lower()]
        if matches.empty:
            return None
        return matches.iloc[0].to_dict()

    def all_movie_ids(self) -> list[str]:
        return self._movie_ids

    def similarity_to_all(self, query_vector: np.ndarray) -> np.ndarray:
        return self.embeddings @ query_vector

    def search(self, query_vector: np.ndarray, top_k: int = 10) -> list[tuple[str, float]]:
        if _HAS_FAISS:
            scores, idx = self.index.search(query_vector.reshape(1, -1), top_k)
            return [
                (self._movie_ids[i], float(s)) for i, s in zip(idx[0], scores[0]) if i != -1
            ]
        distances, idx = self.index.kneighbors(
            query_vector.reshape(1, -1), n_neighbors=min(top_k, len(self._movie_ids))
        )
        return [(self._movie_ids[i], float(1 - d)) for i, d in zip(idx[0], distances[0])]


catalog_service = CatalogService(CATALOG_PATH)
