from backend.services import fallback_service


def test_full_data_movie_gets_high_confidence():
    row = {"rating_count": 500, "genres": "Drama, Sci-Fi", "tags": "space, time travel", "overview": "A story."}
    flags = fallback_service.compute_source_flags(row)
    status = fallback_service.classify_data_status(flags)
    assert status.status == "FULL_DATA"
    assert status.confidence == "High"


def test_missing_overview_with_ratings_and_genres_gets_medium_confidence():
    row = {"rating_count": 500, "genres": "Drama, Sci-Fi", "tags": None, "overview": None}
    flags = fallback_service.compute_source_flags(row)
    status = fallback_service.classify_data_status(flags)
    assert status.status == "RATINGS_GENRES_NO_DESCRIPTION"
    assert "description unavailable" in status.message.lower()
    assert not fallback_service.is_excluded(status)


def test_text_only_no_ratings_gets_medium_confidence():
    row = {"rating_count": 0, "genres": "Drama", "tags": None, "overview": "A story with no rating history."}
    flags = fallback_service.compute_source_flags(row)
    status = fallback_service.classify_data_status(flags)
    assert status.status == "TEXT_ONLY_NO_RATINGS"


def test_insufficient_data_movie_is_excluded():
    row = {"rating_count": 0, "genres": None, "tags": None, "overview": None}
    flags = fallback_service.compute_source_flags(row)
    status = fallback_service.classify_data_status(flags)
    assert status.status == "INSUFFICIENT_DATA"
    assert fallback_service.is_excluded(status)


def test_llm_fallback_flag_takes_priority():
    row = {"rating_count": 500, "genres": "Drama", "tags": "x", "overview": "generated text", "uses_llm_fallback": True}
    flags = fallback_service.compute_source_flags(row)
    status = fallback_service.classify_data_status(flags)
    assert status.status == "AI_FALLBACK_USED"
