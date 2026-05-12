'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { NAV } from '@/lib/nav';
import { useAppStore } from '@/lib/store';
import type { ScreenKey } from '@/types';

interface CmdItem {
  k: string;
  type: 'Jump' | 'AI' | 'Action';
  label: string;
  action: () => void;
}

export function CommandPalette() {
  const cmdOpen          = useAppStore((s) => s.cmdOpen);
  const setCmdOpen       = useAppStore((s) => s.setCmdOpen);
  const setActive        = useAppStore((s) => s.setActive);
  const setAiOpen        = useAppStore((s) => s.setAiOpen);
  const setAiPendingPrompt = useAppStore((s) => s.setAiPendingPrompt);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);

  const jump = (key: ScreenKey) => {
    setActive(key);
    setCmdOpen(false);
  };

  const askAI = (prompt: string) => {
    setAiPendingPrompt(prompt);
    setAiOpen(true);
    setCmdOpen(false);
  };

  const items = useMemo<CmdItem[]>(() => {
    const base: CmdItem[] = [
      ...NAV.map((n) => ({ k: 'go-' + n.key, type: 'Jump' as const, label: 'Go to ' + n.label, action: () => jump(n.key) })),
      { k: 'ai-plan',   type: 'AI',     label: 'Plan my day',                  action: () => askAI('Plan my day. List my P0 tasks, key job actions, and top opportunities.') },
      { k: 'ai-prep',   type: 'AI',     label: 'Run a mock interview session', action: () => jump('interview')     },
      { k: 'ai-resume', type: 'AI',     label: 'Analyze my resume vs a JD',   action: () => jump('resume')        },
      { k: 'ai-rank',   type: 'AI',     label: "Rank today's opportunities",   action: () => askAI("Rank my open opportunities by fit score and urgency. What should I focus on today?") },
      { k: 'ai-brief',  type: 'AI',     label: "Generate my daily brief",      action: () => jump('brief')         },
      { k: 'ai-stuck',  type: 'AI',     label: "I'm stuck — help me unblock",  action: () => askAI("I'm feeling stuck. Look at my blocked tasks and help me figure out what to do next.") },
      { k: 'new-task',  type: 'Action', label: 'New task',                     action: () => jump('tasks')         },
      { k: 'new-app',   type: 'Action', label: 'Add job application',          action: () => jump('jobs')          },
      { k: 'new-opp',   type: 'Action', label: 'Track an opportunity',         action: () => jump('opportunities') },
      { k: 'new-note',  type: 'Action', label: 'Write a note in Vault',        action: () => jump('vault')         },
      { k: 'focus',     type: 'Action', label: 'Start a focus session',        action: () => jump('focus')         },
    ];

    const trimmed = q.trim();
    if (!trimmed) return base;

    const f = trimmed.toLowerCase();
    const matched = base.filter((i) => i.label.toLowerCase().includes(f));

    // Always prepend an "Ask AI" item when the user has typed something
    const askItem: CmdItem = {
      k: 'ask-ai',
      type: 'AI',
      label: `Ask AI: "${trimmed}"`,
      action: () => askAI(trimmed),
    };
    return [askItem, ...matched];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (cmdOpen) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [cmdOpen]);

  useEffect(() => { setCursor(0); }, [q]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setCmdOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
    if (e.key === 'Enter' && items[cursor]) { items[cursor].action(); }
  };

  return (
    <Dialog.Root open={cmdOpen} onOpenChange={setCmdOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-scrim">
          <Dialog.Content className="cmd-modal" onKeyDown={onKeyDown} aria-label="Command palette">
            <div className="cmd-input-wrap">
              <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>⌕</span>
              <input
                ref={inputRef}
                className="cmd-input"
                placeholder="Jump to anything or ask AI…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <kbd>esc</kbd>
            </div>
            <ul className="cmd-list" role="listbox">
              {items.slice(0, 9).map((it, i) => (
                <li
                  key={it.k}
                  className={`cmd-item${i === cursor ? ' active' : ''}`}
                  role="option"
                  aria-selected={i === cursor}
                  onClick={() => { it.action(); setCmdOpen(false); }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className={`cmd-type${it.type === 'AI' ? ' ai' : ''}`}>
                    {it.type === 'AI' ? '✦' : it.type[0]}
                  </span>
                  <span>{it.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
                    {it.type}
                  </span>
                </li>
              ))}
              {items.length === 0 && (
                <li className="cmd-empty">Type anything — AI will answer it.</li>
              )}
            </ul>
            <footer className="cmd-foot">
              <span><kbd>↵</kbd> select</span>
              <span><kbd>↑↓</kbd> nav</span>
              <span><kbd>esc</kbd> close</span>
              <span style={{ marginLeft: 'auto' }}>✦ AI ready</span>
            </footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
