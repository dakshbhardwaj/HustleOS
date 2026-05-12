'use client';

import { useAppStore } from '@/lib/store';

export function ShellWrapper({ children }: { children: React.ReactNode }) {
  const aiOpen = useAppStore((s) => s.aiOpen);
  const showAI = useAppStore((s) => s.preferences.showAI);
  return (
    <div className={`app-shell${aiOpen && showAI ? ' with-ai' : ''}`}>
      {children}
    </div>
  );
}
