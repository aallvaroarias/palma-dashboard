export const VEND_COLORS = [
  '#2AAED9', '#0FA97A', '#C8A43E', '#8B6CF6',
  '#2DC8D8', '#E05252', '#5BADC7', '#DDB84A',
  '#4CAF8A', '#F97316',
];

export const NEG_COLORS = {
  '01-Carnico':    '#2AAED9',
  '02-Galletas':   '#0FA97A',
  '03-Chocolates': '#C8A43E',
  '04-Café':       '#8B6CF6',
  '10-TMLUC':      '#2DC8D8',
};

export const COLORS = {
  blue:   '#1A7FA6',
  blueL:  '#2AAED9',
  gold:   '#C8A43E',
  goldL:  '#DDB84A',
  green:  '#0FA97A',
  red:    '#E05252',
  amber:  '#C8A43E',
  purple: '#8B6CF6',
  cyan:   '#2DC8D8',
  white:  '#EDF4FB',
  muted:  '#7A9BB8',
};

/** Returns semi-transparent version of a hex color */
export const alpha = (hex, a = 0.8) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
