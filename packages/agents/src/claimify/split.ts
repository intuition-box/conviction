// Sentence splitting + markdown header context.
// Goal: mimic Claimify stage 1 (sentence splitting + context).
// Notes:
// - Prefer Intl.Segmenter when available (better with abbreviations/quotes).
// - Fallback to a conservative regex when Segmenter is unavailable.

type Segment = {
  headerPath: string[]; // e.g. ["Food insecurity and agricultural challenges"]
  sentence: string;     // the sentence
};

const FALLBACK_SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9#"'\(\[])/g;

const segmenter: Intl.Segmenter | null = (() => {
  const maybeSegmenter = (Intl as unknown as Record<string, unknown>).Segmenter;
  if (typeof maybeSegmenter !== "function") return null;
  try {
    const SegmenterCtor = maybeSegmenter as new (
      locale: string,
      options: { granularity: "sentence" },
    ) => Intl.Segmenter;
    return new SegmenterCtor("en", { granularity: "sentence" });
  } catch {
    return null;
  }
})();

function splitIntoSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  if (segmenter) {
    const out: string[] = [];
    for (const part of segmenter.segment(t)) {
      const s = part.segment.trim();
      if (s) out.push(s);
    }
    return out.length ? out : [t];
  }

  return t
    .split(FALLBACK_SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitMarkdownIntoSentences(md: string): Segment[] {
  const lines = md.split("\n");
  const headers: string[] = [];
  const segments: Segment[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Markdown headers
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      headers.splice(level - 1);
      headers[level - 1] = title;
      continue;
    }

    // Strip common list markers (keeps content; reduces garbage in claims)
    line = line.replace(/^[-*•]\s+/, "");
    line = line.replace(/^\d+\.\s+/, "");

    // Split paragraph line into sentences
    const sentences = splitIntoSentences(line);
    for (const s of sentences) {
      segments.push({ headerPath: headers.filter(Boolean), sentence: s });
    }
  }

  return segments;
}
