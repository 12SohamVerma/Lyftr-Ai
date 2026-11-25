import { Database, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { UIMessage } from "../types/chat";
import { LoadingIndicator } from "./LoadingIndicator";
import { MessageBubble } from "./MessageBubble";
import { BrandMark } from "./Sidebar";

const SUGGESTIONS = [
  "What is the capital of France?",
  "Explain artificial intelligence simply.",
  "My name is Soham. Remember it for later.",
  "Write a haiku about resilient systems.",
];

interface Props {
  messages: UIMessage[];
  loading: boolean;
  simulated?: string;
  onRetry: (errorId: string) => void;
  onSuggestion: (text: string) => void;
}

export function ChatWindow({ messages, loading, simulated, onRetry, onSuggestion }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
        <BrandMark className="h-14 w-14 shadow-lg shadow-brand-500/20" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to Lyftr AI</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
          A multi-turn assistant with automatic API-key failover and LiteLLM response caching. Every reply shows its source,
          model, latency and token usage.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 dark:border-ink-700">
            <ShieldCheck size={13} /> Key failover
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 dark:border-ink-700">
            <Database size={13} /> Response cache
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 dark:border-ink-700">
            <Layers size={13} /> Session memory
          </span>
        </div>
        <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm text-slate-700 shadow-sm transition hover:border-brand-400 hover:shadow dark:border-ink-700 dark:bg-ink-900 dark:text-slate-200 dark:hover:border-brand-500"
            >
              <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-500" />
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6" aria-live="polite">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} onRetry={onRetry} retryDisabled={loading} />
      ))}
      {loading && <LoadingIndicator simulated={simulated} />}
      <div ref={bottomRef} />
    </div>
  );
}
