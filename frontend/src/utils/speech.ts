/** Turn an assistant's Markdown reply into plain text that sounds natural when spoken. */
export function markdownToSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code block shown in the chat) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\|/g, " ")
    .replace(/^[-:\s]{3,}$/gm, " ")
    .replace(/https?:\/\/\S+/g, "the link in the chat")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();
}

/**
 * Split text into sentence-sized chunks. Speaking short utterances one after
 * another avoids Chrome's habit of silently stopping long utterances (~15 s)
 * and lets the UI caption the sentence currently being spoken.
 */
export function chunkForSpeech(text: string, maxLen = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > maxLen) {
      if (current) chunks.push(current);
      current = "";
      // Very long sentence: break on commas / spaces.
      let rest = s;
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(", ", maxLen);
        if (cut < maxLen / 2) cut = rest.lastIndexOf(" ", maxLen);
        if (cut <= 0) cut = maxLen;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      if (rest.trim()) chunks.push(rest.trim());
    } else if ((current + " " + s).trim().length <= maxLen && current.length < 60) {
      current = (current + " " + s).trim();
    } else {
      if (current) chunks.push(current);
      current = s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const PREFERRED_VOICES = ["natural", "neural", "google us english", "google uk english female", "aria", "jenny", "samantha", "ava", "zira"];

/** Pick a pleasant default voice for the user's language. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  const base = lang.split("-")[0].toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = sameLang.length ? sameLang : voices;
  for (const hint of PREFERRED_VOICES) {
    const exact = pool.find((v) => v.name.toLowerCase().includes(hint) && v.lang.toLowerCase() === lang.toLowerCase());
    if (exact) return exact;
    const any = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (any) return any;
  }
  return pool.find((v) => v.default) ?? pool[0];
}
