"""Neural Collaborative Filtering: predicts a user's rating (0-5) of a
movie from learned user/movie embeddings. Trained on MovieLens 25M ratings
(see train_recommender.py). Optional -- recommender_service falls back to
a deterministic score (rating + genre + semantic similarity) when no
trained checkpoint is present at models/recommender/ncf_model.pt.
"""

from __future__ import annotations

import torch
import torch.nn as nn


class NCF(nn.Module):
    def __init__(self, num_users: int, num_movies: int, embedding_dim: int = 32):
        super().__init__()
        self.user_embedding = nn.Embedding(num_users, embedding_dim)
        self.movie_embedding = nn.Embedding(num_movies, embedding_dim)
        self.mlp = nn.Sequential(
            nn.Linear(embedding_dim * 2, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 1),
        )

    def forward(self, user_idx: torch.Tensor, movie_idx: torch.Tensor) -> torch.Tensor:
        u = self.user_embedding(user_idx)
        m = self.movie_embedding(movie_idx)
        x = torch.cat([u, m], dim=-1)
        return torch.sigmoid(self.mlp(x).squeeze(-1)) * 5.0
