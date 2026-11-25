import { AlertCircle, AudioLines, Check, Copy, FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "../types/chat";
import { BrandMark } from "./Brand";
import { ResponseMetadata } from "./ResponseMetadata";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md p-1.5 text-faint transition hover:bg-surface-2 hover:text-ink"
      aria-label={copied ? "Copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

interface Props {
  message: UIMessage;
  onRetry?: (errorId: string) => void;
  retryDisabled?: boolean;
}

export function MessageBubble({ message, onRetry, retryDisabled }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex animate-fade-up flex-col items-end">
        <div
          data-testid="user-message"
          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-surface-2 px-5 py-2.5 text-[15.5px] leading-7 sm:max-w-[70%] ${
            message.status === "failed" ? "opacity-60" : ""
          }`}
        >
          {message.content}
        </div>
        {(message.via || message.simulated || message.status === "failed") && (
          <div className="mt-1 flex items-center gap-2 pr-2 text-xs text-faint">
            {message.via === "voice" && (
              <span className="inline-flex items-center gap-1">
                <AudioLines size={12} /> Voice
              </span>
            )}
            {message.simulated && (
              <span className="inline-flex items-center gap-1">
                <FlaskConical size={12} /> {message.simulated}
              </span>
            )}
            {message.status === "failed" && <span className="text-rose-500">Not delivered</span>}
          </div>
        )}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex animate-fade-up gap-4" role="alert">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
          <AlertCircle size={16} />
        </span>
        <div data-testid="error-message" className="min-w-0 flex-1 pt-0.5 text-[15px] leading-7 text-rose-700 dark:text-rose-300">
          <p>{message.content}</p>
          {onRetry && message.retryOf && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              disabled={retryDisabled}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50"
            >
              <RotateCcw size={14} /> Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-fade-up gap-4">
      <BrandMark size={28} className="mt-0.5 rounded-full" />
      <div data-testid="assistant-message" className="min-w-0 flex-1">
        <div className="markdown" data-testid="assistant-reply">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
          <CopyButton text={message.content} />
          {message.metadata && <ResponseMetadata metadata={message.metadata} />}
        </div>
      </div>
    </div>
  );
}
