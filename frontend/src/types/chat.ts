// Mirrors the backend API contract (backend/app/schemas.py).

export type ResolutionSource = "LIVE_INFERENCE" | "LLM_CACHE";

export interface ChatMetadata {
  resolution_source: ResolutionSource;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  key_id: string | null;
  fallback_attempts: number;
}

export interface ChatRequest {
  session_id: string;
  message: string;
  system_prompt?: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  metadata: ChatMetadata;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  keys_configured: number;
  cache_enabled: boolean;
  detail?: string;
}

export type MessageRole = "user" | "assistant" | "error";

export interface UIMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  /** Assistant replies only: metadata exactly as returned by the API. */
  metadata?: ChatMetadata;
  /** User messages: "failed" when the request did not produce a reply. */
  status?: "sent" | "failed";
  /** Error messages: the user message that can be retried. */
  retryOf?: string;
  /** The X-Simulate-Failure header that was sent with this request, if any. */
  simulated?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: UIMessage[];
  systemPrompt: string;
  createdAt: number;
}

export type ConnectionState = "checking" | "online" | "degraded" | "offline";
