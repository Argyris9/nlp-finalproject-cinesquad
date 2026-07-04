# Review sentiment model — drop zone

Supplementary task: sentiment analysis on real IMDB review text
(`movie_dataset_public_final/raw/reviews.json`), positive/negative (or
finer-grained) classification.

## Option A — scikit-learn pipeline

```
models/sentiment/sentiment_model.joblib
```

Same contract as the classification drop zone: a fitted, self-contained
`sklearn.pipeline.Pipeline` exposing `.predict([text])` /
`.predict_proba([text])`.

## Option B — fine-tuned transformer

```
models/sentiment/distilbert_sentiment/     # trainer.save_model(...) output
models/sentiment/labels.json               # e.g. ["negative", "positive"]
```

## What the backend does

`backend/services/sentiment_service.py` checks for the joblib pipeline
first, then the transformer directory, and exposes:

```
POST /sentiment   { "text": "..." }  ->  { "label": "...", "probabilities": {...} }
```

Returns `503` until one of the two artifacts is present.
