import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';

export const maxDuration = 20;

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('email-task', 20, 60_000);
  if (limited) return limited;

  const { subject, body, category } = await req.json() as {
    subject: string;
    body?: string;
    category?: string;
  };

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      title: z.string().describe('Concise action-oriented task title, max 80 chars'),
      description: z.string().describe('2-3 sentence task context extracted from the email'),
      priority: z.enum(['P0', 'P1', 'P2']).describe('P0=urgent/deadline today, P1=important, P2=nice-to-have'),
      dueDays: z.number().nullable().describe('Days from today until due, or null if no clear deadline'),
      actionItems: z.array(z.string()).describe('Up to 3 specific action items extracted from the email'),
    }),
    prompt: `Extract a task from this email for a software engineer who is job hunting.

Subject: ${subject}
Category: ${category ?? 'Unknown'}
${body ? `Body:\n${body.slice(0, 600)}` : ''}

Create a clear, actionable task. Priority rules:
- P0: interview today/tomorrow, offer deadline, urgent take-home
- P1: reply needed, application follow-up, assignment due this week
- P2: networking, informational reading, nice-to-have`,
  });

  return Response.json(object);
}
