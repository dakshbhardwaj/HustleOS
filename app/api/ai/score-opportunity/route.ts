/**
 * POST /api/ai/score-opportunity
 * Scores an opportunity 0-100 based on the user's skill profile, active jobs, and recent notes.
 * Returns { score, reasoning } — call this after creating/editing an opportunity.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getJobs } from '@/lib/actions/jobs';
import { getNotes } from '@/lib/actions/notes';
import { getAnthropicKey, missingKeyResponse, rateLimit, parseBody } from '@/lib/api-guard';

export const maxDuration = 20;

// Daksh's base skill profile (kept in sync with resume/profile)
const BASE_SKILLS = [
  'TypeScript', 'React', 'Next.js', 'Node.js', 'Postgres', 'Prisma',
  'System Design', 'REST APIs', 'GraphQL', 'Tailwind', 'Git',
  'Distributed Systems', 'OAuth', 'WebSockets', 'CRDTs', 'Rust',
];

const BodySchema = z.object({
  title:  z.string().min(1).max(500),
  source: z.string().min(1).max(200),
  desc:   z.string().max(2000).optional(),
  tags:   z.array(z.string()).max(20).optional(),
  reward: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const key = getAnthropicKey();
  if (!key) return missingKeyResponse();

  const limited = rateLimit('score-opp', 20, 60_000);
  if (limited) return limited;

  const { data, error } = await parseBody(req, BodySchema);
  if (error) return error;

  const { title, desc, tags, reward, source } = data;

  let context = '';
  try {
    const [jobs, notes] = await Promise.all([
      getJobs().catch(() => []),
      getNotes().catch(() => []),
    ]);

    const activeJobs = jobs.filter((j) => j.stage !== 'Wishlist' && j.stage !== 'Rejected');
    const recentTags = notes.flatMap((n) => n.tags).slice(0, 20);

    context = [
      `User's skill profile: ${BASE_SKILLS.join(', ')}`,
      activeJobs.length > 0 ? `Active job targets: ${activeJobs.map((j) => `${j.company} (${j.role})`).join(', ')}` : '',
      recentTags.length > 0 ? `Recent study topics (from notes): ${[...new Set(recentTags)].join(', ')}` : '',
    ].filter(Boolean).join('\n');
  } catch { /* proceed without */ }

  const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey: key });

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    schema: z.object({
      score: z.number().min(0).max(100).describe('Match score 0-100'),
      reasoning: z.string().max(200).describe('1-2 sentence explanation of the score'),
      effort: z.enum(['low', 'medium', 'high']).describe('Estimated effort level'),
      timeToComplete: z.string().describe('Rough estimate e.g. "2-3 hours", "1 weekend"'),
      skillsMatched: z.array(z.string()).describe('Matching skills from user profile'),
      skillsGap: z.array(z.string()).describe('Skills needed but not in profile'),
    }),
    prompt: `You are scoring a freelance/bounty opportunity for a senior TypeScript/React/Node.js engineer who is job hunting.

Opportunity:
- Title: ${title}
- Source: ${source}
- Description: ${desc ?? 'Not provided'}
- Tags: ${tags?.join(', ') ?? 'None'}
- Reward: ${reward ?? 'Not specified'}

User's context:
${context}

Score this opportunity 0-100 where:
- 90-100: Perfect fit, high reward, can do immediately, directly relevant to interviews
- 70-89: Good match, reasonable effort, builds portfolio
- 50-69: Moderate fit, may need some learning, decent reward
- 30-49: Weak fit or low reward, many better options
- 0-29: Poor match, too far from skill set, or not worth the time

Consider: skill match, reward-to-effort ratio, portfolio value, and relevance to job search.`,
  });

  return Response.json(object);
}
