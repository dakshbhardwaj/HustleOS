'use client';

import { useEffect, useRef, useState, useMemo, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { NAV } from '@/lib/nav';
import { useAppStore } from '@/lib/store';
import { getJobs } from '@/lib/actions/jobs';
import { getNotes } from '@/lib/actions/notes';
import { getOpportunities } from '@/lib/actions/opportunities';
import {
  createTaskFromCapture,
  createTaskFromJobNextStep,
  createTaskFromOpportunity,
  getTasksWithStats,
  toggleTask,
} from '@/lib/actions/tasks';
import type { ScreenKey } from '@/types';
import type { Job, Note, Opportunity, Project, Task } from '@prisma/client';

type TaskWithProject = Task & { project: Project | null; subtasks: Task[] };

interface WorkspaceData {
  tasks: TaskWithProject[];
  jobs: Job[];
  opportunities: Opportunity[];
  notes: Note[];
}

interface CmdItem {
  k: string;
  type: 'Jump' | 'AI' | 'Action' | 'Task' | 'Job' | 'Opp' | 'Note';
  label: string;
  detail?: string;
  action: () => void;
}

export function CommandPalette() {
  const cmdOpen          = useAppStore((s) => s.cmdOpen);
  const setCmdOpen       = useAppStore((s) => s.setCmdOpen);
  const setActive        = useAppStore((s) => s.setActive);
  const setAiOpen        = useAppStore((s) => s.setAiOpen);
  const setAiPendingPrompt = useAppStore((s) => s.setAiPendingPrompt);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const showToast        = useAppStore((s) => s.showToast);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [workspace, setWorkspace] = useState<WorkspaceData>({ tasks: [], jobs: [], opportunities: [], notes: [] });
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [, startTransition] = useTransition();

  const jump = (key: ScreenKey) => {
    setActive(key);
    setCmdOpen(false);
  };

  const openEntity = (screen: ScreenKey, entity: Parameters<typeof setSelectedEntity>[0]) => {
    setSelectedEntity(entity);
    setActive(screen);
    setCmdOpen(false);
  };

  const askAI = (prompt: string) => {
    setAiPendingPrompt(prompt);
    setAiOpen(true);
    setCmdOpen(false);
  };

  const createCapturedTask = (input: string) => {
    setCmdOpen(false);
    startTransition(async () => {
      try {
        const task = await createTaskFromCapture(input);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not add task', 'info');
      }
    });
  };

  const completeTask = (task: TaskWithProject) => {
    setCmdOpen(false);
    startTransition(async () => {
      try {
        await toggleTask(task.id);
        setWorkspace((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => t.id === task.id ? { ...t, done: !t.done, status: !t.done ? 'Completed' : 'Todo' } : t),
        }));
        showToast(`${task.done ? 'Reopened' : 'Completed'}: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not update task', 'info');
      }
    });
  };

  const createJobTask = (job: Job) => {
    setCmdOpen(false);
    startTransition(async () => {
      try {
        const task = await createTaskFromJobNextStep(job.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create job task', 'info');
      }
    });
  };

  const createOpportunityTask = (opportunity: Opportunity) => {
    setCmdOpen(false);
    startTransition(async () => {
      try {
        const task = await createTaskFromOpportunity(opportunity.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create opportunity task', 'info');
      }
    });
  };

  const items = useMemo<CmdItem[]>(() => {
    const base: CmdItem[] = [
      ...NAV.map((n) => ({ k: 'go-' + n.key, type: 'Jump' as const, label: 'Go to ' + n.label, action: () => jump(n.key) })),
      { k: 'ai-plan',   type: 'AI',     label: 'Plan my day',                  action: () => askAI('Plan my day. List my P0 tasks, key job actions, and top opportunities.') },
      { k: 'ai-prep',   type: 'AI',     label: 'Run a mock interview session', action: () => jump('interview')     },
      { k: 'ai-resume', type: 'AI',     label: 'Analyze my resume vs a JD',   action: () => jump('resume')        },
      { k: 'ai-rank',   type: 'AI',     label: "Rank today's opportunities",   action: () => askAI("Rank my open opportunities by fit score and urgency. What should I focus on today?") },
      { k: 'ai-brief',  type: 'AI',     label: "Generate my daily brief",      action: () => jump('brief')         },
      { k: 'ai-stuck',  type: 'AI',     label: "I'm stuck — help me unblock",  action: () => askAI("I'm feeling stuck. Look at my blocked tasks and help me figure out what to do next.") },
      { k: 'new-task',  type: 'Action', label: 'New task',                     action: () => jump('tasks')         },
      { k: 'new-app',   type: 'Action', label: 'Add job application',          action: () => jump('jobs')          },
      { k: 'new-opp',   type: 'Action', label: 'Track an opportunity',         action: () => jump('opportunities') },
      { k: 'new-note',  type: 'Action', label: 'Write a note in Vault',        action: () => jump('vault')         },
      { k: 'focus',     type: 'Action', label: 'Start a focus session',        action: () => jump('focus')         },
    ];

    const trimmed = q.trim();
    if (!trimmed) return base;

    const f = trimmed.toLowerCase();
    const matched = base.filter((i) => i.label.toLowerCase().includes(f));
    const hay = (...parts: Array<string | null | undefined>) => parts.join(' ').toLowerCase();

    const taskMatches: CmdItem[] = workspace.tasks
      .filter((task) => hay(task.title, task.subtitle, task.description, task.project?.name, task.priority, task.status).includes(f))
      .slice(0, 4)
      .flatMap((task) => [
        {
          k: `task-open-${task.id}`,
          type: 'Task' as const,
          label: task.title,
          detail: `${task.done ? 'Done' : task.status} · ${task.priority}${task.project ? ` · ${task.project.name}` : ''}`,
          action: () => openEntity('tasks', { type: 'task', id: task.id }),
        },
        {
          k: `task-toggle-${task.id}`,
          type: 'Action' as const,
          label: `${task.done ? 'Reopen' : 'Complete'} task: ${task.title}`,
          detail: task.project?.name ?? undefined,
          action: () => completeTask(task),
        },
      ]);

    const jobMatches: CmdItem[] = workspace.jobs
      .filter((job) => hay(job.company, job.role, job.stage, job.nextStep, job.notes, job.location).includes(f))
      .slice(0, 4)
      .flatMap((job) => [
        {
          k: `job-open-${job.id}`,
          type: 'Job' as const,
          label: `${job.company} · ${job.role}`,
          detail: `${job.stage}${job.nextStep ? ` · ${job.nextStep}` : ''}`,
          action: () => openEntity('jobs', { type: 'job', id: job.id }),
        },
        {
          k: `job-task-${job.id}`,
          type: 'Action' as const,
          label: `Create follow-up task for ${job.company}`,
          detail: job.nextStep ?? job.role,
          action: () => createJobTask(job),
        },
      ]);

    const opportunityMatches: CmdItem[] = workspace.opportunities
      .filter((opportunity) => hay(opportunity.title, opportunity.source, opportunity.desc, opportunity.reward, opportunity.state, opportunity.tags.join(' ')).includes(f))
      .slice(0, 4)
      .flatMap((opportunity) => [
        {
          k: `opp-open-${opportunity.id}`,
          type: 'Opp' as const,
          label: opportunity.title,
          detail: `${opportunity.source} · ${opportunity.state}${opportunity.score ? ` · ${opportunity.score}` : ''}`,
          action: () => openEntity('opportunities', { type: 'opportunity', id: opportunity.id }),
        },
        {
          k: `opp-task-${opportunity.id}`,
          type: 'Action' as const,
          label: `Create task from opportunity: ${opportunity.title}`,
          detail: opportunity.reward ?? opportunity.source,
          action: () => createOpportunityTask(opportunity),
        },
      ]);

    const noteMatches: CmdItem[] = workspace.notes
      .filter((note) => hay(note.title, note.content, note.tags.join(' ')).includes(f))
      .slice(0, 3)
      .map((note) => ({
        k: `note-open-${note.id}`,
        type: 'Note' as const,
        label: note.title,
        detail: note.tags.length ? note.tags.join(', ') : note.content.slice(0, 80),
        action: () => openEntity('vault', { type: 'note', id: note.id }),
      }));

    // Always prepend direct capture + "Ask AI" items when the user has typed something
    const taskItem: CmdItem = {
      k: 'create-task',
      type: 'Action',
      label: `Create task: "${trimmed}"`,
      action: () => createCapturedTask(trimmed),
    };
    const askItem: CmdItem = {
      k: 'ask-ai',
      type: 'AI',
      label: `Ask AI: "${trimmed}"`,
      action: () => askAI(trimmed),
    };
    return [taskItem, askItem, ...taskMatches, ...jobMatches, ...opportunityMatches, ...noteMatches, ...matched].slice(0, 18);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, workspace]);

  useEffect(() => {
    if (cmdOpen) {
      const timer = setTimeout(() => {
        setQ('');
        setCursor(0);
        inputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [cmdOpen]);

  useEffect(() => {
    if (!cmdOpen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoadingWorkspace(true);
      Promise.all([
        getTasksWithStats().catch(() => null),
        getJobs().catch(() => []),
        getOpportunities().catch(() => []),
        getNotes().catch(() => []),
      ]).then(([taskData, jobs, opportunities, notes]) => {
        if (cancelled) return;
        setWorkspace({
          tasks: taskData?.tasks ?? [],
          jobs,
          opportunities,
          notes,
        });
      }).finally(() => {
        if (!cancelled) setLoadingWorkspace(false);
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cmdOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setCursor(0), 0);
    return () => clearTimeout(timer);
  }, [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setCmdOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
    if (e.key === 'Enter' && items[cursor]) { items[cursor].action(); }
  };

  return (
    <Dialog.Root open={cmdOpen} onOpenChange={setCmdOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-scrim">
          <Dialog.Content className="cmd-modal" onKeyDown={onKeyDown} aria-label="Command palette">
            <div className="cmd-input-wrap">
              <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>⌕</span>
              <input
                ref={inputRef}
                className="cmd-input"
                placeholder="Jump to anything or ask AI…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <kbd>esc</kbd>
            </div>
            <ul className="cmd-list" role="listbox">
              {items.slice(0, 9).map((it, i) => (
                <li
                  key={it.k}
                  className={`cmd-item${i === cursor ? ' active' : ''}`}
                  role="option"
                  aria-selected={i === cursor}
                  onClick={() => { it.action(); setCmdOpen(false); }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className={`cmd-type${it.type === 'AI' ? ' ai' : ''}`}>
                    {it.type === 'AI' ? '✦' : it.type[0]}
                  </span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                    {it.detail ?? it.type}
                  </span>
                </li>
              ))}
              {items.length === 0 && (
                <li className="cmd-empty">Type anything — AI will answer it.</li>
              )}
            </ul>
            <footer className="cmd-foot">
              <span><kbd>↵</kbd> select</span>
              <span><kbd>↑↓</kbd> nav</span>
              <span><kbd>esc</kbd> close</span>
              <span style={{ marginLeft: 'auto' }}>{loadingWorkspace ? 'Indexing…' : '✦ Workspace ready'}</span>
            </footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
