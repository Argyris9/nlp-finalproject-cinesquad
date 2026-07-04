# Frontend — CineSquad

A TanStack Start + React app (Lovable-exported), already wired against the
backend API contract below — `src/lib/api.ts` implements every call,
`src/hooks/useHealth.ts` polls `/health` every 30s, and each route
(`/`, `/genre`, `/vibe`, `/topics`) shows a friendly "still training" state
until its model is dropped into the matching `models/<area>/` folder.

## Running it

```bash
cd frontend
bun install   # or: npm install
bun dev       # or: npm run dev
```

By default it talks to the backend at `http://127.0.0.1:8000`. Override
with a `.env` file setting `VITE_API_BASE_URL` if the backend runs
somewhere else.

Run the backend alongside it (from the project root):

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

## Backend API contract

| Endpoint | Method | Request body | Response |
|---|---|---|---|
| `/health` | GET | – | `{ classification_ready, topic_modeling_ready, rag_ready, sentiment_ready }` (booleans) |
| `/chat` | POST | `{ "question": str, "top_k"?: int }` | `{ "question", "answer", "sources": [{ "title", "score" }] }` |
| `/classify` | POST | `{ "text": str }` | `{ "label", "probabilities": { [label]: number } }` |
| `/sentiment` | POST | `{ "text": str }` | `{ "label", "probabilities": { [label]: number } }` |
| `/topics` | GET | – | `[{ "topic_id", "top_words": [str], "topic_label"? }]` |
| `/topics` | POST | `{ "text": str }` | `{ "topic_id", "top_words": [str], "topic_label"? }` |

Every endpoint except `/health` returns `503` with a plain-text `detail`
message if the underlying model hasn't been dropped into `models/<area>/`
yet — the UI already treats this as a normal "not ready" state, not an error.

CORS is wide open (`allow_origins=["*"]`) on the backend, so this can be
served from any local dev port without extra config.
