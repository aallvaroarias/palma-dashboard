/**
 * Chart.js plugin that draws value labels at the end of each horizontal bar.
 *
 * Primary label (always): the bar's own value (coverage %, venta $, etc.)
 * Secondary label (optional): a second value shown on a second line inside the bar
 *   — e.g. Venta Neta $ while the primary is coverage %.
 *
 * Usage in chart options:
 *   plugins: {
 *     barDataLabels: {
 *       formatValue:   fmtK,         // formatter for primary value
 *       isPct:         false,
 *       secondaryData: [1234, 5678],  // optional: one value per bar
 *       secondaryFmt:  fmtK,          // optional: formatter for secondary value
 *     }
 *   }
 */
export const barDataLabelsPlugin = {
  id: 'barDataLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea } = chart;
    if (!opts || !chartArea) return;

    const { formatValue, isPct, secondaryData, secondaryFmt, secondaryColor } = opts;

    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta.visible) return;

      meta.data.forEach((bar, i) => {
        const raw = dataset.data[i];
        if (raw == null || raw === 0) return;

        // ── primary label ──────────────────────────────────────────
        const label1 = formatValue
          ? formatValue(raw)
          : isPct
            ? raw.toFixed(1) + '%'
            : raw.toLocaleString();

        // ── secondary label ────────────────────────────────────────
        const hasSecondary = Array.isArray(secondaryData) && secondaryData[i] != null;
        const raw2   = hasSecondary ? secondaryData[i] : null;
        const label2 = raw2 != null
          ? (secondaryFmt ? secondaryFmt(raw2) : ('$' + Math.abs(+raw2 || 0).toLocaleString('en', { maximumFractionDigits: 0 })))
          : null;

        const barW  = Math.abs(bar.x - bar.base);
        const inside = barW > (label2 ? 90 : 72);

        ctx.save();
        ctx.textBaseline = 'middle';

        if (inside) {
          const xPos = Math.min(bar.x - 7, chartArea.right - 4);

          if (label2) {
            // line 1: coverage %
            ctx.font      = '600 10px "DM Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(237,244,251,0.95)';
            ctx.fillText(label1, xPos, bar.y - 5);

            // line 2: secondary value
            ctx.font      = '600 9px "DM Mono", monospace';
            ctx.fillStyle = secondaryColor || 'rgba(45,200,216,0.88)';
            ctx.fillText(label2, xPos, bar.y + 6);
          } else {
            ctx.font      = '500 10px "DM Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(237,244,251,0.92)';
            ctx.fillText(label1, xPos, bar.y);
          }
        } else {
          // Outside bar
          const xPos = Math.min(bar.x + 5, chartArea.right - 4);

          if (label2) {
            ctx.textAlign = 'left';

            ctx.font      = '600 10px "DM Mono", monospace';
            ctx.fillStyle = '#7A9BB8';
            ctx.fillText(label1, xPos, bar.y - 5);

            ctx.font      = '600 9px "DM Mono", monospace';
            ctx.fillStyle = secondaryColor || 'rgba(45,200,216,0.70)';
            ctx.fillText(label2, xPos, bar.y + 6);
          } else {
            ctx.font      = '500 10px "DM Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#7A9BB8';
            ctx.fillText(label1, xPos, bar.y);
          }
        }

        ctx.restore();
      });
    });
  },
};

export default barDataLabelsPlugin;
