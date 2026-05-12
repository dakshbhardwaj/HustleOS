'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, ExternalLink, Loader2, Pencil, X, Save, MessageSquare, CheckSquare } from 'lucide-react';
import { ScreenHeader, Pill, EmptyState } from '@/components/ui';
import { getJobs, updateJobStage, createJob, deleteJob, updateJob } from '@/lib/actions/jobs';
import { createTaskFromJobNextStep } from '@/lib/actions/tasks';
import { useAppStore } from '@/lib/store';
import type { Tone } from '@/types';
import type { Job as DBJob, JobStage } from '@prisma/client';

type Stage = JobStage;

const STAGE_TONE: Record<Stage, Tone> = {
  Wishlist:  'neutral',
  Applied:   'neutral',
  OA:        'warn',
  Interview: 'accent',
  Offer:     'success',
  Rejected:  'danger',
};

const STAGES: Stage[] = ['Wishlist', 'Applied', 'OA', 'Interview', 'Offer', 'Rejected'];

// Score ring SVG
function ScoreRing({ score }: { score: number }) {
  const r = 14, circ = 2 * Math.PI * r;
  const fill = score >= 85 ? 'var(--success)' : score >= 70 ? 'var(--accent)' : 'var(--warn)';
  return (
    <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-soft)" strokeWidth="3.5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={fill} strokeWidth="3.5"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 18 18)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: fill }}>
        {score}
      </div>
    </div>
  );
}

function JobCard({ job, highlighted, onDelete, onUpdate, onPrep, onTask }: { job: DBJob; highlighted: boolean; onDelete: (id: string) => void; onUpdate: (id: string, patch: Partial<DBJob>) => void; onPrep: () => void; onTask: (job: DBJob) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ nextStep: job.nextStep ?? '', notes: job.notes ?? '', salary: job.salary ?? '', location: job.location ?? '' });
  const [, startSave] = useTransition();

  const openEdit = (e: React.MouseEvent) => { e.stopPropagation(); setDraft({ nextStep: job.nextStep ?? '', notes: job.notes ?? '', salary: job.salary ?? '', location: job.location ?? '' }); setEditing(true); };

  const save = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(false);
    const patch = { nextStep: draft.nextStep || null, notes: draft.notes || null, salary: draft.salary || null, location: draft.location || null };
    onUpdate(job.id, patch as Partial<DBJob>);
    startSave(async () => { await updateJob(job.id, { nextStep: draft.nextStep || undefined, notes: draft.notes || undefined, salary: draft.salary || undefined, location: draft.location || undefined }); });
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        outline: highlighted ? '2px solid var(--accent)' : undefined,
        boxShadow: highlighted ? '0 0 0 4px color-mix(in oklch, var(--accent) 18%, transparent)' : undefined,
      }}
      className="job-card"
      {...attributes} {...listeners}
    >
      <div className="job-card-top">
        <div className="job-card-logo">{job.company[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="job-card-company">{job.company}</div>
          <div className="job-card-role">{job.role}</div>
        </div>
        {job.match > 0 && <ScoreRing score={job.match} />}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
          {[
            { key: 'nextStep', label: '→ Next step', placeholder: 'e.g. Follow up Monday' },
            { key: 'salary',   label: '$ Salary',    placeholder: 'e.g. $180k' },
            { key: 'location', label: '📍 Location',  placeholder: 'e.g. Remote / NYC' },
            { key: 'notes',    label: '📝 Notes',     placeholder: 'Any context…' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
              <input
                value={(draft as Record<string, string>)[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                placeholder={placeholder}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 4, padding: '4px 7px', fontSize: 11.5, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setEditing(false); }}><X size={11} /></button>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 11, gap: 4 }} onClick={save}><Save size={11} /> Save</button>
          </div>
        </div>
      ) : (
        <>
          <div className="job-card-meta">
            {job.salary && <span>{job.salary}</span>}
            {job.location && <><span>·</span><span>{job.location}</span></>}
            {job.appliedAt && <><span>·</span><span>{new Date(job.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
          </div>
          {job.nextStep && (
            <div className="job-card-next"><span>→</span>{job.nextStep}</div>
          )}
          {job.notes && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
              {job.notes}
            </div>
          )}
        </>
      )}

      <div className="job-card-footer">
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-faint)' }} onClick={(e) => e.stopPropagation()}>
              <ExternalLink size={12} />
            </a>
          )}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px' }} onClick={openEdit} title="Edit">
            <Pencil size={11} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10, padding: '1px 6px', gap: 3 }}
            onClick={(e) => { e.stopPropagation(); onTask(job); }}
            title="Create next-action task"
          >
            <CheckSquare size={10} /> Task
          </button>
          {(job.stage === 'Interview' || job.stage === 'OA') && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 10, padding: '1px 6px', color: 'var(--accent)', gap: 3 }}
              onClick={(e) => { e.stopPropagation(); onPrep(); }}
              title="Go to Interview Prep"
            >
              <MessageSquare size={10} /> Prep →
            </button>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px', color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}>
          ×
        </button>
      </div>
    </div>
  );
}

interface AddJobForm { company: string; role: string; salary: string; location: string; url: string; stage: Stage }
const EMPTY_FORM: AddJobForm = { company: '', role: '', salary: '', location: '', url: '', stage: 'Wishlist' };

export function JobsScreen() {
  const setActive = useAppStore((s) => s.setActive);
  const showToast = useAppStore((s) => s.showToast);
  const selectedEntity = useAppStore((s) => s.selectedEntity);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const [jobs, setJobs] = useState<DBJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<DBJob | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddJobForm>(EMPTY_FORM);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    getJobs().then(setJobs).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedEntity?.type !== 'job') return;
    const timer = setTimeout(() => {
      setHighlightedJobId(selectedEntity.id);
      setSelectedEntity(null);
    }, 0);
    const clearTimer = setTimeout(() => setHighlightedJobId(null), 3500);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [selectedEntity, setSelectedEntity]);

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging(jobs.find((j) => j.id === active.id) ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const destStage = over.id as Stage;
    if (!STAGES.includes(destStage)) return;
    const job = jobs.find((j) => j.id === active.id);
    if (!job || job.stage === destStage) return;
    setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, stage: destStage } : j));
    startSave(async () => { await updateJobStage(job.id, destStage); });
  };

  const handleAdd = () => {
    if (!form.company.trim() || !form.role.trim()) return;
    startSave(async () => {
      const job = await createJob({
        company: form.company.trim(),
        role: form.role.trim(),
        stage: form.stage,
        salary: form.salary || undefined,
        location: form.location || undefined,
        url: form.url || undefined,
      });
      setJobs((prev) => [job, ...prev]);
      setForm(EMPTY_FORM);
      setShowAdd(false);
    });
  };

  const handleDelete = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    startSave(async () => { await deleteJob(id); });
  };

  const handleUpdate = (id: string, patch: Partial<DBJob>) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, ...patch } : j));
  };

  const handleCreateTask = (job: DBJob) => {
    startSave(async () => {
      try {
        const task = await createTaskFromJobNextStep(job.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create job task', 'info');
      }
    });
  };

  if (loading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const byStage = (stage: Stage) => jobs.filter((j) => j.stage === stage);

  return (
    <div className="screen">
      <ScreenHeader
        title="Jobs"
        subtitle={`${jobs.length} application${jobs.length !== 1 ? 's' : ''} tracked`}
        actions={
          <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setShowAdd(true)}>
            <Plus size={13} /> Add job
          </button>
        }
      />

      {/* Add job modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 400, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add job</div>
            {(['company', 'role', 'salary', 'location', 'url'] as const).map((field) => (
              <div key={field}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>{field}</label>
                <input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={field === 'url' ? 'https://…' : field === 'salary' ? '$120k–160k' : ''}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as Stage }))}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
              >
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !form.company.trim() || !form.role.trim()}>
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon="💼"
          title="No jobs tracked yet"
          subtitle="Add your first job application to start tracking your pipeline."
          action={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={12} /> Add job</button>}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="kanban-board" style={{ overflowX: 'auto' }}>
            {STAGES.map((stage) => {
              const stageJobs = byStage(stage);
              return (
                <div key={stage} id={stage} className="kanban-col" style={{ minWidth: 210 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Pill tone={STAGE_TONE[stage]}>{stage}</Pill>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{stageJobs.length}</span>
                    </div>
                  </div>
                  <SortableContext items={stageJobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
                    <div className="kanban-cards" style={{ minHeight: 80 }}>
                      {stageJobs.length === 0 ? (
                        <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', borderRadius: 6, border: '1px dashed var(--border-soft)', margin: '0 8px' }}>
                          Drop here
                        </div>
                      ) : (
                        stageJobs.map((job) => <JobCard key={job.id} job={job} highlighted={highlightedJobId === job.id} onDelete={handleDelete} onUpdate={handleUpdate} onPrep={() => setActive('interview')} onTask={handleCreateTask} />)
                      )}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </div>
          <DragOverlay>
            {dragging && (
              <div className="job-card" style={{ opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', cursor: 'grabbing' }}>
                <div className="job-card-company">{dragging.company}</div>
                <div className="job-card-role">{dragging.role}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
