'use client';

import { Plus } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { useAppStore } from '@/lib/store';
import { NotificationBell } from './NotificationPanel';

export function TopBar() {
  const active           = useAppStore((s) => s.active);
  const aiOpen           = useAppStore((s) => s.aiOpen);
  const setCmdOpen       = useAppStore((s) => s.setCmdOpen);
  const setAiOpen        = useAppStore((s) => s.setAiOpen);
  const setQuickTaskOpen = useAppStore((s) => s.setQuickTaskOpen);
  const preferences      = useAppStore((s) => s.preferences);

  const crumb = NAV.find((n) => n.key === active)?.label ?? '';

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>Personal</span>
        <span>/</span>
        <span className="crumb-active">{crumb}</span>
      </div>
      <div className="topbar-actions">
        <NotificationBell />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setQuickTaskOpen(true)}
          title="Quick-add task (N)"
          style={{ gap: 5 }}
        >
          <Plus size={13} />
          <span style={{ fontSize: 12 }}>New task</span>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px', color: 'var(--text-faint)' }}>N</kbd>
        </button>
        <button className="cmd-trigger compact" onClick={() => setCmdOpen(true)}>
          <span style={{ fontSize: 12 }}>Quick jump…</span>
          <kbd className="kbd-tail">⌘K</kbd>
        </button>
        <button
          className="btn"
          onClick={() => setAiOpen(!aiOpen)}
          style={aiOpen && preferences.showAI
            ? { background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }
            : { borderColor: 'var(--border-soft)' }}
        >
          <span className="ai-glyph sm" style={aiOpen && preferences.showAI ? { background: 'var(--bg)', color: 'var(--accent)' } : {}}>✦</span>
          Assistant
        </button>
      </div>
    </header>
  );
}
