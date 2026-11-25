import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MEMORY,
  MEMORY_STORAGE_KEY,
  clearMemory,
  decideOnUserMessage,
  loadMemory,
  sanitizeName,
  saveMemory,
  type ProfileMemory,
} from "../utils/profileMemory";

export interface MemoryToast {
  id: number;
  text: string;
}

/**
 * Browser-local profile memory: load on startup, persist every change, stay in
 * sync with other tabs, and turn explicit self-introductions into a save offer
 * (or an automatic save when "Remember Me" is on).
 */
export function useProfileMemory() {
  const [memory, setMemory] = useState<ProfileMemory>(() => loadMemory());
  const [offer, setOffer] = useState<string | null>(null);
  const [toast, setToast] = useState<MemoryToast | null>(null);
  const memoryRef = useRef(memory);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  // Another tab changed or cleared the memory -> mirror it here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MEMORY_STORAGE_KEY || e.key === null) setMemory(loadMemory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Auto-hide the confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const persist = useCallback((next: ProfileMemory) => {
    memoryRef.current = next;
    setMemory(next);
    return saveMemory(next);
  }, []);

  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  /** Save (or replace) the name. Returns false if the name is not acceptable. */
  const saveName = useCallback(
    (raw: string, source: "offer" | "auto" | "edit" = "edit") => {
      const name = sanitizeName(raw);
      if (!name) return false;
      const stored = persist({ ...memoryRef.current, name, savedAt: new Date().toISOString() });
      setOffer(null);
      notify(
        stored
          ? `${source === "edit" ? "Updated" : "Saved"} — I'll remember you as ${name} in new chats (this browser only).`
          : `Couldn't save to this browser's storage; ${name} is remembered only until you reload.`,
      );
      return true;
    },
    [notify, persist],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      persist({ ...memoryRef.current, enabled });
      if (!enabled) setOffer(null);
    },
    [persist],
  );

  const setAutoSave = useCallback((autoSave: boolean) => persist({ ...memoryRef.current, autoSave }), [persist]);

  /** Delete everything: the saved name and the preferences (the storage key is removed). */
  const forget = useCallback(() => {
    clearMemory();
    memoryRef.current = { ...DEFAULT_MEMORY };
    setMemory({ ...DEFAULT_MEMORY });
    setOffer(null);
    notify("Memory deleted from this browser. New chats won't know your name.");
  }, [notify]);

  /** Call with every message the user sends (typed or spoken). */
  const observeUserMessage = useCallback(
    (text: string) => {
      const decision = decideOnUserMessage(memoryRef.current, text);
      if (decision.action === "save") saveName(decision.name, "auto");
      else if (decision.action === "offer") setOffer(decision.name);
    },
    [saveName],
  );

  return {
    memory,
    offer,
    toast,
    saveName,
    dismissOffer: () => setOffer(null),
    dismissToast: () => setToast(null),
    setEnabled,
    setAutoSave,
    forget,
    observeUserMessage,
  };
}
