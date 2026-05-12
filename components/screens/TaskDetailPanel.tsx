'use client';

import { useEffect, useRef, useState, useTransition, useCallback } from 'react';
import { X, Plus, Loader2, Trash2, Sparkles, BookOpen, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { Pill } from '@/components/ui';
import { updateTask, createSubtask, deleteTask, getTaskDetail } from '@/lib/actions/tasks';
import { createNote, getNotesForTask } from '@/lib/actions/notes';
import type { Task, Project, Note } from '@prisma/client';

type Priority = 'P0' | 'P1' | 'P2';
type TaskStatus = 'Todo' | 'InProgress' | 'Blocked' | 'Completed';

type SubtaskRow = Task & { project: Project | null; subtasks: Task[] };
type TaskDetail = Task & { project: Project | null; subtasks: SubtaskRow[] };

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

const QUICK_PROMPTS = [
  { label: 'How to approach?', prompt: 'What\'s the best way to approach this task? Give me a concrete plan.' },
  { label: 'Break into steps', prompt: 'Break this task into small, specific subtasks with time estimates.' },
  { label: 'Estimate effort', prompt: 'Estimate the effort and complexity for this task. What could go wrong?' },
  { label: 'Find blockers', prompt: 'What are the likely blockers or dependencies for this task?' },
  { label: 'Write a plan', prompt: 'Write a concise implementation plan I can follow right now.' },
];

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onTaskUpdated: (patch: { id: string } & Partial<Task>) => void;
  onTaskDeleted: (id: string) => void;
}

export function TaskDetailPanel({ taskId, onClose, onTaskUpdated, onTaskDeleted }: TaskDetailPanelProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [newSubtitle, setNewSubtitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [generatingSubtasks, setGeneratingSubtasks] = useState(false);
  const [, startTransition] = useTransition();

  // Learnings
  const [learnings, setLearnings] = useState<Note[]>([]);
  const [learningText, setLearningText] = useState('');
  const [savingLearning, setSavingLearning] = useState(false);

  // AI chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; id: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = useCallback(async (userContent: string) => {
    if (!userContent.trim() || chatLoading || !task) return;
    const userMsg = { role: 'user' as const, content: userContent, id: `u-${Date.now()}` };
    const assistantId = `a-${Date.now()}`;
    setChatMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', id: assistantId }]);
    setChatInput('');
    setChatLoading(true);

    const taskContext = {
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      project: task.project?.name,
      dueAt: task.dueAt?.toISOString(),
      subtasks: task.subtasks.map((s) => ({ title: s.title, done: s.done })),
    };

    try {
      const res = await fetch('/api/ai/task-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map(({ role, content }) => ({ role, content })),
          task: taskContext,
        }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setChatMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m)
        );
      }
    } catch {
      setChatMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: 'Failed to get response. Try again.' } : m)
      );
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, task, chatMessages]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        getTaskDetail(taskId),
        getNotesForTask(taskId),
      ]).then(([t, notes]) => {
        if (cancelled) return;
        if (t) {
          setTask(t as TaskDetail);
          setDescDraft(t.description ?? '');
        }
        setLearnings(notes);
        setLoading(false);
      });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [taskId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const saveDescription = async () => {
    if (!task) return;
    const val = descDraft.trim() || null;
    if (val === (task.description ?? null)) return;
    setSavingDesc(true);
    await updateTask(task.id, { description: val });
    setTask((t) => t ? { ...t, description: val } : t);
    onTaskUpdated({ id: task.id, description: val } as Parameters<typeof onTaskUpdated>[0]);
    setSavingDesc(false);
  };

  const cycleStatus = () => {
    if (!task) return;
    const next = STATUS_CYCLE[task.status as TaskStatus];
    setTask((t) => t ? { ...t, status: next, done: next === 'Completed' } : t);
    startTransition(() => updateTask(task.id, { status: next }));
    onTaskUpdated({ id: task.id, status: next, done: next === 'Completed' } as Parameters<typeof onTaskUpdated>[0]);
  };

  const cyclePriority = () => {
    if (!task) return;
    const next = PRIORITY_CYCLE[task.priority as Priority];
    setTask((t) => t ? { ...t, priority: next } : t);
    startTransition(() => updateTask(task.id, { priority: next }));
    onTaskUpdated({ id: task.id, priority: next } as Parameters<typeof onTaskUpdated>[0]);
  };

  const handleAddSubtask = async () => {
    if (!task || !newSubtitle.trim()) return;
    setAddingSubtask(true);
    const sub = await createSubtask(task.id, { title: newSubtitle.trim(), priority: task.priority as Priority });
    setTask((t) => t ? { ...t, subtasks: [...t.subtasks, sub as SubtaskRow] } : t);
    setNewSubtitle('');
    setAddingSubtask(false);
  };

  const handleGenerateSubtasks = async () => {
    if (!task || generatingSubtasks) return;
    setGeneratingSubtasks(true);
    try {
      const res = await fetch('/api/ai/subtasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          taskTitle: task.title,
          taskSubtitle: task.description ?? task.subtitle ?? undefined,
          project: task.project?.name,
        }),
      });
      const json = await res.json() as { subtasks?: Array<{ title: string; priority: Priority }>; error?: string };
      if (!res.ok || !json.subtasks?.length) throw new Error(json.error ?? 'No subtasks');
      const created: SubtaskRow[] = [];
      for (const subtask of json.subtasks) {
        const sub = await createSubtask(task.id, {
          title: subtask.title,
          priority: subtask.priority,
        });
        created.push(sub as SubtaskRow);
      }
      setTask((t) => t ? { ...t, subtasks: [...t.subtasks, ...created] } : t);
    } catch {
      /* The AI endpoint already reports missing keys/rate limits; keep the panel usable. */
    } finally {
      setGeneratingSubtasks(false);
    }
  };

  const handleDeleteSubtask = (subId: string) => {
    setTask((t) => t ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t);
    startTransition(() => deleteTask(subId));
  };

  const handleToggleSubtask = (subId: string) => {
    const sub = task?.subtasks.find((s) => s.id === subId);
    if (!sub) return;
    const nextDone = !sub.done;
    setTask((t) => {
      if (!t) return t;
      return { ...t, subtasks: t.subtasks.map((s) => s.id === subId ? { ...s, done: nextDone, status: (nextDone ? 'Completed' : 'Todo') as TaskStatus } : s) };
    });
    startTransition(() => updateTask(subId, { status: nextDone ? 'Completed' : 'Todo' }));
  };

  const handleSaveLearning = async () => {
    if (!task || !learningText.trim()) return;
    setSavingLearning(true);
    try {
      const note = await createNote({
        title: `Learning: ${task.title}`,
        content: learningText.trim(),
        tags: ['learning'],
        links: [task.id],
      });
      setLearnings((prev) => [note, ...prev]);
      setLearningText('');
    } finally {
      setSavingLearning(false);
    }
  };

  const handleDelete = () => {
    if (!task) return;
    if (!confirm('Delete this task and all its subtasks?')) return;
    onTaskDeleted(task.id);
    onClose();
    startTransition(() => deleteTask(task.id));
  };

  const sendQuickPrompt = (prompt: string) => {
    setChatOpen(true);
    sendMessage(prompt);
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
        width: 500, background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>Task detail</div>
          <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', opacity: 0.7, padding: '3px 6px', borderRadius: 4 }} title="Delete task">
            <Trash2 size={13} />
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '3px 6px', borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>

        {loading || !task ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={18} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Title */}
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>{task.title}</div>
              {task.subtitle && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>{task.subtitle}</div>}
            </div>

            {/* Meta pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={cycleStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Click to cycle status">
                <Pill tone={STATUS_TONE[task.status as TaskStatus]}>{STATUS_LABEL[task.status as TaskStatus]}</Pill>
              </button>
              <button onClick={cyclePriority} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Click to cycle priority">
                <Pill tone={PRIORITY_TONE[task.priority as Priority]}>{task.priority as Priority}</Pill>
              </button>
              {task.project && (
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '2px 8px' }}>
                  {task.project.name}
                </span>
              )}
              {task.dueAt && (
                <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '2px 8px' }}>
                  Due {new Date(task.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            {/* Description */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={saveDescription}
                placeholder="Add notes, context, links… (saves on blur)"
                rows={5}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text)', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; }}
              />
              {savingDesc && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Saving…</div>}
            </div>

            {/* Subtasks */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                Subtasks
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 4, padding: '1px 5px' }}>
                  {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto', gap: 5, fontSize: 10.5, textTransform: 'none', letterSpacing: 0 }}
                  onClick={handleGenerateSubtasks}
                  disabled={generatingSubtasks}
                >
                  {generatingSubtasks ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={10} />}
                  {generatingSubtasks ? 'Planning…' : 'Plan'}
                </button>
              </div>

              {task.subtasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                  {task.subtasks.map((sub) => (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--border-soft)' }}>
                      <button
                        onClick={() => handleToggleSubtask(sub.id)}
                        style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${sub.done ? 'var(--success)' : 'var(--border)'}`, background: sub.done ? 'var(--success)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}
                      >
                        {sub.done ? '✓' : ''}
                      </button>
                      <span style={{ flex: 1, fontSize: 12.5, color: sub.done ? 'var(--text-faint)' : 'var(--text-dim)', textDecoration: sub.done ? 'line-through' : 'none' }}>{sub.title}</span>
                      <Pill tone={PRIORITY_TONE[sub.priority as Priority]}>{sub.priority as Priority}</Pill>
                      <button onClick={() => handleDeleteSubtask(sub.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 2, opacity: 0.6 }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newSubtitle}
                  onChange={(e) => setNewSubtitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(); }}
                  placeholder="Add a subtask…"
                  style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                />
                <button className="btn btn-ghost btn-sm" onClick={handleAddSubtask} disabled={addingSubtask || !newSubtitle.trim()} style={{ flexShrink: 0, gap: 4 }}>
                  {addingSubtask ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                </button>
              </div>
            </div>

            {/* ── Learnings ── */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={11} />
                Learnings
                {learnings.length > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 4, padding: '1px 5px' }}>
                    {learnings.length}
                  </span>
                )}
              </div>

              {learnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {learnings.map((note) => (
                    <div key={note.id} style={{ padding: '8px 12px', background: 'color-mix(in oklch, var(--success) 6%, transparent)', border: '1px solid color-mix(in oklch, var(--success) 20%, transparent)', borderRadius: 7 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{note.content}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
                        <span style={{ color: 'var(--success)', opacity: 0.8 }}>saved to vault</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                value={learningText}
                onChange={(e) => setLearningText(e.target.value)}
                placeholder="What did you learn from this task? Mistakes, solutions, insights…"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--success) 60%, transparent)'; }}
                onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; }}
              />
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6, gap: 5, fontSize: 11.5 }}
                onClick={handleSaveLearning}
                disabled={savingLearning || !learningText.trim()}
              >
                {savingLearning ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <BookOpen size={10} />}
                {savingLearning ? 'Saving…' : 'Save to vault'}
              </button>
            </div>

            {/* ── AI Discussion ── */}
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
              <button
                onClick={() => setChatOpen((v) => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px', color: 'var(--text-dim)' }}
              >
                <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, textAlign: 'left' }}>Discuss with AI</span>
                {chatMessages.length > 0 && (
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>{Math.floor(chatMessages.length / 2)} exchange{Math.floor(chatMessages.length / 2) !== 1 ? 's' : ''}</span>
                )}
                {chatOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {/* Quick-action chips — always visible */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: chatOpen ? 12 : 0 }}>
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '3px 9px', gap: 4 }}
                    onClick={() => sendQuickPrompt(q.prompt)}
                    disabled={chatLoading}
                  >
                    <Sparkles size={9} style={{ color: 'var(--accent)' }} />
                    {q.label}
                  </button>
                ))}
              </div>

              {chatOpen && (
                <div style={{ marginTop: 4 }}>
                  {/* Messages */}
                  {chatMessages.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10, maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
                      {chatMessages.map((m) => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8 }}>
                          <div style={{
                            maxWidth: '85%', padding: '8px 12px',
                            borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            background: m.role === 'user' ? 'color-mix(in oklch, var(--accent) 15%, transparent)' : 'var(--bg-2)',
                            border: `1px solid ${m.role === 'user' ? 'color-mix(in oklch, var(--accent) 30%, transparent)' : 'var(--border-soft)'}`,
                            fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                          }}>
                            {m.content || (m.role === 'assistant' && chatLoading
                              ? <Loader2 size={13} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
                              : null)}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}

                  {/* Input */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
                      placeholder="Ask anything about this task…"
                      disabled={chatLoading}
                      style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => sendMessage(chatInput)}
                      disabled={chatLoading || !chatInput.trim()}
                      style={{ flexShrink: 0, gap: 4 }}
                    >
                      {chatLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer meta */}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', paddingTop: 4, borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 16 }}>
              <span>Created {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span>Updated {new Date(task.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>

          </div>
        )}
      </div>
    </>
  );
}
