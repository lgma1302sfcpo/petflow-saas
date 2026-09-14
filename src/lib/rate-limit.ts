type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();

export function consumeAttempt(key: string, limit = 5, windowMs = 15 * 60_000) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (current.count >= limit) return { allowed: false, remaining: 0 };
  current.count += 1;
  return { allowed: true, remaining: limit - current.count };
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
