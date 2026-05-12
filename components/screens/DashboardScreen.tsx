'use client';

import { useTransition, useOptimistic, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { StatTile, ScreenHeader, Panel, Pill } from '@/components/ui';
import { toggleTask } from '@/lib/actions/tasks';
import { AlertTriangle, Zap, Timer, CheckSquare, Briefcase, RefreshCw, Loader2 } from 'lucide-react';
import type { Task, Project, Job, Opportunity } from '@prisma/client';

type TaskWithProject = Task & { project: Project | null };

interface AiSuggestion {
  id: string;
  category: 'task' | 'job' | 'opportunity' | 'learning' | 'system';
  title: string;
  why: string;
  cta: string;
  urgency: 'high' | 'normal' | 'low';
}

const SUGGESTION_URGENCY_TONE: Record<AiSuggestion['urgency'], string> = {
  high: 'var(--danger)',
  normal: 'var(--accent)',
  low: 'var(--text-faint)',
};

const SUGGESTION_CAT_LABEL: Record<AiSuggestion['category'], string> = {
  task: 'Task',
  job: 'Job hunt',
  opportunity: 'Opportunity',
  learning: 'Learning',
  system: 'System',
};

const STAGE_TONE: Record<string, 'neutral' | 'accent' | 'warn' | 'success' | 'danger'> = {
  Wishlist:  'neutral',
  Applied:   'neutral',
  OA:        'warn',
  Interview: 'accent',
  Offer:     'success',
  Rejected:  'danger',
};

const PRIORITY_TONE = { P0: 'danger', P1: 'warn', P2: 'neutral' } as const;

function formatDue(d: Date | null): string {
  if (!d) return '—';
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((new Date(d).getTime() - today.getTime()) / 86400_000);
  if (diff === 0) return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Tomorrow';
  if (diff < 0)  return `${Math.abs(diff)}d overdue`;
  return `${diff}d`;
}

interface DashboardScreenProps {
  taskData: {
    tasks:       TaskWithProject[];
    todayTasks:  TaskWithProject[];
    inProgress:  TaskWithProject[];
    blocked:     TaskWithProject[];
    aiSuggested: TaskWithProject[];
  } | null;
  jobs: Job[];
  opportunities: Opportunity[];
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const salutation = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${salutation}, ${name}.`;
}

function computeUrgencies(
  taskData: DashboardScreenProps['taskData'],
  jobs: Job[],
): Array<{ icon: React.ReactNode; text: string; type: 'danger' | 'warn' | 'success' }> {
  const items: Array<{ icon: React.ReactNode; text: string; type: 'danger' | 'warn' | 'success' }> = [];

  const p0Overdue = (taskData?.tasks ?? []).filter(
    (t) => t.priority === 'P0' && !t.done && t.dueAt && new Date(t.dueAt) < new Date(),
  );
  if (p0Overdue.length > 0) {
    items.push({ icon: <AlertTriangle size={12} />, text: `${p0Overdue.length} P0 task${p0Overdue.length > 1 ? 's' : ''} overdue`, type: 'danger' });
  }

  const blocked = taskData?.blocked ?? [];
  if (blocked.length > 0) {
    items.push({ icon: <AlertTriangle size={12} />, text: `${blocked.length} task${blocked.length > 1 ? 's' : ''} blocked`, type: 'warn' });
  }

  const offers = jobs.filter((j) => j.stage === 'Offer');
  if (offers.length > 0) {
    items.push({ icon: <Briefcase size={12} />, text: `Offer pending: ${offers.map((j) => j.company).join(', ')}`, type: 'success' });
  }

  const interviews = jobs.filter((j) => j.stage === 'Interview');
  if (interviews.length > 0) {
    items.push({
      icon: <Briefcase size={12} />,
      text: `${interviews.length} interview${interviews.length > 1 ? 's' : ''}: ${interviews.slice(0, 2).map((j) => j.company).join(', ')}`,
      type: 'warn',
    });
  }

  // Stale jobs: applied but not updated in 7+ days — need a follow-up nudge
  const staleThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stale = jobs.filter(
    (j) => j.stage === 'Applied' && new Date(j.updatedAt).getTime() < staleThreshold,
  );
  if (stale.length > 0) {
    items.push({
      icon: <AlertTriangle size={12} />,
      text: `${stale.length} application${stale.length > 1 ? 's' : ''} need follow-up (7d stale)`,
      type: 'warn',
    });
  }

  return items;
}

export function DashboardScreen({ taskData, jobs, opportunities }: DashboardScreenProps) {
  const setActive         = useAppStore((s) => s.setActive);
  const setAiOpen         = useAppStore((s) => s.setAiOpen);
  const setCmdOpen        = useAppStore((s) => s.setCmdOpen);
  const focusMinutesByDay = useAppStore((s) => s.focusMinutesByDay);
  const { data: session } = useSession();

  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: {
            total: taskData?.tasks.length ?? 0,
            inProgress: taskData?.inProgress.map((t) => ({ title: t.title, priority: t.priority })) ?? [],
            blocked: taskData?.blocked.map((t) => ({ title: t.title })) ?? [],
            todayDue: taskData?.todayTasks.map((t) => ({ title: t.title, done: t.done })) ?? [],
          },
          jobs: jobs.slice(0, 10).map((j) => ({ company: j.company, role: j.role, stage: j.stage, updatedAt: j.updatedAt })),
          opportunities: opportunities.slice(0, 5).map((o) => ({ title: o.title, score: o.score, state: o.state })),
        }),
      });
      if (res.ok) {
        const data = await res.json() as { suggestions: AiSuggestion[] };
        setSuggestions(data.suggestions);
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, [taskData, jobs, opportunities]);

  useEffect(() => {
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const todayKey = new Date().toISOString().slice(0, 10);
  const focusMinutesToday = focusMinutesByDay[todayKey] ?? 0;

  const today     = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';
  const completedToday = (taskData?.tasks ?? []).filter((t) => {
    if (!t.done) return false;
    const updated = new Date(t.updatedAt);
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    return updated >= midnight;
  }).length;

  const todayTasks = taskData?.todayTasks ?? [];
  const totalOpen  = taskData?.tasks.filter((t) => !t.done).length ?? 0;
  const p0Count    = taskData?.tasks.filter((t) => t.priority === 'P0' && !t.done).length ?? 0;
  const inProgress = taskData?.inProgress.length ?? 0;

  const [optimisticTasks, toggleOptimistic] = useOptimistic(
    todayTasks,
    (state, id: string) => state.map((t) => t.id === id ? { ...t, done: !t.done } : t),
  );
  const [, startTransition] = useTransition();

  const handleToggle = (id: string) => {
    startTransition(async () => {
      toggleOptimistic(id);
      await toggleTask(id);
    });
  };

  const urgencies = computeUrgencies(taskData, jobs);

  const interviewCount = jobs.filter((j) => j.stage === 'Interview' || j.stage === 'Offer').length;
  const activeOpps     = opportunities.filter((o) => o.state === 'Interested' || o.state === 'Applied').length;

  const greetingSubtitle = totalOpen > 0
    ? `${totalOpen} open tasks${p0Count > 0 ? ` · ${p0Count} P0` : ''} · ${inProgress} in progress.`
    : 'All caught up. Nothing on fire.';

  return (
    <div className="screen">
      <ScreenHeader
        kicker={today}
        title={greeting(firstName)}
        subtitle={greetingSubtitle}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setCmdOpen(true)} style={{ gap: 5 }}>
              <kbd style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>⌘K</kbd>
              Command
            </button>
            <button className="btn btn-primary" onClick={() => { setAiOpen(true); }}>Plan my day</button>
          </>
        }
      />

      {/* ── Urgency Bar ──────────────────────────────────────────────────── */}
      {urgencies.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          padding: '8px 14px',
          background: 'var(--panel)',
          border: '1px solid var(--border-soft)',
          borderRadius: 10,
          marginBottom: 2,
        }}>
          {urgencies.map((u, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20,
                fontSize: 11.5, fontWeight: 500,
                background: u.type === 'danger'
                  ? 'color-mix(in oklch, var(--danger) 12%, transparent)'
                  : u.type === 'success'
                    ? 'color-mix(in oklch, var(--success) 12%, transparent)'
                    : 'color-mix(in oklch, var(--warn) 12%, transparent)',
                color: u.type === 'danger' ? 'var(--danger)' : u.type === 'success' ? 'var(--success)' : 'var(--warn)',
                border: `1px solid ${u.type === 'danger'
                  ? 'color-mix(in oklch, var(--danger) 25%, transparent)'
                  : u.type === 'success'
                    ? 'color-mix(in oklch, var(--success) 25%, transparent)'
                    : 'color-mix(in oklch, var(--warn) 25%, transparent)'}`,
              }}
            >
              {u.icon}
              {u.text}
            </div>
          ))}
        </div>
      )}

      {/* ── Stats Row ────────────────────────────────────────────────────── */}
      <div className="grid-3">
        <StatTile
          label="Today's focus"
          value={`${todayTasks.filter((t) => !t.done).length} task${todayTasks.filter((t) => !t.done).length !== 1 ? 's' : ''}`}
          delta={focusMinutesToday > 0 ? `${focusMinutesToday}m focused today` : completedToday > 0 ? `+${completedToday} done today` : taskData?.aiSuggested.length ? `+${taskData.aiSuggested.length} AI suggested` : undefined}
          foot={`${inProgress} in progress · ${taskData?.blocked.length ?? 0} blocked`}
          onClick={() => setActive('tasks')}
        />
        <StatTile
          label="Active applications"
          value={String(jobs.filter((j) => !['Wishlist', 'Rejected'].includes(j.stage)).length)}
          delta={interviewCount > 0 ? `+${interviewCount} interview${interviewCount > 1 ? 's' : ''}/offer${interviewCount > 1 ? 's' : ''}` : undefined}
          foot={p0Count > 0 ? `${p0Count} P0 open · ${urgencies.length} alerts` : `${urgencies.length} alert${urgencies.length !== 1 ? 's' : ''}`}
          onClick={() => setActive('jobs')}
        />
        <StatTile
          label="Opportunity pipeline"
          value={String(activeOpps)}
          delta={activeOpps > 0 ? `${opportunities.filter((o) => o.score >= 80).length} high-score` : undefined}
          foot={`${opportunities.length} tracked total`}
          onClick={() => setActive('opportunities')}
        />
      </div>

      {/* ── AI Suggestions ───────────────────────────────────────────────── */}
      <Panel
        title="AI next steps"
        action={
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadSuggestions}
            disabled={suggestionsLoading}
            style={{ gap: 5 }}
          >
            {suggestionsLoading
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            Refresh
          </button>
        }
      >
        {suggestionsLoading && suggestions.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: 12, padding: '12px 0' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Analyzing your tasks, jobs, and pipeline…
          </div>
        ) : suggestions.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '12px 0' }}>
            Click Refresh to generate AI-powered next steps.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {suggestions.map((s) => (
              <div
                key={s.id}
                style={{
                  flexShrink: 0, width: 220,
                  padding: '12px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 7,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
                    color: SUGGESTION_URGENCY_TONE[s.urgency],
                  }}>
                    {SUGGESTION_CAT_LABEL[s.category]}
                  </span>
                  {s.urgency === 'high' && (
                    <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>● urgent</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.4, flex: 1 }}>
                  {s.why}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{
                    justifyContent: 'center', fontSize: 11.5,
                    border: '1px solid var(--border-soft)',
                    borderRadius: 6,
                  }}
                  onClick={() => {
                    if (s.category === 'task') setActive('tasks');
                    else if (s.category === 'job') setActive('jobs');
                    else if (s.category === 'opportunity') setActive('opportunities');
                  }}
                >
                  {s.cta} →
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div className="grid-2">
        <Panel
          title="Today's focus"
          action={<button className="btn btn-ghost btn-sm" onClick={() => setActive('tasks')}>All tasks</button>}
        >
          {optimisticTasks.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '16px 0' }}>
              No tasks due today —{' '}
              <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex' }} onClick={() => setActive('tasks')}>
                Add one
              </button>
            </div>
          ) : (
            <ul className="task-list">
              {optimisticTasks.map((t) => (
                <li key={t.id} className="task-row">
                  <button className={`check${t.done ? ' done' : ''}`} onClick={() => handleToggle(t.id)}>
                    {t.done ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="task-title" style={t.done ? { textDecoration: 'line-through', color: 'var(--text-faint)' } : undefined}>
                      {t.title}
                      {t.aiSuggested && <span style={{ color: 'var(--accent)', fontSize: 11, marginLeft: 6 }}>✦</span>}
                    </div>
                    <div className="task-meta">
                      <span style={{ color: 'var(--text-faint)' }}>{t.project?.name ?? '—'}</span>
                      <span style={{ color: 'var(--text-faint)' }}>·</span>
                      <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{formatDue(t.dueAt)}</span>
                      <Pill tone={PRIORITY_TONE[t.priority]}>{t.priority}</Pill>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Job pipeline"
          action={<button className="btn btn-ghost btn-sm" onClick={() => setActive('jobs')}>All jobs</button>}
        >
          {jobs.filter((j) => !['Wishlist', 'Rejected'].includes(j.stage)).length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '16px 0' }}>
              No active applications —{' '}
              <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex' }} onClick={() => setActive('jobs')}>
                Add one
              </button>
            </div>
          ) : (
            <ul className="pipe-list">
              {jobs
                .filter((j) => !['Wishlist', 'Rejected'].includes(j.stage))
                .slice(0, 5)
                .map((j) => (
                  <li key={j.id} className="pipe-row">
                    <div className="pipe-logo">{j.company[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pipe-title">{j.company}</div>
                      <div className="pipe-sub">{j.role}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                      <Pill tone={STAGE_TONE[j.stage] ?? 'neutral'}>{j.stage}</Pill>
                      {(j.stage === 'Interview' || j.stage === 'OA') && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, padding: '1px 6px', height: 'auto', color: 'var(--accent)' }}
                          onClick={() => setActive('interview')}
                        >
                          Prep →
                        </button>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Second Row ───────────────────────────────────────────────────── */}
      <div className="grid-2">
        <Panel
          title="Opportunity radar"
          action={<button className="btn btn-ghost btn-sm" onClick={() => setActive('opportunities')}>All</button>}
        >
          {opportunities.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 12, padding: '16px 0' }}>
              No opportunities tracked —{' '}
              <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex' }} onClick={() => setActive('opportunities')}>
                Add one
              </button>
            </div>
          ) : (
            <ul className="opp-list">
              {opportunities.slice(0, 4).map((o) => (
                <li
                  key={o.id}
                  className="opp-row"
                  onClick={() => setActive('opportunities')}
                  style={{ cursor: 'pointer' }}
                >
                  {o.score > 0 && (
                    <div className="opp-score" style={{ '--s': o.score / 100 } as React.CSSProperties}>
                      <span>{o.score}</span>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="opp-title">{o.title}</div>
                    <div className="opp-meta" style={{ color: 'var(--text-faint)' }}>
                      {o.source}{o.reward ? ` · ${o.reward}` : ''}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>›</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Quick Actions — intelligent shortcuts to key workflows */}
        <Panel title="Quick actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '2px 0' }}>
            {[
              { icon: <Zap size={13} />,        label: 'Log an opportunity',       screen: 'opportunities' as const },
              { icon: <Briefcase size={13} />,  label: 'Track a job application',  screen: 'jobs' as const },
              { icon: <CheckSquare size={13} />, label: 'Review & plan tasks',      screen: 'tasks' as const },
              { icon: <Timer size={13} />,       label: 'Start a focus session',    screen: 'focus' as const },
            ].map((qa) => (
              <button
                key={qa.screen}
                className="btn btn-ghost"
                style={{
                  justifyContent: 'flex-start', gap: 10, height: 34,
                  padding: '0 10px',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 8, fontSize: 12.5,
                }}
                onClick={() => setActive(qa.screen)}
              >
                <span style={{ color: 'var(--accent)' }}>{qa.icon}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{qa.label}</span>
              </button>
            ))}
            <button
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start', gap: 10, height: 34,
                padding: '0 10px',
                border: '1px solid color-mix(in oklch, var(--accent) 30%, transparent)',
                borderRadius: 8, fontSize: 12.5,
                color: 'var(--accent)',
                background: 'color-mix(in oklch, var(--accent) 6%, transparent)',
              }}
              onClick={() => setAiOpen(true)}
            >
              <span className="ai-glyph sm">✦</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Ask AI to plan my day</span>
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
