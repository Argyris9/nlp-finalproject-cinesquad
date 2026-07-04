from backend.tests.conftest import submit_default_preferences


def test_create_session(client):
    response = client.post("/api/sessions", json={"creator_name": "Argy", "max_users": 4})
    assert response.status_code == 200
    body = response.json()
    assert len(body["session_id"]) == 6
    assert body["status"] == "waiting"
    assert body["users"][0]["display_name"] == "Argy"
    assert body["users"][0]["ready"] is False


def test_join_session(client, two_user_session):
    session_id = two_user_session["session_id"]
    response = client.get(f"/api/sessions/{session_id}/status")
    assert response.status_code == 200
    body = response.json()
    assert len(body["users"]) == 2
    assert body["min_users_reached"] is True
    assert body["all_users_ready"] is False


def test_join_nonexistent_session_returns_404(client):
    response = client.post("/api/sessions/ZZZZZZ/join", json={"display_name": "Ghost"})
    assert response.status_code == 404


def test_join_full_session_returns_400(client):
    r = client.post("/api/sessions", json={"creator_name": "Argy", "max_users": 2})
    session_id = r.json()["session_id"]
    client.post(f"/api/sessions/{session_id}/join", json={"display_name": "Maria"})
    response = client.post(f"/api/sessions/{session_id}/join", json={"display_name": "Extra"})
    assert response.status_code == 400


def test_submit_preferences_marks_user_ready(client, two_user_session):
    session_id = two_user_session["session_id"]
    user1_id = two_user_session["user1_id"]

    response = submit_default_preferences(client, session_id, user1_id)
    assert response.status_code == 200
    assert response.json()["ready"] is True

    status = client.get(f"/api/sessions/{session_id}/status").json()
    user1_status = next(u for u in status["users"] if u["user_id"] == user1_id)
    assert user1_status["ready"] is True
    assert status["all_users_ready"] is False  # user2 hasn't submitted yet


def test_submit_preferences_unknown_user_returns_404(client, two_user_session):
    session_id = two_user_session["session_id"]
    response = submit_default_preferences(client, session_id, "u_doesnotexist")
    assert response.status_code == 404
