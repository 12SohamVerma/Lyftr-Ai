import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * The backend accepts up to 8000 characters; ~400 are reserved for the saved
 * profile-memory block that may be appended to this prompt.
 */
export const SYSTEM_PROMPT_MAX = 7600;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Optional per-session system prompt — one quiet line at the top of the composer.
 * When non-empty it is sent as `system_prompt`; the backend keeps it as this
 * session's override.
 */
export function SystemPromptEditor({ value, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [value]);

  return (
    <div className="flex items-start gap-2 border-b border-line px-4 py-2" title="System prompt for this chat (optional)">
      <SlidersHorizontal size={14} className="mt-[5px] shrink-0 text-faint" aria-hidden />
      <textarea
        ref={ref}
        data-testid="system-prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        maxLength={SYSTEM_PROMPT_MAX}
        aria-label="System prompt (optional)"
        placeholder="System prompt (optional)"
        className="scroll-thin block min-h-6 w-full resize-none bg-transparent text-[13px] leading-6 text-muted outline-none placeholder:text-faint focus:text-ink focus-visible:outline-none"
      />
    </div>
  );
}
