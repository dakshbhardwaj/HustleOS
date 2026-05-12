'use client';

import { useState, useTransition, useOptimistic, useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronRight, X, FolderPlus, Trash2, ChevronUp } from 'lucide-react';
import { ScreenHeader, Pill } from '@/components/ui';
import { toggleTask, createTask, getProjects, createProject, updateTask, deleteTask } from '@/lib/actions/tasks';
import { TaskDetailPanel } from '@/components/screens/TaskDetailPanel';
import { formatTaskDueLabel, parseTaskCapture } from '@/lib/task-capture';
import { useAppStore } from '@/lib/store';
import type { Task, Project } from '@prisma/client';

type Priority = 'P0' | 'P1' | 'P2';
type TaskStatus = 'Todo' | 'InProgress' | 'Blocked' | 'Completed';

interface NewTaskForm {
  title: string;
  priority: Priority;
  dueAt: string;
  projectId: string;
}
const EMPTY_FORM: NewTaskForm = { title: '', priority: 'P1', dueAt: '', projectId: '' };

type TaskWithProject = Task & { project: Project | null; subtasks: Task[] };
type TabKey = 'all' | 'today' | 'inprogress' | 'blocked' | 'ai';
type SortKey = 'priority' | 'due' | 'status' | 'none';

const PRIORITY_ORDER: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };
const STATUS_ORDER: Record<TaskStatus, number> = { Blocked: 0, InProgress: 1, Todo: 2, Completed: 3 };

const PRIORITY_TONE = { P0: 'danger', P1: 'warn', P2: 'neutral' } as const;
const STATUS_TONE: Record<TaskStatus, 'neutral' | 'accent' | 'danger'> = {
  Todo: 'neutral', InProgress: 'accent', Blocked: 'danger', Completed: 'neutral',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  Todo: 'Todo', InProgress: 'In Progress', Blocked: 'Blocked', Completed: 'Done',
};
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  Todo: 'InProgress', InProgress: 'Blocked', Blocked: 'Completed', Completed: 'Todo',
};
const PRIORITY_CYCLE: Record<Priority, Priority> = { P0: 'P1', P1: 'P2', P2: 'P0' };

function formatDue(d: Date | null): string {
  if (!d) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).getTime() - today.getTime()) / 86400_000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return 'Tomorrow';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (diff < 7) return days[new Date(d).getDay()];
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc
    ? <ChevronUp size={10} style={{ display: 'inline', marginLeft: 2 }} />
    : <ChevronDown size={10} style={{ display: 'inline', marginLeft: 2 }} />;
}

interface TaskRowProps {
  task: TaskWithProject;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onStatusCycle: (id: string, next: TaskStatus) => void;
  onPriorityCycle: (id: string, next: Priority) => void;
  onTitleSave: (id: string, title: string) => void;
  onOpenDetail: (id: string) => void;
}

function TaskRow({ task, onToggle, onDelete, onStatusCycle, onPriorityCycle, onTitleSave, onOpenDetail }: TaskRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [hovered, setHovered] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isDone = task.done || task.status === 'Completed';
  const status = task.status as TaskStatus;
  const priority = task.priority as Priority;
  const subtaskCount = task.subtasks?.length ?? 0;
  const doneSubtaskCount = task.subtasks?.filter((s) => s.done).length ?? 0;

  const commitTitle = () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft.trim() !== task.title) {
      onTitleSave(task.id, titleDraft.trim());
    } else {
      setTitleDraft(task.title);
    }
  };

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  return (
    <tr
      className={isDone ? 'row-done' : ''}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Check */}
      <td style={{ width: 40, paddingLeft: 16 }}>
        <button className={`check${isDone ? ' done' : ''}`} onClick={() => onToggle(task.id)}>
          {isDone ? '✓' : ''}
        </button>
      </td>

      {/* Title */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); } }}
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
            />
          ) : (
            <span
              style={isDone ? { textDecoration: 'line-through', color: 'var(--text-faint)', fontWeight: 500, cursor: 'text' } : { fontWeight: 500, cursor: 'text' }}
              onDoubleClick={() => { setEditingTitle(true); setTitleDraft(task.title); }}
              title="Double-click to edit · click row to open detail"
            >
              {task.title}
            </span>
          )}
          {task.aiSuggested && <span style={{ color: 'var(--accent)', fontSize: 11 }}>✦</span>}
          {task.description && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }} title="Has description">¶</span>
          )}
        </div>
        {task.subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{task.subtitle}</div>}
        {subtaskCount > 0 && (
          <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: `${Math.round((doneSubtaskCount / subtaskCount) * 36)}px`, height: 2, background: 'var(--accent)', borderRadius: 2, transition: 'width 200ms', minWidth: 2 }} />
            <span style={{ display: 'inline-block', width: `${Math.round(((subtaskCount - doneSubtaskCount) / subtaskCount) * 36)}px`, height: 2, background: 'var(--border)', borderRadius: 2 }} />
            <span>{doneSubtaskCount}/{subtaskCount} subtasks</span>
          </div>
        )}
      </td>

      {/* Status */}
      <td>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '2px 0' }}
          onClick={() => onStatusCycle(task.id, STATUS_CYCLE[status])}
          title={`Click to change status (currently ${STATUS_LABEL[status]})`}
        >
          <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
        </button>
      </td>

      {/* Priority */}
      <td>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: '2px 0' }}
          onClick={() => onPriorityCycle(task.id, PRIORITY_CYCLE[priority])}
          title="Click to cycle priority"
        >
          <Pill tone={PRIORITY_TONE[priority]}>{priority}</Pill>
        </button>
      </td>

      {/* Project */}
      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        {task.project?.name ?? '—'}
      </td>

      {/* Due */}
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
        {formatDue(task.dueAt)}
      </td>

      {/* Actions */}
      <td style={{ paddingRight: 16, width: 130 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onOpenDetail(task.id)}
            title="Open task detail"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 1, fontSize: 11.5 }}
          >
            <ChevronRight size={12} />
            Open
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '3px 5px', color: 'var(--danger)', opacity: hovered ? 1 : 0, transition: 'opacity 120ms' }}
            onClick={() => onDelete(task.id)}
            title="Delete task"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface TasksScreenProps {
  tasks: TaskWithProject[];
  todayTasks: TaskWithProject[];
  blocked: TaskWithProject[];
  inProgress: TaskWithProject[];
  aiSuggested: TaskWithProject[];
}

export function TasksScreen({ tasks, todayTasks, inProgress, blocked, aiSuggested }: TasksScreenProps) {
  const showToast = useAppStore((s) => s.showToast);
  const selectedEntity = useAppStore((s) => s.selectedEntity);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortAsc, setSortAsc] = useState(true);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<NewTaskForm>(EMPTY_FORM);
  const [saving, startSave] = useTransition();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEntity?.type !== 'task') return;
    const timer = setTimeout(() => {
      setActiveTab('all');
      setDetailTaskId(selectedEntity.id);
      setSelectedEntity(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedEntity, setSelectedEntity]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  const [optimisticTasks, applyOptimistic] = useOptimistic(
    tasks,
    (state, patch: { id: string } & Partial<TaskWithProject>) =>
      state.map((t) => t.id === patch.id ? { ...t, ...patch } : t),
  );
  const [, startTransition] = useTransition();

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [pendingTasks, setPendingTasks] = useState<TaskWithProject[]>([]);

  const settledTaskTitles = new Set(tasks.map((t) => t.title));
  const unsettledPendingTasks = pendingTasks.filter((p) => !settledTaskTitles.has(p.title));
  const allTasks = [...optimisticTasks, ...unsettledPendingTasks];
  const visibleTasks = allTasks.filter((t) => !deletedIds.has(t.id));

  const tabMap: Record<TabKey, TaskWithProject[]> = {
    all:        visibleTasks,
    today:      todayTasks.map((t) => allTasks.find((o) => o.id === t.id) ?? t).filter((t) => !deletedIds.has(t.id)),
    inprogress: inProgress.map((t) => allTasks.find((o) => o.id === t.id) ?? t).filter((t) => !deletedIds.has(t.id)),
    blocked:    blocked.map((t) => allTasks.find((o) => o.id === t.id) ?? t).filter((t) => !deletedIds.has(t.id)),
    ai:         aiSuggested.map((t) => allTasks.find((o) => o.id === t.id) ?? t).filter((t) => !deletedIds.has(t.id)),
  };

  const sorted = [...tabMap[activeTab]].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'priority') cmp = PRIORITY_ORDER[a.priority as Priority] - PRIORITY_ORDER[b.priority as Priority];
    else if (sortKey === 'due') {
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      cmp = da - db;
    } else if (sortKey === 'status') {
      cmp = STATUS_ORDER[a.status as TaskStatus] - STATUS_ORDER[b.status as TaskStatus];
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleToggle = (id: string) => {
    startTransition(async () => {
      const t = optimisticTasks.find((x) => x.id === id);
      if (!t) return;
      applyOptimistic({ id, done: !t.done, status: (!t.done ? 'Completed' : 'Todo') as TaskWithProject['status'] });
      await toggleTask(id);
    });
  };

  const handleStatusCycle = (id: string, next: TaskStatus) => {
    startTransition(async () => {
      applyOptimistic({ id, status: next as TaskWithProject['status'], done: next === 'Completed' });
      await updateTask(id, { status: next, ...(next === 'Completed' ? { } : {}) });
    });
  };

  const handlePriorityCycle = (id: string, next: Priority) => {
    startTransition(async () => {
      applyOptimistic({ id, priority: next as TaskWithProject['priority'] });
      await updateTask(id, { priority: next });
    });
  };

  const handleTitleSave = (id: string, title: string) => {
    startTransition(async () => {
      applyOptimistic({ id, title });
      await updateTask(id, { title });
    });
  };

  const handleDelete = (id: string) => {
    setDeletedIds((prev) => new Set([...prev, id]));
    if (detailTaskId === id) setDetailTaskId(null);
    startTransition(async () => { await deleteTask(id); });
  };

  const handleTaskUpdatedFromPanel = (patch: { id: string } & Partial<TaskWithProject>) => {
    applyOptimistic(patch);
  };

  const handleCreateTask = () => {
    if (!newForm.title.trim()) return;

    const { priority, dueAt, projectId } = newForm;
    const parsed = parseTaskCapture(newForm.title);
    const title = parsed.title || newForm.title.trim();
    const resolvedPriority = parsed.priority ?? priority;
    const resolvedDueAt = dueAt ? new Date(dueAt) : parsed.dueAt;
    const project = projects.find((p) => p.id === projectId) ?? null;
    const optId = `pending-${Date.now()}`;

    const optimistic: TaskWithProject = {
      id: optId,
      title,
      subtitle: null,
      description: null,
      priority: resolvedPriority as TaskWithProject['priority'],
      status: 'Todo' as TaskWithProject['status'],
      done: false,
      dueAt: resolvedDueAt ?? null,
      projectId: projectId || null,
      project,
      userId: '',
      aiSuggested: false,
      parentId: null,
      subtasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setPendingTasks((prev) => [...prev, optimistic]);
    setNewForm(EMPTY_FORM);
    setShowNew(false);

    startSave(async () => {
      try {
        const task = await createTask({ title, priority: resolvedPriority, dueAt: resolvedDueAt, projectId: projectId || undefined });
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        setPendingTasks((prev) => prev.filter((t) => t.id !== optId));
        showToast('Could not create task', 'info');
      }
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    startSave(async () => {
      const proj = await createProject({ name: newProjectName.trim() });
      setProjects((prev) => [...prev, proj].sort((a, b) => a.name.localeCompare(b.name)));
      setNewForm((f) => ({ ...f, projectId: proj.id }));
      setNewProjectName('');
      setShowNewProject(false);
    });
  };

  const cycleSortKey = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
    setShowSortMenu(false);
  };

  const TABS: { key: TabKey; label: string; count: number; ai?: boolean }[] = [
    { key: 'all',        label: 'All',          count: visibleTasks.length },
    { key: 'today',      label: 'Today',        count: tabMap.today.length },
    { key: 'inprogress', label: 'In progress',  count: tabMap.inprogress.length },
    { key: 'blocked',    label: 'Blocked',      count: tabMap.blocked.length },
    { key: 'ai',         label: 'AI suggested', count: tabMap.ai.length, ai: true },
  ];

  const openCount = visibleTasks.filter((t) => !t.done).length;
  const doneCount = visibleTasks.filter((t) => t.done).length;
  const parsedNewTask = parseTaskCapture(newForm.title);

  return (
    <div className="screen">
      <ScreenHeader
        title="Tasks"
        subtitle={`${openCount} open · ${doneCount} completed`}
        actions={
          <>
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost"
                style={{ gap: 6 }}
                onClick={() => setShowSortMenu((v) => !v)}
              >
                Sort: {sortKey === 'none' ? 'None' : sortKey.charAt(0).toUpperCase() + sortKey.slice(1)}
                {sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showSortMenu && (
                <div
                  style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 0', zIndex: 50, minWidth: 140, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
                  onMouseLeave={() => setShowSortMenu(false)}
                >
                  {(['priority', 'due', 'status', 'none'] as SortKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => cycleSortKey(k)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: sortKey === k ? 'var(--accent)' : 'var(--text-dim)', textAlign: 'left' }}
                    >
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                      <SortIcon active={sortKey === k} asc={sortAsc} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => setShowNew(true)}>
              <Plus size={13} /> New task
            </button>
          </>
        }
      />

      {/* New Task Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNew(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>New task</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }} onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Title</label>
              <input
                autoFocus
                value={newForm.title}
                onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                placeholder="What needs to get done?"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
              {(parsedNewTask.priority || parsedNewTask.dueAt) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {parsedNewTask.priority && <span>{parsedNewTask.priority}</span>}
                  {parsedNewTask.dueAt && <span>due {formatTaskDueLabel(parsedNewTask.dueAt)}</span>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Priority</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['P0', 'P1', 'P2'] as Priority[]).map((p) => (
                    <button key={p} onClick={() => setNewForm((f) => ({ ...f, priority: p }))}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${newForm.priority === p ? 'var(--accent)' : 'var(--border-soft)'}`, background: newForm.priority === p ? 'color-mix(in oklch, var(--accent) 15%, transparent)' : 'var(--surface)', color: newForm.priority === p ? 'var(--accent)' : 'var(--text-faint)' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Due date</label>
                <input type="date" value={newForm.dueAt} onChange={(e) => setNewForm((f) => ({ ...f, dueAt: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 6 }}>Project</label>
              {showNewProject ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input autoFocus value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); } }}
                    placeholder="Project name…"
                    style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }} />
                  <button className="btn btn-primary btn-sm" onClick={handleCreateProject} disabled={saving || !newProjectName.trim()}>Create</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowNewProject(false); setNewProjectName(''); }}><X size={12} /></button>
                </div>
              ) : projects.length === 0 ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowNewProject(true)}
                  style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 12, border: '1px dashed var(--border-soft)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-faint)' }}
                >
                  <FolderPlus size={13} /> Create your first project
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select value={newForm.projectId} onChange={(e) => setNewForm((f) => ({ ...f, projectId: e.target.value }))}
                    style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }}>
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" title="New project" onClick={() => setShowNewProject(true)} style={{ flexShrink: 0 }}>
                    <FolderPlus size={13} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreateTask} disabled={saving || !newForm.title.trim()}>
                {saving ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden' }}>
        <div className="tabs" style={{ padding: '0 8px' }}>
          {TABS.map((tab) => (
            <button key={tab.key} className={`tab${activeTab === tab.key ? ' active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              {tab.ai && <span style={{ color: 'var(--accent)', fontSize: 11 }}>✦</span>}
              {tab.label}
              <span className="tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <table className="t-table">
          <thead>
            <tr>
              <th style={{ width: 40, paddingLeft: 16 }} />
              <th>Task</th>
              <th style={{ width: 120, cursor: 'pointer' }} onClick={() => cycleSortKey('status')}>
                Status <SortIcon active={sortKey === 'status'} asc={sortAsc} />
              </th>
              <th style={{ width: 80, cursor: 'pointer' }} onClick={() => cycleSortKey('priority')}>
                Priority <SortIcon active={sortKey === 'priority'} asc={sortAsc} />
              </th>
              <th style={{ width: 150 }}>Project</th>
              <th style={{ width: 90, cursor: 'pointer' }} onClick={() => cycleSortKey('due')}>
                Due <SortIcon active={sortKey === 'due'} asc={sortAsc} />
              </th>
              <th style={{ width: 130, paddingRight: 16 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  ✦ No tasks here. Enjoy the quiet.
                </td>
              </tr>
            ) : (
              sorted.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onStatusCycle={handleStatusCycle}
                  onPriorityCycle={handlePriorityCycle}
                  onTitleSave={handleTitleSave}
                  onOpenDetail={setDetailTaskId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', paddingLeft: 4 }}>
        Double-click a title to edit · click status or priority pill to cycle · Open to view detail &amp; subtasks
      </div>

      {detailTaskId && (
        <TaskDetailPanel
          taskId={detailTaskId}
          onClose={() => setDetailTaskId(null)}
          onTaskUpdated={handleTaskUpdatedFromPanel}
          onTaskDeleted={handleDelete}
        />
      )}
    </div>
  );
}
