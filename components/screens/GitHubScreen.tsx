'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Loader2, GitBranch, Star, GitFork } from 'lucide-react';
import { ScreenHeader, EmptyState } from '@/components/ui';

interface GitHubData {
  login: string;
  name: string;
  avatarUrl: string;
  publicRepos: number;
  followers: number;
  contributions: Record<string, number>;
  repos: { id: number; name: string; description: string; language: string; stars: number; forks: number; pushedAt: string; url: string }[];
  prs: { id: number; title: string; repo: string; state: string; draft: boolean; createdAt: string; url: string }[];
}

interface APIResponse {
  error?: string;
  message?: string;
}

function heatColor(n: number): string {
  if (n === 0) return 'var(--border-soft)';
  if (n <= 2)  return 'color-mix(in oklch, var(--success) 30%, transparent)';
  if (n <= 5)  return 'color-mix(in oklch, var(--success) 55%, transparent)';
  if (n <= 10) return 'color-mix(in oklch, var(--success) 78%, transparent)';
  return 'var(--success)';
}

function buildWeeks(): string[][] {
  const weeks: string[][] = [];
  const today = new Date();
  // Start 51 weeks ago on Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - 51 * 7);
  for (let w = 0; w < 52; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date <= today) week.push(date.toISOString().slice(0, 10));
      else week.push('');
    }
    weeks.push(week);
  }
  return weeks;
}

export function GitHubScreen() {
  const [data, setData] = useState<GitHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/github')
      .then((r) => r.json())
      .then((d: GitHubData & APIResponse) => {
        if (d.error) {
          setError({ type: d.error, message: d.message ?? '' });
        } else {
          setData(d);
        }
      })
      .catch((e) => setError({ type: 'fetch_error', message: String(e) }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    const isAuth = error.type === 'not_connected';
    return (
      <div className="screen">
        <ScreenHeader title="GitHub" subtitle="Contribution activity" />
        <EmptyState
          icon={isAuth ? '🔐' : '⚠️'}
          title={isAuth ? 'Connect your GitHub account' : 'Could not load GitHub data'}
          subtitle={isAuth
            ? 'Connect your GitHub account to see your real contribution graph, repositories, and pull requests. Your current session is kept — only GitHub data is added.'
            : error.message}
          action={isAuth ? (
            <a href="/api/connect/github" className="btn btn-primary btn-sm">
              Connect GitHub
            </a>
          ) : undefined}
        />
      </div>
    );
  }

  if (!data) return null;

  const weeks = buildWeeks();
  const totalContribs = Object.values(data.contributions).reduce((a, b) => a + b, 0);

  return (
    <div className="screen">
      <ScreenHeader
        title="GitHub"
        kicker={`@${data.login}`}
        subtitle={`${totalContribs} contributions · ${data.publicRepos} repos · ${data.followers} followers`}
      />

      {/* Heatmap */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Contribution graph · last 12 months</div>
        <div style={{ display: 'flex', gap: 3, overflowX: 'auto' }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day ? `${day}: ${data.contributions[day] ?? 0} contributions` : ''}
                  style={{
                    width: 12, height: 12, borderRadius: 2,
                    background: day ? heatColor(data.contributions[day] ?? 0) : 'transparent',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 10.5, color: 'var(--text-faint)' }}>
          <span>Less</span>
          {[0, 2, 5, 8, 12].map((n) => (
            <div key={n} style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(n) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Repos */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
            Pinned repos
          </div>
          {data.repos.slice(0, 4).map((r) => (
            <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                  {r.name}
                </a>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(r.pushedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              {r.description && (
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 6, lineHeight: 1.4 }}>{r.description}</div>
              )}
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-faint)' }}>
                {r.language && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />{r.language}</span>}
                {r.stars > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Star size={10} />{r.stars}</span>}
                {r.forks > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><GitFork size={10} />{r.forks}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Pull requests */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
            Open pull requests
          </div>
          {data.prs.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>No open pull requests</div>
          ) : (
            data.prs.map((pr) => (
              <div key={`${pr.repo}-${pr.id}`} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-soft)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <GitBranch size={13} style={{ color: pr.draft ? 'var(--text-faint)' : 'var(--success)', marginTop: 1, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={pr.url as string} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--text)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pr.title as string}
                  </a>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span>{pr.repo as string}</span>
                    {pr.draft && <span style={{ color: 'var(--warn)' }}>Draft</span>}
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                      {new Date(pr.createdAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
