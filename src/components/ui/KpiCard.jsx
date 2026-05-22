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

/**
 * KpiCard
 * Props:
 *   label     {string}  — card title
 *   value     {string}  — main value
 *   sub       {string}  — optional subtitle
 *   color     {string}  — 'blue'|'green'|'red'|'amber'|'purple'|'cyan'
 *   barValue  {number}  — 0-100 percentage for the mini progress bar
 *   barColor  {string}  — CSS color for bar fill (defaults to color gradient)
 *   onClick   {fn}      — optional click handler
 *   icon      {ReactNode} — optional icon element
 */
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
      {/* Top accent line is done via CSS ::before */}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <span
          className="font-sans font-bold uppercase tracking-wider text-palumar-muted"
          style={{ fontSize: '10px', letterSpacing: '0.6px' }}
        >
          {label}
        </span>
        {icon && (
          <span className="text-palumar-muted opacity-60 text-sm">
            {icon}
          </span>
        )}
      </div>

      {/* Main value */}
      <div
        className="font-mono-num font-medium leading-none text-palumar-white"
        style={{ fontSize: '26px', letterSpacing: '-1px' }}
      >
        {value ?? '—'}
      </div>

      {/* Subtitle */}
      {sub !== undefined && sub !== null && (
        <div
          className="text-palumar-muted mt-1.5"
          style={{ fontSize: '11px' }}
          dangerouslySetInnerHTML={{ __html: sub }}
        />
      )}

      {/* Mini progress bar */}
      {barValue !== undefined && (
        <div
          className="mt-2.5 h-0.5 rounded-full overflow-hidden"
          style={{ background: 'var(--navy-4)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(barValue, 100)}%`,
              background: barColor || colorConf.bar,
            }}
          />
        </div>
      )}
    </div>
  );
}
