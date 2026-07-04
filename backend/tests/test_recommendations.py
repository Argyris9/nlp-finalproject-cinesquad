from backend.tests.conftest import submit_default_preferences


def test_recommend_fails_with_only_one_user(client):
    r = client.post("/api/sessions", json={"creator_name": "Solo", "max_users": 4})
    session_id = r.json()["session_id"]
    user_id = r.json()["users"][0]["user_id"]
    submit_default_preferences(client, session_id, user_id)

    response = client.post(f"/api/sessions/{session_id}/recommend", json={"top_k": 5})
    assert response.status_code == 400


def test_recommend_fails_if_not_all_users_ready(client, two_user_session):
    session_id = two_user_session["session_id"]
    submit_default_preferences(client, session_id, two_user_session["user1_id"])
    # user2 never submits preferences

    response = client.post(f"/api/sessions/{session_id}/recommend", json={"top_k": 5})
    assert response.status_code == 400


def test_recommend_succeeds_after_both_users_ready(client, two_user_session):
    session_id = two_user_session["session_id"]
    submit_default_preferences(
        client, session_id, two_user_session["user1_id"],
        preferred_genres=["Sci-Fi", "Thriller"], avoid_genres=["Horror"],
    )
    submit_default_preferences(
        client, session_id, two_user_session["user2_id"],
        preferred_genres=["Sci-Fi", "Drama"],
    )

    response = client.post(f"/api/sessions/{session_id}/recommend", json={"top_k": 5})
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == session_id
    assert len(body["recommendations"]) == 5

    top = body["recommendations"][0]
    assert top["rank"] == 1
    assert isinstance(top["genres"], list)
    assert 0 <= top["group_score"] <= 1
    assert len(top["individual_scores"]) == 2
    assert top["data_status"] != "INSUFFICIENT_DATA"
    assert top["confidence"] in {"High", "Medium", "Low-Medium", "Medium-Low"}
    assert isinstance(top["explanation"], str) and len(top["explanation"]) > 0
    assert set(top["source_flags"].keys()) == {
        "has_ratings", "has_genres", "has_tags", "has_overview", "uses_llm_fallback",
    }

    # recommendations should be sorted by group_score descending
    scores = [r["group_score"] for r in body["recommendations"]]
    assert scores == sorted(scores, reverse=True)
