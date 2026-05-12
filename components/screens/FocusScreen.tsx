'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, SkipForward, CheckCircle2, Coffee, Zap } from 'lucide-react';
import { ScreenHeader } from '@/components/ui';
import { getTasksWithStats, toggleTask } from '@/lib/actions/tasks';
import { useAppStore } from '@/lib/store';

/** Play a gentle two-tone chime using the Web Audio API — no file needed */
function playChime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, ctx.currentTime);

    const tones = [523.25, 659.25, 783.99]; // C5, E5, G5 — major triad
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch { /* Audio context may be blocked on first interaction — silent fail */ }
}

type TimerMode = 'focus' | 'short' | 'long';
type SessionState = 'idle' | 'running' | 'paused' | 'done';

const DURATIONS: Record<TimerMode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const MODE_LABEL: Record<TimerMode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

interface FocusTask { id: string; title: string; project: string; done: boolean; }

interface SessionLog { mode: TimerMode; completedAt: string; minutes: number; }

function pad(n: number) { return String(n).padStart(2, '0'); }

function CircularTimer({ progress, mode, state }: { progress: number; mode: TimerMode; state: SessionState }) {
  const r = 80;
  const circ = 2 * Math.PI * r;
  const fill = progress * circ;
  const color = mode === 'focus' ? 'var(--accent)' : 'var(--success)';
  return (
    <div style={{ position: 'relative', width: 200, height: 200 }}>
      <svg width={200} height={200} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={100} cy={100} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={6} />
        <circle
          cx={100} cy={100} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: state === 'running' ? 'stroke-dasharray 1s linear' : 'none' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>
          {MODE_LABEL[mode]}
        </span>
        <span style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', letterSpacing: -1 }}>
          {/* rendered by parent */}
        </span>
      </div>
    </div>
  );
}

export function FocusScreen() {
  const addFocusMinutes = useAppStore((s) => s.addFocusMinutes);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [state, setState] = useState<SessionState>('idle');
  const [remaining, setRemaining] = useState(DURATIONS.focus);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [log, setLog] = useState<SessionLog[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load real open tasks from DB
  useEffect(() => {
    getTasksWithStats().then((data) => {
      const open = data.tasks
        .filter((t) => !t.done)
        .slice(0, 10)
        .map((t) => ({
          id: t.id,
          title: t.title,
          project: (t as unknown as { project?: { name: string } | null }).project?.name ?? 'General',
          done: false,
        }));
      setTasks(open);
      setActiveTaskId(open[0]?.id ?? null);
    }).catch(() => {
      setTasks([]);
    }).finally(() => {
      setLoadingTasks(false);
    });
  }, []);

  const total = DURATIONS[mode];
  const progress = (total - remaining) / total;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const tick = useCallback(() => {
    setRemaining((prev) => {
      if (prev <= 1) {
        stop();
        setState('done');
        playChime();
        if (mode === 'focus') {
          const mins = DURATIONS[mode] / 60;
          setPomodoroCount((c) => c + 1);
          setLog((l) => [...l, { mode, completedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), minutes: mins }]);
          addFocusMinutes(new Date().toISOString().slice(0, 10), mins);
        }
        return 0;
      }
      return prev - 1;
    });
  }, [mode, stop]);

  const start = () => {
    setState('running');
    intervalRef.current = setInterval(tick, 1000);
  };

  const pause = () => {
    stop();
    setState('paused');
  };

  const resume = () => {
    setState('running');
    intervalRef.current = setInterval(tick, 1000);
  };

  const reset = () => {
    stop();
    setState('idle');
    setRemaining(DURATIONS[mode]);
  };

  const skip = () => {
    stop();
    const next: TimerMode = mode === 'focus' ? (pomodoroCount % 4 === 3 ? 'long' : 'short') : 'focus';
    setMode(next);
    setState('idle');
    setRemaining(DURATIONS[next]);
  };

  const switchMode = (m: TimerMode) => {
    stop();
    setMode(m);
    setState('idle');
    setRemaining(DURATIONS[m]);
  };

  useEffect(() => () => stop(), [stop]);

  const focusMinutes = log.filter((l) => l.mode === 'focus').reduce((s, l) => s + l.minutes, 0);

  return (
    <div className="screen">
      <ScreenHeader
        title="Focus"
        subtitle={`${pomodoroCount} pomodoros today · ${focusMinutes} min focused`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Timer */}
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          {/* Mode tabs */}
          <div className="tabs" style={{ padding: 0, background: 'transparent', border: 'none' }}>
            {(['focus', 'short', 'long'] as TimerMode[]).map((m) => (
              <button key={m} className={`tab${mode === m ? ' active' : ''}`} onClick={() => switchMode(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {/* Ring + time display */}
          <div style={{ position: 'relative', width: 200, height: 200 }}>
            <svg width={200} height={200} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={100} cy={100} r={80} fill="none" stroke="var(--border-soft)" strokeWidth={6} />
              <circle
                cx={100} cy={100} r={80} fill="none"
                stroke={mode === 'focus' ? 'var(--accent)' : 'var(--success)'}
                strokeWidth={6}
                strokeDasharray={`${progress * (2 * Math.PI * 80)} ${2 * Math.PI * 80}`}
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>
                {state === 'done' ? '✓ done' : MODE_LABEL[mode]}
              </span>
              <span style={{ fontSize: 42, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1, letterSpacing: -2 }}>
                {pad(minutes)}:{pad(seconds)}
              </span>
              {activeTaskId && (() => {
                const t = tasks.find((x) => x.id === activeTaskId);
                if (!t) return null;
                const title = t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: 11, color: 'var(--accent)', maxWidth: 130, textAlign: 'center', lineHeight: 1.3, fontWeight: 600 }}>
                      {title}
                    </span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{t.project}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Completion overlay */}
          {state === 'done' && (
            <div style={{
              background: mode === 'focus'
                ? 'color-mix(in oklch, var(--accent) 10%, transparent)'
                : 'color-mix(in oklch, var(--success) 10%, transparent)',
              border: `1px solid color-mix(in oklch, ${mode === 'focus' ? 'var(--accent)' : 'var(--success)'} 30%, transparent)`,
              borderRadius: 10, padding: '14px 18px', width: '100%', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: mode === 'focus' ? 'var(--accent)' : 'var(--success)', textAlign: 'center' }}>
                {mode === 'focus' ? `🍅 Focus session complete! +${DURATIONS.focus / 60} min` : `☕ Break over — ready for next focus?`}
              </div>

              {/* Mark active task done */}
              {mode === 'focus' && activeTaskId && (() => {
                const activeTask = tasks.find((t) => t.id === activeTaskId && !t.done);
                if (!activeTask) return null;
                return (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Finish "{activeTask.title.slice(0, 28)}{activeTask.title.length > 28 ? '…' : ''}"?</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ gap: 4, color: 'var(--success)', borderColor: 'var(--success)', fontSize: 11 }}
                      onClick={() => {
                        setTasks((prev) => prev.map((x) => x.id === activeTaskId ? { ...x, done: true } : x));
                        toggleTask(activeTaskId);
                        // Advance to next undone task
                        const next = tasks.find((t) => t.id !== activeTaskId && !t.done);
                        setActiveTaskId(next?.id ?? null);
                      }}
                    >
                      <CheckCircle2 size={12} /> Mark done
                    </button>
                  </div>
                );
              })()}

              {/* Next session buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                {mode === 'focus' ? (
                  <>
                    <button className="btn btn-ghost btn-sm" style={{ gap: 5 }}
                      onClick={() => { const next: TimerMode = pomodoroCount % 4 === 0 ? 'long' : 'short'; switchMode(next); }}>
                      <Coffee size={12} /> Take a break
                    </button>
                    <button className="btn btn-primary btn-sm" style={{ gap: 5 }} onClick={() => { reset(); setTimeout(start, 50); }}>
                      <Zap size={12} /> Keep going
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" style={{ gap: 5 }} onClick={() => { switchMode('focus'); setTimeout(start, 50); }}>
                    <Play size={12} fill="currentColor" /> Start focus
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={reset} title="Reset"><RotateCcw size={15} /></button>
            {state === 'idle' ? (
              <button className="btn btn-primary" style={{ minWidth: 80, gap: 6 }} onClick={start}>
                <Play size={14} fill="currentColor" /> Start
              </button>
            ) : state === 'running' ? (
              <button className="btn btn-primary" style={{ minWidth: 80, gap: 6 }} onClick={pause}>
                <Pause size={14} fill="currentColor" /> Pause
              </button>
            ) : state === 'paused' ? (
              <button className="btn btn-primary" style={{ minWidth: 80, gap: 6 }} onClick={resume}>
                <Play size={14} fill="currentColor" /> Resume
              </button>
            ) : null /* 'done' handled by overlay above */}
            <button className="btn btn-ghost" onClick={skip} title="Skip"><SkipForward size={15} /></button>
          </div>

          {/* Pomodoro dots */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: i < (pomodoroCount % 4) ? 'var(--accent)' : 'var(--border-soft)',
                transition: 'background 300ms',
              }} />
            ))}
            <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
              {pomodoroCount} total
            </span>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Queue */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Focus queue</span>
            </div>
            {loadingTasks ? (
              <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center' }}>Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div style={{ padding: '16px 14px', fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center' }}>No open tasks — add some in Tasks</div>
            ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
              {tasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    background: activeTaskId === t.id ? 'color-mix(in oklch, var(--accent) 8%, transparent)' : 'transparent',
                    borderLeft: activeTaskId === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'background 120ms',
                  }}
                  onClick={() => setActiveTaskId(t.id)}
                >
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, done: !x.done } : x)); toggleTask(t.id); }}
                  >
                    {t.done
                      ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                      : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid var(--border)' }} />
                    }
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: t.done ? 'var(--text-faint)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{t.project}</div>
                  </div>
                </li>
              ))}
            </ul>
            )}
          </div>

          {/* Session log */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10 }}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Session log</span>
            </div>
            {log.length === 0 ? (
              <div style={{ padding: '20px 14px', fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                No sessions yet today
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
                {log.slice().reverse().map((l, i) => (
                  <li key={i} style={{ padding: '6px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {l.mode === 'focus' ? '🍅' : '☕'} {MODE_LABEL[l.mode]}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{l.completedAt}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stats */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Today</span>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Pomodoros</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{pomodoroCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Focus time</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{focusMinutes}m</span>
            </div>
            {tasks.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Tasks done</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{tasks.filter((t) => t.done).length}/{tasks.length}</span>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
