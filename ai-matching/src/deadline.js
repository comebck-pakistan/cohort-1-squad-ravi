/**
 * deadline.js — local (zero-API) deadline parser
 *
 * Purpose: intercept the collect_deadline step BEFORE calling Groq.
 * For high-confidence matches we advance immediately and save the API call.
 * For low-confidence or unusual phrasing we return confidence='low' so the
 * caller falls through to the normal Groq extraction path.
 *
 * Zero external dependencies. Zero API calls.
 */

// ── Acknowledgement words ─────────────────────────────────────────────────────
// A message that is ONLY one of these words is a post-confirmation ack and must
// never be parsed as a new deadline answer.
const ACK_EXACT = new Set([
  'ok', 'okay', 'k', 'sure', 'yep', 'yup', 'yes', 'yeah', 'yea',
  'great', 'cool', 'nice', 'perfect', 'perf', 'noted',
  'got it', 'sounds good', 'alright', 'works for me',
  'works', 'fine', 'makes sense', 'understood', 'aye',
  'thanks', 'thank you', 'thx', 'ty', 'cheers', 'awesome',
]);

/**
 * Returns true when the ENTIRE message is just an acknowledgement word/phrase.
 * Exported so handleMessage.js can call it before any other logic.
 */
export function isAckOnly(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[!.]+$/, '');
  return ACK_EXACT.has(t);
}

// ── Recurring / cadence patterns ─────────────────────────────────────────────
const RECURRING_PATTERNS = [
  /\bevery\s+(day|week|month|fortnight|two\s+weeks?|couple\s+of\s+weeks?)/i,
  /\b(daily|weekly|bi[-\s]?weekly|fortnightly|monthly|quarterly|annually|yearly)\b/i,
  /\bonce\s+a\s+(day|week|month|year)\b/i,
  /\b\d+\s+times?\s+(a|per)\s+(day|week|month)\b/i,
  /\bper\s+(day|week|month)\b/i,
];

// ── Relative / duration patterns ──────────────────────────────────────────────
const RELATIVE_PATTERNS = [
  /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hour|day|week|month|year)s?\b/i,
  /\ba\s+(week|month|day|year)\b/i,
  /\b(today|tonight|tomorrow|this\s+week|next\s+week|this\s+month|next\s+month|end\s+of\s+(the\s+)?(week|month|year))\b/i,
  /\b(asap|a\.s\.a\.p|immediately|right\s+away|urgently?|as\s+soon\s+as\s+possible|rush|quickly?)\b/i,
  /\b(soon|shortly)\b/i,
  /\bwithin\s+(\d+|a|an)\s+(hour|day|week|month)s?\b/i,
  /\bby\s+\w+/i,
  /\bin\s+(\d+|a|an|one|two|three)\s+(hour|day|week|month)s?\b/i,
];

// ── Explicit calendar date ────────────────────────────────────────────────────
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(,?\s*\d{4})?\b/i,
  /\b\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(,?\s*\d{4})?\b/i,
  /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bq[1-4](\s+\d{4})?\b/i,
];

// ── Type-aware normalisation ──────────────────────────────────────────────────

/**
 * Maps a recurring cadence word/phrase to a canonical "every X" form.
 * Returns null if not a known recurring pattern (caller falls back to raw).
 */
function normalizeRecurring(lower) {
  // "every X" → already clean, just title-case the unit
  const everyMatch = lower.match(/^every\s+(.+)$/);
  if (everyMatch) return `every ${everyMatch[1].trim()}`;

  // "once a X" → "every X"
  const onceAMatch = lower.match(/^once\s+a\s+(day|week|month|year)$/);
  if (onceAMatch) return `every ${onceAMatch[1]}`;

  // "N times a/per X" → "N times per X"
  const timesMatch = lower.match(/^(\d+)\s+times?\s+(?:a|per)\s+(day|week|month)$/);
  if (timesMatch) return `${timesMatch[1]} times per ${timesMatch[2]}`;

  // "per X" → "every X"
  const perMatch = lower.match(/^per\s+(day|week|month)$/);
  if (perMatch) return `every ${perMatch[1]}`;

  // Single-word cadence words → "every X"
  const cadenceMap = {
    daily:        'every day',
    weekly:       'every week',
    biweekly:     'every 2 weeks',
    'bi-weekly':  'every 2 weeks',
    'bi weekly':  'every 2 weeks',
    fortnightly:  'every 2 weeks',
    monthly:      'every month',
    quarterly:    'every quarter',
    annually:     'every year',
    yearly:       'every year',
  };
  if (cadenceMap[lower]) return cadenceMap[lower];

  return null; // unknown recurring form — return raw
}

/**
 * Maps common abbreviations and shorthand to full phrases.
 */
function normalizeShorthand(lower) {
  const shortcuts = {
    asap:      'as soon as possible',
    'a.s.a.p': 'as soon as possible',
    eow:       'end of week',
    eom:       'end of month',
    eoy:       'end of year',
    tmrw:      'tomorrow',
    tmr:       'tomorrow',
    tonite:    'tonight',
  };
  return shortcuts[lower] || null;
}

/**
 * Type-aware normalisation: produces a clean deadline_normalized string
 * that is NEVER null when raw has a value.
 *
 * @param {string} raw         - User's raw deadline text (trimmed)
 * @param {'recurring'|'date'|'relative'} type - Which category matched
 * @returns {string}           - Always a non-empty string
 */
function computeRelativeDeadlineDate(raw) {
  const lower = raw.toLowerCase().trim();
  const d = new Date();

  if (/end\s+of\s+(this\s+)?week|this\s+week|by\s+(the\s+)?end\s+of\s+(this\s+)?week|eow/i.test(lower)) {
    const day = d.getDay();
    const diff = (7 - day) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    const iso = d.toISOString().split('T')[0];
    return `by end of week (${iso})`;
  }

  if (/next\s+week/i.test(lower)) {
    const day = d.getDay();
    const diff = (7 - day) % 7 + 7;
    d.setDate(d.getDate() + diff);
    const iso = d.toISOString().split('T')[0];
    return `by next week (${iso})`;
  }

  if (/tomorrow|tmrw|tmr/i.test(lower)) {
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().split('T')[0];
    return `tomorrow (${iso})`;
  }

  const daysMatch = lower.match(/(?:in\s+)?(\d+)\s+days?/i);
  if (daysMatch) {
    const num = parseInt(daysMatch[1], 10);
    d.setDate(d.getDate() + num);
    const iso = d.toISOString().split('T')[0];
    return `in ${num} days (${iso})`;
  }

  const weeksMatch = lower.match(/(?:in\s+)?(\d+)\s+weeks?/i);
  if (weeksMatch) {
    const num = parseInt(weeksMatch[1], 10);
    d.setDate(d.getDate() + num * 7);
    const iso = d.toISOString().split('T')[0];
    return `in ${num} weeks (${iso})`;
  }

  if (/end\s+of\s+(this\s+)?month|this\s+month|eom/i.test(lower)) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const iso = lastDay.toISOString().split('T')[0];
    return `by end of month (${iso})`;
  }

  return null;
}

function normaliseDeadline(raw, type) {
  const lower = raw.toLowerCase().trim();

  if (type === 'recurring') {
    return normalizeRecurring(lower) || raw.trim();
  }

  // Shorthand expansion applies to all types
  const shorthand = normalizeShorthand(lower);
  if (shorthand) return shorthand;

  if (type === 'relative') {
    const relativeEst = computeRelativeDeadlineDate(raw);
    if (relativeEst) return relativeEst;
  }

  return raw.trim();
}

// ── Main export: local parser ─────────────────────────────────────────────────
/**
 * Try to parse a user's message as a deadline/timeline locally (no API).
 *
 * @param {string} messageText  Raw user message
 * @returns {{ deadline_raw: string, deadline_normalized: string,
 *             is_recurring: boolean, confidence: 'high'|'low' }}
 */
export function parseDeadlineLocally(messageText) {
  if (!messageText) {
    return { deadline_raw: '', deadline_normalized: '', is_recurring: false, confidence: 'low' };
  }

  const raw = messageText.trim();
  const lower = raw.toLowerCase();

  // Button ID shortcuts
  if (lower === 'deadline_asap') {
    return {
      deadline_raw: 'ASAP',
      deadline_normalized: 'as soon as possible',
      is_recurring: false,
      confidence: 'high',
    };
  }
  if (lower === 'deadline_2w') {
    return {
      deadline_raw: '2 weeks',
      deadline_normalized: normaliseDeadline('in 2 weeks', 'relative'),
      is_recurring: false,
      confidence: 'high',
    };
  }
  if (lower === 'deadline_recurring') {
    return {
      deadline_raw: 'recurring',
      deadline_normalized: 'every week',
      is_recurring: true,
      confidence: 'high',
    };
  }

  // 1. Recurring cadences (highest priority)
  for (const p of RECURRING_PATTERNS) {
    if (p.test(lower)) {
      return {
        deadline_raw: raw,
        deadline_normalized: normaliseDeadline(raw, 'recurring'),
        is_recurring: true,
        confidence: 'high',
      };
    }
  }

  // 2. Explicit calendar dates
  for (const p of DATE_PATTERNS) {
    if (p.test(lower)) {
      return {
        deadline_raw: raw,
        deadline_normalized: normaliseDeadline(raw, 'date'),
        is_recurring: false,
        confidence: 'high',
      };
    }
  }

  // 3. Relative / duration phrases
  for (const p of RELATIVE_PATTERNS) {
    if (p.test(lower)) {
      return {
        deadline_raw: raw,
        deadline_normalized: normaliseDeadline(raw, 'relative'),
        is_recurring: false,
        confidence: 'high',
      };
    }
  }

  // 4. Bare single time-unit words
  const bareUnits = ['week', 'month', 'day', 'year', 'tomorrow', 'tonight', 'today'];
  if (bareUnits.includes(lower)) {
    return {
      deadline_raw: raw,
      deadline_normalized: normaliseDeadline(raw, 'relative'),
      is_recurring: false,
      confidence: 'high',
    };
  }

  // 5. Any digit present (e.g. "3", "2026", "15th")
  if (/\d/.test(lower)) {
    return {
      deadline_raw: raw,
      deadline_normalized: normaliseDeadline(raw, 'relative'),
      is_recurring: false,
      confidence: 'high',
    };
  }

  // 6. Not confident — let Groq handle it
  return { deadline_raw: raw, deadline_normalized: raw, is_recurring: false, confidence: 'low' };
}

// ── Post-Groq normalisation helper ───────────────────────────────────────────
/**
 * Ensures deadline_normalized is never null/empty when deadline_raw has a value.
 * Call this after the Groq path to patch up any fields Groq left as null.
 *
 * Guarantee: after this call, if extracted_data.deadline OR deadline_raw is
 * non-empty, deadline_normalized will also be non-empty.
 *
 * @param {object} extractedData  The extracted_data object from Groq
 * @returns {object}              Mutated (in-place) extractedData
 */
export function ensureDeadlineNormalized(extractedData) {
  if (!extractedData) return extractedData;

  const raw = extractedData.deadline_raw || extractedData.deadline || '';
  if (!raw) return extractedData; // no deadline at all — nothing to fix

  // If deadline_normalized is already populated, leave it alone
  if (extractedData.deadline_normalized) return extractedData;

  // Re-run the local normaliser to produce a value
  const localResult = parseDeadlineLocally(raw);

  // localResult.deadline_normalized is always non-empty (falls back to raw)
  extractedData.deadline_normalized = localResult.deadline_normalized;

  // Also patch is_recurring if Groq left it undefined
  if (extractedData.is_recurring === undefined || extractedData.is_recurring === null) {
    extractedData.is_recurring = localResult.is_recurring;
  }

  // Ensure deadline_raw is set too (mirrors deadline if missing)
  if (!extractedData.deadline_raw) {
    extractedData.deadline_raw = raw;
  }

  return extractedData;
}

