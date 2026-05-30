import React from 'react';

export default function SectionTitle({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-3 mt-7 mb-3.5 ${className}`}>
      {/* Accent pip */}
      <div
        style={{
          width: 3,
          height: 14,
          borderRadius: 2,
          background: 'linear-gradient(180deg, #2AAED9 0%, #1A7FA6 100%)',
          flexShrink: 0,
        }}
      />
      <span
        className="font-display font-bold uppercase tracking-widest text-palumar-white"
        style={{ fontSize: '10.5px', letterSpacing: '1.4px', opacity: 0.75 }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: 'linear-gradient(90deg, var(--border-2) 0%, transparent 100%)' }}
      />
    </div>
  );
}
