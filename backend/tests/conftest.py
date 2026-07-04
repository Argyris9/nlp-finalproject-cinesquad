"""Shared pytest fixtures. Importing backend.main triggers loading every
service's real models/catalog at collection time -- these are integration
tests against the actual running app, not mocks, so the first test run
takes as long as starting the server does (a minute or so)."""

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def two_user_session(client):
    """Creates a session, joins a second user, and returns the ids needed
    to submit preferences / request recommendations in a test."""
    r = client.post("/api/sessions", json={"creator_name": "Argy", "max_users": 4})
    data = r.json()
    session_id = data["session_id"]
    user1_id = data["users"][0]["user_id"]

    r = client.post(f"/api/sessions/{session_id}/join", json={"display_name": "Maria"})
    user2_id = r.json()["user_id"]

    return {"session_id": session_id, "user1_id": user1_id, "user2_id": user2_id}


def submit_default_preferences(client, session_id: str, user_id: str, **overrides):
    payload = {
        "user_id": user_id,
        "preferred_genres": ["Sci-Fi"],
        "avoid_genres": [],
        "moods": ["thought-provoking"],
        "attention_level": "moderate",
        "runtime_preference": "any",
        "min_rating": 0.0,
        "free_text": "something smart and interesting",
        "reference_movies": [],
    }
    payload.update(overrides)
    return client.post(f"/api/sessions/{session_id}/preferences", json=payload)
