import { useCallback, useEffect, useState } from "react";

export type PartyIdentity = { sessionId: string; userId: string; displayName: string };

const KEY = "cinesquad:party:v1";

function load(): PartyIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PartyIdentity) : null;
  } catch {
    return null;
  }
}

export function useParty() {
  const [identity, setIdentityState] = useState<PartyIdentity | null>(null);

  useEffect(() => {
    setIdentityState(load());
  }, []);

  const setIdentity = useCallback((next: PartyIdentity) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setIdentityState(next);
  }, []);

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(KEY);
    setIdentityState(null);
  }, []);

  return { identity, setIdentity, clearIdentity };
}
