'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { RefreshCw, Sparkles, CheckSquare, Briefcase, Zap, Loader2, Rss, MessageSquare, BookOpen, Plus } from 'lucide-react';
import { ScreenHeader, Pill } from '@/components/ui';
import { createTechStoryNote, getWeeklyLearningDigest } from '@/lib/actions/notes';
import { createTaskFromJobNextStep, createTaskFromOpportunity, createTaskFromTechStory, getTasksWithStats } from '@/lib/actions/tasks';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import { useAppStore } from '@/lib/store';
import type { Task, Project, Job, Opportunity } from '@prisma/client';

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

type TaskWithProject = Task & { project: Project | null; subtasks: Task[] };

const PRIORITY_TONE = { P0: 'danger', P1: 'warn', P2: 'neutral' } as const;
const STAGE_LABEL: Record<string, string> = {
  Wishlist: 'Wishlist', Applied: 'Applied', OA: 'OA', Interview: 'Interview', Offer: 'Offer',
};
const STAGE_TONE: Record<string, 'neutral' | 'accent' | 'warn' | 'success'> = {
  Wishlist: 'neutral', Applied: 'neutral', OA: 'warn', Interview: 'accent', Offer: 'success',
};

function formatDue(d: Date | null): string {
  if (!d) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).getTime() - today.getTime()) / 86400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface TechStory {
  id: number;
  title: string;
  url: string;
  score: number;
  comments: number;
  by: string;
  relevance: number;
  tags?: string[];
  angle?: string;
  hnUrl: string;
}

interface BriefData {
  todayTasks: TaskWithProject[];
  openTasks: TaskWithProject[];
  blockedTasks: TaskWithProject[];
  activeJobs: Job[];
  opportunities: Opportunity[];
}

interface WeeklyLearningDigest {
  notes: Array<{ id: string; title: string; tags: string[]; updatedAt: Date }>;
  topTags: Array<{ tag: string; count: number }>;
  focus: string;
}

export function DailyBriefScreen() {
  const dailyBriefCache    = useAppStore((s) => s.dailyBriefCache);
  const setDailyBriefCache = useAppStore((s) => s.setDailyBriefCache);
  const showToast          = useAppStore((s) => s.showToast);

  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [techStories, setTechStories] = useState<TechStory[]>([]);
  const [techLoading, setTechLoading] = useState(true);
  const [weeklyLearning, setWeeklyLearning] = useState<WeeklyLearningDigest | null>(null);
  const [capturingStoryId, setCapturingStoryId] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState(() => {
    if (dailyBriefCache?.date === todayDateString()) return dailyBriefCache.text;
    return '';
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();
  const autoGenFired = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [taskData, jobs, opps] = await Promise.all([
        getTasksWithStats().catch(() => null),
        getJobs().catch(() => []),
        getOpportunities().catch(() => []),
      ]);
      setData({
        todayTasks: taskData?.todayTasks.filter((t) => !t.done) ?? [],
        openTasks: taskData?.tasks.filter((t) => !t.done) ?? [],
        blockedTasks: taskData?.blocked ?? [],
        activeJobs: jobs.filter((j) => j.stage !== 'Wishlist'),
        opportunities: opps.filter((o) => o.state !== 'Passed' && o.state !== 'Won'),
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTechFeed = async () => {
    setTechLoading(true);
    try {
      const [res, digest] = await Promise.all([
        fetch('/api/tech-feed'),
        getWeeklyLearningDigest().catch(() => null),
      ]);
      const json = await res.json() as { stories?: TechStory[] };
      setTechStories(json.stories ?? []);
      setWeeklyLearning(digest);
    } catch { /* silent */ } finally {
      setTechLoading(false);
    }
  };

  const generateAISummary = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/ai/brief', { method: 'POST' });
      const json = await res.json() as { summary?: string; error?: string };
      if (json.error) {
        setError(json.error);
      } else {
        const text = json.summary ?? '';
        setAiSummary(text);
        setDailyBriefCache({ text, date: todayDateString() });
      }
    } catch {
      setError('Failed to generate. Check your connection.');
    } finally {
      setGenerating(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
      loadTechFeed();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Auto-generate brief once per day (after data is ready)
  useEffect(() => {
    if (loading) return;                                        // wait for data
    if (autoGenFired.current) return;                          // only once per mount
    if (dailyBriefCache?.date === todayDateString()) return;   // already cached today
    autoGenFired.current = true;
    const timer = setTimeout(() => generateAISummary(), 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const createJobTask = (job: Job) => {
    startTransition(async () => {
      try {
        const task = await createTaskFromJobNextStep(job.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create job task', 'info');
      }
    });
  };

  const createOpportunityTask = (opp: Opportunity) => {
    startTransition(async () => {
      try {
        const task = await createTaskFromOpportunity(opp.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create opportunity task', 'info');
      }
    });
  };

  const saveTechStory = (story: TechStory) => {
    setCapturingStoryId(story.id);
    startTransition(async () => {
      try {
        await createTechStoryNote({
          title: story.title,
          url: story.url,
          hnUrl: story.hnUrl,
          angle: story.angle,
          tags: story.tags,
        });
        showToast('Saved to Vault');
      } catch {
        showToast('Could not save story', 'info');
      } finally {
        setCapturingStoryId(null);
      }
    });
  };

  const taskTechStory = (story: TechStory) => {
    setCapturingStoryId(story.id);
    startTransition(async () => {
      try {
        const task = await createTaskFromTechStory({
          title: story.title,
          url: story.url,
          angle: story.angle,
        });
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create reading task', 'info');
      } finally {
        setCapturingStoryId(null);
      }
    });
  };

  return (
    <div className="screen">
      <ScreenHeader
        kicker={today}
        title="Daily brief"
        subtitle="Your real-time morning overview"
        actions={
          <button className="btn btn-primary" onClick={generateAISummary} disabled={generating} style={{ gap: 6 }}>
            {generating
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <Sparkles size={13} />
            }
            {generating ? 'Generating…' : aiSummary ? 'Regenerate' : 'AI summary'}
          </button>
        }
      />

      {aiSummary && (
        <div style={{ background: 'color-mix(in oklch, var(--accent) 8%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 25%, transparent)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}>AI overview</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6 }}>{aiSummary}</p>
        </div>
      )}

      {error && (
        <div style={{ background: 'color-mix(in oklch, var(--danger) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--danger) 25%, transparent)', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>

          {/* Action plan */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, gridColumn: '1 / -1' }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Today&apos;s action plan</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                {data.openTasks.length} open · {data.activeJobs.length} jobs · {data.opportunities.length} opportunities
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
              <div style={{ padding: 14, borderRight: '1px solid var(--border-soft)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>1. Start</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, fontWeight: 600 }}>
                  {(data.todayTasks[0] ?? data.openTasks.find((t) => t.priority === 'P0') ?? data.openTasks[0])?.title ?? 'Capture one clear task for today'}
                </div>
              </div>
              <div style={{ padding: 14, borderRight: '1px solid var(--border-soft)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>2. Follow up</div>
                {data.activeJobs.find((j) => j.nextStep) ? (() => {
                  const job = data.activeJobs.find((j) => j.nextStep)!;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, fontWeight: 600 }}>{job.nextStep}</div>
                      <button className="btn btn-ghost btn-sm" style={{ gap: 5, alignSelf: 'flex-start' }} onClick={() => createJobTask(job)}>
                        <CheckSquare size={11} /> Make task
                      </button>
                    </div>
                  );
                })() : (
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.45 }}>Add next steps to active applications.</div>
                )}
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>3. Bet</div>
                {data.opportunities[0] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, fontWeight: 600 }}>{data.opportunities[0].title}</div>
                    <button className="btn btn-ghost btn-sm" style={{ gap: 5, alignSelf: 'flex-start' }} onClick={() => createOpportunityTask(data.opportunities[0])}>
                      <CheckSquare size={11} /> Make task
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.45 }}>Track one promising opportunity.</div>
                )}
              </div>
            </div>
          </div>

          {/* Today's tasks */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckSquare size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Today&apos;s focus</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{data.todayTasks.length} tasks</span>
            </div>
            {data.todayTasks.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>No tasks due today ✦</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
                {data.todayTasks.slice(0, 6).map((t, i) => (
                  <li key={t.id} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < Math.min(data.todayTasks.length, 6) - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                    <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.4 }}>{t.title}</span>
                    {t.dueAt && <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{formatDue(t.dueAt)}</span>}
                  </li>
                ))}
                {data.todayTasks.length > 6 && (
                  <li style={{ padding: '6px 14px', fontSize: 11, color: 'var(--text-faint)' }}>+{data.todayTasks.length - 6} more</li>
                )}
              </ul>
            )}
          </div>

          {/* Blocked tasks */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>🚧</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Blockers</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{data.blockedTasks.length} blocked</span>
            </div>
            {data.blockedTasks.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>No blockers — clear runway ✓</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
                {data.blockedTasks.slice(0, 5).map((t, i) => (
                  <li key={t.id} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < Math.min(data.blockedTasks.length, 5) - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-dim)' }}>{t.title}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{t.project?.name ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Job pipeline */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Job pipeline</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{data.activeJobs.length} active</span>
            </div>
            {data.activeJobs.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>No active applications. Time to apply!</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
                {data.activeJobs.slice(0, 5).map((j, i) => (
                  <li key={j.id} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < Math.min(data.activeJobs.length, 5) - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', flexShrink: 0 }}>
                      {j.company[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.company}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.role}</div>
                    </div>
                    <Pill tone={STAGE_TONE[j.stage] ?? 'neutral'}>{STAGE_LABEL[j.stage] ?? j.stage}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Opportunity radar */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Opportunity radar</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{data.opportunities.length} tracked</span>
            </div>
            {data.opportunities.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>No active opportunities. Add some!</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
                {data.opportunities.slice(0, 5).map((o, i) => (
                  <li key={o.id} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < Math.min(data.opportunities.length, 5) - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                    {o.score > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: o.score >= 85 ? 'var(--success)' : o.score >= 70 ? 'var(--accent)' : 'var(--warn)', flexShrink: 0, width: 24, textAlign: 'center' }}>
                        {o.score}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{o.source}{o.reward ? ` · ${o.reward}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{o.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tech pulse — spans full width */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, gridColumn: '1 / -1' }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Rss size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Tech pulse</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>Hacker News · technical radar</span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto', gap: 4, fontSize: 11 }}
                onClick={loadTechFeed}
                disabled={techLoading}
              >
                <RefreshCw size={10} style={techLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                Refresh
              </button>
            </div>
            {techLoading ? (
              <div style={{ padding: '20px 14px', display: 'flex', justifyContent: 'center' }}>
                <Loader2 size={16} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : techStories.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
                Could not load tech feed. Check your connection.
              </div>
            ) : (
              <div>
                {weeklyLearning && (
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-soft)', background: 'color-mix(in oklch, var(--accent) 4%, transparent)', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>Weekly learning loop</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{weeklyLearning.focus}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>{weeklyLearning.notes.length} notes this week</span>
                      {weeklyLearning.topTags.slice(0, 5).map(({ tag, count }) => (
                        <span key={tag} style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)', background: 'color-mix(in oklch, var(--accent) 8%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 18%, transparent)', borderRadius: 4, padding: '2px 6px' }}>
                          {tag} {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {techStories.map((story, i) => (
                  <div
                    key={story.id}
                    style={{
                      padding: '9px 14px',
                      borderBottom: i < techStories.length - 2 ? '1px solid var(--border-soft)' : 'none',
                      borderRight: i % 2 === 0 ? '1px solid var(--border-soft)' : 'none',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: story.relevance > 0 ? 'var(--accent)' : 'var(--text-faint)', flexShrink: 0, minWidth: 28, paddingTop: 1 }}>
                      {story.score}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12.5, color: 'var(--text-dim)', textDecoration: 'none', lineHeight: 1.4, display: 'block' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)'; }}
                      >
                        {story.title}
                      </a>
                      <div style={{ display: 'flex', gap: 10, marginTop: 3, alignItems: 'center' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{story.by}</span>
                        <a
                          href={story.hnUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 10.5, color: 'var(--text-faint)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <MessageSquare size={9} />
                          {story.comments}
                        </a>
                        {story.relevance > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>✦ relevant</span>
                        )}
                      </div>
                      {(story.angle || story.tags?.length) && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                          {story.angle && <span style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.35 }}>{story.angle}</span>}
                          {story.tags?.map((tag) => (
                            <span key={tag} style={{ fontSize: 9.5, color: 'var(--accent)', fontFamily: 'var(--font-mono)', background: 'color-mix(in oklch, var(--accent) 8%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 18%, transparent)', borderRadius: 4, padding: '1px 5px' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ gap: 4, fontSize: 10.5 }}
                          onClick={() => saveTechStory(story)}
                          disabled={capturingStoryId === story.id}
                        >
                          {capturingStoryId === story.id ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <BookOpen size={10} />}
                          Save note
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ gap: 4, fontSize: 10.5 }}
                          onClick={() => taskTechStory(story)}
                          disabled={capturingStoryId === story.id}
                        >
                          <Plus size={10} />
                          Read later
                        </button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-ghost btn-sm" style={{ gap: 6 }} onClick={loadData} disabled={loading}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Last updated {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
