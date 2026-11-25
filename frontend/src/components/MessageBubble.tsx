import { AlertTriangle, Check, Copy, FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "../types/chat";
import { ResponseMetadata } from "./ResponseMetadata";
import { BrandMark } from "./Sidebar";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-ink-800 dark:hover:text-slate-200"
      aria-label={copied ? "Copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy reply"}
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
      <div className="flex animate-fade-in flex-col items-end gap-1">
        <div
          data-testid="user-message"
          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-7 shadow-sm sm:max-w-[75%] ${
            message.status === "failed"
              ? "bg-slate-200 text-slate-600 dark:bg-ink-800 dark:text-slate-400"
              : "bg-brand-600 text-white"
          }`}
        >
          {message.content}
        </div>
        {(message.simulated || message.status === "failed") && (
          <div className="flex items-center gap-2 pr-1 text-[11px] text-slate-500 dark:text-slate-400">
            {message.simulated && (
              <span className="inline-flex items-center gap-1">
                <FlaskConical size={12} /> X-Simulate-Failure: {message.simulated}
              </span>
            )}
            {message.status === "failed" && <span>Not delivered</span>}
          </div>
        )}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex animate-fade-in gap-3" role="alert">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
          <AlertTriangle size={16} />
        </div>
        <div
          data-testid="error-message"
          className="flex max-w-[85%] flex-col gap-2 rounded-2xl rounded-tl-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <p className="leading-6">{message.content}</p>
          {onRetry && message.retryOf && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              disabled={retryDisabled}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-500/10"
            >
              <RotateCcw size={13} /> Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex animate-fade-in gap-3">
      <BrandMark className="mt-0.5 h-8 w-8 shrink-0" />
      <div
        data-testid="assistant-message"
        className="min-w-0 max-w-full flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm sm:max-w-[85%] sm:flex-none dark:border-ink-700 dark:bg-ink-900"
      >
        <div className="flex items-start gap-2">
          <div className="markdown min-w-0 flex-1" data-testid="assistant-reply">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
          <div className="-mr-1 -mt-1 opacity-60 transition group-hover:opacity-100">
            <CopyButton text={message.content} />
          </div>
        </div>
        {message.metadata && <ResponseMetadata metadata={message.metadata} />}
      </div>
    </div>
  );
}
