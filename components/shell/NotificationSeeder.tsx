'use client';

/**
 * NotificationSeeder — runs once per session to generate notifications from real DB data.
 * Fires for: tasks due today, blocked tasks, jobs needing next action, upcoming opportunities.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { getTasksWithStats } from '@/lib/actions/tasks';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import type { ScreenKey } from '@/types';

const SESSION_KEY = 'hustle-notif-seeded';

export function NotificationSeeder() {
  const addNotification = useAppStore((s) => s.addNotification);
  const notifications = useAppStore((s) => s.notifications);
  const ran = useRef(false);

  useEffect(() => {
    // Only seed once per browser session (not per page load, but sessionStorage-based)
    if (ran.current) return;
    ran.current = true;

    const alreadySeeded = sessionStorage.getItem(SESSION_KEY);
    if (alreadySeeded) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    async function seed() {
      try {
        const [taskData, jobs, opps] = await Promise.all([
          getTasksWithStats().catch(() => null),
          getJobs().catch(() => []),
          getOpportunities().catch(() => []),
        ]);

        const now = Date.now();
        const notifs: Parameters<typeof addNotification>[0][] = [];

        // P0 tasks due today
        if (taskData) {
          const p0Today = taskData.todayTasks.filter((t) => !t.done && t.priority === 'P0');
          for (const t of p0Today.slice(0, 3)) {
            notifs.push({
              type: 'task_due',
              title: `Priority task due today`,
              body: t.title,
              screen: 'tasks',
            });
          }

          // Blocked tasks
          const blocked = taskData.blocked.filter((t) => !t.done);
          if (blocked.length > 0) {
            notifs.push({
              type: 'task_blocked',
              title: `${blocked.length} task${blocked.length > 1 ? 's' : ''} blocked`,
              body: blocked.slice(0, 2).map((t) => t.title).join(', ') + (blocked.length > 2 ? ` +${blocked.length - 2} more` : ''),
              screen: 'tasks',
            });
          }
        }

        // Jobs with imminent next steps (Interview or Offer stages)
        const hotJobs = jobs.filter((j) => j.stage === 'Interview' || j.stage === 'Offer');
        for (const j of hotJobs.slice(0, 2)) {
          notifs.push({
            type: j.stage === 'Offer' ? 'job_action' : 'interview',
            title: j.stage === 'Offer' ? `Offer from ${j.company}` : `Interview at ${j.company}`,
            body: j.nextStep ?? (j.stage === 'Offer' ? 'Review and respond to offer' : `${j.role} — prep time`),
            screen: 'jobs',
          });
        }

        // New high-score opportunities
        const topOpps = opps.filter((o) => o.score >= 85 && o.state === 'New').slice(0, 2);
        for (const o of topOpps) {
          notifs.push({
            type: 'opportunity',
            title: `High-match opportunity (${o.score})`,
            body: `${o.title} via ${o.source}${o.reward ? ` · ${o.reward}` : ''}`,
            screen: 'opportunities',
          });
        }

        // Stale job applications (Applied or OA stage, no update in 14+ days)
        const staleThreshold = now - 14 * 24 * 60 * 60 * 1000;
        const staleJobs = jobs.filter((j) => {
          if (j.stage !== 'Applied' && j.stage !== 'OA') return false;
          const updated = j.updatedAt ? new Date(j.updatedAt).getTime() : 0;
          return updated < staleThreshold;
        }).slice(0, 2);
        for (const j of staleJobs) {
          notifs.push({
            type: 'job_action',
            title: `Stale application — ${j.company}`,
            body: `${j.role} · ${j.stage} stage · no update in 2+ weeks`,
            screen: 'jobs',
          });
        }

        // Add in reverse so oldest appears at bottom
        for (const n of notifs.reverse()) {
          addNotification(n);
        }
      } catch {
        // Fail silently — notifications are non-critical
      }
    }

    seed();
  }, [addNotification]);

  return null;
}
