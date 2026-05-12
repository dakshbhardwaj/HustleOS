import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getGitHubToken(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;

  // 1. JWT token — present when user signed in directly with GitHub
  const jwtToken = (session as unknown as Record<string, unknown>)?.githubToken as string | null;
  if (jwtToken) return jwtToken;

  // 2. Database — present when user connected GitHub via /api/connect/github
  if (session.user?.email) {
    const row = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        accounts: {
          where:  { provider: 'github' },
          select: { access_token: true },
          take:   1,
        },
      },
    });
    const token = row?.accounts[0]?.access_token;
    if (token) return token;
  }

  return null;
}

async function ghFetch(path: string, token: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

export async function GET() {
  try {
    const token = await getGitHubToken();
    if (!token) {
      return Response.json({ error: 'not_connected', message: 'Sign in with GitHub to see your activity.' }, { status: 401 });
    }

    const [user, repos] = await Promise.all([
      ghFetch('/user', token),
      ghFetch('/user/repos?sort=pushed&per_page=6&type=owner', token),
    ]);
    const events = await ghFetch(`/users/${user.login}/events?per_page=100`, token);

    // Build contribution heatmap from push events (last 52 weeks)
    const now = Date.now();
    const oneYear = 52 * 7 * 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.type === 'PushEvent') {
        const d = new Date(ev.created_at).toISOString().slice(0, 10);
        counts[d] = (counts[d] ?? 0) + (ev.payload?.commits?.length ?? 1);
      }
    }

    // Pull requests from repos
    const prs = await Promise.all(
      repos.slice(0, 3).map((r: { full_name: string }) =>
        ghFetch(`/repos/${r.full_name}/pulls?state=open&per_page=3`, token).catch(() => [])
      )
    );
    const flatPrs = prs.flat().slice(0, 8).map((pr: Record<string, unknown>) => ({
      id: pr.number,
      title: pr.title,
      repo: (pr.head as Record<string, unknown>)?.repo ? ((pr.head as Record<string, unknown>).repo as Record<string, unknown>)?.name : (pr.url as string)?.split('/')[5],
      state: pr.state,
      draft: pr.draft,
      createdAt: pr.created_at,
      url: pr.html_url,
    }));

    return Response.json({
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      contributions: counts,
      repos: repos.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        pushedAt: r.pushed_at,
        url: r.html_url,
      })),
      prs: flatPrs,
    });
  } catch (err) {
    return Response.json({ error: 'api_error', message: String(err) }, { status: 500 });
  }
}
