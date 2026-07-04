def test_legacy_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "classification_ready",
        "topic_modeling_ready",
        "rag_ready",
        "sentiment_ready",
    }


def test_cinesync_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "CineSync Backend"
    assert body["mode"] in {"FULL_DATA_MODE", "DEMO_MODE"}


def test_model_info_returns_expected_shape(client):
    response = client.get("/api/model-info")
    assert response.status_code == 200
    body = response.json()
    assert body["project_name"] == "CineSync"
    assert isinstance(body["datasets"], list)
    assert isinstance(body["models"], list)
