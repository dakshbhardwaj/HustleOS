'use client';

import { useEffect, useState, useTransition, useRef } from 'react';
import { NAV } from '@/lib/nav';
import { useAppStore, ACCENTS } from '@/lib/store';
import { createTask, getProjects } from '@/lib/actions/tasks';
import type { ScreenKey } from '@/types';
import type { Project } from '@prisma/client';

const NAV_SHORTCUTS: Array<{ key: string; label: string; screen?: ScreenKey; action?: string }> = [
  ...NAV.map((n) => ({ key: n.hint, label: n.label, screen: n.key })),
  { key: 'N',   label: 'Quick-add task' },
  { key: '⌘K', label: 'Command palette' },
  { key: '?',  label: 'Keyboard shortcuts' },
  { key: 'Esc', label: 'Close panels' },
];

function QuickTaskModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2'>('P1');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const showToast = useAppStore((s) => s.showToast);

  useEffect(() => {
    inputRef.current?.focus();
    getProjects().then(setProjects).catch(() => {});
  }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const t = title.trim();
    startSave(async () => {
      await createTask({ title: t, priority, projectId: projectId || undefined });
      showToast(`Task added: ${t.slice(0, 40)}${t.length > 40 ? '…' : ''}`);
      onClose();
    });
  };

  const TONE: Record<string, string> = { P0: 'var(--danger)', P1: 'var(--warn)', P2: 'var(--text-faint)' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '20vh' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', width: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 12 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--accent)', fontSize: 14 }}>✦</span> QUICK TASK
        </div>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder="What needs to get done?"
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['P0', 'P1', 'P2'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${priority === p ? TONE[p] : 'var(--border-soft)'}`, background: priority === p ? `color-mix(in oklch, ${TONE[p]} 15%, transparent)` : 'var(--surface)', color: priority === p ? TONE[p] : 'var(--text-faint)' }}
              >
                {p}
              </button>
            ))}
          </div>
          {projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: 'var(--text)', outline: 'none' }}
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto', fontSize: 12 }}
          >
            {saving ? 'Saving…' : 'Add task'}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', display: 'flex', gap: 12 }}>
          <span><kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>↵</kbd> Add task</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>Esc</kbd> Cancel</span>
        </div>
      </div>
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px', minWidth: 360, maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Keyboard shortcuts</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
          {NAV_SHORTCUTS.map((s) => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{s.label}</span>
              <kbd style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-dim)' }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center' }}>
          Shortcuts are disabled while typing in inputs.
        </div>
      </div>
    </div>
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && (el.isContentEditable || el.closest('[contenteditable]'))) return true;
  return false;
}

export function GlobalToast() {
  const toast = useAppStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 500, background: toast.type === 'success' ? 'var(--success)' : 'var(--accent)',
      color: 'var(--bg)', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)', pointerEvents: 'none',
      animation: 'fadeIn 150ms ease',
    }}>
      {toast.type === 'success' ? '✓ ' : '✦ '}{toast.message}
    </div>
  );
}

export function KeyboardNav() {
  const cmdOpen          = useAppStore((s) => s.cmdOpen);
  const setCmdOpen       = useAppStore((s) => s.setCmdOpen);
  const aiOpen           = useAppStore((s) => s.aiOpen);
  const setAiOpen        = useAppStore((s) => s.setAiOpen);
  const setActive        = useAppStore((s) => s.setActive);
  const preferences      = useAppStore((s) => s.preferences);
  const quickTaskOpen    = useAppStore((s) => s.quickTaskOpen);
  const setQuickTaskOpen = useAppStore((s) => s.setQuickTaskOpen);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Apply theme/density/accent to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', preferences.theme);
    root.setAttribute('data-density', preferences.density);
    root.style.setProperty('--accent', ACCENTS[preferences.accent]);
  }, [preferences.theme, preferences.density, preferences.accent]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      // Escape → close everything
      if (e.key === 'Escape') {
        if (quickTaskOpen) { setQuickTaskOpen(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (cmdOpen) { setCmdOpen(false); return; }
        if (aiOpen) { setAiOpen(false); return; }
        return;
      }

      // Don't intercept when user is typing
      if (isTypingTarget(e.target)) return;
      // Don't intercept modifier combos (⌘S, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't intercept while palette is open
      if (cmdOpen) return;

      // ? → keyboard shortcuts overlay
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      // N → quick-add task
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setQuickTaskOpen(true);
        return;
      }

      // Single-letter nav (D, T, J, O, etc.) — N is claimed above
      const hit = NAV.find((n) => n.hint.toLowerCase() === e.key.toLowerCase() && n.hint.toLowerCase() !== 'n');
      if (hit) {
        e.preventDefault();
        setActive(hit.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmdOpen, setCmdOpen, aiOpen, setAiOpen, setActive, showShortcuts, quickTaskOpen, setQuickTaskOpen]);

  return (
    <>
      {quickTaskOpen && <QuickTaskModal onClose={() => setQuickTaskOpen(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </>
  );
}
