"""Deep-learning scoring ("deep_score" in the group scoring formula).

Loads the trained NCF checkpoint if present (see backend/ml/train_recommender.py
and models/recommender/README.md); the group scoring service falls back to
the rating-based score if this returns None.

Cold-start note: session users are ad-hoc people, never registered
MovieLens users, so the NCF model has no learned *user* embedding for them
-- the classic collaborative-filtering cold-start problem. Rather than
require a user embedding (impossible for a brand-new user), we use the
model's *movie* embeddings (meaningful for any movie seen in training) to
score a candidate against the user's self-reported reference movies. This
keeps the deep model contributing something real for new users instead of
being dead weight that always falls back to a flat rating-based score.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from backend.ml.ncf_model import NCF

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "recommender" / "ncf_model.pt"
MAPPINGS_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "recommender" / "id_mappings.json"


class RecommenderService:
    def __init__(self, model_path: Path, mappings_path: Path):
        self.ready = False
        self.test_rmse: float | None = None
        if not model_path.exists() or not mappings_path.exists():
            return

        checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
        self.model = NCF(
            num_users=checkpoint["num_users"],
            num_movies=checkpoint["num_movies"],
            embedding_dim=checkpoint["embedding_dim"],
        )
        self.model.load_state_dict(checkpoint["state_dict"])
        self.model.eval()
        self.test_rmse = checkpoint.get("test_rmse")

        mappings = json.loads(mappings_path.read_text())
        self.movie_to_idx: dict[str, int] = mappings["movie_to_idx"]

        with torch.no_grad():
            self.movie_embeddings = self.model.movie_embedding.weight.numpy()

        self.ready = True

    def _movie_embedding(self, movie_id: str) -> np.ndarray | None:
        idx = self.movie_to_idx.get(str(movie_id))
        if idx is None:
            return None
        return self.movie_embeddings[idx]

    def deep_score(self, candidate_movie_id: str, reference_movie_ids: list[str]) -> float | None:
        """Cosine similarity (rescaled to [0, 1]) between the candidate's
        learned NCF movie embedding and the average embedding of the user's
        reference movies. Returns None if unavailable (model not trained,
        candidate never seen in training, or no resolvable reference
        movies) -- callers should fall back to the rating-based score."""
        if not self.ready or not reference_movie_ids:
            return None
        candidate_vec = self._movie_embedding(candidate_movie_id)
        if candidate_vec is None:
            return None

        ref_vecs = [v for v in (self._movie_embedding(m) for m in reference_movie_ids) if v is not None]
        if not ref_vecs:
            return None

        ref_vec = np.mean(ref_vecs, axis=0)
        cosine = float(
            np.dot(candidate_vec, ref_vec)
            / (np.linalg.norm(candidate_vec) * np.linalg.norm(ref_vec) + 1e-8)
        )
        return (cosine + 1) / 2


recommender_service = RecommenderService(MODEL_PATH, MAPPINGS_PATH)
