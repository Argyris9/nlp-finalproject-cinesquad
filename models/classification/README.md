# Genre classification model — drop zone

Task 1 of the assignment: classify a movie's genre (or any topic label) from
its overview text. Train **one traditional ML model and one DL model**,
compare them, and drop whichever you want served here — the backend
supports either format, checked in this order:

## Option A — scikit-learn pipeline (traditional ML)

Save a **fitted, self-contained `sklearn.pipeline.Pipeline`** (vectorizer +
classifier together, so raw text goes in and a label comes out) as:

```
models/classification/genre_classifier.joblib
```

```python
import joblib
joblib.dump(pipeline, "models/classification/genre_classifier.joblib")
```

The pipeline must expose `.predict([text])` and, ideally, `.predict_proba([text])`.

## Option B — fine-tuned transformer (DL / transfer learning)

Save a Hugging Face sequence-classification model directory:

```
models/classification/distilbert_genre/     # trainer.save_model(...) output
models/classification/labels.json           # e.g. ["Action","Adventure","Comedy","Crime","Drama","Horror"]
```

`labels.json` must be a JSON list of class names **in the same order** as
the model's label ids (index 0 = label 0, etc.).

## What the backend does

`backend/services/classification_service.py` checks for `genre_classifier.joblib`
first, then the transformer directory, and exposes:

```
POST /classify   { "text": "..." }  ->  { "label": "...", "probabilities": {...} }
```

If neither artifact is present, that endpoint returns `503` with a message
saying the model hasn't been trained yet — the rest of the API keeps working.
