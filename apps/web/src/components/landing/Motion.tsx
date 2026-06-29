'use client';

import type { PropsWithChildren } from 'react';

export function FadeIn({ children, className = '', delay = 0 }: PropsWithChildren<{ className?: string; delay?: number }>) {
  return (
    <div className={`animate-fade-up ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
