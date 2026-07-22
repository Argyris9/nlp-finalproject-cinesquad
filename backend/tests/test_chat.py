from backend.services import group_chat_service
from backend.tests.conftest import submit_default_preferences


def test_single_user_chat_answers_question(client):
    response = client.post("/chat", json={"question": "What is Inception about?"})
    assert response.status_code == 200
    body = response.json()
    assert body["sources"]
    assert body["sources"][0]["title"] == "Inception"


def test_single_user_chat_follow_up_resolves_pronoun(client):
    """Regression test: a short pronoun-only follow-up ("who directed it?")
    must still resolve to the movie from the previous turn instead of
    retrieving an unrelated one -- this is what silently broke before
    history was folded into short follow-up queries."""
    first = client.post("/chat", json={"question": "What is Inception about?"})
    history = [
        {"role": "user", "text": "What is Inception about?"},
        {"role": "assistant", "text": first.json()["answer"]},
    ]

    response = client.post("/chat", json={"question": "who directed it?", "history": history})
    assert response.status_code == 200
    body = response.json()
    assert body["sources"]
    assert body["sources"][0]["title"] == "Inception"
    assert body["sources"][0]["score"] == 1.0


def test_single_user_chat_low_confidence_returns_fallback(client):
    response = client.post(
        "/chat",
        json={"question": "xyzzy quantum kombucha fermentation tax code appendix 1923"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["sources"] == []
    assert "don't have enough information" in body["answer"]


def test_group_chat_returns_grounded_answer(client, two_user_session):
    session_id = two_user_session["session_id"]
    submit_default_preferences(client, session_id, two_user_session["user1_id"])
    submit_default_preferences(client, session_id, two_user_session["user2_id"])

    recommend = client.post(f"/api/sessions/{session_id}/recommend", json={"top_k": 5})
    movie_ids = [m["movie_id"] for m in recommend.json()["recommendations"]]

    response = client.post(
        f"/api/sessions/{session_id}/chat",
        json={
            "user_id": two_user_session["user1_id"],
            "message": "give us something darker",
            "current_movie_ids": movie_ids,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer"]
    assert body["retrieved_movies"]
    assert all(m["movie_id"] not in movie_ids for m in body["retrieved_movies"])


def test_group_chat_history_is_shared_across_users(client, two_user_session):
    session_id = two_user_session["session_id"]
    user1_id = two_user_session["user1_id"]
    user2_id = two_user_session["user2_id"]
    submit_default_preferences(client, session_id, user1_id)
    submit_default_preferences(client, session_id, user2_id)

    recommend = client.post(f"/api/sessions/{session_id}/recommend", json={"top_k": 5})
    movie_ids = [m["movie_id"] for m in recommend.json()["recommendations"]]

    client.post(
        f"/api/sessions/{session_id}/chat",
        json={"user_id": user1_id, "message": "give us something darker", "current_movie_ids": movie_ids},
    )
    client.post(
        f"/api/sessions/{session_id}/chat",
        json={"user_id": user2_id, "message": "what about comedies", "current_movie_ids": movie_ids},
    )

    response = client.get(f"/api/sessions/{session_id}/chat/history")
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 2
    assert history[0]["user_id"] == user1_id
    assert history[0]["display_name"] == "Argy"
    assert history[1]["user_id"] == user2_id
    assert history[1]["display_name"] == "Maria"
    assert all(entry["answer"] for entry in history)


def test_group_chat_low_confidence_returns_fallback(monkeypatch):
    """When nothing in the catalog clears the relevance bar, the service
    should admit that rather than asking the LLM to answer from no
    grounding data at all."""
    monkeypatch.setattr(group_chat_service.catalog_service, "search", lambda *a, **k: [])

    result = group_chat_service.answer_group_chat(
        user_message="something completely unmatchable",
        current_movie_ids=[],
        chat_history=[],
    )
    assert result["retrieved_movies"] == []
    assert "couldn't find a good match" in result["answer"]
