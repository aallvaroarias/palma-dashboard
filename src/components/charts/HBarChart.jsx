import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { metaLinePlugin } from './MetaLinePlugin';
import { barDataLabelsPlugin } from './BarDataLabelsPlugin';
import { fmt, fmtK, pct } from '../../utils/formatters';
import { alpha } from '../../utils/colors';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, metaLinePlugin, barDataLabelsPlugin);

const TICK_COLOR = '#7A9BB8';
const GRID_COLOR = 'rgba(90,145,185,0.08)';

/**
 * HBarChart — Horizontal Bar Chart
 * Props:
 *   labels      {string[]}  — y-axis labels
 *   data        {number[]}  — values
 *   barColors   {string[]}  — per-bar color array (optional)
 *   color       {string}    — single hex color if barColors not provided
 *   metaValue   {number}    — vertical line for meta/target
 *   metaColor   {string}    — color for meta line
 *   metaLabel   {string}    — label on meta line
 *   formatValue {fn}        — tooltip formatter (defaults to fmtK)
 *   isPct       {boolean}   — if true: x-axis 0-100 + % labels
 *   minH        {number}    — minimum container height (default 200)
 *   rowH        {number}    — height per row (default 36)
 */
export default function HBarChart({
  labels = [],
  data = [],
  barColors,
  color = '#2AAED9',
  metaValue,
  metaColor = '#E05252',
  metaLabel,
  formatValue,
  isPct = false,
  minH = 200,
  rowH = 36,
  secondaryData,    // optional: array of secondary values (one per bar)
  secondaryFmt,     // optional: formatter for secondary value
}) {
  const effectiveRowH = secondaryData ? Math.max(rowH, 44) : rowH;
  const height = Math.max(minH, labels.length * effectiveRowH + 48);

  const backgroundColor = useMemo(() => {
    if (barColors && barColors.length) {
      return barColors.map(c => alpha(c, 0.82));
    }
    return alpha(color, 0.82);
  }, [barColors, color]);

  // x-axis ticks: compact (fmtK) para que no se superpongan. Etiquetas de barra: valor completo en $.
  const tickFmt    = isPct ? (v) => v + '%' : fmtK;
  const tooltipFmt = formatValue || (isPct ? pct : fmt);

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    layout: {
      // Extra right padding so short-bar outside labels never clip
      padding: { right: 56 },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(7,19,29,0.92)',
        titleColor: '#EDF4FB',
        bodyColor: '#7A9BB8',
        borderColor: 'rgba(90,145,185,0.25)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => ` ${tooltipFmt(ctx.raw)}`,
        },
      },
      metaLine: metaValue != null
        ? { value: metaValue, color: metaColor, label: metaLabel }
        : {},
      barDataLabels: {
        formatValue: tooltipFmt,
        isPct,
        secondaryData,
        secondaryFmt,
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ...(isPct ? { max: 100 } : {}),
        ticks: {
          callback: tickFmt,
          color: TICK_COLOR,
          font: { size: 10, family: '"DM Mono", monospace' },
        },
        grid: { color: GRID_COLOR },
        border: { display: false },
      },
      y: {
        ticks: {
          autoSkip: false,
          color: TICK_COLOR,
          font: { size: 11, family: 'Inter, system-ui, sans-serif' },
        },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  return (
    <div style={{ height, position: 'relative', width: '100%' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
