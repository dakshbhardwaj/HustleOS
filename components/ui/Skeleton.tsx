'use client';

interface SkeletonProps {
  variant?: 'text' | 'title' | 'card' | 'row' | 'custom';
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ variant = 'text', width, height, style }: SkeletonProps) {
  const cls = variant === 'custom' ? 'skeleton' : `skeleton skeleton-${variant}`;
  return (
    <div
      className={cls}
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonScreen() {
  return (
    <div className="screen" style={{ gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton variant="text" width={80} />
          <Skeleton variant="title" width={200} />
          <Skeleton variant="text" width={160} />
        </div>
        <Skeleton variant="custom" width={90} height={30} style={{ borderRadius: 6 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="card" />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="row" />)}
      </div>
    </div>
  );
}
