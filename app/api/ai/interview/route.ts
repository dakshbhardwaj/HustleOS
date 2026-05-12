import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { z } from 'zod';
import { getAnthropicKey, missingKeyResponse, rateLimit, parseBody } from '@/lib/api-guard';

export const maxDuration = 30;

const BodySchema = z.object({
  question:    z.string().min(1).max(1000),
  userMessage: z.string().min(1).max(2000),
  history:     z.array(z.object({ role: z.enum(['user', 'ai']), text: z.string().max(2000) })).max(20),
});

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('interview', 30, 60_000);
  if (limited) return limited;

  const { data, error } = await parseBody(req, BodySchema);
  if (error) return error;

  const { question, history, userMessage } = data;

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const messages = [
    ...history.map((m) => ({
      role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
      content: m.text,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: `You are an expert technical interviewer conducting a mock interview session.
The question being practiced: "${question}"

Your role:
- Ask clarifying follow-up questions to deepen the candidate's thinking
- Point out gaps or missed considerations without giving away the full answer
- Offer targeted hints when the candidate is stuck
- Acknowledge strong points specifically
- Be concise — 2-4 sentences per response
- Stay in character as an interviewer, not a tutor`,
      messages,
    });

    return Response.json({ reply: text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
