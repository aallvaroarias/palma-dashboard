import React from 'react';

export default function SectionTitle({ children, className = '' }) {
  return (
    <div
      className={`flex items-center gap-2.5 mt-6 mb-3 ${className}`}
    >
      <span
        className="font-display font-bold tracking-widest uppercase text-palumar-muted"
        style={{ fontSize: '10px', letterSpacing: '1.2px' }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: 'var(--border-2)' }}
      />
    </div>
  );
}
