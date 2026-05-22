import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fmtK } from '../../utils/formatters';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const TICK_COLOR = '#7A9BB8';
const GRID_COLOR = 'rgba(90,145,185,0.08)';

/**
 * LineChart
 * Props:
 *   labels      {string[]}
 *   datasets    {Array<{ label, data, color, fill }>}
 *   formatValue {fn}        — tooltip formatter
 *   height      {number}    — container height (default 240)
 *   isPct       {boolean}
 */
export default function LineChart({
  labels = [],
  datasets = [],
  formatValue = fmtK,
  height = 240,
  isPct = false,
}) {
  const chartData = {
    labels,
    datasets: datasets.map((ds) => ({
      label: ds.label || '',
      data: ds.data,
      borderColor: ds.color || '#2AAED9',
      backgroundColor: ds.fill
        ? `${ds.color || '#2AAED9'}22`
        : 'transparent',
      fill: ds.fill || false,
      tension: 0.35,
      pointBackgroundColor: ds.color || '#2AAED9',
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: {
        display: datasets.length > 1,
        labels: {
          color: TICK_COLOR,
          font: { size: 11 },
          boxWidth: 10,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(7,19,29,0.92)',
        titleColor: '#EDF4FB',
        bodyColor: '#7A9BB8',
        borderColor: 'rgba(90,145,185,0.25)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => ` ${isPct ? ctx.raw + '%' : formatValue(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: TICK_COLOR,
          font: { size: 10 },
          maxRotation: 0,
        },
        grid: { color: GRID_COLOR },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        ...(isPct ? { max: 100 } : {}),
        ticks: {
          callback: isPct ? (v) => v + '%' : fmtK,
          color: TICK_COLOR,
          font: { size: 10, family: '"DM Mono", monospace' },
        },
        grid: { color: GRID_COLOR },
        border: { display: false },
      },
    },
  };

  return (
    <div style={{ height, position: 'relative', width: '100%' }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
