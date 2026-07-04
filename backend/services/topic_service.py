"""Rubric 4.1: unsupervised topic modelling. See models/topic_modeling/README.md
for the artifact contract a teammate needs to drop in."""

from pathlib import Path

import joblib
import numpy as np

MODEL_PATH = Path(__file__).resolve().parent.parent.parent / "models" / "topic_modeling" / "topic_model.joblib"


class TopicModelService:
    def __init__(self, path: Path):
        self.ready = False
        self._model = None
        self._vectorizer = None
        self._topic_labels: dict[int, str] = {}
        self._top_words_cache: dict[int, list[str]] = {}

        if path.exists():
            bundle = joblib.load(path)
            self._model = bundle["model"]
            self._vectorizer = bundle["vectorizer"]
            self._topic_labels = bundle.get("topic_labels", {})
            self.ready = True
            self._precompute_top_words()

    def _precompute_top_words(self, n_words: int = 10) -> None:
        feature_names = np.array(self._vectorizer.get_feature_names_out())
        for topic_idx, component in enumerate(self._model.components_):
            top_indices = component.argsort()[::-1][:n_words]
            self._top_words_cache[topic_idx] = feature_names[top_indices].tolist()

    def all_topics(self) -> list[dict]:
        return [
            {
                "topic_id": topic_id,
                "top_words": words,
                "topic_label": self._topic_labels.get(topic_id),
            }
            for topic_id, words in self._top_words_cache.items()
        ]

    def predict(self, text: str) -> dict:
        if not self.ready:
            raise RuntimeError("topic model not trained yet")
        vector = self._vectorizer.transform([text])
        topic_distribution = self._model.transform(vector)[0]
        topic_id = int(topic_distribution.argmax())
        return {
            "topic_id": topic_id,
            "top_words": self._top_words_cache[topic_id],
            "topic_label": self._topic_labels.get(topic_id),
        }


topic_service = TopicModelService(MODEL_PATH)
