import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.routers.group import router as group_router
from backend.services.classification_service import classifier
from backend.services.rag_service import Turn, rag_service
from backend.services.sentiment_service import sentiment_classifier
from backend.services.topic_service import topic_service

app = FastAPI(title="Movie NLP Project API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(group_router)


class TextRequest(BaseModel):
    text: str


class ChatTurn(BaseModel):
    role: str  # "user" or "assistant"
    text: str


class ChatRequest(BaseModel):
    question: str
    top_k: int = 3
    history: list[ChatTurn] = []


@app.get("/health")
def health() -> dict:
    return {
        "classification_ready": classifier.ready,
        "topic_modeling_ready": topic_service.ready,
        "rag_ready": rag_service.ready,
        "sentiment_ready": sentiment_classifier.ready,
    }


@app.post("/classify")
def classify(request: TextRequest) -> dict:
    if not classifier.ready:
        raise HTTPException(503, "Classification model not trained yet -- see models/classification/README.md")
    return classifier.predict(request.text)


@app.get("/topics")
def list_topics() -> list[dict]:
    if not topic_service.ready:
        raise HTTPException(503, "Topic model not trained yet -- see models/topic_modeling/README.md")
    return topic_service.all_topics()


@app.post("/topics")
def predict_topic(request: TextRequest) -> dict:
    if not topic_service.ready:
        raise HTTPException(503, "Topic model not trained yet -- see models/topic_modeling/README.md")
    return topic_service.predict(request.text)


@app.post("/chat")
def chat(request: ChatRequest) -> dict:
    if not rag_service.ready:
        raise HTTPException(503, "RAG corpus not provided yet -- see models/rag/README.md")
    history = [Turn(role=t.role, text=t.text) for t in request.history]
    return rag_service.answer(request.question, top_k=request.top_k, history=history)


@app.post("/sentiment")
def sentiment(request: TextRequest) -> dict:
    if not sentiment_classifier.ready:
        raise HTTPException(503, "Sentiment model not trained yet -- see models/sentiment/README.md")
    return sentiment_classifier.predict(request.text)
