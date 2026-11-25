import { ArrowUp, AudioLines, FlaskConical, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SystemPromptEditor } from "./SystemPromptEditor";

const MAX_CHARS = 4000;

interface Props {
  onSend: (text: string) => boolean;
  busy: boolean;
  focusKey?: string;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  simulateFailure: string;
  onClearSimulation: () => void;
  voiceModeSupported: boolean;
  onVoiceMode: () => void;
}

export function ChatInput(props: Props) {
  const { onSend, busy, focusKey } = props;
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = value.trim().length;
  const canSend = !busy && length > 0;

  // Auto-grow up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [focusKey, busy]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    if (onSend(value)) setValue(""); // input is emptied as soon as the message is sent
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts a newline; ignore Enter while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="overflow-hidden rounded-[26px] border border-line bg-surface shadow-[0_4px_20px_-8px_rgb(0_0_0/0.12)] transition focus-within:border-line-strong dark:border-transparent dark:shadow-none"
    >
      <SystemPromptEditor value={props.systemPrompt} onChange={props.onSystemPromptChange} />

      <textarea
        ref={ref}
        data-testid="chat-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Ask anything"
        aria-label="Message"
        className="scroll-thin block max-h-[200px] min-h-12 w-full resize-none bg-transparent px-5 pt-3.5 text-[16px] leading-6 outline-none placeholder:text-faint focus-visible:outline-none"
      />

      <div className="flex items-center gap-2 px-3 pb-3 pt-1">
        {props.simulateFailure && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 py-1 pl-2.5 pr-1 text-xs font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            <FlaskConical size={13} /> X-Simulate-Failure: {props.simulateFailure}
            <button type="button" onClick={props.onClearSimulation} className="rounded-full p-0.5 hover:bg-amber-200/70 dark:hover:bg-amber-400/20" aria-label="Turn off failure simulation">
              <X size={13} />
            </button>
          </span>
        )}
        <div className="flex-1" />
        {length > MAX_CHARS * 0.8 && (
          <span className={`text-xs tabular-nums ${length > MAX_CHARS ? "font-semibold text-rose-500" : "text-faint"}`}>
            {length}/{MAX_CHARS}
          </span>
        )}
        {props.voiceModeSupported && (
          <button
            type="button"
            onClick={props.onVoiceMode}
            disabled={busy}
            data-testid="voice-mode-button"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink transition hover:bg-surface-3 disabled:opacity-40 dark:bg-surface-3 dark:hover:bg-line-strong"
            aria-label="Start Voice Mode"
            title="Voice Mode"
          >
            <AudioLines size={18} />
          </button>
        )}
        <button
          type="submit"
          data-testid="send-button"
          disabled={!canSend}
          aria-label="Send message"
          title="Send message"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-canvas transition hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-faint"
        >
          {busy ? <Square size={13} className="fill-current" /> : <ArrowUp size={19} strokeWidth={2.4} />}
        </button>
      </div>
    </form>
  );
}
