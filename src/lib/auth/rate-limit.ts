type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();

export function consumeOtpAttempt(key: string, now = Date.now(), limit = 5, windowMs = 15 * 60_000) {
  if (attempts.size > 1000) {
    attempts.forEach((attempt, attemptKey) => { if (attempt.resetAt <= now) attempts.delete(attemptKey); });
    if (attempts.size > 1000) attempts.delete(attempts.keys().next().value as string);
  }
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function resetOtpRateLimitsForTests() {
  attempts.clear();
}
