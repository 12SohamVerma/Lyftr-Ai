import { Check, ChevronDown, Copy, ExternalLink, MessageSquare, MoreHorizontal, PlusCircle, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { historyUrl } from "../services/chatApi";
import type { ChatSession, ConnectionState, HealthResponse } from "../types/chat";
import { BrandMark } from "./Brand";

interface Props {
  sessions: ChatSession[];
  activeId: string;
  busy: boolean;
  open: boolean;
  healthState: ConnectionState;
  health: HealthResponse | null;
  /** Tokens of this chat: live-inference tokens used, and tokens served from cache. */
  usage: { used: number; saved: number };
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
}

const STATUS: Record<ConnectionState, { dot: string; label: string }> = {
  checking: { dot: "bg-slate-400", label: "Connecting…" },
  online: { dot: "bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.25)]", label: "Connected" },
  degraded: { dot: "bg-amber-400", label: "Degraded" },
  offline: { dot: "bg-rose-500", label: "Backend offline" },
};

function ChatMenu({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      window.setTimeout(onClose, 600);
    } catch {
      onClose();
    }
  };

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-white/10";
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-1 top-full z-20 mt-1 w-56 animate-pop-in overflow-hidden rounded-2xl border border-white/10 bg-[#1c1440]/95 p-1.5 text-sm text-side-ink shadow-2xl backdrop-blur"
    >
      <button type="button" role="menuitem" onClick={copy} className={item}>
        {copied ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} className="opacity-70" />}
        {copied ? "Copied" : "Copy session ID"}
      </button>
      <a role="menuitem" href={historyUrl(sessionId)} target="_blank" rel="noreferrer" onClick={onClose} className={item}>
        <ExternalLink size={15} className="opacity-70" /> View stored history
      </a>
    </div>
  );
}

export function Sidebar({ sessions, activeId, busy, open, healthState, health, usage, onClose, onNewChat, onSelect }: Props) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const status = STATUS[healthState];
  const total = usage.used + usage.saved;
  const savedPct = total > 0 ? Math.round((usage.saved / total) * 100) : 0;

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-[#0c0820]/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`bg-sidebar-purple fixed inset-y-0 left-0 z-40 flex w-[288px] flex-col overflow-hidden text-side-ink shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:static lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Chats"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <BrandMark size={46} className="rounded-2xl shadow-glow ring-1 ring-inset ring-white/25" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-extrabold tracking-tight">Lyftr AI</span>
              <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-side-ink/90 ring-1 ring-white/15">Beta</span>
            </div>
            <div className="text-[13px] text-side-muted">Intelligent LLM Chat</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-side-muted hover:bg-white/10 lg:hidden" aria-label="Close sidebar">
            <X size={18} />
          </button>
        </div>

        {/* New chat */}
        <div className="px-4">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            disabled={busy}
            className="group flex h-[52px] w-full items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#8b5cf6,#a78bfa)] px-4 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgb(139_92_246/0.8)] ring-1 ring-inset ring-white/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgb(139_92_246/0.95)] active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 dark:bg-[linear-gradient(135deg,#7c3aed,#c026d3)]"
          >
            <PlusCircle size={20} className="transition-transform duration-300 group-hover:rotate-90" />
            <span className="flex-1 text-left">New Chat</span>
            <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/90">Alt N</kbd>
          </button>
        </div>

        {/* Chat history */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col px-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 text-[15px] font-semibold text-side-ink transition hover:bg-white/5"
            aria-expanded={historyOpen}
          >
            <MessageSquare size={19} className="text-side-muted" />
            <span className="flex-1 text-left">Chat History</span>
            <ChevronDown size={17} className={`text-side-muted transition-transform duration-300 ${historyOpen ? "" : "-rotate-90"}`} />
          </button>

          <div className={`grid min-h-0 transition-[grid-template-rows] duration-300 ${historyOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <ul className="scroll-thin min-h-0 space-y-1 overflow-y-auto pb-2 pl-3 pt-1">
              {sessions.map((s) => {
                const active = s.id === activeId;
                return (
                  <li key={s.id} className="relative">
                    <div className={`group flex items-center rounded-xl transition ${active ? "bg-white/12 ring-1 ring-inset ring-white/10" : "hover:bg-white/6"}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(s.id);
                          onClose();
                        }}
                        disabled={busy && !active}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm disabled:opacity-50 ${
                          active ? "font-semibold text-white" : "text-side-muted hover:text-side-ink"
                        }`}
                      >
                        <MessageSquare size={16} className="shrink-0 opacity-70" />
                        <span className="truncate">{s.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuFor((v) => (v === s.id ? null : s.id))}
                        className={`mr-1.5 rounded-lg p-1.5 text-side-muted transition hover:bg-white/10 hover:text-white ${
                          active || menuFor === s.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                        }`}
                        aria-label="Chat options"
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                    {menuFor === s.id && <ChatMenu sessionId={s.id} onClose={() => setMenuFor(null)} />}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="my-3 h-px bg-white/10" />
          <div
            className="flex items-center gap-2.5 px-2 pb-2 text-[13px] text-side-muted"
            data-testid="connection-status"
            title={health?.detail ?? status.label}
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
            <span className="truncate">
              <span className="font-medium text-side-ink">{status.label}</span>
              {health && healthState !== "offline" ? ` · ${health.keys_configured} keys · cache ${health.cache_enabled ? "on" : "off"}` : ""}
            </span>
          </div>
        </div>

        {/* Decorative waves + usage card */}
        <div className="relative px-4 pb-5 pt-10">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 overflow-hidden" aria-hidden>
            <svg className="wave-track absolute bottom-24 left-0 h-28 w-[200%] opacity-60" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0 60 C150 10 300 110 450 60 S750 10 900 60 S1050 110 1200 60 V120 H0 Z" fill="url(#wv1)" />
              <defs>
                <linearGradient id="wv1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#a78bfa" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <svg className="wave-track absolute bottom-16 left-0 h-32 w-[200%] opacity-40 [animation-duration:24s]" viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path d="M0 70 C200 20 400 120 600 70 S1000 20 1200 70 V120 H0 Z" fill="url(#wv2)" />
              <defs>
                <linearGradient id="wv2" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#e879f9" stopOpacity="0.45" />
                  <stop offset="1" stopColor="#6d28d9" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="relative rounded-2xl border border-white/12 bg-white/[0.07] p-4 backdrop-blur-md">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                <Zap size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-side-muted">AI Usage (This chat)</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> LIVE
                  </span>
                </div>
                <div className="mt-0.5 text-lg font-bold tabular-nums">{usage.used.toLocaleString()} tokens</div>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" title="Share of tokens served from the cache">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6,#e879f9)] transition-[width] duration-700 ease-out"
                style={{ width: `${savedPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-side-muted">
              {usage.saved > 0
                ? `${usage.saved.toLocaleString()} tokens (${savedPct}%) served free from cache`
                : "Live-inference tokens. Cache hits cost nothing."}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
