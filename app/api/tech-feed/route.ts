/**
 * /api/tech-feed — Top tech stories from Hacker News (public API, no auth).
 * Returns the top 8 stories with title, url, score, and comment count.
 * Cached for 30 minutes via Cache-Control.
 */

export const maxDuration = 15;

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  descendants?: number;
  by: string;
  time: number;
}

// Keywords that signal relevance for a software engineer / job seeker
const RELEVANT_KEYWORDS = [
  'react', 'typescript', 'javascript', 'node', 'next.js', 'prisma',
  'ai', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'agent',
  'startup', 'founder', 'remote', 'job', 'hiring',
  'engineering', 'developer', 'software', 'api', 'backend', 'frontend',
  'postgres', 'database', 'performance', 'architecture', 'system design',
  'productivity', 'tool', 'open source', 'github',
];

function relevanceScore(title: string): number {
  const lower = title.toLowerCase();
  return RELEVANT_KEYWORDS.filter((kw) => lower.includes(kw)).length;
}

function matchedKeywords(title: string): string[] {
  const lower = title.toLowerCase();
  return RELEVANT_KEYWORDS.filter((kw) => lower.includes(kw)).slice(0, 5);
}

function learningAngle(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('database') || lower.includes('postgres')) return 'Read for data modeling and persistence tradeoffs.';
  if (lower.includes('performance')) return 'Read for profiling and optimization instincts.';
  if (lower.includes('architecture') || lower.includes('system design')) return 'Read for system design vocabulary.';
  if (lower.includes('ai') || lower.includes('llm') || lower.includes('agent')) return 'Read for AI engineering patterns.';
  if (lower.includes('react') || lower.includes('frontend') || lower.includes('typescript')) return 'Read for frontend engineering taste.';
  if (lower.includes('hiring') || lower.includes('job')) return 'Read for market and career signal.';
  return 'Read if it sharpens your engineering judgment.';
}

export async function GET() {
  try {
    // Fetch top 60 story IDs from HN
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      next: { revalidate: 1800 }, // Next.js fetch cache: 30 min
    });
    const ids = await idsRes.json() as number[];

    // Fetch first 30 items in parallel, then filter + sort by relevance
    const items = await Promise.all(
      ids.slice(0, 30).map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          next: { revalidate: 1800 },
        }).then((r) => r.json() as Promise<HNItem>)
      )
    );

    const stories = items
      .filter((item) => item?.title && item.score > 30)
      .map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
        score: item.score,
        comments: item.descendants ?? 0,
        by: item.by,
        relevance: relevanceScore(item.title),
        tags: matchedKeywords(item.title),
        angle: learningAngle(item.title),
        hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
      }))
      // Sort: relevant stories first, then by HN score
      .sort((a, b) => b.relevance - a.relevance || b.score - a.score)
      .slice(0, 8);

    return Response.json({ stories }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    });
  } catch (err) {
    return Response.json({ error: String(err), stories: [] }, { status: 200 });
  }
}
