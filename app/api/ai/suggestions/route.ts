import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAnthropicKey, missingKeyResponse, rateLimit } from '@/lib/api-guard';

export const maxDuration = 30;

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('suggestions', 10, 60_000);
  if (limited) return limited;

  const { tasks, jobs, opportunities } = await req.json() as {
    tasks: {
      total: number;
      inProgress: Array<{ title: string; priority: string }>;
      blocked: Array<{ title: string }>;
      todayDue: Array<{ title: string; done: boolean }>;
    };
    jobs: Array<{ company: string; role: string; stage: string; updatedAt: string }>;
    opportunities: Array<{ title: string; score: number; state: string }>;
  };

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const staleThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const staleJobs = jobs.filter((j) => j.stage === 'Applied' && new Date(j.updatedAt).getTime() < staleThreshold);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      suggestions: z.array(z.object({
        id: z.string().describe('Short unique slug, e.g. "follow-stripe"'),
        category: z.enum(['task', 'job', 'opportunity', 'learning', 'system']),
        title: z.string().describe('Concise action, e.g. "Follow up with Stripe recruiter"'),
        why: z.string().describe('1-sentence reason this matters now'),
        cta: z.string().describe('Short button label, e.g. "View tasks" or "Go to jobs"'),
        urgency: z.enum(['high', 'normal', 'low']),
      })).min(3).max(5),
    }),
    prompt: `You are an AI chief of staff for a senior software engineer who is actively job hunting. Generate 3-5 specific, high-impact next-step suggestions based on their current state.

Current state:
- Open tasks: ${tasks.total}
- In Progress: ${tasks.inProgress.map((t) => `"${t.title}" (${t.priority})`).join(', ') || 'none'}
- Blocked: ${tasks.blocked.map((t) => `"${t.title}"`).join(', ') || 'none'}
- Due today: ${tasks.todayDue.filter((t) => !t.done).map((t) => `"${t.title}"`).join(', ') || 'none'}
- Jobs in pipeline: ${jobs.map((j) => `${j.company} (${j.stage})`).join(', ') || 'none'}
- Stale applications (7d+): ${staleJobs.map((j) => j.company).join(', ') || 'none'}
- Top opportunities: ${opportunities.slice(0, 3).map((o) => `"${o.title}" score:${o.score}`).join(', ') || 'none'}

Rules:
- Be specific and actionable — reference actual items by name
- Mix urgency levels (not everything is P0)
- Cover different domains: tasks, job hunt, opportunities
- If there are stale applications, prioritize follow-up suggestions
- If there are blocked tasks, address them
- Avoid generic advice like "check your email" or "review your tasks"`,
  });

  return Response.json(object);
}
