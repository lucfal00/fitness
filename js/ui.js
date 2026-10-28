// Formatting and escaping helpers shared by views and charts.
import { fromKey } from './logic.js';

// Template colour palette (accent first); identity is also carried by emoji + name.
export const COLORS = ['#c62f3a', '#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#0ea5e9', '#a855f7', '#16a34a'];
export const DAY_LETTERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export const GROUP_LABELS = {
  petto: 'Petto', dorso: 'Dorso', spalle: 'Spalle', bicipiti: 'Bicipiti', tricipiti: 'Tricipiti',
  avambracci: 'Avambracci', addome: 'Addome', glutei: 'Glutei', quadricipiti: 'Quadricipiti',
  femorali: 'Femorali', polpacci: 'Polpacci',
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Template colours may come from an imported file: only allow #rrggbb. */
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[0]);

const dayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (key) => cap(dayFmt.format(fromKey(key)));
export const fmtShort = (key) => `${+key.slice(8)}/${+key.slice(5, 7)}`;
export const fmtFull = (key) => `${fmtShort(key)}/${key.slice(0, 4)}`;
export const fmtNum = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
export const pct = (f) => (f == null ? '–' : `${Math.round(f * 100)}%`);
export const parseNum = (s) => parseFloat(String(s).replace(',', '.'));

/** Kilograms with decimal comma, no trailing zeros: 62.5 gives "62,5", 60 gives "60". */
export const fmtKg = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Seconds as "m:ss", or "h:mm:ss" from one hour. */
export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
