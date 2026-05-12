import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { AIPanel } from '@/components/shell/AIPanel';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { KeyboardNav, GlobalToast } from '@/components/shell/KeyboardNav';
import { TweaksPanel } from '@/components/shell/TweaksPanel';
import { ShellWrapper } from '@/components/shell/ShellWrapper';
import { AppContent } from '@/components/shell/AppContent';
import { ErrorBoundaryWrapper } from '@/components/shell/ErrorBoundaryWrapper';
import { NotificationSeeder } from '@/components/shell/NotificationSeeder';
import { StoreInitializer } from '@/components/shell/StoreInitializer';
import { getTasksWithStats } from '@/lib/actions/tasks';
import { getJobs } from '@/lib/actions/jobs';
import { getOpportunities } from '@/lib/actions/opportunities';
import { auth } from '@/lib/auth';

export default async function Home() {
  const session = await auth();

  const [taskData, jobs, opportunities] = await Promise.all([
    getTasksWithStats().catch(() => null),
    getJobs().catch(() => []),
    getOpportunities().catch(() => []),
  ]);

  const user = session?.user ? {
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  } : null;

  // Flat task list for badge seeding (StoreInitializer only needs Task[], not TaskWithProject[])
  const allTasks = taskData?.tasks ?? [];

  return (
    <>
      <KeyboardNav />
      {/* Seed badge counts into the store from fresh SSR data */}
      <StoreInitializer tasks={allTasks} jobs={jobs} opportunities={opportunities} />
      <ShellWrapper>
        <Sidebar user={user} jobs={jobs} />
        <main className="main">
          <TopBar />
          <div className="main-scroll">
            <ErrorBoundaryWrapper>
              <AppContent taskData={taskData} jobs={jobs} opportunities={opportunities} />
            </ErrorBoundaryWrapper>
          </div>
        </main>
        <AIPanel />
      </ShellWrapper>
      <CommandPalette />
      <TweaksPanel />
      <NotificationSeeder />
      <GlobalToast />
    </>
  );
}
