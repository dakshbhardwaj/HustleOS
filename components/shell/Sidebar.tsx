'use client';

import {
  LayoutDashboard, Newspaper, CheckSquare, Timer,
  Zap, Briefcase, FileText, MessageSquare, Mail,
  BookOpen, GitBranch, BookMarked, BarChart2, Settings, LogOut,
} from 'lucide-react';
import { NAV, SCREEN_GROUPS } from '@/lib/nav';
import { useAppStore } from '@/lib/store';
import type { ScreenKey } from '@/types';
import { signOut } from 'next-auth/react';
import type { Job } from '@prisma/client';

const ICONS: Record<ScreenKey, React.ComponentType<{ size?: number; className?: string }>> = {
  dashboard:     LayoutDashboard,
  brief:         Newspaper,
  tasks:         CheckSquare,
  focus:         Timer,
  opportunities: Zap,
  jobs:          Briefcase,
  resume:        FileText,
  interview:     MessageSquare,
  email:         Mail,
  learning:      BookOpen,
  github:        GitBranch,
  vault:         BookMarked,
  analytics:     BarChart2,
};

/** Which nav key maps to which badge field */
const BADGE_KEYS: Partial<Record<ScreenKey, keyof ReturnType<typeof useAppStore.getState>['badges']>> = {
  tasks:         'tasks',
  jobs:          'jobs',
  opportunities: 'opportunities',
};

const BADGE_COLOR: Partial<Record<ScreenKey, string>> = {
  tasks:         'var(--danger)',
  jobs:          'var(--accent)',
  opportunities: 'var(--success)',
};

interface SidebarUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

const STAGE_DOT: Record<string, string> = {
  Interview: 'var(--warn)',
  OA:        'var(--warn)',
  Offer:     'var(--success)',
  Applied:   'var(--accent)',
};

function pinnedLabel(job: Job): string {
  const short = job.company.split(' ')[0];
  if (job.stage === 'Offer') return `${short} — offer pending`;
  if (job.stage === 'Interview') return `${short} — interview`;
  if (job.stage === 'OA') return `${short} — OA pending`;
  return `${short} — ${job.stage}`;
}

export function Sidebar({ user, jobs = [] }: { user?: SidebarUser | null; jobs?: Job[] }) {
  const active    = useAppStore((s) => s.active);
  const setActive = useAppStore((s) => s.setActive);
  const setCmdOpen    = useAppStore((s) => s.setCmdOpen);
  const setTweaksOpen = useAppStore((s) => s.setTweaksOpen);
  const badges    = useAppStore((s) => s.badges);

  const displayName = user?.name ?? user?.email?.split('@')[0] ?? 'You';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">⌘</div>
        <div>
          <div className="brand-name">HustleOS</div>
          <div className="brand-sub">v0.5 · personal</div>
        </div>
      </div>

      <button className="cmd-trigger" onClick={() => setCmdOpen(true)}>
        <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>⌕</span>
        <span>Quick jump or ask AI…</span>
        <kbd className="kbd-tail">⌘K</kbd>
      </button>

      <nav className="nav">
        {SCREEN_GROUPS.map((group, gi) => (
          <div key={group}>
            <div className="nav-label" style={gi > 0 ? { marginTop: 10 } : undefined}>
              {group}
            </div>
            {NAV.filter((n) => n.group === group).map((n) => {
              const Icon       = ICONS[n.key];
              const badgeField = BADGE_KEYS[n.key];
              const badgeCount = badgeField ? badges[badgeField] : 0;
              const badgeColor = BADGE_COLOR[n.key] ?? 'var(--accent)';

              return (
                <button
                  key={n.key}
                  className={`nav-item${active === n.key ? ' active' : ''}`}
                  onClick={() => setActive(n.key)}
                >
                  <span className="nav-glyph">
                    <Icon size={14} />
                  </span>
                  <span className="nav-label-text">{n.label}</span>

                  {/* Badge — only shown when count > 0 and not the active screen */}
                  {badgeCount > 0 && active !== n.key && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 17,
                        height: 17,
                        borderRadius: 9,
                        background: badgeColor,
                        color: 'var(--bg)',
                        fontSize: 9.5,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        padding: '0 4px',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}

                  {/* Keyboard hint (only shown on hover, hidden when badge showing) */}
                  {(badgeCount === 0 || active === n.key) && (
                    <kbd className="nav-kbd">{n.hint}</kbd>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Pinned: active jobs with action stages */}
      {(() => {
        const pinned = jobs.filter((j) => ['Interview', 'OA', 'Offer', 'Applied'].includes(j.stage)).slice(0, 4);
        if (pinned.length === 0) return null;
        return (
          <div>
            <div className="nav-label">Pinned</div>
            {pinned.map((j) => (
              <button
                key={j.id}
                className={`nav-item${active === 'jobs' ? '' : ''}`}
                onClick={() => setActive('jobs')}
                style={{ height: 28 }}
              >
                <span className="nav-dot" style={{ background: STAGE_DOT[j.stage] ?? 'var(--text-faint)' }} />
                <span className="nav-label-text" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{pinnedLabel(j)}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <div className="sidebar-foot">
        <div className="profile">
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={displayName}
              className="profile-av"
              style={{ borderRadius: '50%', objectFit: 'cover', width: 28, height: 28 }}
            />
          ) : (
            <div className="profile-av">{initials}</div>
          )}
          <div className="profile-text">
            <div className="profile-name">{displayName}</div>
            <div className="profile-sub">Personal workspace</div>
          </div>
          <button
            className="profile-cog"
            aria-label="Settings"
            title="Appearance & settings"
            onClick={() => setTweaksOpen(true)}
          >
            <Settings size={14} />
          </button>
          <button
            className="profile-cog"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
