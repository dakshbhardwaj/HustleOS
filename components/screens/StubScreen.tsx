'use client';

import { ScreenHeader, AISuggestion } from '@/components/ui';
import type { ScreenKey } from '@/types';

const META: Record<ScreenKey, { title: string; sub: string; hint: string; phase: string }> = {
  dashboard:     { title: 'Dashboard',       sub: 'Daily summary',                              hint: '', phase: '' },
  tasks:         { title: 'Tasks',           sub: 'Task manager',                               hint: '', phase: '' },
  jobs:          { title: 'Jobs',            sub: 'Kanban pipeline',                            hint: '', phase: '' },
  opportunities: { title: 'Opportunities',   sub: 'Bounty radar',                               hint: '', phase: '' },
  interview:     { title: 'Interview prep',  sub: 'Question bank',                              hint: '', phase: '' },
  brief: {
    title: 'Daily brief', phase: 'Phase 4', sub: 'AI morning briefing',
    hint: 'AI compiles your schedule, open tasks, interview deadlines, and market signals into a 3-min brief every morning.',
  },
  focus: {
    title: 'Focus', phase: 'Phase 4', sub: 'Pomodoro + deep work',
    hint: 'Start a timed focus session tied to a task, track flow streaks, and block distractions.',
  },
  resume: {
    title: 'Resume', phase: 'Phase 3', sub: 'AI-matched resume builder',
    hint: 'Upload your resume and paste a JD — AI scores keyword match, highlights gaps, and suggests edits.',
  },
  email: {
    title: 'Inbox intelligence', phase: 'Phase 3', sub: 'AI-triaged email',
    hint: 'Gmail sync with AI classification into Interview / Opportunity / Rejection / Action Required buckets.',
  },
  learning: {
    title: 'Learning', phase: 'Phase 4', sub: 'FSRS spaced-repetition',
    hint: 'Create flashcard decks from any topic. Daily review uses SM-2 scheduling to maximize retention.',
  },
  github: {
    title: 'GitHub', phase: 'Phase 4', sub: 'Contribution heatmap + PRs',
    hint: 'OAuth-connected activity graph, open PR queue, streak tracker, and repo health overview.',
  },
  vault: {
    title: 'Knowledge vault', phase: 'Phase 4', sub: 'Markdown notes + backlinks',
    hint: 'Write and link notes in Markdown, full-text search, tag by project, and see backlinks.',
  },
  analytics: {
    title: 'Analytics', phase: 'Phase 4', sub: 'Career metrics dashboard',
    hint: 'Application funnel conversion, task velocity, focus hours per week, and skill coverage charts.',
  },
};

export function StubScreen({ screen }: { screen: ScreenKey }) {
  const m = META[screen] ?? { title: screen, sub: '', hint: 'Coming soon.', phase: 'Phase TBD' };
  if (!m.phase) {
    return (
      <div className="screen">
        <ScreenHeader title={m.title} subtitle={m.sub} />
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
          ✦ This screen is being built. Check back soon.
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={m.title}
        subtitle={m.sub}
        actions={
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', background: 'var(--surface)', padding: '3px 8px', borderRadius: 4 }}>
            {m.phase}
          </span>
        }
      />

      <AISuggestion onAccept={() => {}} onDismiss={() => {}}>
        <strong>Coming in {m.phase}.</strong> {m.hint}
      </AISuggestion>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 320, gap: 12,
        background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12,
      }}>
        <div style={{ fontSize: 32, color: 'var(--text-faint)' }}>✦</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{m.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
          {m.hint}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
          Scheduled for {m.phase}
        </div>
      </div>
    </div>
  );
}
