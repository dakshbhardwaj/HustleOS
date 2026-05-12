'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { ScreenHeader } from '@/components/ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { getAnalyticsData } from '@/lib/actions/tasks';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import { getDecks } from '@/lib/actions/decks';
import { useAppStore } from '@/lib/store';
import type { Job, Opportunity } from '@prisma/client';

type AnalyticsData = Awaited<ReturnType<typeof getAnalyticsData>>;
type DeckWithCards = Awaited<ReturnType<typeof getDecks>>[number];

const CHART_STYLE = {
  background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: 16,
};

function StatCard({ label, value, sub, color = 'var(--text)' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MomentumWidget({ score, breakdown }: { score: number; breakdown: { label: string; value: number; color: string; weight: string }[] }) {
  const r = 40, circ = 2 * Math.PI * r;
  const scoreColor = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--accent)' : score >= 30 ? 'var(--warn)' : 'var(--danger)';
  const label = score >= 75 ? 'Strong momentum 🚀' : score >= 50 ? 'Building momentum 📈' : score >= 30 ? 'Getting started 💪' : 'Needs attention ⚠️';

  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '18px 22px', display: 'flex', gap: 28, alignItems: 'center' }}>
      {/* Ring */}
      <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface)" strokeWidth="7" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={scoreColor} strokeWidth="7"
            strokeDasharray={`${(score / 100) * circ} ${circ}`}
            strokeLinecap="round" transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dasharray 800ms ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 24, fontWeight: 700, color: scoreColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>/ 100</span>
        </div>
      </div>

      {/* Label + breakdown */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Career Momentum — {label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {breakdown.map((b) => (
            <div key={b.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{b.label}</span>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: b.color }}>{b.value}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${b.value}%`, background: b.color, borderRadius: 2, transition: 'width 600ms' }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>{b.weight} weight</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STAGE_ORDER = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer'];
const STAGE_COLORS: Record<string, string> = {
  Wishlist: 'var(--text-faint)', Applied: 'var(--text-dim)',
  OA: 'var(--warn)', Interview: 'var(--accent)', Offer: 'var(--success)',
};

function computeMomentumScore(
  data: AnalyticsData | null,
  jobs: Job[],
  opportunities: Opportunity[],
): { score: number; breakdown: { label: string; value: number; color: string; weight: string }[] } {
  if (!data) return { score: 0, breakdown: [] };

  // Task score (25%): completion rate of open+done tasks
  const total = data.totalTasks;
  const taskPct = total > 0 ? Math.round((data.doneTasks / total) * 100) : 0;
  const taskScore = taskPct * 0.25;

  // Pipeline score (50%): advanced stages weighted
  const stageWeights: Record<string, number> = { Wishlist: 5, Applied: 20, OA: 50, Interview: 75, Offer: 100 };
  const jobsActive = jobs.filter((j) => j.stage !== 'Rejected');
  const pipelineRaw = jobsActive.length === 0 ? 0
    : Math.round(jobsActive.reduce((sum, j) => sum + (stageWeights[j.stage] ?? 0), 0) / jobsActive.length);
  const pipelineScore = pipelineRaw * 0.50;

  // Opportunity score (25%): tracked opportunities ratio
  const trackedOpps = opportunities.filter((o) => o.state !== 'Passed');
  const oppPct = Math.min(trackedOpps.length * 20, 100); // 5+ opps = 100%
  const oppScore = oppPct * 0.25;

  // Penalty: P0 open tasks
  const p0Penalty = Math.min(data.byPriority.P0 * 5, 15);

  const raw = Math.round(taskScore + pipelineScore + oppScore - p0Penalty);
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    breakdown: [
      { label: 'Task velocity', value: taskPct, color: taskPct >= 60 ? 'var(--success)' : 'var(--warn)', weight: '25%' },
      { label: 'Pipeline health', value: pipelineRaw, color: pipelineRaw >= 50 ? 'var(--accent)' : 'var(--text-faint)', weight: '50%' },
      { label: 'Opportunities', value: oppPct, color: oppPct >= 40 ? 'var(--success)' : 'var(--text-faint)', weight: '25%' },
    ],
  };
}

function formatMinutes(m: number): string {
  if (m === 0) return '0m';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
}

export function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [decks, setDecks] = useState<DeckWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const focusMinutesByDay = useAppStore((s) => s.focusMinutesByDay);

  const load = async () => {
    setLoading(true);
    try {
      const [analytics, jobList, oppList, deckList] = await Promise.all([
        getAnalyticsData().catch(() => null),
        getJobs().catch(() => []),
        getOpportunities().catch(() => []),
        getDecks().catch(() => []),
      ]);
      setData(analytics);
      setJobs(jobList);
      setOpportunities(oppList);
      setDecks(deckList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Job funnel from real data
  const funnelData = STAGE_ORDER.map((stage) => ({
    name: stage,
    value: jobs.filter((j) => j.stage === stage).length,
    fill: STAGE_COLORS[stage],
  })).filter((d) => d.value > 0);
  const maxFunnel = funnelData[0]?.value || 1;

  const completionRate = data ? Math.round((data.doneTasks / Math.max(data.totalTasks, 1)) * 100) : 0;

  // Learning stats
  const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);
  const now = new Date();
  const dueCards = decks.reduce((s, d) => s + d.cards.filter((c) => !c.dueAt || new Date(c.dueAt) <= now).length, 0);
  const masteredCards = decks.reduce((s, d) => s + d.cards.filter((c) => c.reps >= 3 && c.interval >= 7).length, 0);

  const { score, breakdown } = computeMomentumScore(data, jobs, opportunities);

  // Focus stats from persisted store (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const weekFocusMinutes = last7Days.reduce((sum, day) => sum + (focusMinutesByDay[day] ?? 0), 0);
  const todayFocusMinutes = focusMinutesByDay[new Date().toISOString().slice(0, 10)] ?? 0;
  const focusChartData = last7Days.map((date) => ({
    day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    minutes: focusMinutesByDay[date] ?? 0,
  }));
  const hasFocusData = focusChartData.some((d) => d.minutes > 0);

  return (
    <div className="screen">
      <ScreenHeader
        title="Analytics"
        subtitle="Career momentum · task activity · learning"
        actions={
          <button className="btn btn-ghost btn-sm" style={{ gap: 6 }} onClick={load} disabled={loading}>
            <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        }
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* Career Momentum Score — full width */}
          <MomentumWidget score={score} breakdown={breakdown} />

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard
              label="Tasks completed"
              value={data?.doneTasks ?? 0}
              sub={`${completionRate}% completion rate`}
              color="var(--success)"
            />
            <StatCard
              label="Open tasks"
              value={data?.openTasks ?? 0}
              sub={`${data?.byPriority.P0 ?? 0} P0 · ${data?.byPriority.P1 ?? 0} P1 · ${data?.byPriority.P2 ?? 0} P2`}
              color="var(--accent)"
            />
            <StatCard
              label="Job applications"
              value={jobs.length}
              sub={`${jobs.filter((j) => j.stage === 'Interview' || j.stage === 'Offer').length} interviews / offers`}
              color="var(--warn)"
            />
            <StatCard
              label="Flashcards"
              value={totalCards}
              sub={decks.length > 0 ? `${dueCards} due · ${masteredCards} mastered` : `${decks.length} decks`}
              color="var(--text)"
            />
            <StatCard
              label="Focus this week"
              value={formatMinutes(weekFocusMinutes)}
              sub={todayFocusMinutes > 0 ? `${formatMinutes(todayFocusMinutes)} today` : 'No sessions today'}
              color="var(--accent)"
            />
          </div>

          <div className="grid-2">
            {/* Daily activity chart */}
            <div style={CHART_STYLE}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Daily task activity</div>
              {data && data.dailyActivity.some((d) => d.done > 0 || d.added > 0) ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.dailyActivity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: 'var(--text-dim)' }}
                    />
                    <Bar dataKey="added" name="Added" fill="var(--border)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="done" name="Done" fill="var(--success)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                  No task activity in the last 7 days
                </div>
              )}
            </div>

            {/* Project breakdown */}
            <div style={CHART_STYLE}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Tasks by project</div>
              {data && data.byProject.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.byProject.map((p) => (
                    <div key={p.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.name}</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>
                          {p.done}/{p.total}
                        </span>
                      </div>
                      <div style={{ height: 5, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(p.done / p.total) * 100}%`,
                          background: 'var(--success)',
                          borderRadius: 3,
                          transition: 'width 600ms',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                  No project data yet
                </div>
              )}
            </div>
          </div>

          <div className="grid-2">
            {/* Job funnel */}
            <div style={CHART_STYLE}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Application funnel</div>
              {funnelData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {funnelData.map((f) => (
                    <div key={f.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{f.name}</span>
                        <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>{f.value}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(f.value / maxFunnel) * 100}%`, background: f.fill, borderRadius: 3, transition: 'width 600ms' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                  No job applications yet — add some in Jobs
                </div>
              )}
            </div>

            {/* Priority distribution */}
            <div style={CHART_STYLE}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Open tasks by priority</div>
              {data && data.openTasks > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(['P0', 'P1', 'P2'] as const).map((p) => {
                    const count = data.byPriority[p];
                    const pct = Math.round((count / data.openTasks) * 100);
                    const color = p === 'P0' ? 'var(--danger)' : p === 'P1' ? 'var(--warn)' : 'var(--text-faint)';
                    return (
                      <div key={p}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, color, padding: '1px 5px', borderRadius: 3, background: `color-mix(in oklch, ${color} 15%, transparent)` }}>{p}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{count} task{count !== 1 ? 's' : ''}</span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 600ms' }} />
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-faint)' }}>
                    <span>Total open</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{data.openTasks}</span>
                  </div>
                </div>
              ) : (
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                  All tasks completed ✓
                </div>
              )}
            </div>
          </div>

          {/* Focus time chart */}
          <div style={CHART_STYLE}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Focus time — last 7 days</div>
            {hasFocusData ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={focusChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} allowDecimals={false} unit="m" />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-dim)' }}
                    formatter={(v) => [`${v}m`, 'Focus']}
                  />
                  <Bar dataKey="minutes" name="Focus" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-faint)', fontSize: 12 }}>
                <span>No focus sessions recorded this week</span>
                <span style={{ fontSize: 11 }}>Complete a Pomodoro session in Focus to see data here</span>
              </div>
            )}
          </div>

          {/* Learning deck breakdown */}
          {decks.length > 0 && (
            <div style={CHART_STYLE}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 12 }}>Learning decks</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {decks.map((deck) => {
                  const deckDue = deck.cards.filter((c) => !c.dueAt || new Date(c.dueAt) <= now).length;
                  const deckMastered = deck.cards.filter((c) => c.reps >= 3 && c.interval >= 7).length;
                  const deckPct = deck.cards.length > 0 ? Math.round((deckMastered / deck.cards.length) * 100) : 0;
                  return (
                    <div key={deck.id} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: deck.color ?? 'var(--accent)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
                        {deck.cards.length} cards · {deckDue} due · {deckMastered} mastered
                      </div>
                      <div style={{ height: 4, background: 'var(--border-soft)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${deckPct}%`, background: deckPct >= 70 ? 'var(--success)' : deckPct >= 40 ? 'var(--accent)' : 'var(--warn)', borderRadius: 2, transition: 'width 400ms' }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>{deckPct}% mastered</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
