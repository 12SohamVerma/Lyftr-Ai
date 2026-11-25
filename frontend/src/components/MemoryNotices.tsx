import { Brain, CheckCircle2, X } from "lucide-react";
import type { MemoryToast } from "../hooks/useProfileMemory";

/** "Remember Soham for future chats?" — shown above the composer after an explicit introduction. */
export function MemoryOffer({ name, onSave, onDismiss }: { name: string; onSave: () => void; onDismiss: () => void }) {
  return (
    <div
      data-testid="memory-offer"
      role="region"
      aria-label="Save name to memory"
      className="mb-2 flex animate-pop-in flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm shadow-sm"
    >
      <Brain size={16} className="shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1">
        Remember <b data-testid="memory-offer-name">{name}</b> as your name in future chats?{" "}
        <span className="text-xs text-faint">(saved only in this browser)</span>
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          data-testid="memory-offer-save"
          onClick={onSave}
          className="rounded-lg bg-ink px-3 py-1 text-xs font-semibold text-canvas transition hover:opacity-85"
        >
          Save
        </button>
        <button
          type="button"
          data-testid="memory-offer-dismiss"
          onClick={onDismiss}
          className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          Not now
        </button>
      </span>
    </div>
  );
}

/** Confirmation toast (saved / updated / deleted). */
export function MemoryToastView({ toast, onDismiss }: { toast: MemoryToast; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        data-testid="memory-toast"
        className="pointer-events-auto flex max-w-md animate-pop-in items-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm text-canvas shadow-lg"
      >
        <CheckCircle2 size={16} className="shrink-0 text-emerald-400" aria-hidden />
        <span>{toast.text}</span>
        <button type="button" onClick={onDismiss} className="ml-1 rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
