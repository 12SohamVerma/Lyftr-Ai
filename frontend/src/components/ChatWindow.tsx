import { useEffect, useRef } from "react";
import type { UIMessage } from "../types/chat";
import { LoadingIndicator } from "./LoadingIndicator";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: UIMessage[];
  loading: boolean;
  simulated?: string;
  onRetry: (errorId: string) => void;
}

/** The conversation column (the empty state lives in App, ChatGPT-style). */
export function ChatWindow({ messages, loading, simulated, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  return (
    <div className="flex flex-col gap-8 py-6" aria-live="polite">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} onRetry={onRetry} retryDisabled={loading} />
      ))}
      {loading && <LoadingIndicator simulated={simulated} />}
      <div ref={bottomRef} className="h-px" />
    </div>
  );
}
