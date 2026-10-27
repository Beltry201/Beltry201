// Shared design tokens and SVG helpers for every figure in this README.
// Each figure is rendered twice (light + dark) and picked by <picture> in README.md,
// because an SVG inside <img> can't see GitHub's theme on its own.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const THEMES = {
  light: {
    name: 'light',
    page: '#FFFFFF', // GitHub light canvas
    ink: '#11131C',
    slate: '#5A5F73',
    faint: '#8E93A6',
    hair: '#E3E5EC',
    grid: '#EEF0F5',
    accent: '#3A33E6', // ultramarine: data, links, the one loud color
    accentWash: '#3A33E6',
    field: '#3A33E6', // hero panel
    fieldInk: '#FFFFFF',
    fieldSoft: '#C9C7FF',
    spark: '#FFC94D', // the "event" that travels through the hero loop
    empty: '#F2F3F8',
    ramp: ['#D9D7FB', '#A9A5F6', '#7671EE', '#3A33E6'],
  },
  dark: {
    name: 'dark',
    page: '#0D1117', // GitHub dark canvas
    ink: '#E9EBF2',
    slate: '#8D93A7',
    faint: '#5F6578',
    hair: '#262C3A',
    grid: '#161B25',
    accent: '#A09CFF',
    accentWash: '#7C78F2',
    field: '#2B26B8',
    fieldInk: '#FFFFFF',
    fieldSoft: '#B8B5FF',
    spark: '#FFC94D',
    empty: '#161B26',
    ramp: ['#2A2B5C', '#4441A0', '#6F6BD8', '#A09CFF'],
  },
};

export const SANS = `'Bricolage', 'Segoe UI', system-ui, -apple-system, sans-serif`;

// ---------- fonts (embedded, because <img> SVGs can't load web fonts) ----------
const fontCache = {};
function fontData(weight) {
  if (!fontCache[weight]) {
    const buf = readFileSync(join(ROOT, 'assets', 'fonts', `bricolage-${weight}.woff2`));
    fontCache[weight] = buf.toString('base64');
  }
  return fontCache[weight];
}
export function fontFaces(weights = [400, 700]) {
  return weights
    .map(
      (w) =>
        `@font-face{font-family:'Bricolage';font-weight:${w};font-style:normal;` +
        `src:url(data:font/woff2;base64,${fontData(w)}) format('woff2')}`
    )
    .join('');
}

// ---------- text measurement (advance widths extracted from the embedded fonts) ----------
const WIDTHS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lib', 'glyph-widths.json'), 'utf8'));
export function measure(text, size, weight = 400, tracking = 0) {
  const table = WIDTHS[weight] || WIDTHS[400];
  let w = 0;
  for (const ch of String(text)) w += table[ch.codePointAt(0)] ?? 0.55;
  return w * size + tracking * size * Math.max(0, [...String(text)].length - 1);
}

// Greedy word wrap against measured widths.
export function wrap(text, size, weight, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, size, weight) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------- misc ----------
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const fmt = (n) => Number(n).toLocaleString('en-US');

export const r1 = (n) => Math.round(n * 10) / 10;

export function svgDoc({ width, height, title, desc, css = '', body, weights }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${fontFaces(weights)}
text{font-family:${SANS};font-kerning:normal;font-feature-settings:'kern','tnum'}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
${css}</style>
${body}
</svg>
`;
}

// A run of text where some segments are bold numbers: [['1,284', 'num'], [' contributions', 'txt']]
export function richLine(x, y, parts, styles) {
  const spans = parts
    .map(([str, key]) => {
      const s = styles[key];
      return `<tspan font-weight="${s.weight}" fill="${s.fill}">${esc(str)}</tspan>`;
    })
    .join('');
  const size = styles.size;
  return `<text x="${x}" y="${y}" font-size="${size}" xml:space="preserve">${spans}</text>`;
}
export function richWidth(parts, styles) {
  return parts.reduce((w, [str, key]) => w + measure(str, styles.size, styles[key].weight), 0);
}
