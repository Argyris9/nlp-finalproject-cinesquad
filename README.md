# Movie NLP Project — CineSquad

ITC 6110 (Natural Language Processing) group project. A FastAPI backend +
React (Lovable) frontend serving **two feature sets** that share the same
movie data and infrastructure but are otherwise independent:

- **CineSquad** — single-user movie chat/genre/vibe/topics tools, each
  task's model trained independently by a team member and dropped into its
  own `models/` folder.
- **CineSync** — a shared-session group recommender: 2-4 users join a
  session with a room code, submit individual preferences, and get back
  movies scored against the whole group (NLP semantic similarity + a
  trained deep-learning recommender + genre/runtime rules), plus a
  session-grounded chat for follow-up requests.

The frontend (built separately in Lovable) lives in `frontend/`.

## Quick start (first time running this)

Two things need to run at once — the backend (Python/FastAPI) and the
frontend (React dev server) — in two separate terminals. Do these in order:

**1. Prerequisites**
- Python 3.12 (compatibility with `torch`/`transformers` on newer Pythons
  isn't guaranteed yet)
- Node.js ≥ 22.12 for the frontend (the default `node` on some machines is
  older — e.g. on macOS with Homebrew, `brew install node@22` and use
  `/opt/homebrew/opt/node@22/bin` if `node --version` shows something older)

**2. Set up and start the backend** (terminal 1, from the project root)

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Leave this running. First startup is slow (downloading/loading models and
embedding the ~13K-movie catalog). It's ready once you see
`Uvicorn running on http://127.0.0.1:8000` and
`http://127.0.0.1:8000/health` returns a 200 response.

**(Optional) Use Gemini for better chat quality**

Both chat features (single-user RAG chat and the group chat) default to a
free local model (`flan-t5-base`, no setup needed, but noticeably weaker
answers). To use Gemini's free tier instead:

```bash
cp .env.example .env
# then edit .env and set GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)
```

Restart the backend after adding the key. `GEMINI_MODEL` defaults to
`gemini-2.5-flash` — note that `gemini-2.0-flash` has had a **0 free-tier
quota** on some keys, so if you override the model and get quota errors,
try `gemini-2.5-flash` or `gemini-flash-latest` instead.

**3. Set up and start the frontend** (terminal 2, from the project root)

```bash
cd frontend
npm install
npm run dev
```

Leave this running too. It prints the local URL it's serving on (e.g.
`http://localhost:8080`).

**4. Open the app**

Go to the URL from step 3 in your browser. The sidebar/bottom nav shows a
green dot next to each feature once its backend model has finished
loading (some start as "still training" until a teammate drops a trained
model into the matching `models/<area>/` folder — see that folder's README).

**Optional next steps**
- Run the backend test suite: `pytest backend/tests/` (from the project
  root, venv activated)
- Train the group recommender's deep-learning model:
  `python -m backend.ml.train_recommender` (optional — a pre-trained
  checkpoint is already committed, see `models/recommender/README.md`)

## Repo structure

```
finalproject/
├── backend/
│   ├── main.py                          # FastAPI app: legacy routes + mounts routers/group.py
│   ├── schemas.py                       # Pydantic models for the CineSync endpoints
│   ├── routers/
│   │   └── group.py                     # /api/sessions, /api/movies, /api/model-info
│   ├── ml/
│   │   ├── ncf_model.py                 # Neural Collaborative Filtering (PyTorch)
│   │   └── train_recommender.py         # trains it on MovieLens ratings
│   ├── tests/                           # pytest suite (integration tests against the real app)
│   └── services/
│       ├── classification_service.py    # CineSquad Task 1: genre/topic classification
│       ├── topic_service.py             # CineSquad 4.1: unsupervised topic modelling
│       ├── rag_service.py               # CineSquad Task 2: single-user RAG movie Q&A
│       ├── sentiment_service.py         # CineSquad supplementary: review sentiment
│       ├── text_classifier_loader.py    # shared sklearn/transformer loading logic
│       ├── generator_service.py         # shared chat generator: Gemini if GEMINI_API_KEY set, else local flan-t5-base
│       ├── catalog_service.py           # CineSync: enriched movie catalog + embeddings + vector index
│       ├── recommender_service.py       # CineSync: NCF deep-learning scoring (+ cold-start handling)
│       ├── group_scoring_service.py     # CineSync: combines all scores into group recommendations
│       ├── group_chat_service.py        # CineSync: session-grounded RAG chat
│       ├── fallback_service.py          # CineSync: 6-tier data-transparency classification
│       └── session_service.py          # CineSync: in-memory session store
├── models/                              # <- drop trained artifacts here (see each README)
│   ├── classification/README.md         # empty -- teammate drop zone
│   ├── topic_modeling/README.md         # empty -- teammate drop zone
│   ├── rag/README.md                    # corpus.csv already built
│   ├── sentiment/README.md              # empty -- teammate drop zone
│   └── recommender/README.md            # movies_catalog.csv + ncf_model.pt already built
├── frontend/                            # Lovable export + README (API contract)
├── requirements.txt
└── Group-Project-ITC6110-Spring-2026.pdf   # assignment brief

# raw datasets (untouched, gitignored -- source data for whoever builds each model):
├── tmdb_movie_dataset_v11/              # 1.45M movies, full metadata + overview
├── tmdb_5000_movies/                    # tmdb_5000_{movies,credits}.csv (smaller, cleaner TMDB subset)
├── ml-25m/                              # MovieLens 25M ratings/tags/genome data
└── movie_dataset_public_final/          # IMDB reviews (raw/reviews.json) + tag-genome research data
```

## Backend (detailed reference)

The Quick Start above already covers the commands you need — this section
is for details/troubleshooting.

**Setup**

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`faiss-cpu` is in requirements but optional in practice: if it fails to
install on your machine, `catalog_service.py` automatically falls back to
`sklearn.neighbors.NearestNeighbors` with no code changes needed.

**Running**

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

Check `http://127.0.0.1:8000/health` (CineSquad) and
`http://127.0.0.1:8000/api/health` (CineSync) to confirm what's actually
loaded.

**Running tests**

```bash
pytest backend/tests/
```

These are integration tests against the real app (no mocks) -- the first
run pays the same model-loading cost as starting the server.

## Frontend (detailed reference)

```bash
cd frontend
npm install   # or bun install, if you have bun
npm run dev   # or bun dev
```

Requires Node.js ≥ 22.12 (`@tanstack/start-server-core` won't run on
older Node — check with `node --version`, and if it's too old, install a
newer Node and put it first on `PATH` for this command, e.g. on macOS:
`PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev`).

It talks to the backend at `http://127.0.0.1:8000` by default. Point it
elsewhere with a `.env` file in `frontend/` setting `VITE_API_BASE_URL`.
Full API contract this frontend is built against: `frontend/README.md`.

## CineSquad API (single-user)

| Endpoint | Method | Body | Notes |
|---|---|---|---|
| `/health` | GET | – | readiness of the 4 CineSquad services |
| `/classify` | POST | `{"text": str}` | genre/topic label + probabilities |
| `/topics` | GET / POST | – / `{"text": str}` | list all topics, or classify one text |
| `/chat` | POST | `{"question": str, "top_k"?: int, "history"?: [...]}` | RAG chatbot answer + sources |
| `/sentiment` | POST | `{"text": str}` | sentiment label + probabilities |

Every endpoint except `/health` returns `503` with a plain message until
its model is dropped into the matching `models/` folder — expected while
the team is still training, not a bug.

## CineSync API (shared group sessions)

| Endpoint | Method | Body | Notes |
|---|---|---|---|
| `/api/health` | GET | – | overall CineSync readiness + data mode |
| `/api/model-info` | GET | – | which datasets/models are loaded |
| `/api/sessions` | POST | `{"creator_name": str, "max_users"?: int}` | creates a session, returns a 6-char room code |
| `/api/sessions/{id}/join` | POST | `{"display_name": str}` | join with the room code (404 if unknown, 400 if full) |
| `/api/sessions/{id}/status` | GET | – | who's joined, who's ready |
| `/api/sessions/{id}/preferences` | POST | see `backend/schemas.py::PreferenceRequest` | marks that user ready |
| `/api/sessions/{id}/recommend` | POST | `{"top_k"?: int}` | 400 if <2 users or not everyone's ready |
| `/api/sessions/{id}/chat` | POST | `{"user_id", "message", "current_movie_ids"}` | session-grounded follow-up chat |
| `/api/movies/{movie_id}` | GET | – | single movie detail + data-transparency status |

Sessions are **in-memory** (see `session_service.py`) -- fine for this
prototype, but state resets on backend restart and won't work across
multiple worker processes. For production, swap in Redis/PostgreSQL.

CORS is open (`allow_origins=["*"]`) so any local frontend (Lovable dev
server, static file, whatever) can call either API without extra config.
