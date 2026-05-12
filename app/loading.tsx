import { SkeletonScreen } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100vh' }}>
      {/* Sidebar skeleton */}
      <div style={{ background: 'var(--bg-2)', borderRight: '1px solid var(--border-soft)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="skeleton skeleton-custom" style={{ height: 28, width: 120, borderRadius: 6 }} />
        <div className="skeleton skeleton-custom" style={{ height: 28, borderRadius: 6 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-custom" style={{ height: 32, borderRadius: 6, opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </div>
      {/* Main skeleton */}
      <div style={{ background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ height: 44, borderBottom: '1px solid var(--border-soft)', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="skeleton skeleton-custom" style={{ height: 14, width: 80, borderRadius: 3 }} />
          <div className="skeleton skeleton-custom" style={{ height: 14, width: 120, borderRadius: 3 }} />
        </div>
        <SkeletonScreen />
      </div>
    </div>
  );
}
