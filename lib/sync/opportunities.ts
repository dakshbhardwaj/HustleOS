import { prisma } from '@/lib/db';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const BASE_SKILLS = [
  'TypeScript', 'React', 'Next.js', 'Node.js', 'Postgres', 'Prisma',
  'System Design', 'REST APIs', 'GraphQL', 'Tailwind', 'Git',
  'Distributed Systems', 'OAuth', 'WebSockets', 'CRDTs', 'Rust',
];

interface RawOpportunity {
  source: string;
  title: string;
  desc?: string;
  tags: string[];
  reward?: string;
  url: string;
}

function extractReward(text: string): string | undefined {
  const match = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s*(?:USD|USDC|ETH|USDT))?/i);
  return match?.[0];
}

async function fetchGitHubBounties(): Promise<RawOpportunity[]> {
  const queries = [
    'label%3Abounty+is%3Aopen+is%3Aissue',
    'label%3A%22good+first+issue%22+label%3A%22bounty%22+is%3Aopen',
    'label%3A%22%24bounty%22+is%3Aopen+is%3Aissue',
  ];

  const results: RawOpportunity[] = [];
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.github.com/search/issues?q=${q}&sort=created&order=desc&per_page=20`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'HustleOS/1.0',
          },
          next: { revalidate: 0 },
        }
      );
      if (!res.ok) continue;
      const data = await res.json() as { items?: Record<string, unknown>[] };
      for (const issue of data.items ?? []) {
        const body = (issue.body as string | null) ?? '';
        const labels = ((issue.labels as Array<{ name: string }>) ?? [])
          .map((l) => l.name)
          .filter((l) => !['bounty', '$bounty'].includes(l.toLowerCase()));
        results.push({
          source: 'GitHub Bounty',
          title: issue.title as string,
          desc: body.slice(0, 600) || undefined,
          tags: labels.slice(0, 8),
          reward: extractReward(body),
          url: issue.html_url as string,
        });
      }
    } catch {
      // continue to next query
    }
  }
  return results;
}

async function fetchAlgoraBounties(): Promise<RawOpportunity[]> {
  const endpoints = [
    'https://api.algora.io/v0/tasks?status=posted&limit=30',
    'https://console.algora.io/api/bounties?status=open&limit=30',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'HustleOS/1.0' },
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json() as unknown;
      const items: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>)?.bounties as Record<string, unknown>[])
          ?? ((data as Record<string, unknown>)?.items as Record<string, unknown>[])
          ?? ((data as Record<string, unknown>)?.tasks as Record<string, unknown>[])
          ?? [];

      return items
        .filter((b) => b.url || (b.issue as Record<string, unknown>)?.url)
        .map((b) => {
          const issue = b.issue as Record<string, unknown> | undefined;
          const rewardRaw = b.reward ?? b.amount ?? b.prize;
          const rewardStr = rewardRaw ? `$${rewardRaw}` : undefined;
          return {
            source: 'Algora',
            title: (b.title ?? issue?.title ?? 'Untitled') as string,
            desc: ((b.description ?? issue?.body) as string | undefined)?.slice(0, 600),
            tags: ((b.tags ?? b.labels ?? []) as string[]).slice(0, 8),
            reward: rewardStr,
            url: (b.url ?? issue?.url ?? b.html_url) as string,
          };
        });
    } catch {
      // try next endpoint
    }
  }
  return [];
}

async function scoreOpportunity(opp: RawOpportunity): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) return 50;

  try {
    const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1', apiKey });
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: z.object({
        score: z.number().int().min(0).max(100),
      }),
      prompt: `Score this bounty/opportunity 0-100 for a senior TypeScript/React/Node.js engineer.

Skills: ${BASE_SKILLS.join(', ')}

Opportunity:
- Title: ${opp.title}
- Source: ${opp.source}
- Reward: ${opp.reward ?? 'Not specified'}
- Tags: ${opp.tags.join(', ') || 'None'}
- Description: ${opp.desc?.slice(0, 300) ?? 'Not provided'}

Scoring: 90-100 = perfect fit + high reward; 70-89 = good match; 50-69 = moderate fit; 0-49 = poor fit or low reward.
Consider skill match, reward-to-effort ratio, and portfolio value.`,
    });
    return object.score;
  } catch {
    return 50;
  }
}

export interface SyncResult {
  added: number;
  skipped: number;
  errors: number;
  total: number;
  sources: { github: number; algora: number };
}

export async function syncOpportunities(userId: string): Promise<SyncResult> {
  // Get existing URLs to deduplicate
  const existing = await prisma.opportunity.findMany({
    where: { userId, url: { not: null } },
    select: { url: true },
  });
  const existingUrls = new Set(existing.map((o) => o.url));

  // Fetch from all sources in parallel
  const [githubResult, algoraResult] = await Promise.allSettled([
    fetchGitHubBounties(),
    fetchAlgoraBounties(),
  ]);

  const githubOpps = githubResult.status === 'fulfilled' ? githubResult.value : [];
  const algoraOpps = algoraResult.status === 'fulfilled' ? algoraResult.value : [];
  const allOpps = [...githubOpps, ...algoraOpps];

  // Deduplicate within batch and against DB
  const seen = new Set<string>();
  const newOpps = allOpps.filter((o) => {
    if (!o.url || existingUrls.has(o.url) || seen.has(o.url)) return false;
    seen.add(o.url);
    return true;
  });

  let added = 0;
  let errors = 0;

  // Process at most 15 per run to control API costs
  for (const opp of newOpps.slice(0, 15)) {
    try {
      const score = await scoreOpportunity(opp);
      await prisma.opportunity.create({
        data: {
          userId,
          source: opp.source,
          title: opp.title,
          desc: opp.desc,
          tags: opp.tags,
          reward: opp.reward,
          score,
          url: opp.url,
          state: 'New',
        },
      });
      added++;
    } catch {
      errors++;
    }
  }

  return {
    added,
    skipped: allOpps.length - newOpps.length,
    errors,
    total: allOpps.length,
    sources: { github: githubOpps.length, algora: algoraOpps.length },
  };
}
