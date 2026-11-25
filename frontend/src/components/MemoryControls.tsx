import { Brain, Check, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProfileMemory } from "../utils/profileMemory";
import { MAX_NAME_LENGTH } from "../utils/profileMemory";

interface Props {
  memory: ProfileMemory;
  onSaveName: (name: string) => boolean;
  onEnabledChange: (enabled: boolean) => void;
  onAutoSaveChange: (autoSave: boolean) => void;
  onForget: () => void;
}

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; testId: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      data-testid={props.testId}
      onClick={() => props.onChange(!props.checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${props.checked ? "bg-brand-gradient" : "bg-line-strong"}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${props.checked ? "left-5" : "left-1"}`} />
    </button>
  );
}

/** Memory status pill (top bar) + panel to view, edit, disable and delete saved profile memory. */
export function MemoryControls({ memory, onSaveName, onEnabledChange, onAutoSaveChange, onForget }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(memory.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(memory.name ?? "");
      setConfirmDelete(false);
      setInvalid(false);
    }
  }, [open, memory.name]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const status = !memory.enabled ? "Memory off" : memory.name ? memory.name : "No memory";
  const dot = !memory.enabled ? "bg-faint" : memory.name ? "bg-emerald-500" : "bg-line-strong";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = onSaveName(draft);
    setInvalid(!ok);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="memory-indicator"
        data-memory-state={!memory.enabled ? "off" : memory.name ? "saved" : "empty"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={memory.enabled && memory.name ? `Remembering your name: ${memory.name}` : "Personal memory"}
        className="flex h-9 max-w-[11rem] items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <Brain size={16} className={memory.enabled && memory.name ? "text-brand" : ""} />
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="hidden truncate sm:inline">{status}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Personal memory"
          data-testid="memory-panel"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop-in rounded-2xl border border-line bg-canvas p-4 text-sm shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Personal memory</div>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Lyftr AI can remember your name across chats. Only what you state explicitly is saved — never your conversations.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={submit} className="mt-3">
            <label htmlFor="memory-name" className="text-xs font-medium text-muted">
              Saved name
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="memory-name"
                data-testid="memory-name-input"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInvalid(false);
                }}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Not saved yet"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 outline-none focus:border-brand/50 focus-visible:outline-none"
              />
              <button
                type="submit"
                data-testid="memory-save"
                disabled={!draft.trim() || draft.trim() === memory.name}
                className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:opacity-85 disabled:opacity-40"
              >
                <Check size={14} /> Save
              </button>
            </div>
            {invalid && <p className="mt-1 text-xs text-rose-500">Use letters only (up to {MAX_NAME_LENGTH} characters).</p>}
          </form>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Use memory in chats</div>
                <div className="text-xs text-muted">Off: your name is not sent and not offered for saving.</div>
              </div>
              <Switch checked={memory.enabled} onChange={onEnabledChange} label="Use memory in chats" testId="memory-enabled-toggle" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Remember Me</div>
                <div className="text-xs text-muted">Save your name automatically when you tell it, without asking.</div>
              </div>
              <Switch checked={memory.autoSave} onChange={onAutoSaveChange} label="Remember Me" testId="memory-autosave-toggle" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-[11px] leading-4 text-faint">Stored only in this browser. It does not sync to other devices or browsers.</p>
            {confirmDelete ? (
              <button
                type="button"
                data-testid="memory-delete-confirm"
                onClick={() => {
                  onForget();
                  setOpen(false);
                }}
                className="shrink-0 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                data-testid="memory-delete"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-400/10"
              >
                <Trash2 size={13} /> Delete memory
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
