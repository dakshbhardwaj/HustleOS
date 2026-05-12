/**
 * Shared guards for Route Handlers:
 * - requireAnthropicKey()  — returns 503 if ANTHROPIC_API_KEY is missing
 * - rateLimit(key, max, windowMs) — simple in-memory token-bucket per key
 * - parseBody<T>(req, schema) — parse + Zod-validate the JSON body
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

// ── Anthropic key check ───────────────────────────────────────────────────────

export function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && key.trim().length > 10) return key.trim();
  return null;
}

export function missingKeyResponse(): NextResponse {
  return NextResponse.json(
    { error: 'AI features require ANTHROPIC_API_KEY. Set it in .env.local and restart.' },
    { status: 503 },
  );
}

// ── In-memory rate limiter ────────────────────────────────────────────────────

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

/**
 * Returns a 429 response if the key has exceeded `max` calls in the window,
 * otherwise returns null (proceed).
 */
export function rateLimit(
  key: string,
  max = 20,
  windowMs = 60_000,
): NextResponse | null {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= max) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Max ${max} requests per minute.` },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) },
      },
    );
  }

  bucket.count += 1;
  return null;
}

// ── Body parser / validator ───────────────────────────────────────────────────

export async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      data: null,
      error: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null,
      error: NextResponse.json(
        { error: 'Validation failed.', issues: result.error.flatten().fieldErrors },
        { status: 422 },
      ),
    };
  }

  return { data: result.data, error: null };
}
