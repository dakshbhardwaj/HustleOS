'use client';

import type { Tone } from '@/types';

export { Skeleton, SkeletonScreen } from './Skeleton';
export { ErrorBoundary } from './ErrorBoundary';
export { EmptyState } from './EmptyState';

// Pill
interface PillProps { children: React.ReactNode; tone?: Tone }
export function Pill({ children, tone = 'neutral' }: PillProps) {
  const tones: Record<Tone, React.CSSProperties> = {
    neutral: { background: 'var(--chip-bg)', color: 'var(--text-dim)', borderColor: 'var(--border)' },
    accent:  { background: 'color-mix(in oklch, var(--accent) 14%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in oklch, var(--accent) 30%, transparent)' },
    success: { background: 'color-mix(in oklch, var(--success) 14%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in oklch, var(--success) 28%, transparent)' },
    warn:    { background: 'color-mix(in oklch, var(--warn) 14%, transparent)', color: 'var(--warn)', borderColor: 'color-mix(in oklch, var(--warn) 28%, transparent)' },
    danger:  { background: 'color-mix(in oklch, var(--danger) 14%, transparent)', color: 'var(--danger)', borderColor: 'color-mix(in oklch, var(--danger) 28%, transparent)' },
  };
  return <span className="pill" style={tones[tone]}>{children}</span>;
}

// StatTile
interface StatTileProps { label: string; value: string; delta?: string; foot?: string; onClick?: () => void }
export function StatTile({ label, value, delta, foot, onClick }: StatTileProps) {
  const deltaClass = delta?.startsWith('+') ? 'up' : delta?.startsWith('-') ? 'down' : '';
  return (
    <div
      className="tile"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', transition: 'border-color 120ms' } : undefined}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; } : undefined}
    >
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {delta && <div className={`tile-delta ${deltaClass}`}>{delta}</div>}
      {foot && <div className="tile-foot">{foot}</div>}
    </div>
  );
}

// AISuggestion
interface AISuggestionProps {
  children: React.ReactNode;
  onAccept?: () => void;
  onDismiss?: () => void;
}
export function AISuggestion({ children, onAccept, onDismiss }: AISuggestionProps) {
  return (
    <div className="ai-card">
      <div className="ai-glyph">✦</div>
      <div className="ai-body">{children}</div>
      <div className="ai-actions">
        {onAccept  && <button className="btn btn-ghost btn-sm" onClick={onAccept}>Accept</button>}
        {onDismiss && <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>}
      </div>
    </div>
  );
}

// ScreenHeader
interface ScreenHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}
export function ScreenHeader({ kicker, title, subtitle, actions }: ScreenHeaderProps) {
  return (
    <div className="screen-header">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1 className="screen-title">{title}</h1>
        {subtitle && <div className="screen-sub">{subtitle}</div>}
      </div>
      {actions && <div className="screen-actions">{actions}</div>}
    </div>
  );
}

// Panel
interface PanelProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}
export function Panel({ title, action, children, style }: PanelProps) {
  return (
    <section className="panel" style={style}>
      {title && (
        <header className="panel-h">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
