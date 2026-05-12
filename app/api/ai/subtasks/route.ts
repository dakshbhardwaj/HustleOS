import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAnthropicKey, missingKeyResponse, rateLimit, parseBody } from '@/lib/api-guard';

export const maxDuration = 30;

const SubtaskSchema = z.object({
  subtasks: z.array(z.object({
    title:    z.string().describe('Concise, actionable subtask title'),
    estimate: z.string().describe('Time estimate e.g. "20m", "1h"'),
    priority: z.enum(['P0', 'P1', 'P2']),
  })).min(2).max(7),
});

const BodySchema = z.object({
  taskTitle:    z.string().min(1).max(500),
  taskSubtitle: z.string().max(500).optional(),
  project:      z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('subtasks', 20, 60_000);
  if (limited) return limited;

  const { data, error } = await parseBody(req, BodySchema);
  if (error) return error;

  const { taskTitle, taskSubtitle, project } = data;

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-5'),
      schema: SubtaskSchema,
      system: `You are HustleOS, an AI assistant for an ambitious senior software engineer.
Break down tasks into 3–6 concrete, actionable subtasks with time estimates.
Keep titles under 60 characters. Be specific and technical.`,
      prompt: `Break down this task into subtasks:
Task: ${taskTitle}
${taskSubtitle ? `Context: ${taskSubtitle}` : ''}
${project ? `Project: ${project}` : ''}`,
    });

    return Response.json(object);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
