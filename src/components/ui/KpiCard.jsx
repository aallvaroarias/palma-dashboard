import React from 'react';

const COLOR_MAP = {
  blue:   { bar: 'linear-gradient(90deg, #1A7FA6, #2DC8D8)' },
  green:  { bar: 'linear-gradient(90deg, #0FA97A, #34D399)' },
  red:    { bar: 'linear-gradient(90deg, #E05252, #F87171)' },
  amber:  { bar: 'linear-gradient(90deg, #C8A43E, #DDB84A)' },
  gold:   { bar: 'linear-gradient(90deg, #C8A43E, #DDB84A)' },
  purple: { bar: 'linear-gradient(90deg, #8B6CF6, #A78BFA)' },
  cyan:   { bar: 'linear-gradient(90deg, #2DC8D8, #67E8F9)' },
  teal:   { bar: 'linear-gradient(90deg, #1A7FA6, #2AAED9)' },
};

export default function KpiCard({
  label,
  value,
  sub,
  color = 'blue',
  barValue,
  barColor,
  onClick,
  icon,
}) {
  const colorConf = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div
      className={`kpi-card color-${color} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e) : undefined}
    >
      {/* Label row */}
      <div className="flex items-start justify-between mb-2">
        <span
          className="font-sans font-bold uppercase tracking-wider text-palumar-muted"
          style={{ fontSize: '10px', letterSpacing: '0.65px' }}
        >
          {label}
        </span>
        {icon && (
          <span className="text-palumar-muted opacity-50 text-sm">{icon}</span>
        )}
      </div>

      {/* Main value */}
      <div
        className="font-mono-num font-semibold leading-none text-palumar-white"
        style={{ fontSize: '28px', letterSpacing: '-1.5px' }}
      >
        {value ?? '—'}
      </div>

      {/* Subtitle */}
      {sub !== undefined && sub !== null && (
        <div
          className="text-palumar-muted mt-2"
          style={{ fontSize: '11px', lineHeight: 1.4 }}
          dangerouslySetInnerHTML={{ __html: sub }}
        />
      )}

      {/* Progress bar — 3px, rounded, with glow */}
      {barValue !== undefined && (
        <div
          className="mt-3 rounded-full overflow-hidden"
          style={{ height: '3px', background: 'rgba(90,145,185,0.15)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(barValue, 100)}%`,
              background: barColor || colorConf.bar,
              boxShadow: `0 0 6px ${barColor || 'rgba(26,127,166,0.6)'}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
