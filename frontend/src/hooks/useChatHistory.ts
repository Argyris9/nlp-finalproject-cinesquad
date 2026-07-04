import { useCallback, useEffect, useState } from "react";
import type { ChatSource } from "@/lib/api";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  createdAt: number;
};

const KEY = "cinesquad:chat:v1";

function load(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useChatHistory() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setMessages(load());
  }, []);

  const append = useCallback((m: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, m];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    setMessages([]);
  }, []);

  return { messages, append, clear };
}
