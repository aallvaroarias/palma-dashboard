import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { fmt } from '../../utils/formatters';
import { alpha } from '../../utils/colors';

ChartJS.register(ArcElement, Tooltip, Legend);

/**
 * DoughnutChart
 * Props:
 *   labels      {string[]}
 *   data        {number[]}
 *   colors      {string[]}      — array of hex colors
 *   formatValue {fn}            — tooltip formatter
 *   height      {number}        — container height (default 220)
 *   showLegend  {boolean}       — show built-in legend (default false — use custom)
 *   cutout      {string}        — default '62%'
 */
export default function DoughnutChart({
  labels = [],
  data = [],
  colors = [],
  formatValue = fmt,
  height = 220,
  showLegend = false,
  cutout = '62%',
}) {
  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors.map(c => alpha(c, 0.82)),
        borderColor: '#07131D',
        borderWidth: 2,
        hoverBorderWidth: 3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout,
    animation: { duration: 400 },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom',
        labels: {
          color: '#7A9BB8',
          boxWidth: 10,
          font: { size: 10 },
          padding: 12,
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
          label: (ctx) => ` ${ctx.label}: ${formatValue(ctx.raw)}`,
        },
      },
    },
  };

  return (
    <div style={{ height, position: 'relative', width: '100%' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}
