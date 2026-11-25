import { useCallback, useMemo, useRef, useState } from "react";
import { ApiError, sendChatMessage } from "../services/chatApi";
import type { ChatSession, UIMessage } from "../types/chat";

/** RFC 4122 v4 id. crypto.randomUUID needs a secure context, so fall back to getRandomValues. */
export function createId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newSession(): ChatSession {
  return { id: createId(), title: "New chat", messages: [], systemPrompt: "", createdAt: Date.now() };
}

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 42 ? `${oneLine.slice(0, 42)}…` : oneLine || "New chat";
}

/**
 * Chat state for this page. Sessions live in memory only: a fresh session id is
 * generated on every page load (by design — nothing is restored from storage).
 * Only the new message is sent; the backend keeps the history in SQLite.
 */
export function useChat() {
  const [state, setState] = useState(() => {
    const first = newSession();
    return { sessions: [first], activeId: first.id };
  });
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState("");
  const inFlight = useRef(false);

  const activeSession = useMemo(
    () => state.sessions.find((s) => s.id === state.activeId) ?? state.sessions[0],
    [state],
  );

  const updateSession = useCallback((id: string, fn: (s: ChatSession) => ChatSession) => {
    setState((prev) => ({ ...prev, sessions: prev.sessions.map((s) => (s.id === id ? fn(s) : s)) }));
  }, []);

  const send = useCallback(
    (session: ChatSession, text: string) => {
      const message = text.trim();
      if (!message || inFlight.current) return false;
      inFlight.current = true;

      const simulated = simulateFailure || undefined;
      const userMsg: UIMessage = { id: createId(), role: "user", content: message, createdAt: Date.now(), status: "sent", simulated };
      updateSession(session.id, (s) => ({
        ...s,
        title: s.messages.length === 0 ? titleFrom(message) : s.title,
        messages: [...s.messages, userMsg],
      }));
      setPendingSessionId(session.id);

      const systemPrompt = session.systemPrompt.trim();
      sendChatMessage(
        { session_id: session.id, message, ...(systemPrompt ? { system_prompt: systemPrompt } : {}) },
        { simulateFailure: simulated },
      )
        .then((res) => {
          const reply: UIMessage = {
            id: createId(),
            role: "assistant",
            content: res.reply,
            metadata: res.metadata,
            createdAt: Date.now(),
            simulated,
          };
          updateSession(session.id, (s) => ({ ...s, messages: [...s.messages, reply] }));
        })
        .catch((err: unknown) => {
          const text = err instanceof ApiError ? err.message : "Something went wrong while sending your message. Please try again.";
          const errorMsg: UIMessage = { id: createId(), role: "error", content: text, createdAt: Date.now(), retryOf: userMsg.id };
          updateSession(session.id, (s) => ({
            ...s,
            messages: [...s.messages.map((m) => (m.id === userMsg.id ? { ...m, status: "failed" as const } : m)), errorMsg],
          }));
        })
        .finally(() => {
          inFlight.current = false;
          setPendingSessionId(null);
        });
      return true;
    },
    [simulateFailure, updateSession],
  );

  const sendMessage = useCallback((text: string) => send(activeSession, text), [send, activeSession]);

  /** Re-send a failed message: drop the failed attempt + its error, then send again. */
  const retry = useCallback(
    (errorId: string) => {
      if (inFlight.current) return;
      const errorMsg = activeSession.messages.find((m) => m.id === errorId);
      const original = activeSession.messages.find((m) => m.id === errorMsg?.retryOf);
      if (!errorMsg || !original) return;
      const cleaned = { ...activeSession, messages: activeSession.messages.filter((m) => m.id !== errorId && m.id !== original.id) };
      updateSession(activeSession.id, () => cleaned);
      send(cleaned, original.content);
    },
    [activeSession, send, updateSession],
  );

  const newChat = useCallback(() => {
    if (inFlight.current) return;
    setState((prev) => {
      const current = prev.sessions.find((s) => s.id === prev.activeId);
      if (current && current.messages.length === 0) return prev; // already on an empty chat
      const created = newSession();
      return { sessions: [created, ...prev.sessions], activeId: created.id };
    });
  }, []);

  const selectSession = useCallback((id: string) => {
    if (inFlight.current) return;
    setState((prev) => ({ ...prev, activeId: id }));
  }, []);

  const setSystemPrompt = useCallback(
    (value: string) => updateSession(activeSession.id, (s) => ({ ...s, systemPrompt: value })),
    [activeSession.id, updateSession],
  );

  return {
    sessions: state.sessions,
    activeSession,
    isSending: pendingSessionId !== null,
    pendingSessionId,
    simulateFailure,
    setSimulateFailure,
    sendMessage,
    retry,
    newChat,
    selectSession,
    setSystemPrompt,
  };
}
