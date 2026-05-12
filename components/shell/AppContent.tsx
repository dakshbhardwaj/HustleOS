'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { DashboardScreen } from '@/components/screens/DashboardScreen';
import { TasksScreen } from '@/components/screens/TasksScreen';
import { JobsScreen } from '@/components/screens/JobsScreen';
import { OpportunitiesScreen } from '@/components/screens/OpportunitiesScreen';
import { InterviewPrepScreen } from '@/components/screens/InterviewPrepScreen';
import { FocusScreen } from '@/components/screens/FocusScreen';
import { AnalyticsScreen } from '@/components/screens/AnalyticsScreen';
import { GitHubScreen } from '@/components/screens/GitHubScreen';
import { LearningScreen } from '@/components/screens/LearningScreen';
import { VaultScreen } from '@/components/screens/VaultScreen';
import { DailyBriefScreen } from '@/components/screens/DailyBriefScreen';
import { EmailScreen } from '@/components/screens/EmailScreen';
import { ResumeScreen } from '@/components/screens/ResumeScreen';
import { StubScreen } from '@/components/screens/StubScreen';
import type { ScreenKey } from '@/types';
import type { Task, Project, Job, Opportunity } from '@prisma/client';

type TaskWithProject = Task & { project: Project | null; subtasks: Task[] };

interface TaskData {
  tasks:       TaskWithProject[];
  todayTasks:  TaskWithProject[];
  inProgress:  TaskWithProject[];
  blocked:     TaskWithProject[];
  aiSuggested: TaskWithProject[];
}

interface AppContentProps {
  taskData: TaskData | null;
  jobs: Job[];
  opportunities: Opportunity[];
}

// Renders a single screen by key. Props flow through on every render so
// server-action revalidations (taskData updates) reach hidden screens too.
function renderScreen(screen: ScreenKey, props: AppContentProps) {
  const { taskData, jobs, opportunities } = props;
  switch (screen) {
    case 'dashboard':
      return <DashboardScreen taskData={taskData} jobs={jobs} opportunities={opportunities} />;
    case 'tasks':
      return taskData ? (
        <TasksScreen
          tasks={taskData.tasks}
          todayTasks={taskData.todayTasks}
          inProgress={taskData.inProgress}
          blocked={taskData.blocked}
          aiSuggested={taskData.aiSuggested}
        />
      ) : <StubScreen screen="tasks" />;
    case 'jobs':        return <JobsScreen />;
    case 'opportunities': return <OpportunitiesScreen />;
    case 'interview':   return <InterviewPrepScreen />;
    case 'focus':       return <FocusScreen />;
    case 'analytics':   return <AnalyticsScreen />;
    case 'github':      return <GitHubScreen />;
    case 'learning':    return <LearningScreen />;
    case 'vault':       return <VaultScreen />;
    case 'brief':       return <DailyBriefScreen />;
    case 'email':       return <EmailScreen />;
    case 'resume':      return <ResumeScreen />;
    default:            return <StubScreen screen={screen} />;
  }
}

export function AppContent(props: AppContentProps) {
  const active = useAppStore((s) => s.active);

  // Track which screens have been visited. Once mounted, a screen stays in the
  // DOM (just hidden) so its state — fetch results, tab selection, scroll
  // position — survives navigation without re-running effects.
  const [visited, setVisited] = useState<Set<ScreenKey>>(() => new Set([active]));

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <>
      {Array.from(visited).map((screen) => (
        <div
          key={screen}
          style={screen !== active ? { display: 'none' } : undefined}
          aria-hidden={screen !== active}
        >
          {renderScreen(screen, props)}
        </div>
      ))}
    </>
  );
}
