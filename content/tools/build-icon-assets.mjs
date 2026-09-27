#!/usr/bin/env node
/**
 * 生成 App 端图标资产：设计库 icon() → 独立 SVG（96px）→ app/static/icons/*.svg
 * PNG 由 content/tools/qlmanage 批量转换（见 package.json 无依赖约定）。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'app', 'static', 'icons');
mkdirSync(OUT, { recursive: true });

const C = {
  coral: '#FF8A5C', mint: '#5FC9A5', mintDeep: '#2E7D5B', sky: '#6FB8E8',
  lemon: '#FFC94D', ink: '#4A4458', ink2: '#7A7290', ink3: '#AFA8BD',
  red: '#E86A6A', white: '#FFFFFF', termBg: '#3A3440', termInk: '#F3EFE9', termGreen: '#9BD49B',
};

function fmt(v) { return Math.round(v * 100) / 100; }
function transformPath(d, X, Y, k) {
  const TX = (v) => X + v * k;
  const TY = (v) => Y + v * k;
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let out = ''; let i = 0; let cmd = '';
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[A-Za-z]/.test(tk)) { cmd = tk; out += tk; i++; continue; }
    switch (cmd.toUpperCase()) {
      case 'M': case 'L': case 'T': out += `${fmt(TX(+tokens[i]))} ${fmt(TY(+tokens[i + 1]))}`; i += 2; break;
      case 'C': for (let j = 0; j < 6; j += 2) out += `${fmt(TX(+tokens[i + j]))} ${fmt(TY(+tokens[i + j + 1]))} `; i += 6; break;
      case 'Q': case 'S': out += `${fmt(TX(+tokens[i]))} ${fmt(TY(+tokens[i + 1]))} ${fmt(TX(+tokens[i + 2]))} ${fmt(TY(+tokens[i + 3]))}`; i += 4; break;
      case 'A': out += `${fmt(+tokens[i] * k)} ${fmt(+tokens[i + 1] * k)} ${tokens[i + 2]} ${tokens[i + 3]} ${tokens[i + 4]} ${fmt(TX(+tokens[i + 5]))} ${fmt(TY(+tokens[i + 6]))}`; i += 7; break;
      case 'H': out += fmt(TX(+tokens[i])); i += 1; break;
      case 'V': out += fmt(TY(+tokens[i])); i += 1; break;
      default: i += 1;
    }
    out += ' ';
  }
  return out.trim();
}

function iconSvg(name, color, o = {}) {
  const size = 96; const k = size / 24;
  const X = 0, Y = 0;
  const sh = [];
  const g = {
    r: (x, y, w, h, f, oo = {}) => sh.push(`<rect x="${fmt(X + x * k)}" y="${fmt(Y + y * k)}" width="${fmt(w * k)}" height="${fmt(h * k)}" rx="${fmt((oo.rx ?? 0) * k)}" fill="${f ?? 'none'}"${oo.st ? ` stroke="${oo.st}" stroke-width="${fmt((oo.sw ?? 1) * k)}"` : ''}/>`),
    c: (x, y, r, f, oo = {}) => sh.push(`<circle cx="${fmt(X + x * k)}" cy="${fmt(Y + y * k)}" r="${fmt(r * k)}" fill="${f ?? 'none'}"${oo.st ? ` stroke="${oo.st}" stroke-width="${fmt((oo.sw ?? 1) * k)}"` : ''}/>`),
    l: (x1, y1, x2, y2, st, oo = {}) => sh.push(`<line x1="${fmt(X + x1 * k)}" y1="${fmt(Y + y1 * k)}" x2="${fmt(X + x2 * k)}" y2="${fmt(Y + y2 * k)}" stroke="${st}" stroke-width="${fmt((oo.sw ?? 1) * k)}" stroke-linecap="round"/>`),
    p: (d, oo = {}) => sh.push(`<path d="${transformPath(d, X, Y, k)}" fill="${oo.f ?? 'none'}"${oo.st ? ` stroke="${oo.st}" stroke-width="${fmt((oo.sw ?? 2) * k)}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`),
  };
  const st = o.color ?? color;
  switch (name) {
    case 'bolt': g.p('M13.4 2.6 L5.8 13.2 L10.2 13.2 L9.1 21.4 L16.7 10.8 L12.3 10.8 Z', { f: o.f ?? color, st: o.f ?? color, sw: 2 }); break;
    case 'flame': g.p('M12 2.8 C15.4 7.2 17.4 10 17.4 13.2 A5.4 5.4 0 0 1 6.6 13.2 C6.6 10 8.6 7.2 12 2.8 Z', { f: o.f ?? C.lemon }); g.p('M12 9.4 C13.5 11.2 14.4 12.4 14.4 13.9 A2.4 2.4 0 0 1 9.6 13.9 C9.6 12.4 10.5 11.2 12 9.4 Z', { f: '#FFF6DE' }); break;
    case 'book': g.r(4.5, 4, 15, 16, o.f ?? 'none', { rx: 3, st, sw: 2.2 }); g.l(12, 4, 12, 20, st, { sw: 2 }); break;
    case 'search': g.c(10.6, 10.6, 5.2, 'none', { st, sw: 2.4 }); g.l(14.6, 14.6, 19, 19, st, { sw: 2.4 }); break;
    case 'star': g.p('M12 3.4 L14.4 8.4 20 9.2 16 13.1 16.9 18.6 12 16 7.1 18.6 8 13.1 4 9.2 9.6 8.4 Z', { f: o.f ?? color }); break;
    case 'check': g.p('M5 12.6 L9.4 17 19 7.6', { st, sw: 3 }); break;
    case 'chevL': g.p('M14.6 5.6 L8.2 12 L14.6 18.4', { st, sw: 2.6 }); break;
    case 'arrowR': g.p('M5 12 L18.4 12 M12.8 6.2 L18.6 12 L12.8 17.8', { st, sw: 2.4 }); break;
    case 'lock': g.r(6.4, 10.6, 11.2, 9, 'none', { rx: 3, st, sw: 2.2 }); g.p('M8.6 10.4 V8.2 A3.4 3.4 0 0 1 15.4 8.2 V10.4', { st, sw: 2.2 }); break;
    case 'user': g.c(12, 8.4, 4.1, 'none', { st, sw: 2.2 }); g.p('M4.8 19.8 C6.3 15.9 9 14.4 12 14.4 C15 14.4 17.7 15.9 19.2 19.8', { st, sw: 2.2 }); break;
    case 'flag': g.l(6.4, 3.6, 6.4, 20.4, st, { sw: 2.4 }); g.p('M6.4 4.6 H17.4 L14.9 8.1 L17.4 11.6 H6.4 Z', { f: o.f ?? color }); break;
    case 'alert': g.c(12, 12, 8, o.f ?? C.red); g.r(11, 6.8, 2, 6.4, C.white, { rx: 1 }); g.c(12, 15.9, 1.3, C.white); break;
    case 'chat': g.p('M4.4 6.4 A2.6 2.6 0 0 1 7 3.8 H17 A2.6 2.6 0 0 1 19.6 6.4 V13 A2.6 2.6 0 0 1 17 15.6 H10.4 L6 19.4 V15.6 A2.6 2.6 0 0 1 4.4 13 Z', { f: o.f ?? C.skySoft, st: o.st ?? C.sky, sw: 1.6 }); break;
    case 'clock': g.c(12, 12, 8.2, 'none', { st, sw: 2.2 }); g.p('M12 7.4 V12 L15.2 14.2', { st, sw: 2.2 }); break;
    case 'heart': g.p('M12 20 C7.5 16.5 4 13.6 4 10.2 A4.2 4.2 0 0 1 12 7.6 A4.2 4.2 0 0 1 20 10.2 C20 13.6 16.5 16.5 12 20 Z', { f: o.f ?? color }); break;
    case 'term': g.r(3.6, 4.6, 16.8, 14.8, o.f ?? C.termBg, { rx: 3 }); g.p('M7 9.5 L9.6 12 L7 14.5', { st: C.termGreen, sw: 1.8 }); g.l(11.4, 14.5, 16, 14.5, C.termInk, { sw: 1.8 }); break;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${sh.join('')}</svg>`;
}

const JOBS = [
  ['bolt', 'coral', 'bolt-coral'], ['bolt', 'lemon', 'bolt-lemon'], ['bolt', 'white', 'bolt-white'],
  ['flame', 'lemon', 'flame-lemon'],
  ['book', 'coral', 'book-coral'], ['book', 'ink3', 'book-ink3'], ['book', 'mintdeep', 'book-mintdeep'],
  ['star', 'lemon', 'star-lemon'], ['star', 'empty', 'star-empty'],
  ['chevL', 'ink', 'chevl-ink'],
  ['arrowR', 'white', 'arrowr-white'], ['arrowR', 'coral', 'arrowr-coral'],
  ['lock', 'ink3', 'lock-ink3'],
  ['user', 'coral', 'user-coral'], ['user', 'ink3', 'user-ink3'],
  ['flag', 'coral', 'flag-coral'], ['flag', 'ink3', 'flag-ink3'],
  ['alert', 'red', 'alert-red'],
  ['chat', 'sky', 'chat-sky'],
  ['clock', 'ink2', 'clock-ink2'],
  ['check', 'white', 'check-white'],
  ['term', 'default', 'term-dark'],
];
const COLORS = { ...C, empty: '#E8E2D8', mintdeep: C.mintDeep };

for (const [name, colorKey, outName] of JOBS) {
  writeFileSync(join(OUT, outName + '.svg'), iconSvg(name, COLORS[colorKey]));
}
console.log('SVG 图标已生成:', JOBS.length, '个 →', OUT);
