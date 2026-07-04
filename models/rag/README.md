# RAG chatbot — drop zone

Task 2 of the assignment: retrieval-augmented Q&A over movie data. This one
doesn't need a trained model file — just the **corpus** to retrieve from.
The backend builds embeddings and runs generation itself at startup.

## Expected artifact

```
models/rag/corpus.csv
```

Required columns:

| column     | meaning                                   |
|------------|--------------------------------------------|
| `title`    | movie title                                 |
| `overview` | plot synopsis / description text (English)  |

Optional column:

| column | meaning |
|--------|---------|
| `tags` | community tags folded in from MovieLens (`ml-25m/tags.csv`), comma-separated per movie, e.g. `"dark comedy, twist ending, great dialogue"` — if present, these are appended to the retrieved context so the chatbot can use community-sourced descriptors alongside the official synopsis. |

Build this by joining whichever raw dataset(s) you're using (the big
`tmdb_movie_dataset_v11/TMDB_movie_dataset_v11.csv`, `ml-25m/tags.csv`, etc.
— see the project root) down to just these columns, filtered/deduplicated
however makes sense for your corpus size and quality.

## Optional config

```
models/rag/config.json
```

```json
{
  "retriever_model": "sentence-transformers/all-MiniLM-L6-v2"
}
```

A Hugging Face sentence-embedding model id, swappable per-corpus. If
`config.json` is missing, the backend defaults to the value above (free,
local, no API key required).

The **generator** is shared app-wide via `backend/services/generator_service.py`
-- both this single-user chatbot and the session-grounded group chat
(`group_chat_service.py`) reuse the same loaded model instance rather than
each holding its own copy in memory. It picks a backend automatically:

- **Gemini (recommended, better quality)** -- set `GEMINI_API_KEY` in a
  `.env` file at the project root (copy `.env.example`). Free tier, get a
  key at https://aistudio.google.com/apikey. Defaults to model
  `gemini-2.5-flash` (override with `GEMINI_MODEL` in `.env`) --
  `gemini-2.0-flash` had a **0 free-tier quota** on the key this was tested
  with, so avoid it unless you've confirmed your own key has access.
  "Thinking" is explicitly disabled (`thinking_budget=0`) since this is a
  short, direct Q&A task -- leaving it on silently truncates answers
  because thinking tokens eat into the output budget.
- **Local flan-t5-base (automatic fallback)** -- used whenever
  `GEMINI_API_KEY` isn't set, so the backend still works fully offline
  with zero setup/cost, just at lower answer quality.

## What the backend does

`backend/services/rag_service.py` loads `corpus.csv` (+ `config.json` if
present) at startup, embeds every row, and exposes:

```
POST /chat   { "question": "...", "top_k": 3 }  ->  { "answer": "...", "sources": [...] }
```

Retrieval uses cosine similarity plus a title-mention boost (if the query
names a movie verbatim, that movie is ranked first — plain embedding
similarity alone is weak on direct "what is X about?" questions). If
`corpus.csv` isn't present yet, `/chat` returns `503`.
