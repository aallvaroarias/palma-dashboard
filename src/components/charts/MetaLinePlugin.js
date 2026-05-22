/**
 * Chart.js plugin that draws a vertical dashed line at a given x-value
 * (used for meta/target lines in horizontal bar charts).
 *
 * Usage:
 *   import { metaLinePlugin } from './MetaLinePlugin';
 *   Chart.register(metaLinePlugin);
 *   // then add to chart options.plugins.metaLine: { value: 75, color: '#E05252', label: '75%' }
 */
export const metaLinePlugin = {
  id: 'metaLine',
  afterDraw(chart, _args, options) {
    const { value, color = '#E05252', label, lineWidth = 1.5 } = options;
    if (value == null) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!xScale) return;

    const xPx = xScale.getPixelForValue(value);
    if (xPx < chartArea.left || xPx > chartArea.right) return;

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([5, 4]);
    ctx.moveTo(xPx, chartArea.top);
    ctx.lineTo(xPx, chartArea.bottom);
    ctx.stroke();

    if (label) {
      ctx.fillStyle = color;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, xPx, chartArea.top - 4);
    }

    ctx.restore();
  },
};

export default metaLinePlugin;
