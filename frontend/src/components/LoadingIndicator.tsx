import { BrandMark } from "./Sidebar";

/** Shown while a request is in flight. Intentionally NOT an `assistant-message`. */
export function LoadingIndicator({ simulated }: { simulated?: string }) {
  return (
    <div className="flex animate-fade-in gap-3" role="status" aria-live="polite">
      <BrandMark className="mt-0.5 h-8 w-8 shrink-0" />
      <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-ink-700 dark:bg-ink-900">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex gap-1" aria-hidden>
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" />
          </span>
          <span>{simulated ? `Thinking… (simulating ${simulated})` : "Thinking…"}</span>
        </div>
      </div>
    </div>
  );
}
