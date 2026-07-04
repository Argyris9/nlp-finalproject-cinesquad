"""Session-grounded RAG chat: lets a group ask follow-up questions
("give us something darker", "remove horror") grounded in the movie
catalog and the recommendations currently shown to their session.

Uses the same shared generator as the single-user chatbot
(backend/services/generator_service.py) -- Gemini if GEMINI_API_KEY is
set, otherwise a fully local, offline fallback.
"""

from __future__ import annotations

import re

from backend.services import generator_service
from backend.services.catalog_service import catalog_service, parse_list_field
from backend.services.prompt_loader import load_prompt

SYSTEM_INSTRUCTION = load_prompt("group_chat_system.md")
# {current_movies} varies per request (the session's current recommendation
# set), so it stays in the per-request content rather than the static
# system instruction above.
PROMPT_TEMPLATE = (
    "The group is currently looking at these recommended movies: "
    "{current_movies}.\n\nMovie information:\n{context}\n\nUser message: {message}\nAnswer:"
)

_NEGATION_WORDS = r"not|no|without|remove|exclude|skip|less"

# How many candidates to pull from the vector index before genre filtering.
# Embedding similarity alone handles negation poorly ("not horror" can still
# score a horror movie highly, since "horror" is literally in the query) --
# overfetching gives the genre filter below enough to actually work with.
_SEARCH_OVERFETCH_MULTIPLIER = 40


def _detect_excluded_genres(message: str) -> set[str]:
    """Catches explicit exclusions like "not horror" / "remove the horror
    ones" -- a cheap, deterministic fix for something embeddings are known
    to handle badly (negation), rather than hoping semantic similarity
    alone keeps excluded genres out."""
    message_lower = message.lower()
    excluded = set()
    for genre in catalog_service.known_genres:
        pattern = rf"\b(?:{_NEGATION_WORDS})\b[\w\s]{{0,15}}\b{re.escape(genre.lower())}\b"
        if re.search(pattern, message_lower):
            excluded.add(genre.lower())
    return excluded


def answer_group_chat(user_message: str, current_movie_ids: list[str], top_k: int = 5) -> dict:
    if not catalog_service.ready:
        raise RuntimeError("catalog not loaded")

    current_movie_id_set = set(current_movie_ids)
    current_movies = [m for m in (catalog_service.get_movie(mid) for mid in current_movie_ids) if m]
    current_titles = [m["title"] for m in current_movies]

    # A bare request like "give us something darker" carries no signal on
    # its own -- ground the retrieval query in what the group is already
    # looking at (titles + genres), not just the raw message text.
    current_genres = {g.lower() for m in current_movies for g in parse_list_field(m.get("genres"))}
    query_text = user_message
    if current_titles:
        query_text = (
            f"Currently watching options: {', '.join(current_titles)} "
            f"({', '.join(sorted(current_genres))}). Request: {user_message}"
        )

    excluded_genres = _detect_excluded_genres(user_message)

    query_vector = catalog_service.embed_text(query_text)
    overfetch_k = min(len(catalog_service.all_movie_ids()), top_k * _SEARCH_OVERFETCH_MULTIPLIER)
    candidates = catalog_service.search(query_vector, top_k=overfetch_k)

    retrieved = []
    for movie_id, score in candidates:
        if movie_id in current_movie_id_set:
            continue  # don't re-suggest what's already shown
        movie = catalog_service.get_movie(movie_id)
        if not movie:
            continue
        movie_genres = {g.lower() for g in parse_list_field(movie.get("genres"))}
        if movie_genres & excluded_genres:
            continue  # respects "not horror" style requests
        if current_genres and not (movie_genres & current_genres):
            continue  # stay within the group's established genre space
        retrieved.append((movie_id, score))
        if len(retrieved) >= top_k:
            break

    context_lines = []
    retrieved_movies = []
    for movie_id, score in retrieved:
        movie = catalog_service.get_movie(movie_id)
        if not movie:
            continue
        overview = movie.get("overview") or "No dataset-provided description available."
        context_lines.append(f"- {movie['title']}: {overview}")
        retrieved_movies.append({"movie_id": movie_id, "title": movie["title"], "score": round(score, 4)})

    prompt = PROMPT_TEMPLATE.format(
        current_movies=", ".join(current_titles) if current_titles else "none yet",
        context="\n".join(context_lines),
        message=user_message,
    )
    answer_text = generator_service.generate(prompt, system_instruction=SYSTEM_INSTRUCTION, max_new_tokens=128)

    return {
        "answer": answer_text,
        "retrieved_movies": retrieved_movies,
        "grounding_note": (
            "This answer was generated using retrieved movie profiles from the dataset "
            "and the movies currently shown to this session."
        ),
    }
