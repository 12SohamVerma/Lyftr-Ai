import { Settings2 } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Optional per-session system prompt. When non-empty it is sent as `system_prompt`
 * with each message; the backend stores it as this session's override.
 */
export function SystemPromptEditor({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 dark:border-ink-700 dark:bg-ink-900/70">
      <label htmlFor="system-prompt" className="mt-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Settings2 size={14} />
        <span className="hidden sm:inline">System prompt</span>
      </label>
      <textarea
        id="system-prompt"
        data-testid="system-prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={1}
        maxLength={8000}
        placeholder="Optional — e.g. “Answer in simple English.” Applies to this chat from the next message."
        className="scroll-thin max-h-28 min-h-[28px] flex-1 resize-y bg-transparent py-0.5 text-sm leading-6 text-slate-700 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
    </div>
  );
}
