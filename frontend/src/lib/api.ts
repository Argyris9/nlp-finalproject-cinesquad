import { getDeviceId } from "@/lib/deviceId";

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  "http://127.0.0.1:8000";

export type HealthStatus = {
  classification_ready: boolean;
  topic_modeling_ready: boolean;
  rag_ready: boolean;
  sentiment_ready: boolean;
  group_recommender_ready: boolean;
};

export type ChatSource = { title: string; score: number };
export type ChatResponse = { question: string; answer: string; sources: ChatSource[] };
export type ClassifyResponse = { label: string; probabilities: Record<string, number> };
export type Topic = { topic_id: number; top_words: string[]; topic_label?: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public kind: "not_ready" | "not_found" | "bad_request" | "network" | "other" = "other",
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch (err) {
    throw new ApiError(0, "Can't reach the CineSquad backend. Is it running?", "network");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const b = await res.json();
      if (b?.detail) detail = b.detail;
    } catch {}
    const kind =
      res.status === 503 ? "not_ready" : res.status === 404 ? "not_found" : res.status === 400 ? "bad_request" : "other";
    throw new ApiError(res.status, detail, kind);
  }
  return res.json();
}

export type ChatHistoryTurn = { role: "user" | "assistant"; text: string };

// ---- CineSync: shared group sessions ----------------------------------

export type SessionUser = { user_id: string; display_name: string; ready: boolean };
export type CreateSessionResponse = {
  session_id: string;
  session_code: string;
  status: string;
  users: SessionUser[];
  message: string;
};
export type JoinSessionResponse = {
  session_id: string;
  user_id: string;
  display_name: string;
  status: string;
  users: SessionUser[];
  rejoined: boolean;
};
export type SessionStatusResponse = {
  session_id: string;
  status: "waiting" | "ready" | "recommended" | "expired";
  min_users_reached: boolean;
  all_users_ready: boolean;
  users: SessionUser[];
};
export type AttentionLevel = "easy" | "moderate" | "complex";
export type RuntimePreference = "under_90" | "90_120" | "120_150" | "any";
export type PreferenceRequest = {
  user_id: string;
  preferred_genres: string[];
  avoid_genres: string[];
  moods: string[];
  attention_level: AttentionLevel;
  runtime_preference: RuntimePreference;
  min_rating: number;
  free_text: string;
  reference_movies: string[];
};
export type IndividualScore = { user_id: string; display_name: string; score: number; match_percentage: number };
export type SourceFlags = {
  has_ratings: boolean;
  has_genres: boolean;
  has_tags: boolean;
  has_overview: boolean;
  uses_llm_fallback: boolean;
};
export type RecommendationItem = {
  rank: number;
  movie_id: string;
  title: string;
  year: number | null;
  genres: string[];
  group_score: number;
  group_match_percentage: number;
  individual_scores: IndividualScore[];
  confidence: string;
  data_status: string;
  data_status_message: string;
  explanation: string;
  source_flags: SourceFlags;
};
export type RecommendResponse = { session_id: string; generated_at: string; recommendations: RecommendationItem[] };
export type RetrievedMovieRef = { movie_id: string; title: string; score: number };
export type GroupChatResponse = { answer: string; retrieved_movies: RetrievedMovieRef[]; grounding_note: string };
export type GroupChatHistoryEntry = {
  id: number;
  user_id: string;
  display_name: string;
  message: string;
  answer: string;
  retrieved_movies: RetrievedMovieRef[];
};
export type MovieDetail = {
  movie_id: string;
  title: string;
  year: number | null;
  genres: string[];
  average_rating: number | null;
  rating_count: number | null;
  tags: string[];
  overview: string | null;
  source_flags: SourceFlags;
  data_status: string;
  data_status_message: string;
};

const GENRES = [
  "Action", "Adventure", "Animation", "Children", "Comedy", "Crime", "Documentary",
  "Drama", "Fantasy", "Film-Noir", "Horror", "IMAX", "Musical", "Mystery", "Romance",
  "Sci-Fi", "Thriller", "War", "Western",
] as const;

export const api = {
  health: async (): Promise<HealthStatus> => {
    const [legacy, cinesync] = await Promise.all([
      request<Omit<HealthStatus, "group_recommender_ready">>("/health"),
      request<{ status: string; mode: string; models_loaded: boolean; vector_index_loaded: boolean }>("/api/health"),
    ]);
    return { ...legacy, group_recommender_ready: cinesync.models_loaded && cinesync.vector_index_loaded };
  },
  chat: (question: string, history: ChatHistoryTurn[] = [], top_k = 3) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify({ question, top_k, history }) }),
  classify: (text: string) =>
    request<ClassifyResponse>("/classify", { method: "POST", body: JSON.stringify({ text }) }),
  sentiment: (text: string) =>
    request<ClassifyResponse>("/sentiment", { method: "POST", body: JSON.stringify({ text }) }),
  topics: () => request<Topic[]>("/topics"),
  classifyTopic: (text: string) =>
    request<Topic>("/topics", { method: "POST", body: JSON.stringify({ text }) }),

  genres: GENRES as unknown as string[],
  createSession: (creator_name: string, max_users = 4) =>
    request<CreateSessionResponse>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ creator_name, max_users, device_id: getDeviceId() }),
    }),
  joinSession: (sessionId: string, display_name: string) =>
    request<JoinSessionResponse>(`/api/sessions/${sessionId}/join`, {
      method: "POST",
      body: JSON.stringify({ display_name, device_id: getDeviceId() }),
    }),
  sessionStatus: (sessionId: string) => request<SessionStatusResponse>(`/api/sessions/${sessionId}/status`),
  submitPreferences: (sessionId: string, prefs: PreferenceRequest) =>
    request<{ session_id: string; user_id: string; ready: boolean; message: string }>(
      `/api/sessions/${sessionId}/preferences`,
      { method: "POST", body: JSON.stringify(prefs) },
    ),
  recommend: (sessionId: string, top_k = 6) =>
    request<RecommendResponse>(`/api/sessions/${sessionId}/recommend`, {
      method: "POST",
      body: JSON.stringify({ top_k }),
    }),
  groupChat: (sessionId: string, user_id: string, message: string, current_movie_ids: string[]) =>
    request<GroupChatResponse>(`/api/sessions/${sessionId}/chat`, {
      method: "POST",
      body: JSON.stringify({ user_id, message, current_movie_ids }),
    }),
  groupChatHistory: (sessionId: string) =>
    request<GroupChatHistoryEntry[]>(`/api/sessions/${sessionId}/chat/history`),
  movieDetail: (movieId: string) => request<MovieDetail>(`/api/movies/${movieId}`),
};
