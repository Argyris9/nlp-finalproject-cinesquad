"""Combines semantic similarity, deep-learning (NCF) score, genre
match/avoid penalties, rating, and runtime preference into a per-user
score, then aggregates across the group with a disagreement penalty.

individual_score = 0.40*semantic + 0.25*deep + 0.20*genre + 0.10*rating + 0.05*runtime
(x0.35 penalty if the movie contains a genre the user asked to avoid)

group_score = mean(individual_scores) - 0.25 * std(individual_scores)
"""

from __future__ import annotations

import math

import numpy as np

from backend.services import fallback_service
from backend.services.catalog_service import catalog_service, parse_list_field
from backend.services.recommender_service import recommender_service

WEIGHTS = {"semantic": 0.40, "deep": 0.25, "genre": 0.20, "rating": 0.10, "runtime": 0.05}
AVOID_GENRE_PENALTY = 0.35

RUNTIME_BUCKETS = {
    "under_90": (0, 90),
    "90_120": (90, 120),
    "120_150": (120, 150),
}


def build_preference_text(prefs: dict) -> str:
    parts = []
    if prefs.get("preferred_genres"):
        parts.append("preferred genres: " + " ".join(prefs["preferred_genres"]).lower())
    if prefs.get("moods"):
        parts.append("mood: " + " ".join(prefs["moods"]).lower())
    if prefs.get("attention_level"):
        parts.append(f"attention: {prefs['attention_level']}")
    if prefs.get("free_text"):
        parts.append(f"User says: {prefs['free_text']}")
    if prefs.get("reference_movies"):
        parts.append("liked movies: " + ", ".join(prefs["reference_movies"]))
    return ". ".join(parts) if parts else "no specific preference provided"


def _is_nan(value) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def _runtime_score(runtime_minutes, preference: str) -> float:
    if preference == "any" or preference not in RUNTIME_BUCKETS:
        return 1.0
    if _is_nan(runtime_minutes):
        return 0.5  # unknown runtime -- neutral, don't penalize missing data
    low, high = RUNTIME_BUCKETS[preference]
    if preference == "under_90":
        return 1.0 if runtime_minutes < high else 0.3
    return 1.0 if low <= runtime_minutes <= high else 0.3


def _genre_score(movie_genres: list[str], preferred_genres: list[str]) -> float:
    if not preferred_genres:
        return 0.5  # no stated preference -- neutral, not a penalty
    movie_set = {g.lower() for g in movie_genres}
    preferred_set = {g.lower() for g in preferred_genres}
    if not preferred_set:
        return 0.5
    overlap = len(movie_set & preferred_set)
    return min(1.0, overlap / len(preferred_set))


def _resolve_reference_movie_ids(reference_titles: list[str]) -> list[str]:
    ids = []
    for title in reference_titles or []:
        movie = catalog_service.find_by_title(title)
        if movie:
            ids.append(str(movie["movie_id"]))
    return ids


def score_user_against_catalog(preferences: dict) -> dict[str, dict]:
    """Scores every catalog movie for one user's preferences. Movies below
    that user's min_rating are dropped entirely (not just down-scored)."""
    catalog = catalog_service.catalog
    pref_vector = catalog_service.embed_text(build_preference_text(preferences))
    semantic_scores = catalog_service.similarity_to_all(pref_vector)
    semantic_scores = (semantic_scores + 1) / 2  # cosine [-1,1] -> [0,1]

    reference_ids = _resolve_reference_movie_ids(preferences.get("reference_movies", []))
    preferred_genres = preferences.get("preferred_genres", [])
    avoid_genres = {g.lower() for g in preferences.get("avoid_genres", [])}
    runtime_pref = preferences.get("runtime_preference", "any")
    min_rating = preferences.get("min_rating", 0.0)

    results: dict[str, dict] = {}
    for i, row in enumerate(catalog.itertuples(index=False)):
        movie_id = str(row.movie_id)
        avg_rating = 0.0 if _is_nan(row.average_rating) else row.average_rating
        if avg_rating < min_rating:
            continue

        movie_genres = parse_list_field(row.genres)
        semantic = float(semantic_scores[i])
        genre = _genre_score(movie_genres, preferred_genres)
        rating = avg_rating / 5.0
        deep = recommender_service.deep_score(movie_id, reference_ids)
        used_deep_model = deep is not None
        if deep is None:
            deep = rating
        runtime = _runtime_score(row.runtime_minutes, runtime_pref)

        individual = (
            WEIGHTS["semantic"] * semantic
            + WEIGHTS["deep"] * deep
            + WEIGHTS["genre"] * genre
            + WEIGHTS["rating"] * rating
            + WEIGHTS["runtime"] * runtime
        )
        has_avoid_genre = bool({g.lower() for g in movie_genres} & avoid_genres)
        if has_avoid_genre:
            individual *= AVOID_GENRE_PENALTY
        individual = max(0.0, min(1.0, individual))

        results[movie_id] = {
            "semantic": semantic,
            "genre": genre,
            "rating": rating,
            "deep": deep,
            "used_deep_model": used_deep_model,
            "runtime": runtime,
            "individual_score": individual,
            "has_avoid_genre": has_avoid_genre,
        }
    return results


def _build_explanation(movie_row: dict, preferred_genres_by_user: list[list[str]], moods_by_user: list[list[str]]) -> str:
    movie_genres = {g.lower() for g in parse_list_field(movie_row.get("genres"))}
    all_preferred = [g for genres in preferred_genres_by_user for g in genres]
    matched_genres = sorted({g for g in all_preferred if g.lower() in movie_genres}, key=str.lower)
    all_moods = sorted({m for moods in moods_by_user for m in moods})

    pieces = []
    if matched_genres:
        pieces.append(f"it shares the group's interest in {', '.join(matched_genres[:3])}")
    if all_moods:
        pieces.append(f"fits the requested {', '.join(all_moods[:2])} vibe")
    if not pieces:
        pieces.append("it scores well across the group's combined preferences")
    return "Recommended because " + " and ".join(pieces) + "."


def generate_recommendations(users: dict[str, dict], display_names: dict[str, str], top_k: int = 10) -> list[dict]:
    """users: {user_id: preferences_dict}. Returns ranked recommendation
    dicts (movies with INSUFFICIENT_DATA are excluded per fallback_service)."""
    per_user_scores = {uid: score_user_against_catalog(prefs) for uid, prefs in users.items()}

    candidate_ids = set(catalog_service.all_movie_ids())
    for scores in per_user_scores.values():
        candidate_ids &= set(scores.keys())

    preferred_genres_by_user = [prefs.get("preferred_genres", []) for prefs in users.values()]
    moods_by_user = [prefs.get("moods", []) for prefs in users.values()]

    ranked = []
    for movie_id in candidate_ids:
        movie_row = catalog_service.get_movie(movie_id)
        flags = fallback_service.compute_source_flags(movie_row)
        status = fallback_service.classify_data_status(flags)
        if fallback_service.is_excluded(status):
            continue

        individual_scores = {uid: per_user_scores[uid][movie_id]["individual_score"] for uid in users}
        values = list(individual_scores.values())
        group_score = float(np.mean(values) - 0.25 * np.std(values))
        group_score = max(0.0, min(1.0, group_score))

        ranked.append((movie_id, movie_row, flags, status, group_score, individual_scores))

    ranked.sort(key=lambda x: x[4], reverse=True)
    ranked = ranked[:top_k]

    recommendations = []
    for rank, (movie_id, movie_row, flags, status, group_score, individual_scores) in enumerate(ranked, start=1):
        year = movie_row.get("year")
        year = int(year) if not _is_nan(year) else None
        recommendations.append(
            {
                "rank": rank,
                "movie_id": movie_id,
                "title": movie_row.get("title"),
                "year": year,
                "genres": parse_list_field(movie_row.get("genres")),
                "group_score": round(group_score, 4),
                "group_match_percentage": round(group_score * 100),
                "individual_scores": [
                    {
                        "user_id": uid,
                        "display_name": display_names.get(uid, uid),
                        "score": round(score, 4),
                        "match_percentage": round(score * 100),
                    }
                    for uid, score in individual_scores.items()
                ],
                "confidence": status.confidence,
                "data_status": status.status,
                "data_status_message": status.message,
                "explanation": _build_explanation(movie_row, preferred_genres_by_user, moods_by_user),
                "source_flags": flags.as_dict(),
            }
        )
    return recommendations
