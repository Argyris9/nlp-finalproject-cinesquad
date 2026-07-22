"""CineSync: shared-session group movie recommendations. Sessions are
in-memory (session_service.py) -- 2-4 users join with a room code, submit
individual preferences, and get back movies scored against the whole
group (group_scoring_service.py), plus a session-grounded chat
(group_chat_service.py) for follow-up questions.

This whole feature is additive: the older single-user endpoints
(/health, /classify, /topics, /chat, /sentiment in backend/main.py) are
untouched and keep working independently of everything in this router.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.schemas import (
    ChatHistoryEntry,
    CreateSessionRequest,
    CreateSessionResponse,
    GroupChatRequest,
    GroupChatResponse,
    JoinSessionRequest,
    JoinSessionResponse,
    ModelInfoResponse,
    MovieDetailResponse,
    PreferenceRequest,
    PreferenceResponse,
    RecommendRequest,
    RecommendResponse,
    RetrievedMovieRef,
    SessionStatusResponse,
    SourceFlags,
    UserInfo,
)
from backend.services import fallback_service, generator_service, group_chat_service, group_scoring_service
from backend.services.catalog_service import catalog_service, parse_list_field
from backend.services.classification_service import classifier
from backend.services.rag_service import rag_service
from backend.services.recommender_service import recommender_service
from backend.services.session_service import MIN_SESSION_USERS, session_service
from backend.services.sentiment_service import sentiment_classifier
from backend.services.topic_service import topic_service

router = APIRouter(prefix="/api")


def _users_response(session) -> list[UserInfo]:
    return [UserInfo(user_id=u.user_id, display_name=u.display_name, ready=u.ready) for u in session.users.values()]


# ---- Health / model info --------------------------------------------------


@router.get("/health")
def api_health() -> dict:
    return {
        "status": "ok",
        "service": "CineSync Backend",
        "mode": "FULL_DATA_MODE" if catalog_service.ready else "DEMO_MODE",
        "models_loaded": catalog_service.ready,
        "vector_index_loaded": catalog_service.ready,
    }


@router.get("/model-info", response_model=ModelInfoResponse)
def model_info() -> ModelInfoResponse:
    return ModelInfoResponse(
        data_mode="FULL_DATA_MODE" if catalog_service.ready else "DEMO_MODE",
        datasets=[
            {"name": "MovieLens 25M", "role": "Ratings, tags, and genome tags for the group recommender", "loaded": catalog_service.ready},
            {"name": "TMDB (v11 + 5000)", "role": "Plot overview / runtime enrichment", "loaded": catalog_service.ready},
        ],
        models=[
            {"name": "Semantic Embedding Model (all-MiniLM-L6-v2)", "type": "SentenceTransformer", "loaded": catalog_service.ready},
            {"name": "Neural Collaborative Filtering", "type": "PyTorch", "loaded": recommender_service.ready},
            {"name": "Genre Classifier", "type": "Traditional ML / DL", "loaded": classifier.ready},
            {"name": "Topic Model", "type": "LDA/NMF", "loaded": topic_service.ready},
            {"name": "Sentiment Classifier", "type": "Traditional ML / DL", "loaded": sentiment_classifier.ready},
            {
                "name": f"RAG Chatbot (retriever + {'Gemini ' + generator_service.GEMINI_MODEL if generator_service.USING_GEMINI else 'local flan-t5-base'})",
                "type": "Gemini API" if generator_service.USING_GEMINI else "local seq2seq",
                "loaded": rag_service.ready,
            },
        ],
        notes=[
            "Training is not performed live during API requests.",
            "The backend loads precomputed artifacts when available.",
            "The NCF recommender falls back to a rating-based score for movies/users it has no learned embedding for.",
            f"Chat generation backend: {'Gemini (' + generator_service.GEMINI_MODEL + ')' if generator_service.USING_GEMINI else 'local flan-t5-base (set GEMINI_API_KEY in .env to use Gemini instead)'}.",
        ],
    )


# ---- Sessions --------------------------------------------------------------


@router.post("/sessions", response_model=CreateSessionResponse)
def create_session(request: CreateSessionRequest) -> CreateSessionResponse:
    session, creator = session_service.create_session(request.creator_name, request.max_users, request.device_id)
    return CreateSessionResponse(
        session_id=session.session_id,
        session_code=session.session_id,
        status=session.status,
        users=_users_response(session),
        message="Session created successfully.",
    )


@router.post("/sessions/{session_id}/join", response_model=JoinSessionResponse)
def join_session(session_id: str, request: JoinSessionRequest) -> JoinSessionResponse:
    session, user, rejoined = session_service.join_session(session_id, request.display_name, request.device_id)
    return JoinSessionResponse(
        session_id=session.session_id,
        user_id=user.user_id,
        display_name=user.display_name,
        status="joined",
        users=_users_response(session),
        rejoined=rejoined,
    )


@router.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
def session_status(session_id: str) -> SessionStatusResponse:
    session = session_service.get_session(session_id)
    return SessionStatusResponse(
        session_id=session.session_id,
        status=session.status,
        min_users_reached=session_service.min_users_reached(session),
        all_users_ready=session_service.all_users_ready(session),
        users=_users_response(session),
    )


@router.post("/sessions/{session_id}/preferences", response_model=PreferenceResponse)
def submit_preferences(session_id: str, request: PreferenceRequest) -> PreferenceResponse:
    preferences = request.model_dump(exclude={"user_id"})
    session = session_service.submit_preferences(session_id, request.user_id, preferences)
    return PreferenceResponse(
        session_id=session.session_id,
        user_id=request.user_id,
        ready=True,
        message="Preferences saved successfully.",
    )


@router.post("/sessions/{session_id}/recommend", response_model=RecommendResponse)
def recommend(session_id: str, request: RecommendRequest) -> RecommendResponse:
    session = session_service.get_session(session_id)

    if not session_service.min_users_reached(session):
        raise HTTPException(400, f"At least {MIN_SESSION_USERS} users are required before requesting recommendations.")
    if not session_service.all_users_ready(session):
        raise HTTPException(400, "Not all users have submitted their preferences yet.")
    if not catalog_service.ready:
        raise HTTPException(503, "Movie catalog not available -- see models/recommender/README.md")

    users_preferences = {uid: u.preferences for uid, u in session.users.items()}
    display_names = {uid: u.display_name for uid, u in session.users.items()}

    try:
        recommendations = group_scoring_service.generate_recommendations(
            users_preferences, display_names, top_k=request.top_k
        )
    except Exception as exc:  # noqa: BLE001 -- never leak internals to the client
        raise HTTPException(500, "Internal error while generating recommendations.") from exc

    session_service.mark_recommended(session, recommendations)
    return RecommendResponse(
        session_id=session.session_id,
        generated_at=datetime.now(timezone.utc).isoformat(),
        recommendations=recommendations,
    )


@router.post("/sessions/{session_id}/chat", response_model=GroupChatResponse)
def group_chat(session_id: str, request: GroupChatRequest) -> GroupChatResponse:
    session = session_service.get_session(session_id)
    user = session_service.get_user(session, request.user_id)  # 404 if user_id unknown
    if not catalog_service.ready:
        raise HTTPException(503, "Movie catalog not available -- see models/recommender/README.md")

    try:
        # Pass the chat history into the service so the LLM remembers previous turns
        result = group_chat_service.answer_group_chat(
            user_message=request.message,
            current_movie_ids=request.current_movie_ids,
            chat_history=session.chat_history
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, "Internal error while generating a chat response.") from exc

    session.chat_history.append({
        "id": len(session.chat_history),
        "user_id": request.user_id,
        "display_name": user.display_name,
        "message": request.message,
        "answer": result["answer"],
        "retrieved_movies": result["retrieved_movies"],
    })
    return GroupChatResponse(
        answer=result["answer"],
        retrieved_movies=[RetrievedMovieRef(**m) for m in result["retrieved_movies"]],
        grounding_note=result["grounding_note"],
    )


@router.get("/sessions/{session_id}/chat/history", response_model=list[ChatHistoryEntry])
def group_chat_history(session_id: str) -> list[ChatHistoryEntry]:
    """Every user in the session shares this history -- polled by the
    frontend so a message from one participant shows up for everyone."""
    session = session_service.get_session(session_id)
    return [ChatHistoryEntry(**turn) for turn in session.chat_history]


# ---- Movies -----------------------------------------------------------------


@router.get("/movies/{movie_id}", response_model=MovieDetailResponse)
def movie_detail(movie_id: str) -> MovieDetailResponse:
    if not catalog_service.ready:
        raise HTTPException(503, "Movie catalog not available -- see models/recommender/README.md")
    movie = catalog_service.get_movie(movie_id)
    if movie is None:
        raise HTTPException(404, f"Movie '{movie_id}' not found")

    flags = fallback_service.compute_source_flags(movie)
    status = fallback_service.classify_data_status(flags)
    year = movie.get("year")
    return MovieDetailResponse(
        movie_id=str(movie["movie_id"]),
        title=movie["title"],
        year=int(year) if year is not None and year == year else None,  # NaN != NaN
        genres=parse_list_field(movie.get("genres")),
        average_rating=movie.get("average_rating"),
        rating_count=int(movie["rating_count"]) if movie.get("rating_count") == movie.get("rating_count") else None,
        tags=parse_list_field(movie.get("tags")),
        overview=movie.get("overview") if isinstance(movie.get("overview"), str) else None,
        source_flags=SourceFlags(**flags.as_dict()),
        data_status=status.status,
        data_status_message=status.message,
    )
