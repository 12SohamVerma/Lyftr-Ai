import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "../services/chatApi";
import type { ConnectionState, HealthResponse } from "../types/chat";

const HEALTH_POLL_MS = 30_000;

/** Polls GET /health. "degraded" = backend up but not fully configured (HTTP 503). */
export function useHealth() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const h = await fetchHealth();
      setHealth(h);
      setState(h.status === "ok" ? "online" : "degraded");
    } catch {
      setState("offline");
    } finally {
      setChecking(false);
      setCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, HEALTH_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { state, health, checkedAt, checking, refresh };
}
