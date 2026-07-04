# Topic modelling — drop zone

Rubric section 4.1: unsupervised topic modelling (LDA, NMF, or similar) over
movie text to discover latent topics/genres.

## Expected artifact

A single joblib file bundling everything needed to score new text:

```
models/topic_modeling/topic_model.joblib
```

Save it as a dict with these keys:

```python
import joblib
joblib.dump(
    {
        "model": lda_or_nmf_model,       # sklearn LatentDirichletAllocation or NMF, already fit
        "vectorizer": vectorizer,         # the CountVectorizer/TfidfVectorizer used to build its input
        "topic_labels": {0: "crime/investigation", 1: "family/school", ...},  # optional, human-readable names
    },
    "models/topic_modeling/topic_model.joblib",
)
```

`topic_labels` is optional — if omitted, the API just returns the numeric
topic id and its top words.

## What the backend does

`backend/services/topic_service.py` loads this file at startup and exposes:

```
POST /topics   { "text": "..." }  ->  { "topic_id": 2, "top_words": [...], "topic_label": "..." }
GET  /topics                       ->  top words for every topic (for a "browse topics" UI view)
```

If the artifact isn't present yet, both endpoints return `503`.
