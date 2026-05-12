'use client';

import { useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, Trash2, ExternalLink } from 'lucide-react';
import { useAppStore, type Notification, type NotifType } from '@/lib/store';

const TYPE_META: Record<NotifType, { icon: string; color: string }> = {
  task_due:     { icon: '📌', color: 'var(--warn)' },
  task_blocked: { icon: '🚧', color: 'var(--danger)' },
  job_action:   { icon: '💼', color: 'var(--accent)' },
  opportunity:  { icon: '⚡', color: 'var(--success)' },
  interview:    { icon: '🎯', color: 'var(--accent)' },
  ai:           { icon: '✦', color: 'var(--accent)' },
};

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const notifOpen = useAppStore((s) => s.notifOpen);
  const setNotifOpen = useAppStore((s) => s.setNotifOpen);
  const notifications = useAppStore((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        title="Notifications"
        onClick={() => setNotifOpen(!notifOpen)}
        style={{ position: 'relative' }}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <Bell size={15} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: 'var(--danger)', color: '#fff',
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
            borderRadius: '50%', width: 14, height: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, border: '1.5px solid var(--bg)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {notifOpen && <NotificationPanel />}
    </div>
  );
}

function NotificationPanel() {
  const notifications = useAppStore((s) => s.notifications);
  const markAllRead = useAppStore((s) => s.markAllRead);
  const markRead = useAppStore((s) => s.markRead);
  const clearNotifications = useAppStore((s) => s.clearNotifications);
  const setNotifOpen = useAppStore((s) => s.setNotifOpen);
  const setActive = useAppStore((s) => s.setActive);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setNotifOpen]);

  // Keyboard close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setNotifOpen]);

  const handleClick = (n: Notification) => {
    markRead(n.id);
    if (n.screen) {
      setActive(n.screen);
      setNotifOpen(false);
    }
  };

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0,
        width: 360, maxHeight: 480,
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          Notifications
          {unread > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--danger)', color: '#fff', padding: '1px 5px', borderRadius: 8 }}>
              {unread}
            </span>
          )}
        </span>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10.5, gap: 4, padding: '2px 7px' }}
            title="Mark all read"
          >
            <CheckCheck size={11} /> Mark read
          </button>
        )}
        {notifications.length > 0 && (
          <button
            onClick={clearNotifications}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 10.5, gap: 4, padding: '2px 7px', color: 'var(--text-faint)' }}
            title="Clear all"
          >
            <Trash2 size={11} />
          </button>
        )}
        <button onClick={() => setNotifOpen(false)} className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }}>
          <X size={13} />
        </button>
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12.5 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
            All caught up — no notifications
          </div>
        ) : (
          notifications.map((n) => {
            const meta = TYPE_META[n.type];
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  width: '100%', textAlign: 'left', padding: '11px 14px',
                  borderBottom: '1px solid var(--border-soft)',
                  background: n.read ? 'transparent' : 'color-mix(in oklch, var(--accent) 5%, transparent)',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  cursor: 'pointer', border: 'none',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: n.read ? 400 : 600,
                    color: 'var(--text)', lineHeight: 1.3, marginBottom: 2,
                  }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.4 }}>
                    {n.body}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {timeAgo(n.createdAt)}
                  </span>
                  {n.screen && (
                    <ExternalLink size={10} style={{ color: 'var(--text-faint)' }} />
                  )}
                  {!n.read && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
