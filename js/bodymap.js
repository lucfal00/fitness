// Body map: front and back silhouette, one element per zone (data-group), accent opacity by level 0-4.
import { esc, GROUP_LABELS } from './ui.js';

const rect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2.2}"/>`;
const ell = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const pair = (draw) => draw(false) + draw(true);          // left + mirrored right (figure centre x = 50)
const mx = (x, w, flip) => (flip ? 100 - x - w : x);

// Zone shapes in figure coordinates (100 x 165).
const FRONT = {
  spalle: pair((f) => ell(f ? 73 : 27, 38, 8, 7)),
  petto: pair((f) => rect(mx(33, 15, f), 34, 15, 16)),
  addome: rect(36, 52, 28, 28),
  bicipiti: pair((f) => rect(mx(16, 10, f), 45, 10, 24)),
  avambracci: pair((f) => rect(mx(13, 9, f), 71, 9, 28)),
  quadricipiti: pair((f) => rect(mx(33, 15, f), 84, 15, 40)),
  polpacci: pair((f) => rect(mx(34, 12, f), 128, 12, 32)),
};
const BACK = {
  spalle: pair((f) => ell(f ? 73 : 27, 38, 8, 7)),
  dorso: rect(33, 34, 34, 30),
  tricipiti: pair((f) => rect(mx(16, 10, f), 45, 10, 24)),
  avambracci: pair((f) => rect(mx(13, 9, f), 71, 9, 28)),
  glutei: pair((f) => rect(mx(33, 15, f), 66, 15, 16)),
  femorali: pair((f) => rect(mx(33, 15, f), 86, 15, 38)),
  polpacci: pair((f) => rect(mx(34, 12, f), 128, 12, 32)),
};

const OPACITY = [0, 0.3, 0.55, 0.78, 1];

function zones(shapes, levels) {
  return Object.entries(shapes).map(([g, svg]) => {
    const lv = Math.max(0, Math.min(4, Math.round(levels?.[g] ?? 0)));
    const style = lv === 0 ? 'fill:var(--track)' : `fill:var(--accent);fill-opacity:${OPACITY[lv]}`;
    return `<g class="zone" data-group="${g}" data-level="${lv}" style="${style}"><title>${esc(GROUP_LABELS[g])}</title>${svg}</g>`;
  }).join('');
}

/** Silhouette (head, neck, torso, limbs) behind the zones. */
const BASE = `<g style="fill:var(--empty)"><circle cx="50" cy="12" r="9"/>${rect(44, 20, 12, 12)}
  ${rect(28, 30, 44, 56)}${rect(31, 82, 38, 12)}${rect(32, 84, 17, 80)}${rect(51, 84, 17, 80)}
  ${rect(12, 34, 14, 68)}${rect(74, 34, 14, 68)}</g>`;

/** levels: { [group]: 0..4 } gives an SVG string with the front (left) and back (right) figures. */
export function bodyMap(levels = {}) {
  const fig = (x, label, shapes) => `<g transform="translate(${x} 0)">${BASE}${zones(shapes, levels)}
    <text x="50" y="178" text-anchor="middle" style="fill:var(--muted);font-size:10px">${label}</text></g>`;
  return `<svg class="bodymap" viewBox="0 0 220 184" role="img" aria-label="Mappa muscolare: fronte e retro">
    ${fig(0, 'Fronte', FRONT)}${fig(120, 'Retro', BACK)}</svg>`;
}
