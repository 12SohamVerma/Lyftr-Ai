import { Cpu, Menu, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";
import { SystemPromptEditor } from "./components/SystemPromptEditor";
import { useChat } from "./hooks/useChat";
import { fetchHealth } from "./services/chatApi";
import type { ConnectionState, HealthResponse } from "./types/chat";

const HEALTH_POLL_MS = 30_000;

function useHealth() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const h = await fetchHealth();
        if (cancelled) return;
        setHealth(h);
        setState(h.status === "ok" ? "online" : "degraded");
      } catch {
        if (!cancelled) setState("offline");
      }
    };
    check();
    const id = window.setInterval(check, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { state, health };
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("lyftr-theme", next ? "dark" : "light");
      } catch {
        /* storage unavailable — theme just won't persist */
      }
      return next;
    });
  }, []);
  return { dark, toggle };
}

function StatusPill({ state, health }: { state: ConnectionState; health: HealthResponse | null }) {
  const styles: Record<ConnectionState, { dot: string; label: string }> = {
    checking: { dot: "bg-slate-400", label: "Connecting" },
    online: { dot: "bg-emerald-500", label: "Online" },
    degraded: { dot: "bg-amber-500", label: "Degraded" },
    offline: { dot: "bg-rose-500", label: "Offline" },
  };
  const s = styles[state];
  const detail = health
    ? `${health.keys_configured} key${health.keys_configured === 1 ? "" : "s"} · cache ${health.cache_enabled ? "on" : "off"}`
    : state === "offline"
      ? "backend unreachable"
      : "";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-ink-700 dark:bg-ink-900 dark:text-slate-300"
      title={health?.detail ?? detail}
      data-testid="connection-status"
    >
      <span className={`h-2 w-2 rounded-full ${s.dot} ${state === "online" ? "shadow-[0_0_0_3px] shadow-emerald-500/20" : ""}`} />
      <span className="font-medium">{s.label}</span>
      {detail && <span className="hidden text-slate-400 md:inline">· {detail}</span>}
    </span>
  );
}

export default function App() {
  const chat = useChat();
  const { state, health } = useHealth();
  const { dark, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { activeSession } = chat;

  const loadingHere = chat.pendingSessionId === activeSession.id;
  const lastModel = useMemo(() => {
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const m = activeSession.messages[i].metadata?.model;
      if (m) return m;
    }
    return null;
  }, [activeSession.messages]);
  const inFlightSimulation = useMemo(() => {
    const lastUser = [...activeSession.messages].reverse().find((m) => m.role === "user");
    return lastUser?.simulated;
  }, [activeSession.messages]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        sessions={chat.sessions}
        activeId={activeSession.id}
        busy={chat.isSending}
        simulateFailure={chat.simulateFailure}
        onSimulateFailureChange={chat.setSimulateFailure}
        onNewChat={chat.newChat}
        onSelect={chat.selectSession}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/80 px-3 backdrop-blur sm:px-5 dark:border-ink-800 dark:bg-ink-950/80">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-ink-800"
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
            {activeSession.title}
          </div>
          {lastModel && (
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 font-mono text-[11px] text-slate-500 sm:inline-flex dark:border-ink-700 dark:text-slate-400">
              <Cpu size={12} /> {lastModel}
            </span>
          )}
          <StatusPill state={state} health={health} />
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-ink-800 dark:hover:text-slate-100"
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            title={dark ? "Light theme" : "Dark theme"}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto">
          <ChatWindow
            messages={activeSession.messages}
            loading={loadingHere}
            simulated={inFlightSimulation}
            onRetry={chat.retry}
            onSuggestion={(text) => chat.sendMessage(text)}
          />
        </div>

        <div className="shrink-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-3 pb-4 pt-2 sm:px-6 dark:from-ink-950 dark:via-ink-950">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <SystemPromptEditor value={activeSession.systemPrompt} onChange={chat.setSystemPrompt} />
            <ChatInput onSend={chat.sendMessage} busy={chat.isSending} autoFocusKey={activeSession.id} />
            <p className="text-center text-[11px] text-slate-400">
              Lyftr AI can make mistakes. Replies may be served from cache — check the source badge.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
