import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskResult, ChatMetadata } from "../types/chat";
import { chunkForSpeech, markdownToSpeech, pickDefaultVoice } from "../utils/speech";
import { getRecognitionCtor, type Recognition } from "../utils/recognition";

export type VoicePhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

/** Silence after the last recognised word that ends the user's turn. */
const END_OF_TURN_MS = 1300;
const VOICE_KEY = "lyftr-voice";
const MAX_MESSAGE = 4000;

function readVoicePref(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Hands-free conversation loop on top of the normal chat request path:
 *   listen (Web Speech recognition) -> pause detected -> ask(text) via POST /chat
 *   -> speak the reply (speechSynthesis) -> listen again.
 * The microphone is also routed into an AnalyserNode so the UI can react to the
 * real input level.
 */
export function useVoiceMode(ask: (text: string) => Promise<AskResult> | null) {
  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      getRecognitionCtor() !== null &&
      "speechSynthesis" in window &&
      !!navigator.mediaDevices?.getUserMedia,
    [],
  );

  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [muted, setMuted] = useState(false);
  const [userText, setUserText] = useState("");
  const [caption, setCaption] = useState("");
  const [lastMeta, setLastMeta] = useState<ChatMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState(readVoicePref);

  const activeRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const mutedRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const silenceTimer = useRef<number | null>(null);
  const restartFailures = useRef(0);
  const turnRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const boundaryAt = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const askRef = useRef(ask);

  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  const go = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // ---- voices ---------------------------------------------------------------
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceURI === voiceURI) ?? pickDefaultVoice(voices),
    [voices, voiceURI],
  );
  useEffect(() => {
    voiceRef.current = selectedVoice;
  }, [selectedVoice]);

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri);
    try {
      localStorage.setItem(VOICE_KEY, uri);
    } catch {
      /* ignore */
    }
  }, []);

  // ---- recognition ------------------------------------------------------------
  const clearSilence = () => {
    if (silenceTimer.current !== null) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  };

  const stopRecognition = useCallback(() => {
    clearSilence();
    const rec = recRef.current;
    recRef.current = null;
    try {
      rec?.abort();
    } catch {
      /* already stopped */
    }
  }, []);

  const fail = useCallback(
    (message: string) => {
      stopRecognition();
      window.speechSynthesis?.cancel();
      setError(message);
      go("error");
    },
    [go, stopRecognition],
  );

  // Declared with refs so the recognition callbacks never see stale closures.
  const finishTurnRef = useRef<() => void>(() => undefined);

  const startRecognition = useCallback(() => {
    if (!activeRef.current || mutedRef.current || recRef.current) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    finalRef.current = "";
    interimRef.current = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      interimRef.current = interim;
      restartFailures.current = 0;
      setUserText(`${finalRef.current} ${interim}`.trim());
      clearSilence();
      silenceTimer.current = window.setTimeout(() => finishTurnRef.current(), END_OF_TURN_MS);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        fail("Microphone access was blocked. Allow it from the address bar, then start Voice Mode again.");
      } else if (e.error === "audio-capture") {
        fail("No microphone was found. Connect one and try again.");
      }
      // "no-speech", "network", "aborted": onend decides whether to restart.
    };
    rec.onend = () => {
      if (recRef.current !== rec) return; // intentionally stopped / replaced
      recRef.current = null;
      if (!activeRef.current || mutedRef.current || phaseRef.current !== "listening") return;
      // Chrome ends continuous recognition after long silences; keep listening.
      restartFailures.current += 1;
      if (restartFailures.current > 6) {
        fail("Speech recognition keeps stopping. Check your connection and try again.");
        return;
      }
      window.setTimeout(() => startRecognition(), 250);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [fail]);

  const listen = useCallback(() => {
    if (!activeRef.current) return;
    setUserText("");
    setCaption("");
    go("listening");
    startRecognition();
  }, [go, startRecognition]);

  // ---- speaking ---------------------------------------------------------------
  const speak = useCallback(
    (markdown: string, turn: number) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const chunks = chunkForSpeech(markdownToSpeech(markdown));
      if (!chunks.length) {
        listen();
        return;
      }
      go("speaking");
      let index = 0;
      const next = () => {
        if (!activeRef.current || turn !== turnRef.current) return;
        if (index >= chunks.length) {
          listen();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[index]);
        const voice = voiceRef.current;
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? navigator.language ?? "en-US";
        u.rate = 1.03;
        u.pitch = 1;
        u.onstart = () => {
          boundaryAt.current = performance.now();
        };
        u.onboundary = () => {
          boundaryAt.current = performance.now();
        };
        u.onend = () => {
          index += 1;
          next();
        };
        u.onerror = (ev) => {
          if (ev.error === "interrupted" || ev.error === "canceled") return;
          index += 1;
          next();
        };
        setCaption(chunks[index]);
        utteranceRef.current = u; // keep a reference: Chrome can GC utterances mid-speech
        synth.speak(u);
      };
      // A short gap after cancel() avoids a Chrome bug where speak() is dropped.
      window.setTimeout(next, 60);
    },
    [go, listen],
  );

  // ---- a user turn ends -----------------------------------------------------------
  useEffect(() => {
    finishTurnRef.current = () => {
      const text = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, " ").trim();
      if (!text || phaseRef.current !== "listening") return;
      stopRecognition();
      const turn = ++turnRef.current;
      setUserText(text);
      setCaption("");
      setError(null);
      go("thinking");

      const pending = askRef.current(text.slice(0, MAX_MESSAGE));
      if (!pending) {
        setError("Still waiting for the previous answer.");
        listen();
        return;
      }
      pending.then((res) => {
        if (!activeRef.current || turn !== turnRef.current) return; // interrupted or closed
        if (res.ok) {
          setLastMeta(res.message.metadata ?? null);
          speak(res.message.content, turn);
        } else {
          setLastMeta(null);
          setError(res.error);
          speak(res.error, turn);
        }
      });
    };
  }, [go, listen, speak, stopRecognition]);

  // ---- microphone level (for the orb + waveform) ------------------------------------
  const getLevel = useCallback((now: number): number => {
    const p = phaseRef.current;
    if (p === "speaking") {
      // speechSynthesis exposes no audio, so animate a natural-looking envelope
      // that spikes on every word boundary.
      const sinceWord = now - boundaryAt.current;
      const spike = Math.max(0, 1 - sinceWord / 260) * 0.35;
      return Math.min(1, 0.28 + 0.12 * Math.sin(now / 95) + 0.08 * Math.sin(now / 41 + 1.3) + spike);
    }
    if (p === "thinking") return 0.12 + 0.06 * Math.sin(now / 320);
    if (p !== "listening" || mutedRef.current) return 0.02;
    const analyser = analyserRef.current;
    const buf = bufferRef.current;
    if (!analyser || !buf) return 0.02;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    return Math.min(1, rms * 5.5);
  }, []);

  // ---- open / close ---------------------------------------------------------------
  const releaseAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const open = useCallback(async () => {
    if (!supported || activeRef.current) return;
    activeRef.current = true;
    mutedRef.current = false;
    restartFailures.current = 0;
    turnRef.current += 1;
    setActive(true);
    setMuted(false);
    setError(null);
    setUserText("");
    setCaption("");
    setLastMeta(null);
    go("connecting");
    // Unlock speech output inside this user gesture (needed by some browsers).
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      bufferRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      fail("Microphone access was blocked. Allow it from the address bar, then start Voice Mode again.");
      return;
    }
    listen();
  }, [fail, go, listen, supported]);

  const close = useCallback(() => {
    activeRef.current = false;
    turnRef.current += 1;
    stopRecognition();
    window.speechSynthesis?.cancel();
    releaseAudio();
    setActive(false);
    go("idle");
  }, [go, releaseAudio, stopRecognition]);

  const retry = useCallback(() => {
    close();
    window.setTimeout(() => void open(), 50);
  }, [close, open]);

  /** Stop the current answer (or ignore a pending one) and listen again. */
  const interrupt = useCallback(() => {
    if (phaseRef.current !== "speaking" && phaseRef.current !== "thinking") return;
    turnRef.current += 1;
    window.speechSynthesis.cancel();
    listen();
  }, [listen]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (next) stopRecognition();
    else if (phaseRef.current === "listening") startRecognition();
  }, [startRecognition, stopRecognition]);

  useEffect(
    () => () => {
      activeRef.current = false;
      stopRecognition();
      window.speechSynthesis?.cancel();
      releaseAudio();
    },
    [releaseAudio, stopRecognition],
  );

  return {
    supported,
    active,
    phase,
    muted,
    userText,
    caption,
    lastMeta,
    error,
    voices,
    voiceURI: selectedVoice?.voiceURI ?? "",
    setVoiceURI,
    open,
    close,
    retry,
    interrupt,
    toggleMute,
    getLevel,
  };
}
