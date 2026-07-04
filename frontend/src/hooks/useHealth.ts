import { useEffect, useState } from "react";
import { api, type HealthStatus } from "@/lib/api";

const DEFAULT: HealthStatus = {
  classification_ready: false,
  topic_modeling_ready: false,
  rag_ready: false,
  sentiment_ready: false,
  group_recommender_ready: false,
};

let cache: HealthStatus | null = null;
const listeners = new Set<(h: HealthStatus, online: boolean) => void>();
let online = false;
let started = false;

async function poll() {
  try {
    const h = await api.health();
    cache = h;
    online = true;
  } catch {
    online = false;
  }
  listeners.forEach((cb) => cb(cache ?? DEFAULT, online));
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  poll();
  setInterval(poll, 30_000);
}

export function useHealth() {
  const [state, setState] = useState<{ health: HealthStatus; online: boolean }>({
    health: cache ?? DEFAULT,
    online,
  });
  useEffect(() => {
    start();
    const cb = (health: HealthStatus, onl: boolean) => setState({ health, online: onl });
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return state;
}

export function refreshHealth() {
  return poll();
}
