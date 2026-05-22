/**
 * Chart.js plugin that draws value labels at the end of each horizontal bar.
 *
 * - If the bar is wide enough (> 72px): label goes INSIDE, right-aligned, white text.
 * - If the bar is short: label goes OUTSIDE to the right, muted text.
 *
 * Usage in chart options:
 *   plugins: {
 *     barDataLabels: { formatValue: fmtK, isPct: false }
 *   }
 */
export const barDataLabelsPlugin = {
  id: 'barDataLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea } = chart;
    if (!opts || !chartArea) return;

    const { formatValue, isPct } = opts;

    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta.visible) return;

      meta.data.forEach((bar, i) => {
        const raw = dataset.data[i];
        if (raw == null || raw === 0) return;

        const label = formatValue
          ? formatValue(raw)
          : isPct
            ? raw.toFixed(1) + '%'
            : raw.toLocaleString();

        const barW = Math.abs(bar.x - bar.base);
        const inside = barW > 72;

        ctx.save();
        ctx.font = '500 10px "DM Mono", monospace';
        ctx.textBaseline = 'middle';

        if (inside) {
          // Inside bar, near right edge
          ctx.textAlign = 'right';
          ctx.fillStyle = 'rgba(237,244,251,0.92)';
          ctx.fillText(label, Math.min(bar.x - 6, chartArea.right - 4), bar.y);
        } else {
          // Outside bar, just after right edge
          ctx.textAlign = 'left';
          ctx.fillStyle = '#7A9BB8';
          const x = Math.min(bar.x + 5, chartArea.right - 4);
          ctx.fillText(label, x, bar.y);
        }

        ctx.restore();
      });
    });
  },
};

export default barDataLabelsPlugin;
