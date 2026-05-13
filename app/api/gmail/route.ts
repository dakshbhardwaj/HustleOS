/**
 * /api/gmail — Fetch, classify, and return Gmail messages.
 *
 * GET  /api/gmail         — fetch + classify recent emails
 * POST /api/gmail/actions — create tasks from action-required emails
 *
 * Requires: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env.local
 * and user signed in with Google OAuth.
 */

import { auth } from '@/lib/auth';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';

export const maxDuration = 30;

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
  internalDate: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  error?: { message: string; code: number };
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBase64(str: string): string {
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function getBody(msg: GmailMessage): string {
  // Try parts first (multipart/alternative)
  if (msg.payload.parts) {
    const textPart = msg.payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) return decodeBase64(textPart.body.data).slice(0, 800);
    const htmlPart = msg.payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) return decodeBase64(htmlPart.body.data).replace(/<[^>]+>/g, ' ').slice(0, 800);
  }
  if (msg.payload.body?.data) return decodeBase64(msg.payload.body.data).slice(0, 800);
  return msg.snippet ?? '';
}

export async function GET() {
  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'not_configured', message: 'Google OAuth credentials not set. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.' }, { status: 200 });
  }

  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('gmail', 5, 60_000);
  if (limited) return limited;

  const session = await auth();
  const googleToken = (session as unknown as Record<string, string | null>)?.googleAccessToken;

  if (!googleToken) {
    return Response.json({ error: 'not_connected', message: 'Gmail not connected. Sign in with Google to enable email intelligence.' }, { status: 200 });
  }

  // Fetch messages from the last 4 weeks so older actionable emails still inform tasks.
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&labelIds=INBOX&q=newer_than%3A28d',
    { headers: { Authorization: `Bearer ${googleToken}` } }
  );

  const listData = await listRes.json() as GmailListResponse;

  if (listData.error) {
    return Response.json({ error: 'gmail_error', message: listData.error.message }, { status: 200 });
  }

  if (!listData.messages?.length) {
    return Response.json({ emails: [], connected: true });
  }

  // Fetch full message details. Keep classification bounded for latency/cost.
  const messageIds = listData.messages.slice(0, 50).map((m) => m.id);
  const messages = await Promise.all(
    messageIds.map((id) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${googleToken}` },
      }).then((r) => r.json() as Promise<GmailMessage>)
    )
  );

  // Extract email data
  const rawEmails = messages.map((msg) => ({
    id: msg.id,
    from: getHeader(msg, 'from'),
    subject: getHeader(msg, 'subject'),
    body: getBody(msg),
    date: new Date(parseInt(msg.internalDate)).toISOString(),
    snippet: msg.snippet ?? '',
  }));

  // AI classification
  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const { object: classified } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      emails: z.array(z.object({
        id: z.string(),
        category: z.enum(['Interview', 'Offer', 'Rejection', 'Action Required', 'Opportunity', 'Networking', 'Informational', 'Spam']),
        tone: z.enum(['accent', 'success', 'danger', 'warn', 'neutral']),
        action: z.string().optional().describe('Suggested action if any, e.g. "Reply by Friday" or "Block time for interview"'),
        priority: z.enum(['high', 'normal', 'low']),
        summary: z.string().describe('1-sentence summary of what this email is about'),
      })),
    }),
    prompt: `You are an AI chief of staff for a senior software engineer who is actively job hunting.

Classify each of these emails. Be accurate — recruiters, interview confirmations, take-home assignments, rejection letters, and bounty/opportunity announcements are common.

Emails:
${rawEmails.map((e, i) => `
[${i + 1}] ID: ${e.id}
From: ${e.from}
Subject: ${e.subject}
Body snippet: ${e.body.slice(0, 400)}
`).join('\n---\n')}

Categories:
- Interview: Interview invites, scheduling, onsite confirmations
- Offer: Job offers, offer letters, salary discussions
- Rejection: Rejections or "we went with another candidate"
- Action Required: Take-home assignments, forms to complete, replies needed
- Opportunity: Bounties, freelance gigs, job postings, contracting work
- Networking: Coffee chats, introductions, recruiter outreach (early stage)
- Informational: Newsletters, receipts, updates that don't need action
- Spam: Promotional or irrelevant

Tone:
- accent (blue) = Interview, Networking
- success (green) = Offer, Opportunity
- danger (red) = Rejection
- warn (orange) = Action Required
- neutral = Informational, Spam`,
  });

  // Merge classification with raw data
  const emails = rawEmails.map((raw) => {
    const cls = classified.emails.find((c) => c.id === raw.id);
    return {
      id: raw.id,
      from: raw.from.replace(/<[^>]+>/, '').trim(),
      subject: raw.subject,
      snippet: raw.snippet,
      body: raw.body.slice(0, 200),
      date: raw.date,
      cat: cls?.category ?? 'Informational',
      tone: cls?.tone ?? 'neutral',
      action: cls?.action,
      priority: cls?.priority ?? 'normal',
      summary: cls?.summary ?? raw.snippet,
    };
  });

  return Response.json({ emails, connected: true });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    emailId: string;
    action: 'create_task' | 'dismiss';
    subject?: string;
    description?: string;
    priority?: 'P0' | 'P1' | 'P2';
    dueDays?: number | null;
  };

  if (body.action !== 'create_task') {
    return Response.json({ success: true });
  }

  // Use ALLOWED_EMAIL pattern (same as other server actions) so this works without Google sign-in
  const userEmail = process.env.ALLOWED_EMAIL;
  if (!userEmail) return Response.json({ error: 'ALLOWED_EMAIL not configured' }, { status: 500 });

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

  const title = body.subject
    ? body.subject.replace(/^(re|fwd?):\s*/i, '').trim().slice(0, 120)
    : `Follow up on email ${body.emailId}`;

  const dueAt = body.dueDays != null
    ? new Date(Date.now() + body.dueDays * 86_400_000)
    : undefined;

  await prisma.task.create({
    data: {
      title,
      description: body.description ?? null,
      priority: body.priority ?? 'P1',
      userId: user.id,
      aiSuggested: true,
      dueAt,
    },
  });

  return Response.json({ success: true });
}
