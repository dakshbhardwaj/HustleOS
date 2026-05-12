'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { Plus, ExternalLink, Loader2, Trash2, Pencil, X, Sparkles, RefreshCw, CheckSquare } from 'lucide-react';
import { ScreenHeader, Pill, EmptyState } from '@/components/ui';
import { getOpportunities, createOpportunity, updateOpportunityState, updateOpportunity, deleteOpportunity } from '@/lib/actions/opportunities';
import { createTaskFromOpportunity } from '@/lib/actions/tasks';
import { useAppStore } from '@/lib/store';
import type { Opportunity } from '@prisma/client';

const STATES = ['New', 'Interested', 'Applied', 'Won', 'Passed'];

const STATE_TONE: Record<string, 'neutral' | 'accent' | 'warn' | 'success' | 'danger'> = {
  New:        'neutral',
  Interested: 'accent',
  Applied:    'warn',
  Won:        'success',
  Passed:     'danger',
};

function ScoreRing({ score }: { score: number }) {
  const r = 18, circ = 2 * Math.PI * r;
  const fill = score >= 85 ? 'var(--success)' : score >= 70 ? 'var(--accent)' : 'var(--warn)';
  return (
    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--border-soft)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={fill} strokeWidth="4"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 22 22)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: fill }}>
        {score}
      </div>
    </div>
  );
}

interface AddForm {
  source: string; title: string; desc: string;
  reward: string; tags: string; url: string; score: string;
}
const EMPTY: AddForm = { source: '', title: '', desc: '', reward: '', tags: '', url: '', score: '' };

interface EditForm {
  title: string; desc: string; reward: string;
  tags: string; url: string; score: string; dueAt: string;
}

export function OpportunitiesScreen() {
  const showToast = useAppStore((s) => s.showToast);
  const selectedEntity = useAppStore((s) => s.selectedEntity);
  const setSelectedEntity = useAppStore((s) => s.setSelectedEntity);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Opportunity | null>(null);
  const [form, setForm] = useState<AddForm>(EMPTY);
  const [editForm, setEditForm] = useState<EditForm>({ title: '', desc: '', reward: '', tags: '', url: '', score: '', dueAt: '' });
  const [saving, startSave] = useTransition();
  const [scoring, setScoring] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('opps_last_synced') : null
  );

  useEffect(() => {
    getOpportunities().then(setOpps).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedEntity?.type !== 'opportunity') return;
    const timer = setTimeout(() => {
      setStateFilter(null);
      setExpandedId(selectedEntity.id);
      setSelectedEntity(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedEntity, setSelectedEntity]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/sync/opportunities', { method: 'POST' });
      const data = await res.json() as { added?: number; skipped?: number; errors?: number; error?: string };
      if (!res.ok) {
        setSyncMsg(data.error ?? 'Sync failed');
        return;
      }
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSynced(ts);
      localStorage.setItem('opps_last_synced', ts);
      setSyncMsg(`+${data.added ?? 0} new · ${data.skipped ?? 0} skipped`);
      // Reload opportunities to show newly added ones
      const fresh = await getOpportunities();
      setOpps(fresh);
    } catch {
      setSyncMsg('Network error — try again');
    } finally {
      setSyncing(false);
    }
  }, []);

  const filtered = stateFilter ? opps.filter((o) => o.state === stateFilter) : opps;

  const cycleState = (opp: Opportunity) => {
    const idx = STATES.indexOf(opp.state);
    const next = STATES[(idx + 1) % STATES.length];
    setOpps((prev) => prev.map((o) => o.id === opp.id ? { ...o, state: next } : o));
    startSave(async () => { await updateOpportunityState(opp.id, next); });
  };

  const openEdit = (e: React.MouseEvent, opp: Opportunity) => {
    e.stopPropagation();
    setEditTarget(opp);
    setEditForm({
      title: opp.title,
      desc: opp.desc ?? '',
      reward: opp.reward ?? '',
      tags: opp.tags.join(', '),
      url: opp.url ?? '',
      score: opp.score > 0 ? String(opp.score) : '',
      dueAt: opp.dueAt ? new Date(opp.dueAt).toISOString().slice(0, 10) : '',
    });
  };

  const handleSaveEdit = () => {
    if (!editTarget || !editForm.title.trim()) return;
    const tags = editForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
    // Optimistic patch uses null for DB-compatible types
    const optimisticPatch = {
      title: editForm.title.trim(),
      desc: editForm.desc || null,
      reward: editForm.reward || null,
      tags,
      url: editForm.url || null,
      score: editForm.score ? parseInt(editForm.score) : 0,
      dueAt: editForm.dueAt ? new Date(editForm.dueAt) : null,
    };
    // Server action patch uses undefined for optional fields
    const serverPatch = {
      title: editForm.title.trim(),
      desc: editForm.desc || undefined,
      reward: editForm.reward || undefined,
      tags,
      url: editForm.url || undefined,
      score: editForm.score ? parseInt(editForm.score) : 0,
      dueAt: editForm.dueAt ? new Date(editForm.dueAt) : null,
    };
    setOpps((prev) => prev.map((o) => o.id === editTarget.id ? { ...o, ...optimisticPatch } : o));
    setEditTarget(null);
    startSave(async () => { await updateOpportunity(editTarget.id, serverPatch); });
  };

  const handleAdd = useCallback(async () => {
    if (!form.title.trim() || !form.source.trim()) return;
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);

    // Auto-score via AI if no manual score provided
    let aiScore = form.score ? parseInt(form.score) : 0;
    let aiReasoning = '';
    if (!form.score) {
      setScoring(true);
      try {
        const res = await fetch('/api/ai/score-opportunity', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: form.title, desc: form.desc, tags, reward: form.reward, source: form.source }),
        });
        const data = await res.json() as { score?: number; reasoning?: string };
        if (data.score) { aiScore = data.score; aiReasoning = data.reasoning ?? ''; }
      } catch { /* use 0 if AI fails */ } finally {
        setScoring(false);
      }
    }

    startSave(async () => {
      const opp = await createOpportunity({
        source: form.source.trim(),
        title: form.title.trim(),
        desc: (form.desc || aiReasoning) || undefined,
        tags,
        reward: form.reward || undefined,
        score: aiScore,
        url: form.url || undefined,
      });
      setOpps((prev) => [opp, ...prev].sort((a, b) => b.score - a.score));
      setForm(EMPTY);
      setShowAdd(false);
    });
  }, [form, startSave]);

  const handleDelete = (id: string) => {
    setOpps((prev) => prev.filter((o) => o.id !== id));
    startSave(async () => { await deleteOpportunity(id); });
  };

  const handleCreateTask = (opp: Opportunity) => {
    startSave(async () => {
      try {
        const task = await createTaskFromOpportunity(opp.id);
        showToast(`Task added: ${task.title.slice(0, 42)}${task.title.length > 42 ? '…' : ''}`);
      } catch {
        showToast('Could not create opportunity task', 'info');
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

  return (
    <div className="screen">
      <ScreenHeader
        title="Opportunities"
        subtitle={`${opps.length} opportunit${opps.length !== 1 ? 'ies' : 'y'} tracked`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastSynced && !syncMsg && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>synced {lastSynced}</span>
            )}
            {syncMsg && (
              <span style={{ fontSize: 11, color: syncing ? 'var(--text-faint)' : 'var(--success)' }}>{syncMsg}</span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ gap: 5 }}
              onClick={handleSync}
              disabled={syncing}
              title="Fetch new bounties from GitHub & Algora"
            >
              <RefreshCw size={12} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button className="btn btn-primary btn-sm" style={{ gap: 6 }} onClick={() => setShowAdd(true)}>
              <Plus size={13} /> Add
            </button>
          </div>
        }
      />

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Add opportunity</div>
            <div style={{ display: 'flex', gap: 8, background: 'color-mix(in oklch, var(--accent) 7%, transparent)', border: '1px solid color-mix(in oklch, var(--accent) 20%, transparent)', borderRadius: 7, padding: '7px 11px', alignItems: 'center', marginBottom: 4 }}>
              <Sparkles size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>Leave fit score blank — AI will auto-score based on your skill profile.</span>
            </div>
            {[
              { key: 'source', label: 'Source', placeholder: 'Railway, Liveblocks, Algora…' },
              { key: 'title',  label: 'Title',  placeholder: "What's the opportunity?" },
              { key: 'desc',   label: 'Description (optional)', placeholder: 'Brief details…' },
              { key: 'reward', label: 'Reward',  placeholder: '$500, $1,000…' },
              { key: 'score',  label: 'Fit score (0–100) — leave blank to AI-score', placeholder: 'Auto' },
              { key: 'tags',   label: 'Tags (comma-separated)', placeholder: 'oauth, typescript, react' },
              { key: 'url',    label: 'URL (optional)', placeholder: 'https://…' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  value={(form as unknown as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || scoring || !form.title.trim() || !form.source.trim()}>
                {scoring ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Scoring…</> : saving ? 'Saving…' : <><Sparkles size={11} /> Add & Score</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditTarget(null)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Edit opportunity</span>
              <button className="ai-x" onClick={() => setEditTarget(null)}><X size={14} /></button>
            </div>
            {[
              { key: 'title',  label: 'Title',  placeholder: "What's the opportunity?" },
              { key: 'desc',   label: 'Description', placeholder: 'Brief details…' },
              { key: 'reward', label: 'Reward',  placeholder: '$500, $1,000…' },
              { key: 'score',  label: 'Fit score (0–100)', placeholder: '85' },
              { key: 'tags',   label: 'Tags (comma-separated)', placeholder: 'oauth, typescript, react' },
              { key: 'url',    label: 'URL', placeholder: 'https://…' },
              { key: 'dueAt',  label: 'Due date', placeholder: '' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  type={key === 'dueAt' ? 'date' : 'text'}
                  value={(editForm as unknown as Record<string, string>)[key]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', colorScheme: 'dark' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving || !editForm.title.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {opps.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, ...(stateFilter === null ? { color: 'var(--accent)' } : {}) }} onClick={() => setStateFilter(null)}>
            All ({opps.length})
          </button>
          {STATES.map((s) => {
            const count = opps.filter((o) => o.state === s).length;
            if (!count) return null;
            return (
              <button key={s} className="btn btn-ghost btn-sm" style={{ fontSize: 11, ...(stateFilter === s ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}) }} onClick={() => setStateFilter(stateFilter === s ? null : s)}>
                {s} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon="🎯"
          title={stateFilter ? `No ${stateFilter} opportunities` : 'No opportunities yet'}
          subtitle="Add bounties, freelance gigs, or side projects you are tracking."
          action={!stateFilter ? <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}><Plus size={12} /> Add opportunity</button> : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((opp) => {
            const expanded = expandedId === opp.id;
            return (
              <div
                key={opp.id}
                className="opp-card"
                style={{
                  cursor: 'pointer',
                  outline: expanded ? '1px solid color-mix(in oklch, var(--accent) 45%, transparent)' : undefined,
                }}
                onClick={() => setExpandedId(expanded ? null : opp.id)}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {opp.score > 0 && <ScoreRing score={opp.score} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{opp.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 6 }}>
                      {opp.source}{opp.reward && ` · ${opp.reward}`}{opp.entries > 0 && ` · ${opp.entries} entries`}
                    </div>
                    {expanded && opp.desc && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 8 }}>{opp.desc}</div>
                    )}
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {opp.tags.map((t) => (
                        <span key={t} style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-faint)' }}>{t}</span>
                      ))}
                      {opp.dueAt && (
                        <span style={{ fontSize: 10.5, color: 'var(--warn)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                          due {new Date(opp.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={(e) => { e.stopPropagation(); cycleState(opp); }}
                    >
                      <Pill tone={STATE_TONE[opp.state] ?? 'neutral'}>{opp.state}</Pill>
                    </button>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {opp.url && (
                        <a href={opp.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-faint)' }} onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, padding: '1px 5px', color: 'var(--text-faint)' }}
                        onClick={(e) => openEdit(e, opp)}
                        title="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, padding: '1px 5px', color: 'var(--accent)' }}
                        onClick={(e) => { e.stopPropagation(); handleCreateTask(opp); }}
                        title="Create task"
                      >
                        <CheckSquare size={11} />
                      </button>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(opp.id); }}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
