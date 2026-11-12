import { logger } from "../lib/logger";

/**
 * Prompt injection guard for the Traveldesk AI assistant.
 *
 * A user message can try to make the assistant ignore its instructions,
 * reveal system data, or act on behalf of another tenant. This service scans
 * incoming messages for known injection patterns and returns a reason when one
 * is found — the caller then refuses the prompt instead of sending it to the
 * model.
 *
 * Patterns are intentionally conservative: a false positive just means the
 * user rephrases, which is safer than a false negative leaking data.
 */

export type PromptGuardResult = {
  /** true when the message looks safe to send to the model. */
  safe: boolean;
  /** Human-readable reason when unsafe. Empty when safe. */
  reason: string;
};

/** Patterns that indicate an attempt to override system instructions. */
const INJECTION_PATTERNS = [
  // "Ignore all previous instructions" style
  /(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|system|prompt)/i,
  // "You are now / act as" style
  /(you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(a\s+)?(different|another|new)/i,
  // "Reveal / print / show" system or data
  /(reveal|print|show|output|dump|display)\s+(the\s+)?(system|internal|backend|database|schema|config|secret|key|token|password)/i,
  // Cross-tenant / data exfiltration
  /(all\s+)?(customers|records|bookings|invoices)\s+(of|in|from)\s+(another|other|different|all|every)\s+(organization|tenant|company)/i,
  // "Repeat / say back" the system prompt
  /(repeat|say\s+back|recite|transcribe)\s+(the\s+)?(system|instruction|prompt|preamble)/i,
];

/** Maximum safe message length — absurdly long inputs are suspicious. */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Scans a user message for prompt injection. Returns { safe: true } when the
 * message looks like a normal travel agency query, or { safe: false, reason }
 * when it looks like an attempt to override the assistant.
 */
export function scanPrompt(message: string): PromptGuardResult {
  if (!message || message.trim().length === 0) {
    return { safe: true, reason: "" };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      safe: false,
      reason: "Message is too long. Please keep your query under 4,000 characters.",
    };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      logger.warn(
        { pattern: pattern.source, messageLength: message.length },
        "Prompt injection pattern detected; message refused",
      );
      return {
        safe: false,
        reason:
          "I can't process that request — it looks like an attempt to override my instructions. Please ask about trips, bookings, quotations or itineraries instead.",
      };
    }
  }

  return { safe: true, reason: "" };
}
