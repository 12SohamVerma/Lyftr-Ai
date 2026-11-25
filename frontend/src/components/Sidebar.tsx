import { Check, Copy, ExternalLink, FlaskConical, MessageSquare, Plus, X } from "lucide-react";
import { useState } from "react";
import { historyUrl } from "../services/chatApi";
import type { ChatSession } from "../types/chat";

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lyftr-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0d1324" />
      <path d="M22 16v28h20" fill="none" stroke="url(#lyftr-g)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="20" r="4.5" fill="#22d3ee" />
    </svg>
  );
}

export const SIMULATION_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "", label: "Off", hint: "Normal requests" },
  { value: "key_1=429", label: "key_1 → 429", hint: "key_1 rate-limited, key_2 should answer" },
  { value: "key_1=500", label: "key_1 → 500", hint: "key_1 server error, key_2 should answer" },
  { value: "key_1=503", label: "key_1 → 503", hint: "key_1 unavailable, key_2 should answer" },
  { value: "*=429", label: "all keys → 429", hint: "Every key fails: expect a 503 error" },
];

interface Props {
  sessions: ChatSession[];
  activeId: string;
  busy: boolean;
  simulateFailure: string;
  onSimulateFailureChange: (value: string) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ sessions, activeId, busy, simulateFailure, onSimulateFailureChange, onNewChat, onSelect, open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const active = sessions.find((s) => s.id === activeId);
  const replies = active?.messages.filter((m) => m.role === "assistant") ?? [];
  const cacheHits = replies.filter((m) => m.metadata?.resolution_source === "LLM_CACHE").length;
  const failovers = replies.filter((m) => (m.metadata?.fallback_attempts ?? 0) > 0).length;
  const hint = SIMULATION_OPTIONS.find((o) => o.value === simulateFailure)?.hint;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(activeId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 dark:border-ink-800 dark:bg-ink-900 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Chats and tools"
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <BrandMark />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight">Lyftr AI</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Intelligent LLM Chat</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-ink-800"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={onNewChat}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <Plus size={16} /> New chat
          </button>
        </div>

        <nav className="scroll-thin mt-4 flex-1 overflow-y-auto px-3">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">This tab</div>
          <ul className="space-y-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  disabled={busy && s.id !== activeId}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-50 ${
                    s.id === activeId
                      ? "bg-slate-100 font-medium text-slate-900 dark:bg-ink-800 dark:text-white"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-ink-850"
                  }`}
                >
                  <MessageSquare size={15} className="shrink-0 opacity-60" />
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-3 dark:border-ink-800">
          <section className="rounded-xl border border-slate-200 p-3 dark:border-ink-700">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Session</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copyId}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-800 dark:hover:text-slate-200"
                  title="Copy session id"
                  aria-label="Copy session id"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <a
                  href={historyUrl(activeId)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-800 dark:hover:text-slate-200"
                  title="Open stored history (GET /sessions/{id}/messages)"
                  aria-label="Open stored history"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" data-testid="session-id">
              {activeId}
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              {[
                ["Replies", replies.length],
                ["Cache hits", cacheHits],
                ["Failovers", failovers],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 py-1.5 dark:bg-ink-850">
                  <dd className="text-sm font-semibold">{value}</dd>
                  <dt className="text-[10px] text-slate-500 dark:text-slate-400">{label}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-ink-600">
            <label htmlFor="simulate-failure" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <FlaskConical size={13} /> Failover demo
            </label>
            <select
              id="simulate-failure"
              data-testid="simulate-failure-select"
              value={simulateFailure}
              onChange={(e) => onSimulateFailureChange(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-850"
            >
              {SIMULATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {simulateFailure ? (
                <>
                  Sends <code className="font-mono">X-Simulate-Failure: {simulateFailure}</code>. {hint}.
                </>
              ) : (
                "Adds an X-Simulate-Failure header to the next messages to show key failover."
              )}
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}
