'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import type { Task, Job, Opportunity } from '@prisma/client';

interface StoreInitializerProps {
  tasks: Task[];
  jobs: Job[];
  opportunities: Opportunity[];
}

/**
 * Seeds the Zustand store with badge counts derived from SSR-fetched data.
 * Runs once on mount — badges are NOT persisted (always fresh from server).
 * Place this inside the Providers tree so the store is available.
 */
export function StoreInitializer({ tasks, jobs, opportunities }: StoreInitializerProps) {
  const setBadges = useAppStore((s) => s.setBadges);

  useEffect(() => {
    setBadges({
      tasks:        tasks.filter((t) => !t.done && t.priority === 'P0').length,
      jobs:         jobs.filter((j) => j.stage === 'Interview' || j.stage === 'Offer').length,
      opportunities: opportunities.filter((o) => o.state === 'New').length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once at mount with SSR snapshot

  return null;
}
