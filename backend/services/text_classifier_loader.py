"""Shared loader for the two drop-zone contracts used by both the
classification and sentiment services: a self-contained sklearn Pipeline
joblib file, or a fine-tuned HF transformer directory + labels.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


class TextClassifier:
    """Loads whichever artifact is present under `model_dir`, or stays
    `ready = False` so the API can respond gracefully before training."""

    def __init__(self, model_dir: Path, joblib_filename: str, transformer_subdir: str):
        self.model_dir = model_dir
        self.joblib_path = model_dir / joblib_filename
        self.transformer_path = model_dir / transformer_subdir
        self.labels_path = model_dir / "labels.json"

        self.ready = False
        self._backend = None  # "sklearn" or "transformer"
        self._pipeline = None
        self._tokenizer = None
        self._model = None
        self._labels: list[str] | None = None

        self._try_load()

    def _try_load(self) -> None:
        if self.joblib_path.exists():
            self._pipeline = joblib.load(self.joblib_path)
            self._backend = "sklearn"
            self.ready = True
        elif self.transformer_path.exists() and self.labels_path.exists():
            self._tokenizer = AutoTokenizer.from_pretrained(self.transformer_path)
            self._model = AutoModelForSequenceClassification.from_pretrained(self.transformer_path)
            self._model.eval()
            self._labels = json.loads(self.labels_path.read_text())
            self._backend = "transformer"
            self.ready = True

    def predict(self, text: str) -> dict:
        if not self.ready:
            raise RuntimeError("model not trained yet")

        if self._backend == "sklearn":
            label = self._pipeline.predict([text])[0]
            probabilities = {}
            if hasattr(self._pipeline, "predict_proba"):
                classes = self._pipeline.classes_
                probs = self._pipeline.predict_proba([text])[0]
                probabilities = {str(c): float(p) for c, p in zip(classes, probs)}
            return {"label": str(label), "probabilities": probabilities}

        inputs = self._tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
        with torch.no_grad():
            logits = self._model(**inputs).logits[0]
        probs = torch.softmax(logits, dim=0).tolist()
        probabilities = {label: float(p) for label, p in zip(self._labels, probs)}
        top_label = max(probabilities, key=probabilities.get)
        return {"label": top_label, "probabilities": probabilities}
