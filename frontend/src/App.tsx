import { useEffect, useMemo, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { VoiceMode } from "./components/VoiceMode";
import { useChat } from "./hooks/useChat";
import { useHealth } from "./hooks/useHealth";
import { useTheme } from "./hooks/useTheme";
import { useVoiceMode } from "./hooks/useVoiceMode";

export default function App() {
  const chat = useChat();
  const health = useHealth();
  const theme = useTheme();
  const voice = useVoiceMode(chat.ask);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { activeSession, newChat } = chat;

  const empty = activeSession.messages.length === 0;
  const loadingHere = chat.pendingSessionId === activeSession.id;
  const lastModel = [...activeSession.messages].reverse().find((m) => m.metadata)?.metadata?.model;
  const model = health.health?.model ?? lastModel ?? null;
  // Sidebar usage card: live-inference tokens of this chat, and tokens served from cache.
  const usage = useMemo(() => {
    let used = 0;
    let saved = 0;
    for (const m of activeSession.messages) {
      if (!m.metadata) continue;
      const tokens = m.metadata.input_tokens + m.metadata.output_tokens;
      if (m.metadata.resolution_source === "LLM_CACHE") saved += tokens;
      else used += tokens;
    }
    return { used, saved };
  }, [activeSession.messages]);
  const inFlightSimulation = useMemo(
    () => [...activeSession.messages].reverse().find((m) => m.role === "user")?.simulated,
    [activeSession.messages],
  );

  // Alt+N starts a new chat (Ctrl/Cmd+N belongs to the browser).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const composer = (
    <ChatInput
      onSend={chat.sendMessage}
      busy={chat.isSending}
      focusKey={activeSession.id}
      systemPrompt={activeSession.systemPrompt}
      onSystemPromptChange={chat.setSystemPrompt}
      simulateFailure={chat.simulateFailure}
      onClearSimulation={chat.clearSimulation}
      voiceModeSupported={voice.supported}
      onVoiceMode={voice.open}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar
        sessions={chat.sessions}
        activeId={activeSession.id}
        busy={chat.isSending}
        open={sidebarOpen}
        healthState={health.state}
        health={health.health}
        usage={usage}
        onClose={() => setSidebarOpen(false)}
        onNewChat={chat.newChat}
        onSelect={chat.selectSession}
      />

      {/* data-session-id: the current session (a new one on every page load). */}
      <main className="flex min-w-0 flex-1 flex-col" data-session-id={activeSession.id}>
        <TopBar model={model} dark={theme.dark} onToggleTheme={theme.toggle} onOpenSidebar={() => setSidebarOpen(true)} onNewChat={chat.newChat} />

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh]">
            <div className="flex animate-fade-up flex-col items-center">
              <div className="orb-wrap mb-10" aria-hidden>
                <div className="orb-glow" />
                <div className="orb-core" />
                <div className="orb-veil" />
              </div>
              <h1 className="mb-8 text-center text-[26px] font-semibold tracking-tight sm:text-[28px]">How can I help you today?</h1>
            </div>
            <div className="w-full max-w-3xl animate-fade-up [animation-delay:60ms]">{composer}</div>
          </div>
        ) : (
          <>
            <div className="scroll-thin flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
                <ChatWindow messages={activeSession.messages} loading={loadingHere} simulated={inFlightSimulation} onRetry={chat.retry} />
              </div>
            </div>
            <div className="shrink-0 px-3 pb-2 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                {composer}
                <p className="py-2 text-center text-xs text-faint">Lyftr AI can make mistakes. Each reply shows its source, latency and tokens.</p>
              </div>
            </div>
          </>
        )}
      </main>

      <VoiceMode voice={voice} />
    </div>
  );
}
