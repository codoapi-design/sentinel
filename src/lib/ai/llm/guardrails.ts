/**
 * Radareum AI — Output Guardrails
 *
 * Post-processing safety net applied to every generated answer, whichever
 * path produced it. Implements Part 7 §7.7: financial advice, prediction,
 * identity, and security — plus the tone rules from Part 4 §4.19.
 *
 * The policy here is deliberately conservative. Obvious violations are
 * dropped or replaced with the Spec's approved phrasing; borderline wording
 * is flagged and left intact rather than rewritten, because rewriting an
 * analytical sentence risks changing a number's meaning.
 */

export type GuardrailCategory =
  | 'financial_advice'
  | 'prediction'
  | 'identity'
  | 'security'
  | 'tone';

export type GuardrailAction = 'removed' | 'rephrased' | 'flagged';

export interface GuardrailViolation {
  category: GuardrailCategory;
  action: GuardrailAction;
  /** Stable rule identifier, e.g. `advice.you_should`. */
  rule: string;
  /** The offending fragment, truncated for logging. */
  excerpt: string;
}

export interface SanitizedOutput {
  text: string;
  violations: GuardrailViolation[];
}

const MAX_EXCERPT_CHARS = 160;
const MAX_VIOLATIONS = 25;

const WITHHELD_NOTICE =
  'The generated response did not meet Radareum response policy and was withheld. No analysis is available for this request.';

const READ_ONLY_NOTICE = 'Radareum is read-only. It never asks for keys and cannot move funds.';
const IDENTITY_NOTICE = "I'm Radareum — I analyze your wallet data.";
const UNCLASSIFIED_NOTICE = 'This address is not classified in the available data.';
const UNCLASSIFIED_ACTIVITY_NOTICE = 'This activity has not been classified in the available data.';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface SentenceRule {
  rule: string;
  category: GuardrailCategory;
  pattern: RegExp;
  /** When present the sentence is replaced; otherwise it is removed. */
  replacement?: string;
}

/** Whole-sentence rules: the sentence is dropped or swapped for safe text. */
const SENTENCE_RULES: readonly SentenceRule[] = [
  // Guardrail 1 — Financial advice
  { rule: 'advice.you_should', category: 'financial_advice', pattern: /\byou (?:should|ought to|must|need to|have to)\b/i },
  { rule: 'advice.recommend', category: 'financial_advice', pattern: /\b(?:i|we)(?:'d)? (?:recommend|suggest|advise)\b/i },
  { rule: 'advice.my_recommendation', category: 'financial_advice', pattern: /\bmy (?:advice|recommendation)\b/i },
  { rule: 'advice.consider_action', category: 'financial_advice', pattern: /\bconsider (?:selling|buying|reducing|increasing|rebalancing|diversifying|allocating|exiting|entering|trimming|adding)\b/i },
  { rule: 'advice.would_be_wise', category: 'financial_advice', pattern: /\bit would be (?:wise|smart|advisable|prudent|better)\b/i },
  { rule: 'advice.entry_exit_point', category: 'financial_advice', pattern: /\b(?:good|great|ideal|poor|bad) (?:entry|exit) point\b/i },
  { rule: 'advice.time_to_trade', category: 'financial_advice', pattern: /\b(?:time|moment) to (?:buy|sell|exit|enter)\b/i },
  { rule: 'advice.imperative_trade', category: 'financial_advice', pattern: /\b(?:buy|sell|hold|rebalance|diversify|reduce|increase) (?:now|immediately|today|your exposure)\b/i },
  { rule: 'advice.act_now', category: 'financial_advice', pattern: /\bact now\b/i },
  { rule: 'advice.better_off', category: 'financial_advice', pattern: /\byou(?:'d| would) be better off\b/i },

  // Guardrail 2 — Prediction
  { rule: 'prediction.directional', category: 'prediction', pattern: /\b(?:will|is going to|are going to|is about to|are about to|expected to|likely to) (?:probably |likely )?(?:rise|fall|increase|decrease|drop|recover|rebound|continue|climb|decline|surge|crash|pump|dump|go (?:up|down))\b/i },
  { rule: 'prediction.trend_continues', category: 'prediction', pattern: /\bthis (?:trend|pattern|decline|rally) will\b/i },
  { rule: 'prediction.expect_more', category: 'prediction', pattern: /\bexpect (?:further|continued|more|another)\b/i },
  { rule: 'prediction.first_person', category: 'prediction', pattern: /\b(?:i|we) (?:predict|forecast|expect|anticipate)\b/i },
  { rule: 'prediction.price_target', category: 'prediction', pattern: /\bprice (?:target|prediction|forecast)\b/i },
  { rule: 'prediction.should_move', category: 'prediction', pattern: /\bshould (?:rise|fall|recover|rebound|increase|decrease|continue)\b/i },

  // Guardrail 3 — Identity
  { rule: 'identity.language_model', category: 'identity', pattern: /\bas an? (?:ai|artificial intelligence|large )?language model\b/i, replacement: IDENTITY_NOTICE },
  { rule: 'identity.trained_by', category: 'identity', pattern: /\bi was trained (?:by|on)\b/i, replacement: IDENTITY_NOTICE },
  { rule: 'identity.model_name', category: 'identity', pattern: /\bi(?:'m| am) (?:chatgpt|claude|gemini|gpt-|llama|mistral)/i, replacement: IDENTITY_NOTICE },
  { rule: 'identity.system_prompt', category: 'identity', pattern: /\b(?:my|the) (?:system )?(?:prompt|instructions)\b/i, replacement: IDENTITY_NOTICE },
  { rule: 'identity.address_attribution', category: 'identity', pattern: /\b(?:address|wallet) (?:belongs to|is owned by|is operated by|is controlled by)\b/i, replacement: UNCLASSIFIED_NOTICE },

  // Guardrail 4 — Security
  { rule: 'security.request_key', category: 'security', pattern: /\b(?:share|send|provide|enter|paste|give me|reveal|type|upload) (?:your |the |me your )?(?:seed phrase|private key|mnemonic|recovery phrase|password)\b/i, replacement: READ_ONLY_NOTICE },
  { rule: 'security.key_mention', category: 'security', pattern: /\byour (?:seed phrase|private key|mnemonic|recovery phrase)\b/i, replacement: READ_ONLY_NOTICE },
  { rule: 'security.compromise_claim', category: 'security', pattern: /\byour (?:wallet|account|funds|portfolio) (?:is|are|was|were|has been|have been) (?:hacked|compromised|drained|stolen|exploited|attacked)\b/i, replacement: UNCLASSIFIED_ACTIVITY_NOTICE },
  { rule: 'security.transaction_creation', category: 'security', pattern: /\bi (?:can|will|could) (?:sign|send|execute|submit|broadcast|create) (?:a |this |the )?transaction\b/i, replacement: 'Radareum is read-only. It can explain a transaction but cannot create one.' },

  // Tone (Part 4 §4.19, Part 7 §7.3 risk phrasing)
  { rule: 'tone.judgement', category: 'tone', pattern: /\b(?:this|that|it) is (?:dangerous|alarming|terrible|awful|very risky|really bad)\b/i },
];

interface InlineRule {
  rule: string;
  category: GuardrailCategory;
  pattern: RegExp;
  replacement: string;
  action: GuardrailAction;
}

/** Inline rules: surgical replacements that leave the surrounding facts intact. */
const INLINE_RULES: readonly InlineRule[] = [
  {
    rule: 'security.full_address',
    category: 'security',
    pattern: /\b0x[a-fA-F0-9]{40}\b/g,
    replacement: '',
    action: 'rephrased',
  },
  {
    rule: 'tone.unfortunately',
    category: 'tone',
    pattern: /\bunfortunately,?\s*/gi,
    replacement: '',
    action: 'removed',
  },
  {
    rule: 'tone.great_news',
    category: 'tone',
    pattern: /\bgreat news[,:]?\s*/gi,
    replacement: '',
    action: 'removed',
  },
];

/** Flag-only terms: recorded for review, never rewritten. */
const FLAG_ONLY_RULES: ReadonlyArray<{ rule: string; category: GuardrailCategory; pattern: RegExp }> = [
  { rule: 'tone.risk_language', category: 'tone', pattern: /\b(?:risky|dangerous|catastrophic)\b/i },
  { rule: 'advice.soft_suggestion', category: 'financial_advice', pattern: /\b(?:you may want to|you might want to|worth considering)\b/i },
];

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

/**
 * Splits a single line into sentences. A boundary requires terminal
 * punctuation followed by whitespace and a capital-letter start, so decimals
 * such as `4.2%` and figures such as `$12,480.55` stay intact.
 */
function splitSentences(line: string): string[] {
  const sentences: string[] = [];
  let buffer = '';

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    buffer += char;

    if (char !== '.' && char !== '!' && char !== '?') continue;

    let next = i + 1;
    let sawSpace = false;
    while (next < line.length && (line[next] === ' ' || line[next] === '\t')) {
      buffer += line[next];
      next += 1;
      sawSpace = true;
    }

    const isEnd = next >= line.length;
    const startsNewSentence = !isEnd && sawSpace && /["'(\[A-Z\u0600-\u06FF]/.test(line[next]);

    if (isEnd || startsNewSentence) {
      sentences.push(buffer);
      buffer = '';
    }

    i = next - 1;
  }

  if (buffer.length > 0) sentences.push(buffer);
  return sentences;
}

function maskFullAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function truncate(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_EXCERPT_CHARS ? `${trimmed.slice(0, MAX_EXCERPT_CHARS - 1)}…` : trimmed;
}

function capitalizeFirstLetter(text: string): string {
  const index = text.search(/[a-z]/);
  if (index === -1) return text;
  // Only fix a lowercase start, never mid-sentence casing.
  if (text.slice(0, index).trim().length > 0) return text;
  return text.slice(0, index) + text[index].toUpperCase() + text.slice(index + 1);
}

/** A line that carries no words left after sanitization is dropped entirely. */
function isStructuralRemnant(line: string): boolean {
  return /^[\s\-*•>#|:.]*$/.test(line);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects forbidden patterns without modifying the text. Useful for
 * evaluation runs and observability (Part 7 §7.11 "guardrail hits").
 */
export function detectGuardrailViolations(text: string): GuardrailViolation[] {
  return sanitizeAgentOutput(text).violations;
}

/**
 * Neutralizes forbidden patterns in an agent answer.
 * Returns the safe text plus every violation that was found.
 */
export function sanitizeAgentOutput(text: string): SanitizedOutput {
  const violations: GuardrailViolation[] = [];

  const record = (violation: GuardrailViolation): void => {
    if (violations.length >= MAX_VIOLATIONS) return;
    violations.push(violation);
  };

  if (typeof text !== 'string' || text.trim().length === 0) {
    return { text: '', violations };
  }

  const outputLines: string[] = [];

  for (const line of text.split('\n')) {
    if (line.trim().length === 0) {
      outputLines.push('');
      continue;
    }

    const rebuilt: string[] = [];

    for (const sentence of splitSentences(line)) {
      // Every matching rule is recorded for observability; the first one
      // decides what replaces the sentence.
      const matchedRules = SENTENCE_RULES.filter((rule) => rule.pattern.test(sentence));

      if (matchedRules.length > 0) {
        for (const matched of matchedRules) {
          record({
            category: matched.category,
            action: matched.replacement ? 'rephrased' : 'removed',
            rule: matched.rule,
            excerpt: truncate(sentence),
          });
        }
        const replacement = matchedRules[0].replacement;
        if (replacement) rebuilt.push(`${replacement} `);
        continue;
      }

      let current = sentence;

      for (const inlineRule of INLINE_RULES) {
        const pattern = new RegExp(inlineRule.pattern.source, inlineRule.pattern.flags);
        if (!pattern.test(current)) continue;

        pattern.lastIndex = 0;
        current = current.replace(pattern, (match) =>
          inlineRule.rule === 'security.full_address' ? maskFullAddress(match) : inlineRule.replacement
        );

        record({
          category: inlineRule.category,
          action: inlineRule.action,
          rule: inlineRule.rule,
          excerpt: truncate(sentence),
        });
        current = capitalizeFirstLetter(current);
      }

      for (const flagRule of FLAG_ONLY_RULES) {
        if (flagRule.pattern.test(current)) {
          record({
            category: flagRule.category,
            action: 'flagged',
            rule: flagRule.rule,
            excerpt: truncate(current),
          });
        }
      }

      if (current.includes('!')) {
        record({ category: 'tone', action: 'rephrased', rule: 'tone.exclamation', excerpt: truncate(current) });
        current = current.replace(/!+/g, '.');
      }

      rebuilt.push(current);
    }

    const rebuiltLine = rebuilt.join('').replace(/[ \t]+$/, '');

    // Keep the line only if something meaningful survived.
    if (rebuiltLine.length > 0 && !isStructuralRemnant(rebuiltLine)) {
      outputLines.push(rebuiltLine);
    }
  }

  const sanitized = outputLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (sanitized.length === 0) {
    return { text: WITHHELD_NOTICE, violations };
  }

  return { text: sanitized, violations };
}
