import { ArrowUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

const MAX_CHARS = 4000;

interface Props {
  onSend: (text: string) => boolean;
  busy: boolean;
  autoFocusKey?: string;
}

export function ChatInput({ onSend, busy, autoFocusKey }: Props) {
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
    ref.current?.focus();
  }, [autoFocusKey, busy]);

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
      className="rounded-2xl border border-slate-200 bg-white shadow-sm transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-900"
    >
      <textarea
        ref={ref}
        data-testid="chat-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={busy ? "Waiting for the reply…" : "Message Lyftr AI…"}
        aria-label="Message"
        className="scroll-thin block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
        <span className="hidden text-[11px] text-slate-400 sm:inline">
          <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> for a new line
        </span>
        <div className="ml-auto flex items-center gap-3">
          {length > MAX_CHARS * 0.8 && (
            <span className={`text-[11px] tabular-nums ${length > MAX_CHARS ? "font-semibold text-rose-500" : "text-slate-400"}`}>
              {length}/{MAX_CHARS}
            </span>
          )}
          <button
            type="submit"
            data-testid="send-button"
            disabled={!canSend}
            aria-label="Send message"
            title="Send message"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-ink-700 dark:disabled:text-slate-500"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
    </form>
  );
}
