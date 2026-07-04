"""Task 1: genre (or other topic) classification. See models/classification/README.md
for the artifact contract a teammate needs to drop in."""

from pathlib import Path

from backend.services.text_classifier_loader import TextClassifier

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "classification"

classifier = TextClassifier(
    model_dir=MODEL_DIR,
    joblib_filename="genre_classifier.joblib",
    transformer_subdir="distilbert_genre",
)
