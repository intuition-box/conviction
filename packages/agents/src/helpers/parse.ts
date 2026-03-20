import type { FlatTriple, CausalMarker } from "../types.js";
import { trackFallback } from "./fallbackTracker.js";
import {
  REPORTING_VERBS,
  PROBABLE_VERB_RE,
  TEMPORAL_SINCE_RE,
  COPULA_RE,
  MODAL_EXTRACT_RE,
  TRANSITIVE_RE,
  FILLER_SUBJECTS_RE,
  SUB_PROPOSITION_MIN_WORDS,
  SUB_PROPOSITION_MAX_WORDS,
  CAUSAL_BEFORE_MIN_WORDS,
} from "./rules/extractionRules.js";

export function isReportingVerb(word: string): boolean {
  return REPORTING_VERBS.has(word.toLowerCase());
}

export function looksLikeProposition(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.length >= 3 && PROBABLE_VERB_RE.test(text);
}

function looksLikeMetaProposition(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && PROBABLE_VERB_RE.test(text);
}

export function parseMetaClaim(claim: string): { source: string; verb: string; proposition: string } | null {
  const c = claim.trim().replace(/\.$/, "");

  const m1 = c.match(/^(.+?)\s+([a-z]+)\s+that\s+(.+)$/i);
  if (m1) {
    const verb = m1[2].trim();
    if (!REPORTING_VERBS.has(verb.toLowerCase())) return null;
    const proposition = m1[3].trim();
    if (!proposition) return null;
    return { source: m1[1].trim(), verb, proposition };
  }

  const m2 = c.match(/^(.+?)\s+([a-z]+)\s+(.+)$/i);
  if (!m2) return null;
  const verb = m2[2].trim();
  if (!REPORTING_VERBS.has(verb.toLowerCase())) return null;
  const remainder = m2[3].trim();
  if (!remainder) return null;

  const subProp = tryExtractSubProposition(remainder);
  if (subProp) return { source: m2[1].trim(), verb, proposition: remainder };
  if (looksLikeMetaProposition(remainder)) return { source: m2[1].trim(), verb, proposition: remainder };

  return null;
}

const CONSEQUENTIAL_MULTI_RE = /,?\s*(so\s+that|which\s+is\s+why|which\s+means|which\s+leads\s+to|leading\s+to|resulting\s+in)\b/i;
const CONSEQUENTIAL_SINGLE_RE = /\b(therefore|thus|hence)\b/i;
const SO_RE = /\bso\b/i;
const WHICH_VERB_COMMA_RE = /,\s*which\s+(\w+)\b/i;
const WHICH_VERB_NO_COMMA_RE = /\bwhich\s+(\w+)\b/i;

export function parseCausal(text: string): { mainText: string; reasonText: string; marker: CausalMarker } | null {
  const multiMatch = CONSEQUENTIAL_MULTI_RE.exec(text);
  if (multiMatch) {
    return buildCausalResult(text, multiMatch.index, multiMatch[0].length, multiMatch[1]);
  }

  const whichResult = parseWhichRelative(text);
  if (whichResult) return whichResult;

  const singleMatch = CONSEQUENTIAL_SINGLE_RE.exec(text);
  if (singleMatch) {
    return buildCausalResult(text, singleMatch.index, singleMatch[0].length, singleMatch[1]);
  }

  const soMatch = SO_RE.exec(text);
  if (soMatch) {
    const afterSo = text.slice(soMatch.index + soMatch[0].length);
    if (!/^\s+that\b/i.test(afterSo)) {
      return buildCausalResult(text, soMatch.index, soMatch[0].length, "so");
    }
  }

  const causalMatch = /\b(because|since)\b/i.exec(text);
  if (!causalMatch) return null;
  const marker = causalMatch[1].toLowerCase() as CausalMarker;
  const markerIndex = causalMatch.index;
  if (marker === "since" && TEMPORAL_SINCE_RE.test(text.slice(markerIndex))) return null;
  return buildCausalResult(text, markerIndex, causalMatch[0].length, marker);
}

function parseWhichRelative(text: string): { mainText: string; reasonText: string; marker: CausalMarker } | null {
  const commaMatch = WHICH_VERB_COMMA_RE.exec(text);
  if (commaMatch) {
    const verb = commaMatch[1].toLowerCase();
    const marker = `which ${verb}` as CausalMarker;
    const fullMatchEnd = commaMatch.index + commaMatch[0].length;
    const before = text.slice(0, commaMatch.index).trim();
    const after = text.slice(fullMatchEnd).trim().replace(/\.\s*$/, "");
    if (before.split(/\s+/).filter(Boolean).length < CAUSAL_BEFORE_MIN_WORDS) return null;
    if (!after || after.split(/\s+/).filter(Boolean).length < 2) return null;
    return { mainText: before, reasonText: after, marker };
  }

  const noCommaMatch = WHICH_VERB_NO_COMMA_RE.exec(text);
  if (noCommaMatch) {
    const verb = noCommaMatch[1].toLowerCase();
    const marker = `which ${verb}` as CausalMarker;
    const before = text.slice(0, noCommaMatch.index).trim();
    if (!PROBABLE_VERB_RE.test(before)) return null;
    const fullMatchEnd = noCommaMatch.index + noCommaMatch[0].length;
    const after = text.slice(fullMatchEnd).trim().replace(/\.\s*$/, "");
    if (before.split(/\s+/).filter(Boolean).length < CAUSAL_BEFORE_MIN_WORDS) return null;
    if (!after || after.split(/\s+/).filter(Boolean).length < 2) return null;
    return { mainText: before, reasonText: after, marker };
  }

  return null;
}

function buildCausalResult(
  text: string,
  markerIndex: number,
  markerLength: number,
  rawMarker: string,
): { mainText: string; reasonText: string; marker: CausalMarker } | null {
  const marker = rawMarker.toLowerCase().replace(/\s+/g, " ").trim() as CausalMarker;
  const before = text.slice(0, markerIndex).trim().replace(/[,;:]\s*$/, "").trim();
  const after = text.slice(markerIndex + markerLength).trim().replace(/\.\s*$/, "");
  if (before.split(/\s+/).filter(Boolean).length < CAUSAL_BEFORE_MIN_WORDS) return null;
  if (!after || after.split(/\s+/).filter(Boolean).length < 2) return null;
  return { mainText: before, reasonText: after, marker };
}

export function tryExtractSubProposition(value: string): FlatTriple | null {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < SUB_PROPOSITION_MIN_WORDS || words.length > SUB_PROPOSITION_MAX_WORDS) return null;

  const modalIntransitive = trimmed.match(/^(.+?)\s+(can|should|must|will|may|might|could|would)\s+([a-z][a-z-]*)$/i);
  if (modalIntransitive) {
    const subject = modalIntransitive[1].trim();
    if (FILLER_SUBJECTS_RE.test(subject)) return null;
    const predicate = modalIntransitive[2].trim();
    const object = modalIntransitive[3].trim();
    trackFallback("tryExtractSubProposition");
    return { subject, predicate, object };
  }

  const modal = trimmed.match(MODAL_EXTRACT_RE);
  if (modal) {
    const subject = modal[1].trim();
    if (FILLER_SUBJECTS_RE.test(subject)) return null;
    const predicate = `${modal[2].trim()} ${modal[3].trim()}`;
    const object = modal[4].trim();
    if (object.toLowerCase().startsWith("that ")) return null;
    trackFallback("tryExtractSubProposition");
    return { subject, predicate, object };
  }

  const trans = trimmed.match(TRANSITIVE_RE);
  if (trans) {
    const subject = trans[1].trim();
    if (FILLER_SUBJECTS_RE.test(subject)) return null;
    const predicate = trans[2].trim();
    const object = trans[3].trim();
    if (object.toLowerCase().startsWith("that ")) return null;
    trackFallback("tryExtractSubProposition");
    return { subject, predicate, object };
  }

  const copula = trimmed.match(COPULA_RE);
  if (copula) {
    const subject = copula[1].trim();
    if (FILLER_SUBJECTS_RE.test(subject)) return null;
    const predicate = copula[2].trim();
    const object = copula[3].trim();
    if (object.toLowerCase().startsWith("that ")) return null;
    trackFallback("tryExtractSubProposition");
    return { subject, predicate, object };
  }

  return null;
}

