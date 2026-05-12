'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Plus, ChevronDown, ChevronRight, Sparkles, Send, RotateCcw, CheckCircle2, Circle, Loader2, Trash2, X } from 'lucide-react';
import { ScreenHeader, Pill } from '@/components/ui';
import { getQuestions, createQuestion, updateQuestionState, deleteQuestion } from '@/lib/actions/questions';
import type { Question } from '@prisma/client';
import type { Tone } from '@/types';

type Difficulty = 'Easy' | 'Medium' | 'Hard';
type Category = 'System Design' | 'Behavioral' | 'Coding' | 'Role-specific';
type QuestionState = 'unseen' | 'reviewing' | 'confident';

const DIFF_TONE: Record<Difficulty, Tone> = { Easy: 'success', Medium: 'warn', Hard: 'danger' };
const CAT_TONE: Record<Category, Tone> = {
  'System Design': 'accent', Behavioral: 'neutral', Coding: 'warn', 'Role-specific': 'success',
};
const CATS: Category[] = ['System Design', 'Behavioral', 'Coding', 'Role-specific'];
const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];

interface ChatMessage { role: 'user' | 'ai'; text: string; }

function MockSessionPanel({ question, onClose }: { question: Question; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: `Let's work through this together. Take your time — start by clarifying any assumptions you'd make before diving into the solution.` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/interview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.text, history: messages, userMessage: userMsg }),
      });
      const data = await res.json() as { reply: string };
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, hit an error. Try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mock-panel">
      <div className="mock-panel-header">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Mock session</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{question.text}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      {question.hint && hint && (
        <div style={{ padding: '8px 12px', background: 'color-mix(in oklch, var(--accent) 8%, transparent)', borderRadius: 6, fontSize: 12, color: 'var(--accent)', lineHeight: 1.5 }}>
          <strong>Hint:</strong> {question.hint}
        </div>
      )}

      <div className="mock-messages">
        {messages.map((m, i) => (
          <div key={i} className={`mock-msg ${m.role}`}>
            <span className="mock-msg-label">{m.role === 'ai' ? '✦ HustleOS' : 'You'}</span>
            <p>{m.text}</p>
          </div>
        ))}
        {loading && (
          <div className="mock-msg ai">
            <span className="mock-msg-label">✦ HustleOS</span>
            <p style={{ color: 'var(--text-faint)' }}>Thinking…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mock-input-row">
        {question.hint && (
          <button className="btn btn-ghost btn-sm" onClick={() => setHint((v) => !v)}>
            <Sparkles size={12} /> {hint ? 'Hide hint' : 'Hint'}
          </button>
        )}
        <input
          className="mock-input"
          placeholder="Your answer…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          autoFocus
        />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !input.trim()}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

interface QuestionRowProps {
  q: Question;
  onStateChange: (id: string, state: QuestionState) => void;
  onStartMock: (q: Question) => void;
  onDelete: (id: string) => void;
}

function QuestionRow({ q, onStateChange, onStartMock, onDelete }: QuestionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const state = q.state as QuestionState;

  const STATE_ICON = {
    unseen:    <Circle size={14} style={{ color: 'var(--text-faint)' }} />,
    reviewing: <Circle size={14} style={{ color: 'var(--warn)' }} />,
    confident: <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />,
  };

  const nextState: Record<QuestionState, QuestionState> = {
    unseen: 'reviewing', reviewing: 'confident', confident: 'unseen',
  };

  return (
    <div className="q-row">
      <button
        className="q-state-btn"
        onClick={() => onStateChange(q.id, nextState[state])}
        title="Cycle confidence"
      >
        {STATE_ICON[state]}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text)' }}
            onClick={() => setExpanded((v) => !v)}
          >
            {q.text}
          </span>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill tone={CAT_TONE[q.category as Category] ?? 'neutral'}>{q.category}</Pill>
          <Pill tone={DIFF_TONE[q.difficulty as Difficulty] ?? 'neutral'}>{q.difficulty}</Pill>
          {q.company && <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{q.company}</span>}
        </div>

        {expanded && (
          <div style={{ marginTop: 10 }}>
            {q.hint && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', marginBottom: 8, lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text)' }}>Hint:</strong> {q.hint}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={() => onStartMock(q)}>
                <Sparkles size={11} /> Start mock
              </button>
              {(['unseen', 'reviewing', 'confident'] as QuestionState[]).map((s) => (
                <button
                  key={s}
                  className="btn btn-ghost btn-sm"
                  style={state === s ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                  onClick={() => onStateChange(q.id, s)}
                >
                  {s}
                </button>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', marginLeft: 'auto' }}
                onClick={() => onDelete(q.id)}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AddForm {
  text: string; category: Category; difficulty: Difficulty; company: string; hint: string;
}
const EMPTY: AddForm = { text: '', category: 'System Design', difficulty: 'Medium', company: '', hint: '' };

export function InterviewPrepScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, startSave] = useTransition();
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All');
  const [diffFilter, setDiffFilter] = useState<Difficulty | 'All'>('All');
  const [mockQ, setMockQ] = useState<Question | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY);

  useEffect(() => {
    getQuestions().then(setQuestions).finally(() => setLoading(false));
  }, []);

  const visible = questions
    .filter((q) => catFilter === 'All' || q.category === catFilter)
    .filter((q) => diffFilter === 'All' || q.difficulty === diffFilter);

  const confident = questions.filter((q) => q.state === 'confident').length;
  const reviewing = questions.filter((q) => q.state === 'reviewing').length;

  const handleStateChange = (id: string, state: QuestionState) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, state } : q));
    startSave(async () => { await updateQuestionState(id, state); });
  };

  const handleDelete = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    startSave(async () => { await deleteQuestion(id); });
  };

  const handleAdd = () => {
    if (!form.text.trim()) return;
    startSave(async () => {
      const q = await createQuestion({
        text: form.text.trim(),
        category: form.category,
        difficulty: form.difficulty,
        company: form.company.trim() || undefined,
        hint: form.hint.trim() || undefined,
      });
      setQuestions((prev) => [...prev, q]);
      setForm(EMPTY);
      setShowAdd(false);
    });
  };

  const randomUnseen = () => {
    const unseen = visible.filter((q) => q.state === 'unseen');
    if (unseen.length === 0) return;
    setMockQ(unseen[Math.floor(Math.random() * unseen.length)]);
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="Interview prep"
        subtitle={loading ? 'Loading…' : `${questions.length} question${questions.length !== 1 ? 's' : ''} · ${confident} confident · ${reviewing} reviewing`}
        actions={
          <>
            <button className="btn btn-ghost" onClick={randomUnseen} disabled={loading || visible.filter((q) => q.state === 'unseen').length === 0}>
              <RotateCcw size={13} /> Random
            </button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={13} /> Add question</button>
          </>
        }
      />

      {/* Add question modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 480, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add question</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)' }} onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Question</label>
              <textarea
                autoFocus
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                rows={3}
                placeholder="What would you ask the candidate?"
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                >
                  {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Difficulty</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as Difficulty }))}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                >
                  {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Company (optional)</label>
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="e.g. Google, Meta"
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 4 }}>Hint (optional)</label>
                <input
                  value={form.hint}
                  onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
                  placeholder="Key concepts to consider…"
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !form.text.trim()}>
                {saving ? 'Saving…' : 'Add question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={20} style={{ color: 'var(--text-faint)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : questions.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16, background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12 }}>
          <div style={{ fontSize: 36 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>No questions yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Add practice questions for your interviews.</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={13} /> Add first question</button>
        </div>
      ) : (
        <>
          {/* Readiness score widget */}
          {(() => {
            const total = questions.length;
            const unseen = total - confident - reviewing;
            // Score: confident = 1pt, reviewing = 0.5pt each
            const rawScore = total > 0 ? Math.round(((confident + reviewing * 0.5) / total) * 100) : 0;
            const scoreColor = rawScore >= 75 ? 'var(--success)' : rawScore >= 50 ? 'var(--accent)' : 'var(--warn)';
            const r = 28, circ = 2 * Math.PI * r;
            return (
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 20, alignItems: 'center' }}>
                {/* Score ring */}
                <div style={{ position: 'relative', width: 70, height: 70, flexShrink: 0 }}>
                  <svg width="70" height="70" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r={r} fill="none" stroke="var(--surface)" strokeWidth="5" />
                    <circle cx="35" cy="35" r={r} fill="none" stroke={scoreColor} strokeWidth="5"
                      strokeDasharray={`${(rawScore / 100) * circ} ${circ}`}
                      strokeLinecap="round" transform="rotate(-90 35 35)"
                      style={{ transition: 'stroke-dasharray 600ms ease' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{rawScore}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1 }}>readiness</span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                    {rawScore >= 75 ? 'Interview ready 🎯' : rawScore >= 50 ? 'Getting there 📈' : 'Keep practicing 💪'}
                  </div>
                  <div style={{ height: 5, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: `linear-gradient(to right, var(--success) ${(confident / total) * 100}%, var(--warn) ${(confident / total) * 100}% ${((confident + reviewing) / total) * 100}%, transparent ${((confident + reviewing) / total) * 100}%)`,
                      width: `${((confident + reviewing) / total) * 100}%`,
                      transition: 'width 400ms',
                    }} />
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>✓ {confident} confident</span>
                    <span style={{ fontSize: 11, color: 'var(--warn)', fontFamily: 'var(--font-mono)' }}>~ {reviewing} reviewing</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>○ {unseen} unseen</span>
                  </div>
                </div>

                {/* Per-category mini-breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  {CATS.map((cat) => {
                    const catQs = questions.filter((q) => q.category === cat);
                    const catConf = catQs.filter((q) => q.state === 'confident').length;
                    const pct = catQs.length > 0 ? Math.round((catConf / catQs.length) * 100) : 0;
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', width: 80, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                        <div style={{ width: 60, height: 3, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)', borderRadius: 2, transition: 'width 400ms' }} />
                        </div>
                        <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', width: 26 }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {mockQ && <MockSessionPanel question={mockQ} onClose={() => setMockQ(null)} />}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="tabs" style={{ padding: 0, background: 'transparent', border: 'none' }}>
              {(['All', ...CATS] as const).map((c) => (
                <button key={c} className={`tab${catFilter === c ? ' active' : ''}`} onClick={() => setCatFilter(c)}>
                  {c}
                  <span className="tab-count">{c === 'All' ? questions.length : questions.filter((q) => q.category === c).length}</span>
                </button>
              ))}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['All', ...DIFFS] as const).map((d) => (
                <button key={d} className={`btn btn-sm ${diffFilter === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDiffFilter(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-faint)', fontSize: 13 }}>
              No questions match this filter.
            </div>
          ) : (
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, overflow: 'hidden' }}>
              {visible.map((q, i) => (
                <div key={q.id} style={i > 0 ? { borderTop: '1px solid var(--border-soft)' } : undefined}>
                  <QuestionRow q={q} onStateChange={handleStateChange} onStartMock={setMockQ} onDelete={handleDelete} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
