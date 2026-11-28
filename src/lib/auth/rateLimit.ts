/**
 * Sliding window rate limiter for authentication endpoints.
 * Limits failed attempts per identifier (IP / email) to protect against
 * brute force and credential stuffing attacks.
 */

interface RateLimitRecord {
  attempts: number[];
}

const loginAttempts = new Map<string, RateLimitRecord>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // 5 attempts per window

export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Filter out attempts older than the window
  record.attempts = record.attempts.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (record.attempts.length >= MAX_ATTEMPTS) {
    const oldest = record.attempts[0];
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - record.attempts.length };
}

export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { attempts: [] };
  record.attempts.push(now);
  loginAttempts.set(identifier, record);
}

export function clearRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}
