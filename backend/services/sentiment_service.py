"""Supplementary task: sentiment analysis on IMDB review text. See
models/sentiment/README.md for the artifact contract a teammate needs to drop in."""

from pathlib import Path

from backend.services.text_classifier_loader import TextClassifier

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "sentiment"

sentiment_classifier = TextClassifier(
    model_dir=MODEL_DIR,
    joblib_filename="sentiment_model.joblib",
    transformer_subdir="distilbert_sentiment",
)
