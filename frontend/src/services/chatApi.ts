import type { ChatRequest, ChatResponse, HealthResponse } from "../types/chat";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const CHAT_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 8_000;

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");

export type ApiErrorKind = "validation" | "unavailable" | "upstream" | "not_found" | "network" | "timeout" | "server";

/** An error that is always safe and readable to show in the chat. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

function describeValidation(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = (detail as ValidationIssue[]).map((issue) => {
      const field = issue.loc?.filter((p) => p !== "body").join(".");
      const msg = issue.msg ?? "is invalid";
      return field ? `${field}: ${msg}` : msg;
    });
    if (parts.length) return parts.join("; ");
  }
  return "the request was invalid";
}

async function readDetail(res: Response): Promise<unknown> {
  try {
    const body = await res.json();
    return body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
  } catch {
    return null;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const detail = await readDetail(res);
  switch (res.status) {
    case 422:
      return new ApiError("validation", `Your message could not be sent — ${describeValidation(detail)}.`, 422);
    case 503:
      return new ApiError(
        "unavailable",
        detail === "all providers unavailable"
          ? "All AI providers are unavailable right now — every API key in the pool failed. Please try again in a moment."
          : `The service is temporarily unavailable${typeof detail === "string" ? ` (${detail})` : ""}.`,
        503,
      );
    case 502:
      return new ApiError("upstream", `The model provider could not answer this request${typeof detail === "string" ? `: ${detail}` : ""}.`, 502);
    case 404:
      return new ApiError("not_found", typeof detail === "string" ? detail : "Not found.", 404);
    default:
      return new ApiError(
        "server",
        `The server returned an error (HTTP ${res.status})${typeof detail === "string" ? `: ${detail}` : ""}.`,
        res.status,
      );
  }
}

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("timeout", "The request timed out. The model may be busy — please try again.");
    }
    throw new ApiError("network", "Can't reach the Lyftr AI server. Check your connection and that the backend is running.");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) throw await toApiError(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("server", "The server sent a response that could not be read.");
  }
}

export interface SendOptions {
  /** Value for the X-Simulate-Failure header (failover demo), e.g. "key_1=429". */
  simulateFailure?: string;
}

export function sendChatMessage(body: ChatRequest, options: SendOptions = {}): Promise<ChatResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.simulateFailure) headers["X-Simulate-Failure"] = options.simulateFailure;
  return request<ChatResponse>("/chat", { method: "POST", headers, body: JSON.stringify(body) }, CHAT_TIMEOUT_MS);
}

/** Health is "degraded" with HTTP 503, so the body is read for both 200 and 503. */
export async function fetchHealth(): Promise<HealthResponse> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    const body = (await res.json()) as HealthResponse;
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

export function historyUrl(sessionId: string): string {
  return `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/messages`;
}
