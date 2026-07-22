"""Pydantic request/response models for the CineSync group-recommendation
feature (sessions, preferences, group recommendations, session-grounded
chat, movie detail, model info). Kept separate from the older single-user
endpoints in main.py (classify/topics/chat/sentiment), which stay untouched.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RuntimePreference = Literal["under_90", "90_120", "120_150", "any"]


class UserInfo(BaseModel):
    user_id: str
    display_name: str
    ready: bool = False


# ---- Sessions ----------------------------------------------------------


class CreateSessionRequest(BaseModel):
    creator_name: str
    max_users: int = 4
    device_id: str | None = None  # persistent per-browser id, see frontend useDeviceId


class CreateSessionResponse(BaseModel):
    session_id: str
    session_code: str
    status: str
    users: list[UserInfo]
    message: str


class JoinSessionRequest(BaseModel):
    display_name: str
    device_id: str | None = None


class JoinSessionResponse(BaseModel):
    session_id: str
    user_id: str
    display_name: str
    status: str
    users: list[UserInfo]
    rejoined: bool = False  # true if device_id matched an existing seat instead of creating a new one


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    min_users_reached: bool
    all_users_ready: bool
    users: list[UserInfo]


# ---- Preferences --------------------------------------------------------


class PreferenceRequest(BaseModel):
    user_id: str
    preferred_genres: list[str] = []
    avoid_genres: list[str] = []
    moods: list[str] = []
    attention_level: str | None = None
    runtime_preference: RuntimePreference = "any"
    min_rating: float = Field(0.0, ge=0, le=5)
    free_text: str = ""
    reference_movies: list[str] = []


class PreferenceResponse(BaseModel):
    session_id: str
    user_id: str
    ready: bool
    message: str


# ---- Recommendations -----------------------------------------------------


class RecommendRequest(BaseModel):
    top_k: int = 10


class IndividualScore(BaseModel):
    user_id: str
    display_name: str
    score: float
    match_percentage: int


class SourceFlags(BaseModel):
    has_ratings: bool
    has_genres: bool
    has_tags: bool
    has_overview: bool
    uses_llm_fallback: bool = False


class RecommendationItem(BaseModel):
    rank: int
    movie_id: str
    title: str
    year: int | None
    genres: list[str]
    group_score: float
    group_match_percentage: int
    individual_scores: list[IndividualScore]
    confidence: str
    data_status: str
    data_status_message: str
    explanation: str
    source_flags: SourceFlags


class RecommendResponse(BaseModel):
    session_id: str
    generated_at: str
    recommendations: list[RecommendationItem]


# ---- Session-grounded chat -----------------------------------------------


class GroupChatRequest(BaseModel):
    user_id: str
    message: str
    current_movie_ids: list[str] = []


class RetrievedMovieRef(BaseModel):
    movie_id: str
    title: str
    score: float


class GroupChatResponse(BaseModel):
    answer: str
    retrieved_movies: list[RetrievedMovieRef]
    grounding_note: str


class ChatHistoryEntry(BaseModel):
    id: int
    user_id: str
    display_name: str
    message: str
    answer: str
    retrieved_movies: list[RetrievedMovieRef] = []


# ---- Movies ---------------------------------------------------------------


class MovieDetailResponse(BaseModel):
    movie_id: str
    title: str
    year: int | None
    genres: list[str]
    average_rating: float | None
    rating_count: int | None
    tags: list[str]
    overview: str | None
    source_flags: SourceFlags
    data_status: str
    data_status_message: str


# ---- Model info -------------------------------------------------------------


class DatasetInfo(BaseModel):
    name: str
    role: str
    loaded: bool


class ModelInfoEntry(BaseModel):
    name: str
    type: str
    loaded: bool


class ModelInfoResponse(BaseModel):
    project_name: str = "CineSync"
    backend_version: str = "0.1.0"
    data_mode: str
    datasets: list[DatasetInfo]
    models: list[ModelInfoEntry]
    notes: list[str]
