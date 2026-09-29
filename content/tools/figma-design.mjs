#!/usr/bin/env node
/**
 * 「排错推理训练场」可爱风 UI 设计稿生成器 v2
 *
 *   node figma-design.mjs dry    → /tmp/figma_review/preview.html（本地预览）
 *   node figma-design.mjs push   → 写回 Figma（重建页面 + 6 屏 + 动效规范）并导出 PNG
 *
 * v2 变更：自有图标系统（圆头描边贴纸风 + 吉祥物矢量 mark，去系统 emoji）；
 * 首页改章节地图网格 + 底部 3 Tab；新增章节详情页与个人中心页；新增动效规范画板。
 * 形状（rect/line/circle/ellipse/path）走 SVG；文案走 create_text 可编辑图层。
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.FIGMA_RPC || 'http://localhost:3057';
const PAGE_NAME = '排错推理训练场 · MVP';
const W = 390;

/* ---------- 可爱风 Design Tokens ---------- */
const C = {
  bg: '#FFF9F4', card: '#FFFFFF', line: '#F5E6DA', well: '#FBF3EB',
  coral: '#FF8A5C', coralDeep: '#E86F3F', coralSoft: '#FFF1E7', coralLine: '#FFD3BC',
  pink: '#FFB5C8', pinkSoft: '#FFEDF2',
  mint: '#5FC9A5', mintSoft: '#E9F7F1', mintDeep: '#2E7D5B',
  sky: '#6FB8E8', skySoft: '#EAF4FC',
  lemon: '#FFC94D', lemonSoft: '#FFF6DE', lemonLine: '#F2D98C', lemonDeep: '#8A6D1F', lemonSub: '#B08F4A',
  ink: '#4A4458', ink2: '#7A7290', ink3: '#AFA8BD',
  termBg: '#3A3440', termInk: '#F3EFE9', termGreen: '#9BD49B',
  red: '#E86A6A', redSoft: '#FDEDED',
  darkCard: '#4A4458', darkTrack: '#5E5770', darkSub: '#C9C2DA',
  white: '#FFFFFF',
  otter: '#B98A6B', otterFace: '#E8C9A8',
};

/* ---------- 屏幕模型（形状 + 文案分离） ---------- */
function makeScreen() {
  const sh = [];
  const tx = [];
  let H = 0;
  const bump = (v) => { if (v > H) H = v; };
  const s = {
    sh, tx,
    r(x, y, w, h, f, o = {}) {
      sh.push({ t: 'r', x, y, w, h, f, rx: o.rx ?? 0, st: o.st, sw: o.sw ?? 1, dash: !!o.dash });
      bump(y + h);
    },
    c(x, y, r, f, o = {}) {
      sh.push({ t: 'c', x, y, r, f, st: o.st, sw: o.sw ?? 1 });
      bump(y + r);
    },
    e(x, y, rx, ry, f, o = {}) {
      sh.push({ t: 'e', x, y, rx, ry, f, st: o.st, sw: o.sw ?? 1 });
      bump(y + ry);
    },
    l(x1, y1, x2, y2, st, o = {}) {
      sh.push({ t: 'l', x1, y1, x2, y2, st, sw: o.sw ?? 1, dash: !!o.dash });
      bump(y2);
    },
    p(d, o = {}) {
      sh.push({ t: 'p', d, f: o.f, st: o.st, sw: o.sw ?? 2 });
      bump(o.y ?? 0);
    },
    img(name, x, y, w) {
      sh.push({ t: 'img', name, x, y, w });
      bump(y + w);
    },
    card(x, y, w, h, face, edge, rx, thick = 8) {
      sh.push({ t: 'r', x, y: y + thick, w, h, f: edge, rx });
      sh.push({ t: 'r', x, y, w, h, f: face, rx });
      bump(y + thick + h);
    },
    t(s2, x, y, fs, o = {}) {
      tx.push({ s: s2, x, y, fs, w: o.w ?? 'R', c: o.c ?? C.ink, width: o.width, al: o.al ?? 'L' });
      bump(y + fs * 1.5 * s2.split('\n').length);
    },
    nav(title) {
      s.p('M20 24 L13 31 L20 38', { st: C.ink, sw: 2.4 });
      s.t(title, 0, 22, 16, { w: 'B', c: C.ink, width: W, al: 'C' });
    },
    get H2() { return H; },
  };
  return s;
}

/* ---------- 变换组：把 24/48 网格图形缩放平移到目标位置 ---------- */
function fmt(v) {
  return Math.round(v * 100) / 100;
}
function transformPath(d, X, Y, k) {
  const TX = (v) => X + v * k;
  const TY = (v) => Y + v * k;
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let out = '';
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[A-Za-z]/.test(tk)) {
      cmd = tk;
      out += tk;
      i++;
      continue;
    }
    switch (cmd.toUpperCase()) {
      case 'M': case 'L': case 'T':
        out += `${fmt(TX(+tokens[i]))} ${fmt(TY(+tokens[i + 1]))}`;
        i += 2;
        break;
      case 'C':
        for (let j = 0; j < 6; j += 2) {
          out += `${fmt(TX(+tokens[i + j]))} ${fmt(TY(+tokens[i + j + 1]))} `;
        }
        i += 6;
        break;
      case 'Q': case 'S':
        out += `${fmt(TX(+tokens[i]))} ${fmt(TY(+tokens[i + 1]))} ${fmt(TX(+tokens[i + 2]))} ${fmt(TY(+tokens[i + 3]))}`;
        i += 4;
        break;
      case 'A':
        out += `${fmt(+tokens[i] * k)} ${fmt(+tokens[i + 1] * k)} ${tokens[i + 2]} ${tokens[i + 3]} ${tokens[i + 4]} ${fmt(TX(+tokens[i + 5]))} ${fmt(TY(+tokens[i + 6]))}`;
        i += 7;
        break;
      case 'H':
        out += fmt(TX(+tokens[i]));
        i += 1;
        break;
      case 'V':
        out += fmt(TY(+tokens[i]));
        i += 1;
        break;
      default:
        i += 1;
    }
    out += ' ';
  }
  return out.trim();
}
function group(s, X, Y, k) {
  const TX = (v) => X + v * k;
  const TY = (v) => Y + v * k;
  return {
    r: (x, y, w, h, f, o = {}) =>
      s.r(TX(x), TY(y), w * k, h * k, f, { ...o, rx: (o.rx ?? 0) * k, sw: (o.sw ?? 1) * k }),
    c: (x, y, r, f, o = {}) => s.c(TX(x), TY(y), r * k, f, { ...o, sw: (o.sw ?? 1) * k }),
    e: (x, y, rx, ry, f, o = {}) => s.e(TX(x), TY(y), rx * k, ry * k, f, { ...o, sw: (o.sw ?? 1) * k }),
    l: (x1, y1, x2, y2, st, o = {}) =>
      s.l(TX(x1), TY(y1), TX(x2), TY(y2), st, { ...o, sw: (o.sw ?? 1) * k }),
    p: (d, o = {}) => s.p(transformPath(d, X, Y, k), { ...o, sw: (o.sw ?? 2) * k }),
  };
}

/* ---------- 自有图标库（24 网格，圆头描边贴纸风） ---------- */
function icon(s, name, X, Y, size, color, o = {}) {
  const g = group(s, X, Y, size / 24);
  const st = o.color ?? color;
  switch (name) {
    case 'bolt': // ⚡ 成本（全绝对坐标，transformPath 不支持相对命令）
      g.p('M13.4 2.6 L5.8 13.2 L10.2 13.2 L9.1 21.4 L16.7 10.8 L12.3 10.8 Z', { f: o.f ?? color, st: o.f ?? color, sw: 2 });
      break;
    case 'flame': // streak
      g.p('M12 2.8 C15.4 7.2 17.4 10 17.4 13.2 A5.4 5.4 0 0 1 6.6 13.2 C6.6 10 8.6 7.2 12 2.8 Z', { f: o.f ?? C.lemon });
      g.p('M12 9.4 C13.5 11.2 14.4 12.4 14.4 13.9 A2.4 2.4 0 0 1 9.6 13.9 C9.6 12.4 10.5 11.2 12 9.4 Z', { f: '#FFF6DE' });
      break;
    case 'book':
      g.r(4.5, 4, 15, 16, o.f ?? 'none', { rx: 3, st, sw: 2.2 });
      g.l(12, 4, 12, 20, st, { sw: 2 });
      break;
    case 'search':
      g.c(10.6, 10.6, 5.2, 'none', { st, sw: 2.4 });
      g.l(14.6, 14.6, 19, 19, st, { sw: 2.4 });
      break;
    case 'star':
      g.p('M12 3.4 L14.4 8.4 20 9.2 16 13.1 16.9 18.6 12 16 7.1 18.6 8 13.1 4 9.2 9.6 8.4 Z', { f: o.f ?? color });
      break;
    case 'check':
      g.p('M5 12.6 L9.4 17 19 7.6', { st, sw: 3 });
      break;
    case 'chevL':
      g.p('M14.6 5.6 L8.2 12 L14.6 18.4', { st, sw: 2.6 });
      break;
    case 'arrowR':
      g.p('M5 12 L18.4 12 M12.8 6.2 L18.6 12 L12.8 17.8', { st, sw: 2.4 });
      break;
    case 'lock':
      g.r(6.4, 10.6, 11.2, 9, 'none', { rx: 3, st, sw: 2.2 });
      g.p('M8.6 10.4 V8.2 A3.4 3.4 0 0 1 15.4 8.2 V10.4', { st, sw: 2.2 });
      break;
    case 'user':
      g.c(12, 8.4, 4.1, 'none', { st, sw: 2.2 });
      g.p('M4.8 19.8 C6.3 15.9 9 14.4 12 14.4 C15 14.4 17.7 15.9 19.2 19.8', { st, sw: 2.2 });
      break;
    case 'flag': // 冒险 tab
      g.l(6.4, 3.6, 6.4, 20.4, st, { sw: 2.4 });
      g.p('M6.4 4.6 H17.4 L14.9 8.1 L17.4 11.6 H6.4 Z', { f: o.f ?? color });
      break;
    case 'alert': // 报错
      g.c(12, 12, 8, o.f ?? C.red);
      g.r(11, 6.8, 2, 6.4, C.white, { rx: 1 });
      g.c(12, 15.9, 1.3, C.white);
      break;
    case 'term': // 日志
      g.r(3.6, 4.6, 16.8, 14.8, o.f ?? C.termBg, { rx: 3 });
      g.p('M7 9.5 L9.6 12 L7 14.5', { st: C.termGreen, sw: 1.8 });
      g.l(11.4, 14.5, 16, 14.5, C.termInk, { sw: 1.8 });
      break;
    case 'chat': // 反馈
      g.p('M4.4 6.4 A2.6 2.6 0 0 1 7 3.8 H17 A2.6 2.6 0 0 1 19.6 6.4 V13 A2.6 2.6 0 0 1 17 15.6 H10.4 L6 19.4 V15.6 A2.6 2.6 0 0 1 4.4 13 Z', { f: o.f ?? C.skySoft, st: o.st ?? C.sky, sw: 1.6 });
      break;
    case 'clock': // 时间线
      g.c(12, 12, 8.2, 'none', { st, sw: 2.2 });
      g.p('M12 7.4 V12 L15.2 14.2', { st, sw: 2.2 });
      break;
    case 'code': // 代码
      g.p('M9 7.4 L4.6 12 L9 16.6 M15 7.4 L19.4 12 L15 16.6', { st, sw: 2.3 });
      break;
    case 'sparkle':
      g.p('M12 4 L13.6 10.4 20 12 13.6 13.6 12 20 10.4 13.6 4 12 10.4 10.4 Z', { f: o.f ?? color });
      break;
    case 'heart':
      g.p('M12 20 C7.5 16.5 4 13.6 4 10.2 A4.2 4.2 0 0 1 12 7.6 A4.2 4.2 0 0 1 20 10.2 C20 13.6 16.5 16.5 12 20 Z', { f: o.f ?? color });
      break;
  }
}

/* ---------- 吉祥物矢量 mark（几何 kawaii + 渐变 3D，48 网格） ---------- */
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'static', 'mascots');
function mascotAsset(name) {
  const p = join(ASSET_DIR, name + '-192.png');
  return existsSync(p) ? p : null;
}
function mascot(s, name, X, Y, size, o = {}) {
  if (mascotAsset(name)) {
    s.img(name, X, Y, size);
    return;
  }
  const g = group(s, X, Y, size / 48);
  const ink = o.ink ?? '#3A3440';
  // 玻璃感眼睛：深瞳 + 左上高光 + 右下反光
  const eye = (x, y, r) => {
    g.c(x, y, r, '#332E3E');
    g.c(x - r * 0.32, y - r * 0.38, r * 0.34, '#FFFFFF');
    g.c(x + r * 0.3, y + r * 0.34, r * 0.16, '#FFFFFF');
  };
  const shade = (x, y, rx, ry, col) => g.e(x, y, rx, ry, col, { op: 0.35 });
  switch (name) {
    case 'frog': {
      g.c(14, 13, 8, { g: { a: '#B2EBD6', b: '#4FB493' } });
      g.c(34, 13, 8, { g: { a: '#B2EBD6', b: '#4FB493' } });
      g.r(3, 14, 42, 27, { g: { a: '#9FE6CC', b: '#4FAF8E' } }, { rx: 14 });
      g.e(24, 37.5, 14, 6, { g: { a: '#F2FDF8', b: '#CFF2E2' } });
      shade(24, 40, 11, 3.4, '#3E8E72');
      g.c(14, 13, 5.4, '#FFFFFF');
      g.c(34, 13, 5.4, '#FFFFFF');
      eye(14.4, 13.6, 2.7);
      eye(34.4, 13.6, 2.7);
      g.c(21.4, 24.4, 0.9, '#3E8E72');
      g.c(26.6, 24.4, 0.9, '#3E8E72');
      g.e(9, 30, 3.9, 2.4, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.85 });
      g.e(39, 30, 3.9, 2.4, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.85 });
      g.p('M17.5 30.5 Q24 36 30.5 30.5', { st: ink, sw: 2.1 });
      g.e(11, 19, 4.2, 2.4, '#FFFFFF', { op: 0.4 });
      break;
    }
    case 'otter': {
      g.c(11, 12, 4.8, { g: { a: '#C99A76', b: '#96684A' } });
      g.c(37, 12, 4.8, { g: { a: '#C99A76', b: '#96684A' } });
      g.c(11.5, 12.5, 2, '#7E5740');
      g.c(36.5, 12.5, 2, '#7E5740');
      g.c(24, 26, 17, { g: { a: '#D8B08C', b: '#9A6E4E' } });
      g.e(24, 32, 11, 8.4, { g: { a: '#F6E8D2', b: '#E0C49E' } });
      shade(24, 41, 9, 2.6, '#7E5740');
      eye(17.4, 22.6, 2.4);
      eye(30.6, 22.6, 2.4);
      g.c(24, 28.2, 2.5, '#332E3E');
      g.c(23.4, 27.6, 0.8, '#FFFFFF', { op: 0.9 });
      g.p('M21.2 32 Q24 34.4 26.8 32', { st: ink, sw: 1.8 });
      g.l(13.2, 29.8, 5, 27.6, ink, { sw: 1.5 });
      g.l(13.4, 32.2, 5, 32.2, ink, { sw: 1.5 });
      g.l(34.8, 29.8, 43, 27.6, ink, { sw: 1.5 });
      g.l(34.6, 32.2, 43, 32.2, ink, { sw: 1.5 });
      g.e(15.5, 15.5, 4.6, 2.6, '#FFFFFF', { op: 0.35 });
      break;
    }
    case 'snail': {
      g.r(4, 31, 31, 9, { g: { a: '#FFDD7A', b: '#EFB445' } }, { rx: 4.5 });
      g.e(8.5, 33.5, 4, 2.8, '#F7CE62');
      g.l(12, 31, 9, 21, '#EFB445', { sw: 2.6 });
      g.l(19, 31, 18, 20, '#EFB445', { sw: 2.6 });
      eye(8.6, 18.6, 2.7);
      eye(17.6, 18, 2.7);
      g.c(29, 21, 14, { g: { a: '#FFB088', b: '#E56B36' } });
      g.c(29, 21, 14, 'none', { st: '#D95F30', sw: 1.2 });
      g.c(29, 21, 8.6, 'none', { st: '#FFE3CE', sw: 2.6 });
      g.c(29, 21, 3.4, '#FFE3CE');
      g.e(22.5, 13.5, 5, 2.8, '#FFD1B3', { op: 0.85 });
      g.e(15, 34.5, 3.2, 1.8, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.8 });
      g.p('M6 34.5 Q7 36 8.5 35.6', { st: ink, sw: 1.4 });
      break;
    }
    case 'rabbit': {
      g.p('M17.5 10.5 C9 7.5 3 15.5 4.4 27 C5.3 34.4 13.4 35.6 15.4 29 C17.2 23.4 18.6 15.5 17.5 10.5 Z', { g: { a: '#FFFFFF', b: '#CFC6E2' }, st: '#B9AFCB', sw: 1.2 });
      g.p('M15.4 14 C10.6 12.4 8 19 9.2 26.6 C10 31.6 14.6 31.4 14.8 26.2 C15 21 15.8 16.6 15.4 14 Z', { g: { a: '#FBDDE6', b: '#EDA9C0' } });
      g.p('M30.5 10.5 C39 7.5 45 15.5 43.6 27 C42.7 34.4 34.6 35.6 32.6 29 C30.8 23.4 29.4 15.5 30.5 10.5 Z', { g: { a: '#FFFFFF', b: '#CFC6E2' }, st: '#B9AFCB', sw: 1.2 });
      g.p('M32.6 14 C37.4 12.4 40 19 38.8 26.6 C38 31.6 33.4 31.4 33.2 26.2 C33 21 32.2 16.6 32.6 14 Z', { g: { a: '#FBDDE6', b: '#EDA9C0' } });
      g.c(24, 30, 14.5, { g: { a: '#FFFFFF', b: '#DFD8EC' } });
      shade(24, 42, 9.5, 2.8, '#B9AFCB');
      eye(18, 27.6, 2.9);
      eye(30, 27.6, 2.9);
      g.p('M22.4 31.4 L25.6 31.4 L24 33.4 Z', { f: '#F2A9BE' });
      g.p('M24 33.4 Q24 35.6 21.8 36 M24 33.4 Q24 35.6 26.2 36', { st: ink, sw: 1.6 });
      g.e(13.5, 33, 3.6, 2.3, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.8 });
      g.e(34.5, 33, 3.6, 2.3, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.8 });
      g.e(17, 21, 5, 2.8, '#FFFFFF', { op: 0.55 });
      break;
    }
    case 'dino': {
      g.e(24, 22, 20, 17, { g: { a: '#8FDDBE', b: '#2E8260' } });
      g.c(12, 10.5, 1.8, '#FFF6DE');
      g.c(24, 6.5, 1.8, '#FFF6DE');
      g.c(36, 10.5, 1.8, '#FFF6DE');
      g.p('M13.5 21.5 C10 14.5 9.4 8.5 11.6 4.6 C16.2 8.6 20.8 14.6 20.2 20.4 Z', { g: { a: '#FFFBEA', b: '#E0C68C' }, st: '#D9BE85', sw: 1 });
      g.p('M34.5 21.5 C38 14.5 38.6 8.5 36.4 4.6 C31.8 8.6 27.2 14.6 27.8 20.4 Z', { g: { a: '#FFFBEA', b: '#E0C68C' }, st: '#D9BE85', sw: 1 });
      g.p('M24 15 C22.2 18.4 21.8 21 22.2 23.2 L25.8 23.2 C26.2 21 25.8 18.4 24 15 Z', { g: { a: '#FFFBEA', b: '#E0C68C' }, st: '#D9BE85', sw: 1 });
      g.r(9, 21, 30, 23, { g: { a: '#8FDDBE', b: '#46A87E' } }, { rx: 12 });
      shade(24, 42.5, 10.5, 3, '#2E7D5B');
      eye(17.6, 29.5, 2.5);
      eye(30.4, 29.5, 2.5);
      g.e(11.5, 34.5, 3.4, 2.2, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.8 });
      g.e(36.5, 34.5, 3.4, 2.2, { g: { a: '#FFC7D6', b: '#FF9FBB' } }, { op: 0.8 });
      g.p('M19.5 36 Q24 39.4 28.5 36', { st: ink, sw: 2 });
      g.e(24, 45, 9.5, 3.6, '#C9F0DD');
      g.e(15, 26, 4.6, 2.6, '#FFFFFF', { op: 0.35 });
      break;
    }
  }
}

/* ---------- 通用组件 ---------- */
function tabBar(s, active, frameH) {
  const y = frameH - 84;
  s.r(0, y, W, 84, C.card);
  s.l(0, y, W, y, C.line, { sw: 1 });
  s.r(W / 2 - 60, y + 74, 120, 5, C.ink, { rx: 2.5 });
  const tabs = [
    { key: 'adventure', label: '冒险', icon: 'flag' },
    { key: 'handbook', label: '手册', icon: 'book' },
    { key: 'me', label: '我的', icon: 'user' },
  ];
  tabs.forEach((tb, i) => {
    const cx = 65 + i * 130;
    const on = tb.key === active;
    icon(s, tb.icon, cx - 12, y + 14, 24, on ? C.coral : C.ink3, { f: on ? C.coral : undefined, color: on ? C.coral : C.ink3 });
    s.t(tb.label, cx - 30, y + 44, 11, { w: on ? 'B' : 'R', c: on ? C.coral : C.ink3, width: 60, al: 'C' });
  });
}

function hypRow(s, y, text, on) {
  s.r(36, y, 318, 40, on ? C.coralSoft : C.card, { rx: 12, st: on ? C.coral : C.line, sw: 1.5 });
  if (on) {
    s.r(46, y + 11, 18, 18, C.coral, { rx: 6 });
    s.p('M50 ' + (y + 20) + ' L54 ' + (y + 24) + ' L60 ' + (y + 16), { st: C.white, sw: 2.4 });
  } else {
    s.r(46, y + 11, 18, 18, C.card, { rx: 6, st: C.line, sw: 1.5 });
  }
  s.t(text, 74, y + 11, 12.5, { w: on ? 'M' : 'R', c: on ? C.ink : C.ink2 });
  return y + 48;
}

function mascotBubble(s, y, who, line, o = {}) {
  const h = o.h ?? 46;
  s.r(20, y, 350, h, C.lemonSoft, { rx: 18, st: C.lemonLine, sw: 1 });
  s.c(34, y + h / 2 - 14, 28, C.card, { st: C.lemonLine, sw: 1 });
  s.r(20, y, 22, h, C.lemonSoft);
  mascot(s, who, 27, y + h / 2 - 12, 24);
  s.t(line, 72, y + (h - 18) / 2, 13, { w: 'M', c: C.lemonDeep });
}

/* ---------- ⓪ 图标合集（先于一切屏幕仔细检查） ---------- */
function buildIconSheet() {
  const s = makeScreen();
  const MW = 1300;
  s.t('图标合集 · Icon Set', 40, 36, 26, { w: 'B', c: C.ink });
  s.t('全部图标与本产品吉祥物 mark 的唯一权威来源。网格 24/48 · 圆头描边 · 多尺寸梯度验证可读性。', 40, 78, 12, { c: C.ink2 });

  // —— 功能图标：6 列 × 3 行，每格大图 + 名字 + 16px 小尺寸预览 ——
  const icons = [
    ['bolt', '成本 ⚡'], ['flame', '连续 streak'], ['book', '手册'],
    ['search', '查找'], ['star', '星级'], ['check', '已完成'],
    ['chevL', '返回'], ['arrowR', '前进/下一关'], ['lock', '未解锁'],
    ['user', '我的'], ['flag', '冒险 Tab'], ['alert', '报错'],
    ['term', '日志'], ['chat', '反馈'], ['clock', '时间线'],
    ['code', '代码'], ['sparkle', '学习闪光'], ['heart', '生命/收藏'],
  ];
  s.t('功能图标', 40, 116, 16, { w: 'B', c: C.ink });
  icons.forEach(([name, label], i) => {
    const x = 40 + (i % 6) * 210;
    const y = 144 + Math.floor(i / 6) * 150;
    s.card(x, y, 186, 126, C.card, '#EFE5D6', 18, 5);
    s.r(x + 20, y + 18, 60, 60, C.coralSoft, { rx: 16 });
    icon(s, name, x + 32, y + 30, 36, C.coral);
    icon(s, name, x + 96, y + 26, 16, C.ink2);
    icon(s, name, x + 96, y + 52, 24, C.ink2);
    s.t(label, x + 20, y + 92, 12, { w: 'M', c: C.ink });
  });

  // —— 吉祥物 mark：5 格，96px 大图 + 名字 + 口癖 ——
  s.t('吉祥物 mark', 40, 620, 16, { w: 'B', c: C.ink });
  s.t('几何 kawaii 风 · 48 网格 · 用于头像/图鉴/气泡', 354, 624, 10, { c: C.ink3, width: 0, al: 'R' });
  const dex = [
    ['frog', '恐怖蛙', '报错恐慌', '呱——好多红色！'],
    ['otter', '惊讶濑', '意外 = 信息', '纳尼？！证据它自己说话了！'],
    ['snail', '不行蜗', '盲扫', '（慢慢探头）这两个动作，好像啥也没查出来。'],
    ['rabbit', '垂耳兔', '过早锁定', '（摇头）证据还不够，你只是想结束它。'],
    ['dino', '三角龙', '挫败陪伴', '（蹲下）这题是真难。坐一会儿。'],
  ];
  dex.forEach(([who, name, trait, quote], i) => {
    const x = 40 + i * 250;
    const y = 648;
    s.card(x, y, 230, 210, C.card, '#EFE5D6', 20, 6);
    s.c(x + 115, y + 78, 52, C.coralSoft);
    mascot(s, who, x + 67, y + 30, 96);
    s.t(name, x + 20, y + 146, 15, { w: 'B', c: C.ink, width: 190, al: 'C' });
    s.t(trait, x + 20, y + 168, 10, { w: 'B', c: C.coral, width: 190, al: 'C' });
    s.t(quote, x + 20, y + 184, 9.5, { c: C.ink3, width: 190, al: 'C' });
  });

  // —— 尺寸梯度：mark 与 icon 在 48/32/24/16 的可读性 ——
  s.t('尺寸梯度（吉祥物 48→16 · 图标 24→12）', 40, 900, 16, { w: 'B', c: C.ink });
  s.card(40, 928, 1220, 120, C.card, '#EFE5D6', 20, 6);
  const sizes = [48, 32, 24, 16];
  sizes.forEach((sz, i) => {
    mascot(s, 'frog', 90 + i * 90, 964 - (48 - sz) / 2, sz);
    icon(s, 'bolt', 480 + i * 70, 964, sz * 0.6, C.coral);
    s.t(String(sz), 90 + i * 90 - 8, 1016, 10, { c: C.ink3, width: 64, al: 'C' });
  });
  s.t('16px 以下吉祥物退化为纯色头像圈 + 眼睛，图标保持轮廓可读', 780, 1016, 11, { c: C.ink3 });
  return { name: '图标合集 · Icon Set', items: s, H: 1080, wide: true };
}

/* ---------- ① 首页 · 章节地图 ---------- */
function buildHome() {
  const s = makeScreen();
  // 头部：档案 + streak
  s.c(46, 52, 26, C.mintSoft, { st: C.mint, sw: 1.6 });
  mascot(s, 'frog', 34, 40, 24);
  s.t('瞎扫实习生', 84, 34, 15, { w: 'B', c: C.ink });
  s.t('再破案 1 关晋升「初级侦探」', 84, 58, 10, { c: C.ink3 });
  s.r(288, 32, 82, 34, C.lemonSoft, { rx: 17 });
  icon(s, 'flame', 298, 39, 20);
  s.t('3 天', 320, 40, 12, { w: 'B', c: C.lemonDeep });

  // 继续闯关大卡
  s.card(20, 100, 350, 116, C.coralSoft, '#F3CFA9', 20, 8);
  s.t('继续闯关 · 第 1 章 接入层之夜', 40, 118, 10, { w: 'B', c: C.coral });
  s.t('深夜的全线超时', 40, 140, 18, { w: 'B', c: C.ink });
  s.t('★★ 标准 · 最佳 4⚡ · 差一颗 ★★★', 40, 172, 11, { c: C.ink2 });
  s.c(312, 158, 22, C.coral);
  icon(s, 'arrowR', 301, 147, 22, C.white, { color: C.white, sw: 3.4 });
  s.t('最近的故障现场，就差一步收网', 40, 194, 10, { c: C.ink3 });

  // 章节地图
  s.t('章节地图', 20, 240, 14, { w: 'B', c: C.ink });
  s.t('按层闯关，拼出全栈地图', 354, 244, 10, { c: C.ink3, width: 0, al: 'R' });
  const chapterCard = (x, y, o) => {
    const locked = !!o.locked;
    s.r(x, y, 170, 158, locked ? C.card : C.coralSoft, { rx: 20, st: locked ? C.line : C.coralLine, sw: 1.5, dash: false });
    s.r(x + 14, y + 14, 54, 22, locked ? C.well : C.coral, { rx: 11 });
    s.t(o.no, x + 14, y + 19, 9, { w: 'B', c: locked ? C.ink3 : C.white, width: 54, al: 'C' });
    if (locked) {
      icon(s, 'lock', x + 130, y + 14, 22, C.ink3);
    } else {
      icon(s, 'star', x + 132, y + 15, 20, C.lemon);
    }
    s.t(o.name, x + 14, y + 48, 15, { w: 'B', c: locked ? C.ink2 : C.ink });
    s.t(o.pact, x + 14, y + 76, 10, { c: locked ? C.ink3 : C.ink2 });
    const prog = o.prog, total = o.total;
    s.r(x + 14, y + 122, 96, 8, locked ? C.well : C.white, { rx: 4 });
    if (prog > 0) s.r(x + 14, y + 122, Math.max(10, (96 * prog) / total), 8, locked ? C.ink3 : C.coral, { rx: 4 });
    s.t(prog + '/' + total, x + 118, y + 116, 11, { w: 'B', c: locked ? C.ink3 : C.coral, width: 40, al: 'C' });
  };
  chapterCard(20, 266, { no: '第 1 章', name: '接入层之夜', pact: 'TLS 与链路的契约', prog: 1, total: 4 });
  chapterCard(200, 266, { no: '第 2 章', name: '数据的脾气', pact: '一致性窗口', prog: 0, total: 3, locked: true });
  chapterCard(20, 440, { no: '第 3 章', name: '构建与依赖', pact: '产物 × 运行环境', prog: 0, total: 2, locked: true });
  chapterCard(200, 440, { no: '第 4 章', name: '运行时暗面', pact: '资源生命周期', prog: 0, total: 1, locked: true });
  s.t('全部 10 关 · 每关一朵层契约拼图', 20, 622, 10, { c: C.ink3, width: 350, al: 'C' });
  tabBar(s, 'adventure', 844);
  return { name: '首页 · 章节地图', items: s, H: 844 };
}

/* ---------- ② 章节详情 ---------- */
function buildChapter() {
  const s = makeScreen();
  s.nav('接入层之夜');
  s.card(20, 52, 350, 128, C.coralSoft, '#F3CFA9', 20, 8);
  s.r(36, 68, 54, 22, C.coral, { rx: 11 });
  s.t('第 1 章', 36, 73, 9, { w: 'B', c: C.white, width: 54, al: 'C' });
  s.t('接入层之夜', 104, 66, 18, { w: 'B', c: C.ink });
  s.t('层契约：TLS 是两端协商，任何一侧校验策略的差异\n都会造成"部分失败"。', 36, 104, 11, { c: C.ink2 });
  s.t('进度 1/4 · 收集检查单 4 条', 36, 150, 10, { w: 'B', c: C.coral });

  const node = (y, o) => {
    const live = !!o.live;
    if (live) {
      s.card(20, y, 350, 64, C.card, '#F3CFA9', 20, 6);
    } else {
      s.r(20, y, 350, 64, C.card, { rx: 20, st: C.line, sw: 1.5, dash: true });
    }
    s.r(34, y + 10, 44, 44, live ? C.coral : C.well, { rx: 14 });
    if (live) icon(s, 'bolt', 44, y + 20, 24, C.white, { color: C.white });
    else s.r(51, y + 28, 10, 10, C.line, { rx: 5 });
    s.t(o.title, 92, y + 13, 15, { w: 'B', c: live ? C.ink : C.ink2 });
    s.t(o.meta, 92, y + 37, 11, { c: C.ink3 });
    if (live) {
      s.t('★★☆', 314, y + 22, 16, { w: 'B', c: C.lemon, width: 56, al: 'C' });
    } else {
      s.r(306, y + 18, 58, 28, C.bg, { rx: 14, st: C.line, sw: 1, dash: true });
      s.t('即将上线', 306, y + 26, 9, { c: C.ink3, width: 58, al: 'C' });
    }
    return y + 64;
  };
  const conn = (y) => s.l(56, y + 4, 56, y + 14, C.pink, { sw: 2, dash: true });
  let y = 200;
  y = node(y, { live: true, title: '深夜的全线超时', meta: '★★ 标准 · 最佳 4⚡' });
  conn(y); y = node(y + 18, { title: 'DNS 代理劫持', meta: '★★ 标准' });
  conn(y); y = node(y + 18, { title: 'CORS 失败', meta: '★ 教学关' });
  conn(y); y = node(y + 18, { title: 'Nginx 配置陷阱', meta: '★★ 标准' });
  s.t('通关本章，解锁「接入层」层契约拼图 🧩', 20, y + 26, 11, { c: C.ink3, width: 350, al: 'C' });
  return { name: '章节详情 · 接入层之夜', items: s, H: 560 };
}

/* ---------- 分享海报 · 侦探档案 v2（390 宽，导出 2x = 780 宽 PNG） ---------- */
function buildSharePoster() {
  const s = makeScreen();
  const PW = 390;
  // 页面奶油底由 frame 提供；顶部标题区
  s.t('排错推理训练场', 0, 34, 13, { w: 'B', c: C.coral, width: PW, al: 'C' });
  s.t('侦 探 档 案', 0, 58, 26, { w: 'B', c: C.ink, width: PW, al: 'C' });
  s.t('AGENT-ERA DEBUGGER · DIAGNOSIS RECORD', 0, 96, 8, { c: C.ink3, width: PW, al: 'C' });

  // 主卡（深紫档案卡）
  const KX = 20, KY = 120, KW = 350, KH = 330;
  s.card(KX, KY, KW, KH, C.darkCard, '#35303F', 24, 8);
  // 三色积木装饰（右上）
  const bw = 14, gap = 6;
  const cols = [C.coral, C.mint, C.sky];
  for (let i = 0; i < 3; i++) s.r(KX + KW - 26 - (3 - i) * (bw + gap), KY + 16, bw, bw, cols[i], { rx: 4 });
  // 吉祥物 + 光圈
  s.c(KX + KW / 2, KY + 92, 52, { g: { a: '#5E5770', b: '#413B4D' } });
  s.t('', 0, 0, 8, {});
  mascot(s, 'frog', KX + KW / 2 - 34, KY + 58, 68);
  // 称号 + 银河线
  s.t('初级侦探', 0, KY + 168, 26, { w: 'B', c: C.lemon, width: PW, al: 'C' });
  s.l(KX + 90, KY + 202, KX + KW - 90, KY + 202, C.darkTrack, { sw: 2, dash: true });
  // 三列数据（胶囊）
  const stat = (i, v, k) => {
    const cw = 98, x = KX + 18 + i * (cw + 9);
    s.r(x, KY + 220, cw, 64, '#413B4D', { rx: 16 });
    s.t(v, x, KY + 230, 22, { w: 'B', c: C.white, width: cw, al: 'C' });
    s.t(k, x, KY + 258, 10, { c: C.darkSub, width: cw, al: 'C' });
  };
  stat(0, '2', '破案');
  stat(1, '1', '连续天数');
  stat(2, '8', '检查单');
  // 底部 slogan
  s.t('看症状 · 立假设 · 算成本 · 定根因', 0, KY + 300, 11, { w: 'B', c: C.termGreen, width: PW, al: 'C' });

  // 层契约拼图条：六章积木，点亮 = 已通关
  const PY = 470;
  s.t('层契约拼图', 20, PY, 12, { w: 'B', c: C.ink });
  s.t('2 / 6 章', 270, PY, 12, { w: 'B', c: C.coral, width: 100, al: 'R' });
  // 实体积木语言：点亮 = 章节色实心块 + 硬边投影 + 白字；未点亮 = 虚线空块
  const acc = [C.coral, C.coral, C.mint, C.sky, C.lemon, C.pink];
  const deep = ['#E06B38', '#E06B38', '#3FA885', '#4F93C4', '#D9A32E', '#E08AA6'];
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 59;
    if (i < 2) {
      s.r(x + 1, PY + 28, 51, 48, deep[i], { rx: 12 });
      s.r(x, PY + 24, 51, 48, acc[i], { rx: 12 });
      s.t('章' + (i + 1), x, PY + 41, 11, { w: 'B', c: C.white, width: 51, al: 'C' });
    } else {
      s.r(x, PY + 24, 51, 48, C.card, { rx: 12, st: '#E3E6EB', sw: 1.5, dash: true });
      s.t('章' + (i + 1), x, PY + 41, 11, { c: C.ink3, width: 51, al: 'C' });
    }
  }

  // 二维码 + 邀请
  const QY = 566;
  s.card(20, QY, 350, 96, C.card, C.line, 20, 6);
  s.r(34, QY + 14, 68, 68, C.white, { rx: 10, st: C.line, sw: 2 });
  // 二维码占位纹理
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if ((i + j * 3 + i * j) % 3 !== 0) s.r(40 + i * 11, QY + 20 + j * 11, 8, 8, C.ink, { rx: 2 });
  }
  s.t('扫码来挑战', 116, QY + 24, 13, { w: 'B', c: C.ink });
  s.t('把你的排错直觉，练成条件反射', 116, QY + 46, 10, { c: C.ink2 });
  s.t('2026.09.29 · 侦探 No.0002', 116, QY + 66, 9, { c: C.ink3 });

  // 页脚
  s.t('—— 本档案由排错推理训练场生成 ——', 0, 690, 9, { c: C.ink3, width: PW, al: 'C' });
  return { name: '分享海报 · 侦探档案 v2', items: s, H: 720, wide: false };
}

/* ---------- ③ 闯关页 ---------- */
function buildPlay() {
  const s = makeScreen();
  s.nav('诊断现场');
  s.card(20, 48, 350, 52, C.darkCard, '#35303F', 16, 8);
  icon(s, 'bolt', 36, 61, 22, C.lemon);
  s.t('已花 4', 62, 63, 15, { w: 'B', c: C.lemon });
  s.t('错误指认 0/2 · 专家基准复盘揭晓', 94, 57, 10, { c: C.darkSub, width: 260, al: 'R' });

  s.card(20, 116, 350, 496, C.card, '#EFE5D6', 20, 8);
  s.r(36, 132, 68, 24, C.coralSoft, { rx: 12 });
  s.t('故障现场', 36, 138, 10, { w: 'B', c: C.coral, width: 68, al: 'C' });
  s.t('深夜的全线超时', 36, 166, 19, { w: 'B', c: C.ink });
  s.t('你是「鲜到家」电商的后端开发，今晚值班。\n22:47，手机开始疯狂震动，客服群炸了。', 36, 198, 12, { c: C.ink2 });
  s.r(36, 240, 318, 50, C.well, { rx: 10 });
  s.t('用户 App / 小程序 → CDN + 负载均衡（TLS 终止）\n→ Nginx 接入层 → 订单服务 → MySQL', 46, 250, 10.5, { c: C.ink2 });
  s.r(36, 302, 318, 118, C.termBg, { rx: 12 });
  icon(s, 'alert', 48, 312, 15);
  s.t('接入层 error.log', 68, 314, 11, { w: 'B', c: C.termGreen });
  s.t('22:47:03 [error] TLS handshake error\n     (certificate verify failed)\n22:47:03 [warn] upstream timeout (偶发慢查询)\n...（同类 error 刷屏，error 率约 30%）', 50, 336, 10, { c: C.termInk });
  s.r(36, 432, 318, 64, C.well, { rx: 12 });
  icon(s, 'chat', 48, 442, 16);
  s.t('客服群反馈', 70, 444, 11, { w: 'B', c: C.ink });
  s.t('「点结算一直转圈！」「支付又失败了！」——但也有用户\n表示一切正常。商品页（另一域名）无人反馈异常。', 50, 464, 10.5, { c: C.ink2 });
  s.r(36, 508, 318, 48, C.well, { rx: 12 });
  icon(s, 'clock', 46, 518, 16, C.ink2);
  s.t('22:47 故障开始 ｜ 22:00 运维更新过 Nginx 配置\n三天前证书从 A 厂商切换到 B 厂商', 68, 518, 10.5, { c: C.ink2 });
  s.t('影响面还完全未知——先画圈，再动手。', 36, 570, 12, { w: 'B', c: C.coral });

  s.r(20, 628, 350, 402, C.card, { rx: 20 });
  s.t('假设板 · 先提交假设，才能开始验证', 36, 644, 14, { w: 'B', c: C.ink });
  let hy = 672;
  hy = hypRow(s, hy, '证书链不完整（换厂商漏发中间证书）', false);
  hy = hypRow(s, hy, '证书过期了', true);
  hy = hypRow(s, hy, '今晚 22:00 的 Nginx 配置变更引入问题', true);
  hy = hypRow(s, hy, 'CDN / 负载均衡过载，握手超时', false);
  s.r(36, hy + 4, 318, 40, C.well, { rx: 12 });
  s.t('自由备注（可选）：此刻你在怀疑什么', 48, hy + 15, 11, { c: C.ink3 });
  s.r(36, hy + 56, 318, 46, C.coral, { rx: 23 });
  s.t('提交假设，开始验证', 36, hy + 69, 15, { w: 'B', c: C.white, width: 318, al: 'C' });

  const act = (y, o) => {
    s.r(20, y, 350, 64, C.card, { rx: 18, st: C.line, sw: 1 });
    s.t(o.name, 36, y + 12, 14, { w: 'B', c: o.done ? C.ink2 : C.ink });
    if (o.danger) {
      const cw = o.name.length * 14 + 22;
      s.r(36 + cw, y + 13, 34, 18, C.red, { rx: 6 });
      s.t('变更', 36 + cw, y + 16, 9, { w: 'B', c: C.white, width: 34, al: 'C' });
    }
    s.t(o.desc, 36, y + 36, 11, { c: C.ink3 });
    icon(s, 'bolt', 322, y + 15, 16, C.coral);
    s.t(String(o.cost), 342, y + 13, 15, { w: 'B', c: C.coral, width: 22, al: 'C' });
    if (o.done) s.t('已执行 ✓', 308, y + 40, 10, { w: 'B', c: C.mint, width: 56, al: 'C' });
    return y + 72;
  };
  let ay = 1058;
  s.t('验证动作 · 每一步都在花 ⚡ 买信息', 20, ay - 22, 12, { w: 'B', c: C.ink2 });
  ay = act(ay, { name: '查影响范围看板', desc: '统计失败请求的客户端、地域、运营商分布', cost: 1, done: true });
  ay = act(ay, { name: '查证书有效期', desc: 'openssl x509 -enddate 直接看时间窗', cost: 1 });
  ay = act(ay, { name: '重启接入层全部节点', desc: '【状态变更】经典大招：重启试试', cost: 10, danger: true });

  mascotBubble(s, ay + 8, 'otter', '纳尼？！证据它自己说话了！');
  s.r(20, ay + 66, 350, 46, C.card, { rx: 23, st: C.coral, sw: 2 });
  s.t('指认根因', 20, ay + 79, 15, { w: 'B', c: C.coral, width: 350, al: 'C' });
  return { name: '闯关页 · 诊断现场', items: s, H: 1386 };
}

/* ---------- ④ 复盘页 ---------- */
function buildReview() {
  const s = makeScreen();
  s.nav('复盘室');
  s.card(20, 48, 350, 302, C.darkCard, '#37323F', 24, 10);
  s.t('S', 20, 62, 64, { w: 'B', c: C.lemon, width: 350, al: 'C' });
  s.t('专家级诊断', 20, 140, 15, { w: 'B', c: C.white, width: 350, al: 'C' });
  icon(s, 'star', 138, 172, 22, C.lemon);
  icon(s, 'star', 172, 172, 22, C.lemon);
  icon(s, 'star', 206, 172, 22, C.lemon);
  s.t('★ 破案 · ★★ 预算 ≤ 1.2× · ★★★ 零错误指认', 20, 202, 9.5, { c: C.darkSub, width: 350, al: 'C' });
  const marks = ['frog', 'otter', 'snail', 'rabbit', 'dino'];
  marks.forEach((m, i) => mascot(s, m, 96 + i * 42, 224, 26));
  s.t('你', 40, 258, 11, { c: C.darkSub });
  s.r(66, 260, 218, 10, C.darkTrack, { rx: 5 });
  s.r(66, 260, 124, 10, C.coral, { rx: 5 });
  s.t('4⚡', 332, 256, 11, { w: 'B', c: C.white, width: 34, al: 'R' });
  s.t('专家', 40, 282, 11, { c: C.darkSub });
  s.r(66, 284, 218, 10, C.darkTrack, { rx: 5 });
  s.r(66, 284, 218, 10, C.mint, { rx: 5 });
  s.t('7⚡', 332, 280, 11, { w: 'B', c: C.white, width: 34, al: 'R' });

  s.r(20, 362, 350, 40, C.mintSoft, { rx: 14 });
  icon(s, 'book', 92, 372, 18, C.mintDeep);
  s.t('手册新增 4 条诊断检查单', 116, 374, 12, { w: 'B', c: C.mintDeep });

  s.card(20, 414, 206, 48, C.coral, '#E06B38', 24, 8);
  s.t('下一关', 40, 428, 15, { w: 'B', c: C.white, width: 130, al: 'C' });
  icon(s, 'arrowR', 171, 426, 24, C.white, { color: C.white, sw: 3.4 });
  s.r(238, 414, 132, 48, C.card, { rx: 24, st: C.coral, sw: 2 });
  s.t('再玩一次', 238, 428, 14, { w: 'B', c: C.coral, width: 132, al: 'C' });

  s.card(20, 478, 350, 226, C.card, '#EFE5D6', 20, 6);
  s.t('本局心理回放', 36, 494, 15, { w: 'B', c: C.ink });
  s.t('怀疑：证书过期了', 52, 524, 12, { c: C.ink2 });
  s.p('M42 528 L46 532', { st: C.ink3, sw: 1.4 });
  s.t('验证：查影响范围看板（-1 ⚡）', 52, 548, 12, { c: C.ink2 });
  s.r(56, 572, 296, 62, C.lemonSoft, { rx: 14 });
  s.c(76, 596, 18, C.card, { st: C.lemonLine, sw: 1 });
  mascot(s, 'otter', 65, 586, 22);
  s.t('纳尼？！证据它自己说话了！', 102, 582, 11.5, { w: 'M', c: C.lemonDeep });
  s.t('惊讶濑出现的次数 = 你读到关键证据的次数。\n意外 = 信息。', 102, 602, 9.5, { c: C.lemonSub });
  s.t('验证：openssl s_client 看完整证书链（-2 ⚡）', 52, 644, 12, { c: C.ink2 });
  s.t('指认根因：换证书厂商时漏配中间证书，链不完整', 52, 668, 12, { w: 'M', c: C.ink });

  s.card(20, 718, 350, 470, C.card, '#EFE5D6', 20, 6);
  s.t('专家推理链', 36, 734, 15, { w: 'B', c: C.ink });
  s.t('点击逐步展开', 354, 738, 10, { c: C.ink3, width: 0, al: 'R' });
  const step = (y, no, stop, blocks) => {
    s.r(36, y, 318, blocks.h, C.well, { rx: 14 });
    s.c(62, y + 26, 12, C.coral);
    s.t(String(no), 50, y + 20, 12, { w: 'B', c: C.white, width: 24, al: 'C' });
    if (stop) {
      s.r(82, y + 15, 60, 22, C.mintSoft, { rx: 11, st: C.mint, sw: 1 });
      s.t('停止规则', 82, y + 19, 9, { w: 'B', c: C.mintDeep, width: 60, al: 'C' });
    }
    let cy = y + 48;
    for (const b of blocks.rows) {
      if (b.k === 'why') {
        const h = b.s.split('\n').length * 16 + 16;
        s.r(50, cy, 290, h, C.coralSoft, { rx: 8 });
        s.r(50, cy, 3, h, C.coral);
        s.t(b.s, 62, cy + 8, 10.5, { c: '#9C5312' });
        cy += h + 8;
      } else {
        s.t(b.p + '：' + b.s, 50, cy, b.fs ?? 11, { w: b.w ?? 'R', c: b.c ?? C.ink2 });
        cy += b.s.split('\n').length * ((b.fs ?? 11) * 1.5) + 6;
      }
    }
    return y + blocks.h + 12;
  };
  let sy = step(768, 1, false, {
    h: 208,
    rows: [
      { p: '观察', s: '手机在震，但我还没看任何日志。排错第一步\n不是找错，是画圈：影响面多大？', c: C.ink, w: 'M' },
      { p: '判断', s: '建立基线：这是"部分失败"，不是全网灾难。' },
      { p: '动作', s: '查影响范围看板（-1 ⚡）', c: C.sky, w: 'B' },
      { k: 'why', s: '为什么：1⚡ 就能买到"故障的形状"。全端型故障\n和单端型故障，候选假设集完全不同——先画圈，\n后面每一步才有的放矢。' },
      { p: '结论', s: 'iOS 占 91%、各地域均有 → 像"部分客户端校验\n失败"。证书/兼容性类假设升权。', c: C.ink },
    ],
  });
  sy = step(sy, 6, true, {
    h: 132,
    rows: [
      { p: '观察', s: '证据链闭合了吗？根因 + 分布 + 时间线三点齐了。', c: C.ink, w: 'M' },
      { p: '动作', s: '（停止收集，去修复）', c: C.mintDeep, w: 'B' },
      { k: 'why', s: '为什么：再花 ⚡ 看 diff、查 CDN 都不会改变\n"去拿中间证书"这个行动。继续收集是给焦虑交税。' },
    ],
  });

  s.card(20, sy + 8, 350, 178, C.card, '#EFE5D6', 20, 6);
  s.t('带走的诊断检查单', 36, sy + 24, 15, { w: 'B', c: C.ink });
  s.t('☑ 握手类故障第一步永远是看"谁能连上、谁不能"\n——分布即线索。', 36, sy + 54, 12, { w: 'M', c: C.ink });
  s.t('TLS 是两端协商：任何一侧校验策略的差异都会造成"部分\n失败"。这就是影响面动作只花 1⚡ 也值回票价的原因。', 36, sy + 96, 10.5, { c: C.ink3 });
  s.t('☑ openssl s_client 是证书问题的一锤定音动作。', 36, sy + 138, 12, { w: 'M', c: C.ink });
  return { name: '复盘页 · 通关仪式', items: s, H: 1386 };
}

/* ---------- ⑤ 手册 ---------- */
function buildHandbook() {
  const s = makeScreen();
  s.t('手册', 0, 22, 16, { w: 'B', c: C.ink, width: W, al: 'C' });
  s.card(20, 52, 350, 152, C.darkCard, '#37323F', 24, 10);
  s.c(70, 108, 26, C.darkTrack);
  mascot(s, 'frog', 56, 94, 28);
  s.t('收集图鉴', 112, 72, 10, { c: C.darkSub });
  s.t('已相遇 2 / 5 只', 112, 90, 18, { w: 'B', c: C.white });
  s.r(112, 122, 210, 10, C.darkTrack, { rx: 5 });
  s.r(112, 122, 84, 10, C.lemon, { rx: 5 });
  s.t('克服同一偏误 3 次，解锁它们的认可', 112, 142, 10, { c: C.darkSub });

  s.t('内心小动物图鉴', 20, 226, 16, { w: 'B', c: C.ink });
  const dex = (x, y, o) => {
    const off = !!o.off;
    s.card(x, y, 170, 128, C.card, off ? '#EFE5D6' : '#F3CFA9', 18, 6);
    s.c(x + 34, y + 36, 24, off ? C.well : C.coralSoft);
    mascot(s, o.who, x + 22, y + 24, 24);
    s.t(o.name, x + 66, y + 26, 14, { w: 'B', c: off ? C.ink3 : C.ink });
    s.t(o.trait, x + 66, y + 46, 9, { c: off ? C.ink3 : C.ink3 });
    s.t(o.quote, x + 16, y + 66, 10.5, { c: off ? C.ink3 : C.ink2 });
    s.t(o.count, x + 16, y + 104, 10, { w: 'B', c: off ? C.ink3 : C.coral });
  };
  dex(20, 252, { who: 'frog', name: '恐怖蛙', trait: '报错恐慌', quote: '呱——好多红色！完了完\n了要背锅了！', count: '出场 3 次' });
  dex(200, 252, { who: 'otter', name: '惊讶濑', trait: '意外 = 信息', quote: '纳尼？！证据它自己说\n话了！', count: '出场 5 次' });
  dex(20, 390, { who: 'snail', name: '不行蜗', trait: '盲扫', quote: '（慢慢探头）这两个动\n作，好像啥也没查出来。', count: '尚未相遇', off: true });
  dex(200, 390, { who: 'rabbit', name: '垂耳兔', trait: '过早锁定', quote: '（摇头）证据还不够，\n你只是想结束它。', count: '尚未相遇', off: true });

  s.t('收集的检查单', 20, 546, 16, { w: 'B', c: C.ink });
  s.r(20, 572, 350, 84, C.card, { rx: 16, st: C.line, sw: 1 });
  s.t('握手类故障第一步永远是看"谁能连上、\n谁不能"——分布即线索。', 36, 586, 12, { w: 'M', c: C.ink });
  s.t('《深夜的全线超时》 · TLS 握手', 36, 632, 10, { c: C.sky });
  s.r(20, 668, 350, 84, C.card, { rx: 16, st: C.line, sw: 1 });
  s.t('openssl s_client 是证书问题的一锤定音\n动作：直接看服务器发出了什么。', 36, 682, 12, { w: 'M', c: C.ink });
  s.t('《深夜的全线超时》 · TLS 握手', 36, 728, 10, { c: C.sky });
  tabBar(s, 'handbook', 844);
  return { name: '手册 · 成长收集', items: s, H: 844 };
}

/* ---------- ⑥ 个人中心 ---------- */
function buildProfile() {
  const s = makeScreen();
  s.t('我的', 0, 22, 16, { w: 'B', c: C.ink, width: W, al: 'C' });
  s.card(20, 52, 350, 128, C.darkCard, '#37323F', 24, 10);
  s.c(74, 116, 32, C.darkTrack);
  mascot(s, 'frog', 58, 100, 32);
  s.t('瞎扫实习生', 122, 74, 20, { w: 'B', c: C.white });
  s.t('本地档案 · 第 1 天 · 累计破案 1 关', 122, 104, 10.5, { c: C.darkSub });
  s.t('距「初级侦探」还差 1 关', 122, 122, 10, { c: C.lemon });
  const stat = (x, v, k) => {
    s.card(x, 194, 110, 74, C.card, '#EFE5D6', 16, 5);
    s.t(v, x, 210, 20, { w: 'B', c: C.coral, width: 110, al: 'C' });
    s.t(k, x, 240, 10, { c: C.ink3, width: 110, al: 'C' });
  };
  stat(20, '3 天', '连续 streak');
  stat(140, '1', '累计破案');
  stat(260, '7⚡', '最低成本');

  s.card(20, 284, 350, 108, C.coralSoft, '#F3CFA9', 20, 8);
  s.t('账号', 36, 300, 13, { w: 'B', c: C.ink });
  s.t('v0 进度保存在本机。登录后可多端同步、\n参与排行榜与每日挑战。', 36, 324, 10.5, { c: C.ink3 });
  s.r(36, 352, 318, 30, C.coralSoft, { rx: 15 });
  s.t('登录 / 注册 · 即将开放', 36, 359, 11, { w: 'B', c: C.coral, width: 318, al: 'C' });

  s.t('通用', 20, 416, 13, { w: 'B', c: C.ink2 });
  const row = (y, label, value) => {
    s.card(20, y, 350, 52, C.card, '#EFE5D6', 16, 5);
    s.t(label, 36, y + 17, 13, { w: 'M', c: C.ink });
    s.t(value, 336, y + 19, 10, { c: C.ink3, width: 0, al: 'R' });
    s.p('M350 ' + (y + 26) + ' L344 ' + (y + 20) + ' M350 ' + (y + 26) + ' L344 ' + (y + 32), { st: C.ink3, sw: 1.6 });
    return y + 60;
  };
  let ry = row(434, '学习提醒', '每天 21:30');
  ry = row(ry, '每日一题', '即将上线');
  ry = row(ry, '检查单云同步', '即将上线');
  ry = row(ry, '关于排错推理训练场', 'v0.1');
  tabBar(s, 'me', 844);
  return { name: '我的 · 个人中心', items: s, H: 844 };
}

/* ---------- ⑦ 动效规范 ---------- */
function buildMotion() {
  const s = makeScreen();
  const MW = 1300;
  s.t('动效规范 · Motion Spec', 40, 40, 26, { w: 'B', c: C.ink });
  s.t('曲线约定：标准 ease-out = cubic-bezier(.25,.8,.3,1) · 弹性 overshoot = cubic-bezier(.34,1.56,.64,1) · 时长 200~420ms · 尊重 prefers-reduced-motion', 40, 84, 12, { c: C.ink2 });
  const card = (x, y, o) => {
    s.r(x, y, 296, 168, C.card, { rx: 20, st: C.line, sw: 1 });
    s.r(x + 20, y + 18, 40, 40, o.tint, { rx: 13 });
    s.t(o.name, x + 74, y + 22, 14, { w: 'B', c: C.ink });
    s.t(o.trigger, x + 74, y + 44, 9.5, { c: C.ink3 });
    s.t(o.detail, x + 20, y + 74, 10.5, { c: C.ink2 });
    s.r(x + 20, y + 116, 256, 8, C.well, { rx: 4 });
    s.r(x + 20, y + 116, o.bar, 8, o.barColor ?? C.coral, { rx: 4 });
    s.c(x + 20 + o.bar - 5, y + 120, 5, C.coralDeep);
    s.t(o.curve, x + 20, y + 136, 9, { w: 'B', c: C.coral });
  };
  const M = [
    { name: '页面进入', trigger: 'navigateTo 推入', tint: C.coralSoft, detail: '整页内容上移 24px + 淡入', bar: 150, curve: 'ease-out · 240ms' },
    { name: '证据卡滑入', trigger: '动作执行返回证据', tint: C.skySoft, detail: 'translateY 16 → 0 + 淡入，多条依序 stagger 80ms', bar: 190, curve: 'spring(0.22, 1.1) · 320ms' },
    { name: '动物气泡弹出', trigger: '引擎触发吉祥物出场', tint: C.lemonSoft, detail: 'scale 0.6 → 1.06 → 1 + 左右轻摆 1 次（overshoot）', bar: 230, curve: 'overshoot · 380ms' },
    { name: '⚡ 消耗飞行', trigger: '点击验证动作', tint: C.lemonSoft, detail: '动作卡上的 ⚡ 飞向成本条（贝塞尔路径 500ms），成本数字 count-up 300ms', bar: 210, curve: 'ease-in-out · 500ms' },
    { name: '评级揭示', trigger: '进入复盘页', tint: C.pinkSoft, detail: '评级字母 scale 0.4 → 1.15 → 1，星星逐颗 pop（stagger 140ms）', bar: 250, curve: 'overshoot · 420ms' },
    { name: '撒花粒子', trigger: 'S 级 / 全员撒花', tint: C.mintSoft, detail: '12 粒彩纸从卡顶抛物线散落 900ms，仅一次', bar: 280, barColor: C.mint, curve: 'linear + 重力 · 900ms' },
    { name: 'Tab 切换', trigger: '点击底部 Tab', tint: C.skySoft, detail: '图标 scale 1 → 1.2 → 1，标签颜色过渡', bar: 120, curve: 'ease-out · 200ms' },
    { name: '关卡解锁（预留）', trigger: '通关本章末关', tint: C.pinkSoft, detail: '锁图标开锁动画 + 下一章卡片描边颜色过渡 + 轻微弹跳', bar: 170, barColor: C.pink, curve: 'ease-out · 300ms' },
  ];
  M.forEach((o, i) => {
    const x = 40 + (i % 4) * 320;
    const y = 130 + Math.floor(i / 4) * 196;
    card(x, y, o);
  });
  s.t('落地约定：H5 用 CSS transition/animation 实现；native（蒸汽模式）改用 transform/opacity 过渡；动物气泡出场由引擎事件驱动，不做常驻动画。', 40, 560, 12, { c: C.ink2 });
  return { name: '动效规范 · Motion Spec', items: s, H: 620, wide: true };
}

/* ---------- 序列化 ---------- */
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const WEIGHT = { R: 400, M: 500, B: 700 };
const STYLE = { R: 'Regular', M: 'Medium', B: 'Bold' };

function shapesSvg(items, forFigma = false) {
  let defs = '';
  let gid = 0;
  const fillOf = (it) => {
    const gradSpec = it.g ?? (it.f && typeof it.f === 'object' && it.f.g ? it.f.g : null);
    if (gradSpec) {
      gid++;
      const id = 'gr' + gid;
      defs += `<radialGradient id="${id}" cx="34%" cy="26%" r="90%"><stop offset="0%" stop-color="${gradSpec.a}"/><stop offset="100%" stop-color="${gradSpec.b}"/></radialGradient>`;
      return `fill="url(#${id})"${it.op != null ? ` fill-opacity="${it.op}"` : ''}`;
    }
    if (it.f != null && typeof it.f !== 'object') return `fill="${it.f}"${it.op != null ? ` fill-opacity="${it.op}"` : ''}`;
    return '';
  };
  let out = '';
  for (const it of items) {
    if (it.t === 'r') {
      out += `<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${it.rx}" ${fillOf(it)}${it.st ? ` stroke="${it.st}" stroke-width="${it.sw}"${it.dash ? ' stroke-dasharray="5 4"' : ''}` : ''}/>`;
    } else if (it.t === 'c') {
      out += `<circle cx="${it.x}" cy="${it.y}" r="${it.r}" ${fillOf(it)}${it.st ? ` stroke="${it.st}" stroke-width="${it.sw}"` : ''}/>`;
    } else if (it.t === 'e') {
      out += `<ellipse cx="${it.x}" cy="${it.y}" rx="${it.rx}" ry="${it.ry}" ${fillOf(it)}${it.st ? ` stroke="${it.st}" stroke-width="${it.sw}"` : ''}/>`;
    } else if (it.t === 'l') {
      out += `<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${it.st}" stroke-width="${it.sw}"${it.dash ? ' stroke-dasharray="4 4"' : ''}/>`;
    } else if (it.t === 'p') {
      out += `<path d="${it.d}" ${fillOf(it)}${it.st ? ` stroke="${it.st}" stroke-width="${it.sw}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`;
    } else if (it.t === 'img' && !forFigma) {
      out += `<image href="assets/${it.name}-192.png" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.w}"/>`;
    }
  }
  return (defs ? `<defs>${defs}</defs>` : '') + out;
}
function textsSvg(items) {
  let out = '';
  for (const it of items) {
    const lines = it.s.split('\n');
    const anchor = it.al === 'C' ? 'middle' : it.al === 'R' ? 'end' : 'start';
    const ax = it.al === 'C' ? it.x + (it.width ?? 0) / 2 : it.al === 'R' ? it.x + (it.width ?? 0) : it.x;
    let tspans = '';
    lines.forEach((ln, i) => {
      tspans += i === 0
        ? `<tspan x="${ax}">${esc(ln)}</tspan>`
        : `<tspan x="${ax}" dy="${it.fs * 1.45}">${esc(ln)}</tspan>`;
    });
    out += `<text y="${it.y + it.fs}" font-family="'PingFang SC','Inter',sans-serif" font-size="${it.fs}" font-weight="${WEIGHT[it.w]}" fill="${it.c}" text-anchor="${anchor}">${tspans}</text>`;
  }
  return out;
}

async function call(name, args) {
  const res = await fetch(API + '/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  if (j.isError) throw new Error(j.text || '工具执行失败');
  return j;
}

/* ---------- dry ---------- */
function dry(screens) {
  mkdirSync('/tmp/figma_review', { recursive: true });
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{background:#2A2733;display:flex;flex-wrap:wrap;gap:36px;padding:32px;font-family:sans-serif}
  .ph{border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  .lb{color:#B7AFC7;font-size:13px;text-align:center;margin-top:10px}
  </style></head><body>`;
  for (const sc of screens) {
    const w = sc.wide ? 1300 : W;
    const h = Math.ceil(sc.items.H2);
    html += `<div><div class="ph"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="${C.bg}"/>${shapesSvg(sc.items.sh)}${textsSvg(sc.items.tx)}</svg></div><div class="lb">${sc.name}（${w}×${h}）</div></div>`;
  }
  html += '</body></html>';
  writeFileSync('/tmp/figma_review/preview.html', html);
  mkdirSync('/tmp/figma_review/assets', { recursive: true });
  for (const n of ['frog', 'otter', 'snail', 'rabbit', 'dino']) {
    const a = mascotAsset(n);
    if (a) writeFileSync('/tmp/figma_review/assets/' + n + '-192.png', readFileSync(a));
  }
  console.log('dry 完成 → /tmp/figma_review/preview.html');
}

/* ---------- push ---------- */
async function push(screens) {
  const st = await (await fetch(API + '/status')).json();
  if (!st.plugin_connected) throw new Error('Figma 插件未连接到桥（端口 3056）。');
  const page = await call('execute_figma_code', {
    code: `
      const old = figma.root.children.find(p => p.name === ${JSON.stringify(PAGE_NAME)});
      if (old) {
        const shelter = figma.root.children.find(p => p !== old) || figma.createPage();
        figma.currentPage = shelter;
        old.remove();
      }
      const p = figma.createPage();
      p.name = ${JSON.stringify(PAGE_NAME)};
      figma.currentPage = p;
      return { pageId: p.id };
    `,
  });
  const pageId = JSON.parse(page.text).result.pageId;
  console.log('页面已重建:', pageId);
  mkdirSync('/tmp/figma_review', { recursive: true });
  let x = 0;
  let rowH = 0;
  let y = 0;
  const results = [];
  for (const sc of screens) {
    const w = sc.wide ? 1300 : W;
    const h = Math.ceil(sc.items.H2);
    if (x + w > 1500) { x = 0; y += rowH + 100; rowH = 0; }
    const frame = await call('create_frame', {
      name: sc.name, x, y, width: w, height: h, fills: C.bg, parent_id: pageId,
    });
    const fid = JSON.parse(frame.text).id;
    await call('create_node_from_svg', {
      svg: `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${shapesSvg(sc.items.sh, true)}</svg>`,
      parent_id: fid, name: sc.name + ' · 形状', x: 0, y: 0,
    });
    // 吉祥物图片资产：createImage + 图片填充矩形
    const imgs = sc.items.sh.filter((it) => it.t === 'img');
    if (imgs.length) {
      const payload = imgs.map((it) => {
        const b64 = readFileSync(join(ASSET_DIR, it.name + '-96.png')).toString('base64');
        return { name: it.name, b64, x: it.x, y: it.y, w: it.w };
      });
      await call('execute_figma_code', {
        code: `const items = ${JSON.stringify(payload)};
        const frame = await figma.getNodeByIdAsync(${JSON.stringify(fid)});
        for (const it of items) {
          const bin = atob(it.b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          const img = figma.createImage(arr);
          const r = figma.createRectangle();
          r.resize(it.w, it.w);
          r.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash }];
          frame.appendChild(r);
          r.x = it.x; r.y = it.y; r.name = '吉祥物 · ' + it.name;
        }
        return { placed: items.length };`,
      });
    }
    for (const it of sc.items.tx) {
      const created = await call('create_text', {
        text: it.s, x: it.x, y: it.y, font_size: it.fs,
        font_family: 'Inter', font_style: STYLE[it.w],
        fills: it.c, width: it.width ? it.width : undefined,
        text_align_horizontal: it.al === 'C' ? 'CENTER' : it.al === 'R' ? 'RIGHT' : 'LEFT',
        parent_id: fid,
      });
      // 右对齐无宽文本：按实际宽度回移，使右缘对齐到 ax
      if (it.al === 'R' && !it.width) {
        const w = JSON.parse(created.text).width;
        const tid = JSON.parse(created.text).id;
        await call('execute_figma_code', {
          code: `const n = await figma.getNodeByIdAsync(${JSON.stringify(tid)}); n.x = ${JSON.stringify(it.x)} - n.width; return { x: n.x };`,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 600));
    const png = Buffer.from(await (await fetch(`${API}/image?node_id=${encodeURIComponent(fid)}&scale=1`)).arrayBuffer());
    const file = `/tmp/figma_review/v2-${results.length + 1}-${sc.name.split(' ')[0]}.png`;
    writeFileSync(file, png);
    results.push({ name: sc.name, fid, file });
    console.log('✓', sc.name, fid, `(${w}×${h})`);
    x += w + 80;
    rowH = Math.max(rowH, h);
  }
  console.log('全部完成。共', results.length, '块画板');
}

const mode = process.argv[2] || 'dry';
const screens = [buildIconSheet(), buildHome(), buildChapter(), buildPlay(), buildReview(), buildHandbook(), buildProfile(), buildSharePoster(), buildMotion()];
if (mode === 'dry') dry(screens);
else await push(screens);
