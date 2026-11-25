/**
 * Persistent user-profile memory (browser-local MVP).
 *
 * - Only facts the user states explicitly are saved (today: their name). Model
 *   replies are never used, and conversations are never stored as memory.
 * - Stored in localStorage under a versioned key; nothing is sent to the server
 *   except as a short block inside the existing `system_prompt` request field.
 * - Session histories stay separate: memory is a small personalisation block, not
 *   a shared transcript.
 */

export const MEMORY_STORAGE_KEY = "lyftr.memory.v1";
const MEMORY_VERSION = 1;
export const MAX_NAME_LENGTH = 40;
const MAX_NAME_WORDS = 4;

/** Mirrors the backend's DEFAULT_SYSTEM_PROMPT; used only until /health reports the real value. */
export const FALLBACK_DEFAULT_SYSTEM_PROMPT = "You are Lyftr AI, a concise and helpful assistant.";

export interface ProfileMemory {
  version: 1;
  /** Use the saved profile in chats (and offer to save new names). */
  enabled: boolean;
  /** "Remember Me": save an explicitly stated name without asking first. */
  autoSave: boolean;
  /** The saved name, or null when nothing is saved. */
  name: string | null;
  /** ISO timestamp of the last save. */
  savedAt: string | null;
}

export const DEFAULT_MEMORY: ProfileMemory = { version: 1, enabled: true, autoSave: false, name: null, savedAt: null };

// ---------------------------------------------------------------------------
// Name extraction (conservative)
// ---------------------------------------------------------------------------

const NAME_PATTERNS: RegExp[] = [
  /\bmy\s+name\s+is\s+(.+)/iu,
  /\bmy\s+name['’]s\s+(.+)/iu,
  /\b(?:you\s+can\s+|please\s+)?call\s+me\s+(.+)/iu,
  /\bmera\s+naam\s+(.+)/iu, // Hinglish: "mera naam Soham hai"
];

/** Words that end a name ("Soham and I…", "Soham hai"). */
const STOP_WORDS = new Set([
  "and", "but", "or", "so", "because", "from", "i", "i'm", "im", "here", "too", "also", "please", "thanks",
  "thank", "who", "what", "how", "btw", "by", "the", "a", "an", "is", "am", "are", "was", "not", "in", "at",
  "on", "to", "of", "for", "with", "my", "your", "hai", "h", "hu", "hoon", "if", "then", "which",
]);

/** First words that mean this is not a name ("call me back", "my name is not…"). */
const BLOCKED_FIRST_WORDS = new Set([
  "not", "back", "later", "now", "when", "if", "maybe", "sometime", "tomorrow", "today", "tonight", "again",
  "anytime", "crazy", "old", "lazy", "silly", "stupid", "weird", "dumb", "anything", "whatever", "something",
  "nothing", "nobody", "someone", "anyone", "you", "him", "her", "them", "it", "that", "this", "unknown",
  "secret", "private", "irrelevant", "same", "different", "very", "really", "just", "only", "never",
  "always", "asap", "soon", "yes", "no", "ok", "okay",
]);

/** Phrases right before the match that make the statement hypothetical or negative. */
const NEGATING_PREFIX = /(?:\bif|\bsuppose|\bimagine|\bpretend|\bdon['’]?t|\bdo\s+not|\bnever|\bnot|\bisn['’]?t|\bwhat\s+if)\s*$/iu;

const WORD_RE = /^[\p{L}][\p{L}\p{M}'’-]*$/u;

function capitalise(word: string): string {
  // Only fix all-lowercase input ("soham" -> "Soham"); keep "McDonald" / "DeSouza" as typed.
  return word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/**
 * Returns the name from an explicit self-introduction ("My name is Soham",
 * "Call me Soham", "mera naam Soham hai"), or null. Questions, negations and
 * hypotheticals are ignored on purpose.
 */
export function extractNameFromMessage(text: string): string | null {
  const message = text.trim();
  if (!message || message.length > 500 || message.endsWith("?")) return null;

  for (const pattern of NAME_PATTERNS) {
    const match = pattern.exec(message);
    if (!match || match.index === undefined) continue;
    const before = message.slice(0, match.index);
    if (NEGATING_PREFIX.test(before.trimEnd() + " ") || NEGATING_PREFIX.test(before)) return null;

    const words: string[] = [];
    for (const raw of match[1].trim().split(/\s+/)) {
      const word = raw.replace(/[.,!?;:)"'”’]+$/u, "");
      if (!WORD_RE.test(word) || STOP_WORDS.has(word.toLowerCase())) break;
      if (words.length === 0 && (BLOCKED_FIRST_WORDS.has(word.toLowerCase()) || word.length < 2)) return null;
      words.push(capitalise(word));
      if (/[.,!?;:]$/.test(raw) || words.length === 3) break;
    }
    if (words.length === 0) return null;
    return sanitizeName(words.join(" "));
  }
  return null;
}

/**
 * Normalises a name for storage or editing: letters, spaces, apostrophes, hyphens
 * and dots only, at most 4 words / 40 characters. This also stops a saved "name"
 * from smuggling instructions into the system prompt.
 */
export function sanitizeName(input: string): string | null {
  const cleaned = input
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s'’.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, MAX_NAME_WORDS)
    .join(" ")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return /\p{L}/u.test(cleaned) ? cleaned : null;
}

// ---------------------------------------------------------------------------
// What to do when the user sends a message
// ---------------------------------------------------------------------------

export type MemoryDecision = { action: "none" } | { action: "offer"; name: string } | { action: "save"; name: string };

/** Offer to save (default) or auto-save ("Remember Me") an explicitly stated name. */
export function decideOnUserMessage(memory: ProfileMemory, text: string): MemoryDecision {
  if (!memory.enabled) return { action: "none" };
  const name = extractNameFromMessage(text);
  if (!name || (memory.name && memory.name.toLowerCase() === name.toLowerCase())) return { action: "none" };
  return memory.autoSave ? { action: "save", name } : { action: "offer", name };
}

/** The name to use in prompts, or null when memory is off or empty. */
export function activeProfileName(memory: ProfileMemory): string | null {
  return memory.enabled && memory.name ? memory.name : null;
}

// ---------------------------------------------------------------------------
// System prompt composition
// ---------------------------------------------------------------------------

export function profileBlock(name: string): string {
  return (
    "Saved user profile (stated explicitly by the user and stored only in their browser). " +
    "Use it naturally when relevant; you do not remember anything else from other chats.\n" +
    `- Name: ${name}`
  );
}

/**
 * Builds the `system_prompt` for a request without overwriting anything:
 * the base is the session's custom prompt if set (the contract says it overrides
 * the default), otherwise the default instructions; the profile block is appended.
 * Returns null when there is nothing to add, so the backend's own default/session
 * prompt applies exactly as before this feature.
 */
export function composeSystemPrompt(opts: { custom: string; defaultPrompt: string; profileName: string | null }): string | null {
  const custom = opts.custom.trim();
  if (!opts.profileName) return custom || null;
  const base = custom || opts.defaultPrompt.trim() || FALLBACK_DEFAULT_SYSTEM_PROMPT;
  return `${base}\n\n${profileBlock(opts.profileName)}`;
}

/**
 * The value to send as `system_prompt` for one request. If nothing would be sent
 * but this session already stored an override on the server (from an earlier
 * custom prompt or memory), the default is sent explicitly, so a deleted or disabled
 * memory (or a cleared custom prompt) really stops applying in that chat.
 */
export function systemPromptForRequest(opts: {
  custom: string;
  defaultPrompt: string;
  profileName: string | null;
  sessionHasOverride: boolean;
}): string | undefined {
  const composed = composeSystemPrompt(opts);
  if (composed) return composed;
  return opts.sessionHasOverride ? opts.defaultPrompt.trim() || FALLBACK_DEFAULT_SYSTEM_PROMPT : undefined;
}

// ---------------------------------------------------------------------------
// Storage (versioned, validated, failure-tolerant)
// ---------------------------------------------------------------------------

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // blocked site data / private mode
  }
}

export function loadMemory(storage: KeyValueStorage | null = browserStorage()): ProfileMemory {
  try {
    const raw = storage?.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MEMORY };
    const data = JSON.parse(raw) as Partial<ProfileMemory>;
    if (data.version !== MEMORY_VERSION) return { ...DEFAULT_MEMORY };
    const name = typeof data.name === "string" ? sanitizeName(data.name) : null;
    return {
      version: 1,
      enabled: data.enabled !== false,
      autoSave: data.autoSave === true,
      name,
      savedAt: name && typeof data.savedAt === "string" ? data.savedAt : null,
    };
  } catch {
    return { ...DEFAULT_MEMORY }; // corrupted JSON -> start clean
  }
}

export function saveMemory(memory: ProfileMemory, storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    storage?.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
    return !!storage;
  } catch {
    return false;
  }
}

export function clearMemory(storage: KeyValueStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(MEMORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
