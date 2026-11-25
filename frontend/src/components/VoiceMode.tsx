import { AlertTriangle, AudioLines, Clock3, Hand, KeyRound, Layers, Loader2, Mic, MicOff, PhoneOff, RotateCcw, Settings2, Sparkles, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { useVoiceMode, VoicePhase } from "../hooks/useVoiceMode";

type Voice = ReturnType<typeof useVoiceMode>;

const BARS = 48;

const LABEL: Record<VoicePhase, string> = {
  idle: "",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Something went wrong",
};

function drawWaveform(canvas: HTMLCanvasElement, history: number[], phase: VoicePhase, now: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const step = w / history.length;
  const barW = Math.max(3, Math.min(5, step * 0.42));
  for (let i = 0; i < history.length; i++) {
    let v = history[i];
    if (phase === "thinking") v = 0.06 + 0.55 * Math.pow(Math.max(0, Math.sin(now / 240 - i * 0.3)), 6);
    if (phase === "connecting") v = 0.04 + 0.2 * Math.pow(Math.max(0, Math.sin(now / 300 - i * 0.18)), 8);
    const bh = Math.max(barW, Math.min(1, v) * h);
    const x = i * step + (step - barW) / 2;
    const y = h - bh;
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.min(1, v * 1.6)})`;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, barW / 2);
    ctx.fill();
  }
}

function OrbIcon({ phase, muted }: { phase: VoicePhase; muted: boolean }) {
  const cls = "drop-shadow-[0_4px_18px_rgba(30,40,160,0.45)] transition-all duration-300";
  if (phase === "connecting") return <Loader2 size={64} strokeWidth={1.6} className={`${cls} animate-spin`} />;
  if (phase === "error") return <AlertTriangle size={64} strokeWidth={1.6} className={cls} />;
  if (phase === "thinking") return <Sparkles size={68} strokeWidth={1.5} className={`${cls} animate-pulse`} />;
  if (phase === "speaking") return <AudioLines size={70} strokeWidth={1.6} className={cls} />;
  return muted ? <MicOff size={72} strokeWidth={1.6} className={cls} /> : <Mic size={76} strokeWidth={1.6} className={cls} />;
}

function ControlButton(props: { onClick: () => void; label: string; children: ReactNode; tone?: "glass" | "on" | "danger"; disabled?: boolean; pressed?: boolean }) {
  const tones = {
    glass: "bg-white/15 text-white ring-1 ring-inset ring-white/30 hover:bg-white/25",
    on: "bg-white text-indigo-700 shadow-lg hover:bg-white/90",
    danger: "bg-rose-500 text-white shadow-[0_12px_30px_-10px_rgb(244_63_94/0.9)] hover:bg-rose-600",
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        aria-label={props.label}
        aria-pressed={props.pressed}
        className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md transition duration-200 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-35 sm:h-16 sm:w-16 ${tones[props.tone ?? "glass"]}`}
      >
        {props.children}
      </button>
      <span className={`text-xs font-medium text-white/85 ${props.disabled ? "opacity-40" : ""}`}>{props.label}</span>
    </div>
  );
}

export function VoiceMode({ voice }: { voice: Voice }) {
  const { active, phase, muted, userText, caption, lastMeta, error } = voice;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const getLevel = voice.getLevel;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // One animation loop drives the orb scale (CSS var) and the waveform canvas.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let frame = 0;
    let smooth = 0;
    const history = new Array<number>(BARS).fill(0);
    const loop = (now: number) => {
      const level = getLevel(now);
      smooth = smooth * 0.72 + level * 0.28;
      rootRef.current?.style.setProperty("--lvl", smooth.toFixed(3));
      if (frame++ % 3 === 0) {
        history.pop();
        history.unshift(smooth);
      }
      if (canvasRef.current) drawWaveform(canvasRef.current, history, phaseRef.current, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevel]);

  // Keyboard: Esc ends the call; Space interrupts an answer or toggles mute.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape") {
        e.preventDefault();
        if (settingsOpen) setSettingsOpen(false);
        else voice.close();
      } else if (e.key === " " && tag !== "BUTTON" && tag !== "SELECT" && tag !== "INPUT") {
        e.preventDefault();
        if (phaseRef.current === "speaking" || phaseRef.current === "thinking") voice.interrupt();
        else voice.toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, settingsOpen, voice]);

  useEffect(() => {
    if (active) rootRef.current?.focus();
  }, [active]);

  const voiceOptions = useMemo(() => {
    const base = (navigator.language || "en").split("-")[0].toLowerCase();
    return [...voice.voices].sort((a, b) => {
      const am = a.lang.toLowerCase().startsWith(base) ? 0 : 1;
      const bm = b.lang.toLowerCase().startsWith(base) ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name);
    });
  }, [voice.voices]);

  if (!active) return null;

  const speaker = phase === "speaking" ? "Lyftr AI" : phase === "error" ? "Notice" : "You";
  let text: string;
  if (phase === "connecting") text = "Connecting to your microphone…";
  else if (phase === "error") text = error ?? "Voice Mode stopped.";
  else if (phase === "speaking") text = caption;
  else if (phase === "thinking") text = userText;
  else if (muted) text = "You're muted. Tap the mic to talk.";
  else text = userText || "Go ahead, I'm listening…";
  const placeholder = phase === "listening" && !userText;

  const orbAction = () => {
    if (phase === "speaking" || phase === "thinking") voice.interrupt();
    else if (phase === "listening") voice.toggleMute();
    else if (phase === "error") voice.retry();
  };
  const orbLabel =
    phase === "speaking" || phase === "thinking" ? "Interrupt" : phase === "listening" ? (muted ? "Unmute microphone" : "Mute microphone") : "Voice orb";

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-phase={phase}
      data-muted={muted || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      data-testid="voice-mode"
      className="vm-root fixed inset-0 z-[60] flex animate-fade-in flex-col overflow-hidden text-white outline-none"
    >
      <div className="vm-bg absolute inset-0" aria-hidden>
        <span className="vm-blob vm-blob-a" />
        <span className="vm-blob vm-blob-b" />
        <span className="vm-blob vm-blob-c" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2.5 rounded-full bg-white/15 py-1.5 pl-1.5 pr-4 ring-1 ring-inset ring-white/25 backdrop-blur-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-bold">Lyftr AI Voice</span>
          <span className={`h-2 w-2 rounded-full ${phase === "error" ? "bg-rose-300" : muted ? "bg-amber-300" : "animate-pulse bg-emerald-300"}`} />
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:bg-white/25"
            aria-label="Voice settings"
            aria-expanded={settingsOpen}
          >
            <Settings2 size={18} />
          </button>
          <button
            type="button"
            onClick={voice.close}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:bg-white/25"
            aria-label="Close voice mode"
          >
            <X size={18} />
          </button>
          {settingsOpen && (
            <div className="absolute right-0 top-12 w-72 animate-pop-in rounded-2xl bg-white/90 p-4 text-sm text-slate-800 shadow-2xl backdrop-blur-xl">
              <label htmlFor="vm-voice" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Assistant voice
              </label>
              <select
                id="vm-voice"
                value={voice.voiceURI}
                onChange={(e) => voice.setVoiceURI(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus-visible:outline-none"
              >
                {voiceOptions.length === 0 && <option value="">System default</option>}
                {voiceOptions.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Speech is transcribed and spoken by your browser. Replies come from the same <code>/chat</code> session as your text chat.
              </p>
            </div>
          )}
        </div>
      </header>

      {/* Stage */}
      <main className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center px-5">
        <div className="relative">
          {(phase === "speaking" || (phase === "listening" && !muted)) && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <span className="vm-ring" />
              <span className="vm-ring [animation-delay:1.1s]" />
            </div>
          )}
          <button type="button" className="vm-orb" onClick={orbAction} aria-label={orbLabel} data-testid="voice-orb">
            <span className="vm-orb-glow" />
            <span className="vm-orb-rim" />
            <span className="vm-orb-body">
              <span className="vm-orb-swirl" />
            </span>
            <span className="vm-orb-shine" />
            <span className="vm-orb-icon">
              <OrbIcon phase={phase} muted={muted} />
            </span>
          </button>
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-white/90 sm:mt-10" aria-live="polite" data-testid="voice-phase">
          {muted && phase === "listening" ? "Muted" : LABEL[phase]}
          {(phase === "thinking" || phase === "connecting") && (
            <span className="flex gap-1" aria-hidden>
              <span className="typing-dot h-1 w-1 rounded-full bg-white" />
              <span className="typing-dot h-1 w-1 rounded-full bg-white" />
              <span className="typing-dot h-1 w-1 rounded-full bg-white" />
            </span>
          )}
        </div>

        <canvas ref={canvasRef} className="mt-5 h-11 w-[min(520px,84vw)]" aria-hidden />

        {/* Transcript pill */}
        <div className="mt-5 w-[min(720px,92vw)]">
          <div className="flex min-h-16 items-center gap-3 rounded-[28px] bg-white/25 p-2.5 pr-3 shadow-[0_20px_50px_-20px_rgba(40,20,120,0.6)] ring-1 ring-inset ring-white/35 backdrop-blur-xl">
            <span className="vm-mini-orb h-11 w-11 shrink-0 rounded-full" aria-hidden />
            <div className="min-w-0 flex-1 py-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{speaker}</div>
              <p
                className={`line-clamp-3 text-[15px] font-medium leading-snug sm:text-base ${placeholder ? "text-white/70" : "text-white"} ${phase === "thinking" ? "opacity-80" : ""}`}
                aria-live="polite"
                data-testid="voice-transcript"
              >
                {text}
              </p>
            </div>
            {phase === "error" ? (
              <button
                type="button"
                onClick={voice.retry}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-indigo-700 transition hover:-translate-y-px"
              >
                <RotateCcw size={15} /> Try again
              </button>
            ) : (
              <button
                type="button"
                onClick={voice.toggleMute}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:scale-105 ${muted ? "bg-white text-indigo-700" : "text-white hover:bg-white/15"}`}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              >
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
            )}
          </div>

          {lastMeta && (phase === "speaking" || phase === "listening") && (
            <div className="mt-3 flex animate-fade-in flex-wrap items-center justify-center gap-2 text-xs font-medium text-white/90">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/20">
                {lastMeta.resolution_source === "LLM_CACHE" ? <Layers size={12} /> : <Zap size={12} />} {lastMeta.resolution_source}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/20">
                <Clock3 size={12} /> {lastMeta.latency_ms} ms
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/20">
                {lastMeta.input_tokens} in · {lastMeta.output_tokens} out
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-inset ring-white/20">
                <KeyRound size={12} /> {lastMeta.key_id ?? "cache"}
                {lastMeta.fallback_attempts > 0 ? ` · fallback ${lastMeta.fallback_attempts}` : ""}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Controls */}
      <footer className="relative z-10 flex items-start justify-center gap-6 px-4 pb-8 pt-4 sm:gap-10 sm:pb-10">
        <ControlButton onClick={voice.toggleMute} label={muted ? "Unmute" : "Mute"} tone={muted ? "on" : "glass"} pressed={muted} disabled={phase === "error" || phase === "connecting"}>
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </ControlButton>
        <ControlButton onClick={voice.interrupt} label="Interrupt" disabled={phase !== "speaking" && phase !== "thinking"}>
          <Hand size={22} />
        </ControlButton>
        <ControlButton onClick={voice.close} label="End" tone="danger">
          <PhoneOff size={22} />
        </ControlButton>
      </footer>
      <p className="relative z-10 -mt-4 hidden pb-4 text-center text-[11px] text-white/60 [@media(hover:hover)]:block">
        Space to interrupt or mute · Esc to end
      </p>
    </div>,
    document.body,
  );
}
