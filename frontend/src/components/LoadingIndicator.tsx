import { BrandMark } from "./Brand";

/** Shown while a request is in flight. Intentionally NOT an `assistant-message`. */
export function LoadingIndicator({ simulated }: { simulated?: string }) {
  return (
    <div className="flex animate-fade-up gap-4" role="status" aria-live="polite">
      <BrandMark size={28} className="mt-0.5 rounded-full" />
      <div className="flex items-center gap-2 pt-1 text-sm text-faint">
        <span className="flex gap-1" aria-hidden>
          <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
          <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
          <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
        </span>
        <span className="sr-only">Thinking</span>
        {simulated && <span>simulating {simulated}</span>}
      </div>
    </div>
  );
}
