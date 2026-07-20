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
        self._topic_shares: dict[int, float] = {}
        self._top_words_cache: dict[int, list[str]] = {}
        if path.exists():
            bundle = joblib.load(path)
            self._model = bundle["model"]
            self._vectorizer = bundle["vectorizer"]
            # int keys: lookups use ints, and any JSON round-trip would turn
            # these into strings and silently return None for every label
            self._topic_labels = {int(k): v for k, v in bundle.get("topic_labels", {}).items()}
            self._topic_shares = {int(k): v for k, v in bundle.get("topic_shares", {}).items()}
            self.ready = True
            self._precompute_top_words()

    def _precompute_top_words(self, n_words: int = 10) -> None:
        feature_names = np.array(self._vectorizer.get_feature_names_out())
        for topic_idx, component in enumerate(self._model.components_):
            top_indices = component.argsort()[::-1][:n_words]
            self._top_words_cache[topic_idx] = feature_names[top_indices].tolist()

    def all_topics(self) -> list[dict]:
        if not self.ready:
            raise RuntimeError("topic model not trained yet")
        return [
            {
                "topic_id": topic_id,
                "top_words": words,
                "topic_label": self._topic_labels.get(topic_id),
                "corpus_share": self._topic_shares.get(topic_id),
            }
            for topic_id, words in self._top_words_cache.items()
        ]

    def predict(self, text: str) -> dict:
        if not self.ready:
            raise RuntimeError("topic model not trained yet")

        # NMF is a transformer, not a classifier: transform() gives per-topic
        # weights and the argmax happens here, not in the model.
        vector = self._vectorizer.transform([text])
        topic_distribution = self._model.transform(vector)[0]

        # No vocabulary overlap -> argmax of an all-zero vector would silently
        # return topic 0 for every unmatchable input.
        if float(topic_distribution.sum()) == 0.0:
            return {
                "topic_id": None,
                "top_words": [],
                "topic_label": None,
                "weight": 0.0,
                "reason": "text shares no vocabulary with the corpus",
            }

        topic_id = int(topic_distribution.argmax())
        return {
            "topic_id": topic_id,
            "top_words": self._top_words_cache[topic_id],
            "topic_label": self._topic_labels.get(topic_id),
            "weight": float(topic_distribution[topic_id]),
        }


topic_service = TopicModelService(MODEL_PATH)