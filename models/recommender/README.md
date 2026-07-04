# Group recommender — movie catalog + optional deep learning model

Powers the CineSync shared-session group recommendations
(`/api/sessions/{id}/recommend`) and session-grounded chat
(`/api/sessions/{id}/chat`).

## `movies_catalog.csv` (already built, checked in)

Unlike the other `models/` drop zones, this one isn't empty -- the movie
catalog itself was built and is ready to use:

- **Source**: MovieLens 25M (`ml-25m/movies.csv` + `ratings.csv` + `tags.csv`
  + `genome-scores.csv`/`genome-tags.csv`), enriched with TMDB overview/runtime
  via `ml-25m/links.csv` → `tmdb_movie_dataset_v11/`.
- **Filter**: `rating_count >= 50` (13,176 movies) -- keeps the catalog to
  well-known titles and makes embedding + NCF training tractable on a laptop
  CPU, at the cost of excluding very obscure/rarely-rated movies. Documented
  here as the deliberate dataset-size adjustment.
- **Columns**: `movie_id, title, year, genres, average_rating, rating_count,
  tags, genome_tags, overview, runtime_minutes, text_profile`.

Rebuild it (e.g. with a different filter threshold) via the script used to
generate it, or just edit the CSV directly -- `backend/services/catalog_service.py`
just reads whatever's there at startup.

## `ncf_model.pt` + `id_mappings.json` (already trained, checked in)

A small Neural Collaborative Filtering model (`backend/ml/ncf_model.py`),
trained via:

```bash
python -m backend.ml.train_recommender
```

This samples 3M of the ~24.6M available ratings (again, for CPU
tractability -- see `--sample-size`), trains for a few epochs, and saves:

- `ncf_model.pt` -- model weights + architecture metadata + test RMSE/MAE
- `id_mappings.json` -- userId/movieId → embedding-index mappings

**The backend does not require this file.** If it's missing,
`recommender_service.py` reports `ready=False` and group scoring falls back
to the rating-based score for the "deep_score" component. Retrain any time
by re-running the command above; the backend picks up the new checkpoint on
its next restart (training is never triggered automatically by the API).

### Cold-start note (read before assuming "deep_score" is broken)

Session users are ad-hoc people, not registered MovieLens users -- the NCF
model has no learned *user* embedding for them. Rather than require one
(impossible for a brand-new user), `recommender_service.deep_score()` uses
the model's *movie* embeddings (meaningful for any movie seen in training)
and compares a candidate movie to the user's self-reported `reference_movies`
from the preference form. If a user gave no reference movies (or none
resolve to a known title), `deep_score` returns `None` and group scoring
falls back to the rating-based score for that user/movie pair -- this is
expected, not a bug.
