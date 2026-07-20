"""Task 2: retrieval-augmented movie Q&A chatbot. See models/rag/README.md
for the corpus format a teammate needs to drop in. Unlike the other
services, this one doesn't wait for a "trained model" -- it builds
embeddings itself from whatever corpus.csv is provided.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from backend.services import generator_service
from backend.services.prompt_loader import load_prompt

RAG_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "rag"
CORPUS_PATH = RAG_DIR / "corpus.csv"
CONFIG_PATH = RAG_DIR / "config.json"

DEFAULT_RETRIEVER_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

SYSTEM_INSTRUCTION = load_prompt("rag_chat_system.md")
PROMPT_TEMPLATE = "Movie information:\n{context}\n{history}\nQuestion: {question}\nAnswer:"

HISTORY_TURN_LIMIT = 3  # how many prior *user* turns feed into retrieval + generation

_PUNCT_RE = re.compile(r"[^a-z0-9\s]")


def _normalize(text: str) -> str:
    """Lowercase and strip punctuation so "Avengers: Endgame" matches a query
    that says "avengers endgame" with no colon."""
    text = _PUNCT_RE.sub(" ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class RetrievedMovie:
    title: str
    overview: str
    tags: str | None
    score: float


@dataclass
class Turn:
    role: str  # "user" or "assistant"
    text: str


class MovieRAGService:
    def __init__(self, corpus_path: Path, config_path: Path):
        self.ready = False
        if not corpus_path.exists():
            return

        config = {}
        if config_path.exists():
            config = json.loads(config_path.read_text())
        retriever_model = config.get("retriever_model", DEFAULT_RETRIEVER_MODEL)

        self.corpus = pd.read_csv(corpus_path).dropna(subset=["title", "overview"]).reset_index(drop=True)
        self.has_tags = "tags" in self.corpus.columns

        self.retriever = SentenceTransformer(retriever_model)
        self.doc_embeddings = self.retriever.encode(
            self.corpus["overview"].tolist(), show_progress_bar=False, normalize_embeddings=True
        )
        self._titles_normalized = [_normalize(t) for t in self.corpus["title"].tolist()]

        self.ready = True

    def retrieve(self, query: str, top_k: int = 3, boost_query: str | None = None) -> list[RetrievedMovie]:
        query_embedding = self.retriever.encode([query], normalize_embeddings=True)
        sims = cosine_similarity(query_embedding, self.doc_embeddings)[0]

        # FIX: Only look for title keywords in the current question, fallback to full query if not provided
        target_for_boost = boost_query if boost_query is not None else query
        query_normalized = _normalize(target_for_boost)
        
        for i, title_norm in enumerate(self._titles_normalized):
            if len(title_norm) < 4:
                continue
            if re.search(rf"\b{re.escape(title_norm)}\b", query_normalized):
                # Longer/more specific titles get a bigger boost, so e.g.
                # "Avengers: Endgame" (normalized "avengers endgame") wins
                # over a shorter, unrelated title like "Endgame" that also
                # happens to match as a substring of the query.
                sims[i] += 1.0 + 0.01 * len(title_norm)

        top_indices = np.argsort(sims)[::-1][:top_k]
        results = []
        for i in top_indices:
            row = self.corpus.iloc[i]
            results.append(
                RetrievedMovie(
                    title=row["title"],
                    overview=row["overview"],
                    tags=row["tags"] if self.has_tags and pd.notna(row.get("tags")) else None,
                    # sims[i] can exceed 1.0 for title-boosted matches (cosine
                    # similarity + boost) -- ranking above uses the unclamped
                    # value, but the reported score is clamped to [0, 1] so
                    # frontend "similarity %" displays stay sane.
                    score=max(0.0, min(1.0, float(sims[i]))),
                )
            )
        return results

    def generate_answer(
        self,
        question: str,
        retrieved: list[RetrievedMovie],
        recent_user_questions: list[str],
        max_new_tokens: int = 128,
    ) -> str:
        lines = []
        for m in retrieved:
            line = f"- {m.title}: {m.overview}"
            if m.tags:
                line += f" (tags: {m.tags})"
            lines.append(line)

        history_block = ""
        if recent_user_questions:
            prior = "; ".join(recent_user_questions)
            history_block = f"\nEarlier in this conversation the user also asked: {prior}\n"

        prompt = PROMPT_TEMPLATE.format(context="\n".join(lines), history=history_block, question=question)
        return generator_service.generate(prompt, system_instruction=SYSTEM_INSTRUCTION, max_new_tokens=max_new_tokens)


    def answer(self, question: str, top_k: int = 3, history: list[Turn] | None = None) -> dict:
            history = history or []
            recent_user_questions = [t.text for t in history if t.role == "user"][-HISTORY_TURN_LIMIT:]

            if recent_user_questions and len(question.split()) >= 4:
                retrieval_query = " ".join([*recent_user_questions, question])
            else:
                retrieval_query = question

            retrieved = self.retrieve(retrieval_query, top_k=top_k, boost_query=question)

            if not retrieved or retrieved[0].score < 0.35:
                return {
                    "question": question,
                    "answer": "I don't have enough information to answer that from the movie data I have.",
                    "sources": [],
                }

            answer_text = self.generate_answer(question, retrieved[:1], recent_user_questions)

            return {
                "question": question,
                "answer": answer_text,
                "sources": [{"title": m.title, "score": round(m.score, 4)} for m in retrieved],
            }


rag_service = MovieRAGService(CORPUS_PATH, CONFIG_PATH)