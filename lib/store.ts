'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScreenKey, AccentKey, DensityKey, ThemeKey } from '@/types';

export const ACCENTS: Record<AccentKey, string> = {
  amber: 'oklch(72% 0.16 60)',
  green: 'oklch(72% 0.16 150)',
  iris:  'oklch(70% 0.16 280)',
  rose:  'oklch(70% 0.18 15)',
};

export type NotifType = 'task_due' | 'task_blocked' | 'job_action' | 'opportunity' | 'interview' | 'ai';

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  screen?: ScreenKey;
  read: boolean;
  createdAt: number;
}

interface Preferences {
  theme: ThemeKey;
  accent: AccentKey;
  density: DensityKey;
  showAI: boolean;
}

// Serialisable email shape stored in cache (avoids importing Email from EmailScreen)
export interface CachedEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body?: string;
  date?: string;
  cat: string;
  tone: string;
  action?: string;
  priority?: string;
  summary?: string;
  taskCreated?: boolean;
}

export interface EmailCache {
  emails: CachedEmail[];
  connected: boolean;
  /** Unix ms — used to compute staleness */
  cachedAt: number;
}

/** Daily AI-generated brief — cached by date (YYYY-MM-DD) */
export interface DailyBriefCache {
  text: string;
  date: string; // YYYY-MM-DD
}

/** Live badge counts seeded from SSR data each page load */
export interface Badges {
  tasks: number;        // P0 open tasks
  jobs: number;         // Interview + Offer count
  opportunities: number; // New opportunities
}

interface AppState {
  active: ScreenKey;
  cmdOpen: boolean;
  aiOpen: boolean;
  tweaksOpen: boolean;
  notifOpen: boolean;
  notifications: Notification[];
  preferences: Preferences;
  /** Cached Gmail data — persisted across sessions, refreshed after TTL */
  emailCache: EmailCache | null;
  /** Today's AI brief — persisted, regenerated each day */
  dailyBriefCache: DailyBriefCache | null;
  /** Date of last proactive AI greeting (prevents repeat greetings per day) */
  lastGreetedDate: string | null;
  /** Live badge counts — populated from SSR data, not persisted */
  badges: Badges;

  /** Pending prompt routed from CommandPalette → AIPanel */
  aiPendingPrompt: string | null;
  /** Global quick-task modal — can be opened from TopBar, keyboard shortcut, etc. */
  quickTaskOpen: boolean;
  /** Transient toast message shown briefly after an action */
  toast: { message: string; type: 'success' | 'info' } | null;
  /** Persisted focus session log — focus minutes per day (keyed YYYY-MM-DD) */
  focusMinutesByDay: Record<string, number>;

  setActive: (screen: ScreenKey) => void;
  setCmdOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
  setAiPendingPrompt: (prompt: string | null) => void;
  setQuickTaskOpen: (open: boolean) => void;
  showToast: (message: string, type?: 'success' | 'info') => void;
  addFocusMinutes: (date: string, minutes: number) => void;
  setTweaksOpen: (open: boolean) => void;
  setNotifOpen: (open: boolean) => void;
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearNotifications: () => void;
  setNotifications: (notifs: Notification[]) => void;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  setEmailCache: (cache: EmailCache) => void;
  clearEmailCache: () => void;
  setDailyBriefCache: (cache: DailyBriefCache) => void;
  clearDailyBriefCache: () => void;
  setLastGreetedDate: (date: string) => void;
  setBadges: (badges: Badges) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      active: 'dashboard',
      cmdOpen: false,
      aiOpen: true,
      aiPendingPrompt: null,
      quickTaskOpen: false,
      toast: null,
      focusMinutesByDay: {},
      tweaksOpen: false,
      notifOpen: false,
      notifications: [],
      emailCache: null,
      dailyBriefCache: null,
      lastGreetedDate: null,
      badges: { tasks: 0, jobs: 0, opportunities: 0 },
      preferences: {
        theme: 'dark',
        accent: 'amber',
        density: 'regular',
        showAI: true,
      },
      setActive: (screen) => set({ active: screen }),
      setCmdOpen: (open) => set({ cmdOpen: open }),
      setAiOpen: (open) => set({ aiOpen: open }),
      setAiPendingPrompt: (prompt) => set({ aiPendingPrompt: prompt }),
      setQuickTaskOpen: (open) => set({ quickTaskOpen: open }),
      showToast: (message, type = 'success') => {
        set({ toast: { message, type } });
        setTimeout(() => set({ toast: null }), 2800);
      },
      addFocusMinutes: (date, minutes) =>
        set((s) => ({
          focusMinutesByDay: {
            ...s.focusMinutesByDay,
            [date]: (s.focusMinutesByDay[date] ?? 0) + minutes,
          },
        })),
      setTweaksOpen: (open) => set({ tweaksOpen: open }),
      setNotifOpen: (open) => set({ notifOpen: open }),
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: `${Date.now()}-${Math.random()}`, read: false, createdAt: Date.now() },
            ...s.notifications,
          ].slice(0, 50),
        })),
      markRead: (id) =>
        set((s) => ({ notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n) })),
      markAllRead: () =>
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),
      setNotifications: (notifs) => set({ notifications: notifs }),
      setPreference: (key, value) =>
        set((s) => ({ preferences: { ...s.preferences, [key]: value } })),
      setEmailCache: (cache) => set({ emailCache: cache }),
      clearEmailCache: () => set({ emailCache: null }),
      setDailyBriefCache: (cache) => set({ dailyBriefCache: cache }),
      clearDailyBriefCache: () => set({ dailyBriefCache: null }),
      setLastGreetedDate: (date) => set({ lastGreetedDate: date }),
      setBadges: (badges) => set({ badges }),
    }),
    {
      name: 'hustle-ui',
      partialize: (s) => ({
        active: s.active,
        aiOpen: s.aiOpen,
        preferences: s.preferences,
        notifications: s.notifications,
        emailCache: s.emailCache,
        dailyBriefCache: s.dailyBriefCache,
        lastGreetedDate: s.lastGreetedDate,
        focusMinutesByDay: s.focusMinutesByDay,
        // badges, quickTaskOpen, toast intentionally NOT persisted
      }),
    }
  )
);

/** How long cached email data is considered fresh (5 minutes) */
export const EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;
