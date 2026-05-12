'use client';

import { Settings2, X } from 'lucide-react';
import { ACCENTS, useAppStore } from '@/lib/store';
import type { AccentKey, DensityKey, ThemeKey } from '@/types';

export function TweaksPanel() {
  const open = useAppStore((s) => s.tweaksOpen);
  const setOpen = useAppStore((s) => s.setTweaksOpen);
  const preferences = useAppStore((s) => s.preferences);
  const setPreference = useAppStore((s) => s.setPreference);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 500,
          width: 36, height: 36, borderRadius: '50%',
          background: open ? 'var(--accent)' : 'var(--panel)', border: '1px solid var(--border)',
          color: open ? 'white' : 'var(--text-dim)', display: 'grid', placeItems: 'center',
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          transition: 'background 150ms, color 150ms',
        }}
        aria-label="Tweaks"
      >
        <Settings2 size={15} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 64, right: 20, zIndex: 500,
          width: 240,
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Tweaks</span>
            <button className="ai-x" onClick={() => setOpen(false)}><X size={13} /></button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Theme</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['dark', 'light'] as ThemeKey[]).map((t) => (
                <button key={t} className={`btn btn-sm${preferences.theme === t ? ' btn-primary' : ''}`}
                  onClick={() => setPreference('theme', t)}>{t}</button>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Accent</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(Object.entries(ACCENTS) as [AccentKey, string][]).map(([key, val]) => (
                <button key={key} title={key}
                  onClick={() => setPreference('accent', key)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: val, border: preferences.accent === key ? '2px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer',
                  }} />
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Density</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['compact', 'regular', 'comfy'] as DensityKey[]).map((d) => (
                <button key={d} className={`btn btn-sm${preferences.density === d ? ' btn-primary' : ''}`}
                  onClick={() => setPreference('density', d)}>{d}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 12.5 }}>AI panel</span>
              <button
                className={`btn btn-sm${preferences.showAI ? ' btn-primary' : ''}`}
                onClick={() => setPreference('showAI', !preferences.showAI)}>
                {preferences.showAI ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
