// Prompt-injection guardrails — real ones, not decorative. 2.0's Groq
// proxy had a blocked-pattern regex on top of its RAG system prompt;
// this is the same class of defense, cheap and worth keeping regardless
// of which model sits behind it.

const BLOCKED_PATTERNS = [
  /ignore (all |the )?(previous|prior|above) instructions/i,
  /you are now/i,
  /system prompt/i,
  /reveal (your|the) (system )?prompt/i,
  /act as (if )?(a|an) (?!energy)/i,
  /disregard (all|your) (rules|guidelines|instructions)/i,
  /\bDAN\b/, // "Do Anything Now" jailbreak family
];

export function isSuspiciousPrompt(message: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(message));
}

// Simple in-memory per-user rate limit — good enough for a single Vercel
// instance/demo, not a distributed limiter. Documented limitation, not a
// silent gap: a real deployment needs a shared store (Upstash/Redis).
const requestLog = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  requestLog.set(userId, timestamps);
  return timestamps.length > MAX_REQUESTS_PER_WINDOW;
}
