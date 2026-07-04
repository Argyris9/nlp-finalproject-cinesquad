"""Data-transparency ("fallback") service.

For every candidate movie, be explicit about which pieces of its profile
came from real data vs. were derived/approximated, so users (and graders)
can see when a recommendation/explanation is well-grounded vs. a
best-effort guess from partial data.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SourceFlags:
    has_ratings: bool
    has_genres: bool
    has_tags: bool
    has_overview: bool
    uses_llm_fallback: bool = False

    def as_dict(self) -> dict:
        return {
            "has_ratings": self.has_ratings,
            "has_genres": self.has_genres,
            "has_tags": self.has_tags,
            "has_overview": self.has_overview,
            "uses_llm_fallback": self.uses_llm_fallback,
        }


@dataclass
class DataStatus:
    status: str
    message: str
    confidence: str


FULL_DATA = DataStatus(
    "FULL_DATA",
    "Data source: Dataset-based profile. This recommendation is based on available "
    "ratings, genres, tags, and movie description from the dataset.",
    "High",
)
RATINGS_GENRES_NO_DESCRIPTION = DataStatus(
    "RATINGS_GENRES_NO_DESCRIPTION",
    "Data source: Ratings and genre data available; description unavailable. This movie "
    "has rating and genre information in the dataset, but no dataset-provided plot "
    "description was available. Any short explanation is generated from available "
    "genres, tags, and rating patterns, and should not be treated as verified plot metadata.",
    "Medium",
)
TEXT_ONLY_NO_RATINGS = DataStatus(
    "TEXT_ONLY_NO_RATINGS",
    "Data source: Text metadata available; rating history unavailable. This movie was "
    "matched using its description, genres, and semantic similarity to the users' "
    "preferences. It was not scored using the deep-learning rating model because no "
    "rating history was available.",
    "Medium",
)
RATING_ONLY_LIMITED_TEXT = DataStatus(
    "RATING_ONLY_LIMITED_TEXT",
    "Data source: Rating-based recommendation with limited text metadata. This movie was "
    "recommended mainly because of rating-pattern similarity. Since limited textual "
    "metadata was available, the explanation is less detailed.",
    "Low-Medium",
)
AI_FALLBACK_USED = DataStatus(
    "AI_FALLBACK_USED",
    "AI fallback used: No dataset-provided description was available. A local LLM "
    "generated a short fallback description using the movie title, genres, and available "
    "tags. This text is used only for user-facing explanation, not for model training or evaluation.",
    "Medium-Low",
)
INSUFFICIENT_DATA = DataStatus(
    "INSUFFICIENT_DATA",
    "Excluded from recommendation: Insufficient data. This movie was not included in the "
    "final recommendation list because it did not have enough rating or textual metadata "
    "to produce a reliable score.",
    "Exclude",
)


def compute_source_flags(movie_row: dict) -> SourceFlags:
    return SourceFlags(
        has_ratings=bool(movie_row.get("rating_count")) and movie_row.get("rating_count", 0) > 0,
        has_genres=bool(movie_row.get("genres")),
        has_tags=bool(movie_row.get("tags")) or bool(movie_row.get("genome_tags")),
        has_overview=bool(movie_row.get("overview")),
        uses_llm_fallback=bool(movie_row.get("uses_llm_fallback", False)),
    )


def classify_data_status(flags: SourceFlags) -> DataStatus:
    if flags.uses_llm_fallback:
        return AI_FALLBACK_USED
    if flags.has_ratings and flags.has_genres and flags.has_tags and flags.has_overview:
        return FULL_DATA
    if flags.has_ratings and flags.has_genres and not flags.has_overview:
        return RATINGS_GENRES_NO_DESCRIPTION
    if not flags.has_ratings and flags.has_overview:
        return TEXT_ONLY_NO_RATINGS
    if flags.has_ratings and not flags.has_overview and not flags.has_tags:
        return RATING_ONLY_LIMITED_TEXT
    if not any((flags.has_ratings, flags.has_genres, flags.has_tags, flags.has_overview)):
        return INSUFFICIENT_DATA
    # Any remaining partial-data combination not covered by a specific tier
    # above still gets a reasonable, non-crashing default.
    return TEXT_ONLY_NO_RATINGS if flags.has_overview else RATING_ONLY_LIMITED_TEXT


def is_excluded(status: DataStatus) -> bool:
    return status.status == INSUFFICIENT_DATA.status
