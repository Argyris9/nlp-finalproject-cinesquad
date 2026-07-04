"""Trains the Neural Collaborative Filtering recommender on MovieLens 25M
ratings, restricted to movies in models/recommender/movies_catalog.csv (the
same catalog the app recommends from).

Not run automatically by the API -- run it manually once, and
recommender_service will pick up the saved checkpoint on the next backend
restart. If you never run this, the backend still works fine via the
deterministic fallback scorer (rating + genre + semantic similarity).

Usage (from the project root, venv activated):
    python -m backend.ml.train_recommender

The full 25M-row ratings file is subsampled (see --sample-size) to keep
training tractable on a laptop CPU -- documented here as a deliberate
dataset-size adjustment, same convention used for the RAG corpus.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset

from backend.ml.ncf_model import NCF

ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG_PATH = ROOT / "models" / "recommender" / "movies_catalog.csv"
RATINGS_PATH = ROOT / "ml-25m" / "ratings.csv"
MODEL_OUT = ROOT / "models" / "recommender" / "ncf_model.pt"
MAPPINGS_OUT = ROOT / "models" / "recommender" / "id_mappings.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-size", type=int, default=2_000_000)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4096)
    parser.add_argument("--embedding-dim", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    print("loading catalog + ratings...")
    catalog_movie_ids = set(pd.read_csv(CATALOG_PATH, usecols=["movie_id"])["movie_id"].astype(int))
    ratings = pd.read_csv(RATINGS_PATH, usecols=["userId", "movieId", "rating"])
    ratings = ratings[ratings["movieId"].isin(catalog_movie_ids)]
    print(f"ratings for catalog movies: {len(ratings)}")

    if len(ratings) > args.sample_size:
        ratings = ratings.sample(n=args.sample_size, random_state=args.seed)
    print(f"training on {len(ratings)} ratings (sampled for CPU tractability)")

    user_ids = ratings["userId"].unique()
    movie_ids = ratings["movieId"].unique()
    user_to_idx = {u: i for i, u in enumerate(user_ids)}
    movie_to_idx = {m: i for i, m in enumerate(movie_ids)}

    ratings["user_idx"] = ratings["userId"].map(user_to_idx)
    ratings["movie_idx"] = ratings["movieId"].map(movie_to_idx)

    ratings = ratings.sample(frac=1.0, random_state=args.seed).reset_index(drop=True)
    split = int(len(ratings) * 0.9)
    train_df, test_df = ratings.iloc[:split], ratings.iloc[split:]

    def to_tensors(df):
        return (
            torch.tensor(df["user_idx"].values, dtype=torch.long),
            torch.tensor(df["movie_idx"].values, dtype=torch.long),
            torch.tensor(df["rating"].values, dtype=torch.float32),
        )

    train_ds = TensorDataset(*to_tensors(train_df))
    test_ds = TensorDataset(*to_tensors(test_df))
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size)

    model = NCF(num_users=len(user_to_idx), num_movies=len(movie_to_idx), embedding_dim=args.embedding_dim)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = torch.nn.MSELoss()

    print("training...")
    for epoch in range(args.epochs):
        model.train()
        t0 = time.time()
        total_loss = 0.0
        for user_idx, movie_idx, rating in train_loader:
            optimizer.zero_grad()
            pred = model(user_idx, movie_idx)
            loss = loss_fn(pred, rating)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(rating)
        train_rmse = (total_loss / len(train_ds)) ** 0.5
        print(f"epoch {epoch + 1}/{args.epochs} - train RMSE: {train_rmse:.4f} - {time.time() - t0:.1f}s")

    print("evaluating on held-out test set...")
    model.eval()
    errors = []
    abs_errors = []
    with torch.no_grad():
        for user_idx, movie_idx, rating in test_loader:
            pred = model(user_idx, movie_idx)
            errors.append(((pred - rating) ** 2).numpy())
            abs_errors.append((pred - rating).abs().numpy())
    rmse = float(np.sqrt(np.concatenate(errors).mean()))
    mae = float(np.concatenate(abs_errors).mean())
    print(f"test RMSE: {rmse:.4f}  test MAE: {mae:.4f}")

    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "num_users": len(user_to_idx),
            "num_movies": len(movie_to_idx),
            "embedding_dim": args.embedding_dim,
            "test_rmse": rmse,
            "test_mae": mae,
        },
        MODEL_OUT,
    )
    MAPPINGS_OUT.write_text(
        json.dumps(
            {
                "user_to_idx": {str(k): v for k, v in user_to_idx.items()},
                "movie_to_idx": {str(k): v for k, v in movie_to_idx.items()},
            }
        )
    )
    print(f"saved model -> {MODEL_OUT}")
    print(f"saved id mappings -> {MAPPINGS_OUT}")


if __name__ == "__main__":
    main()
