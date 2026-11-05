/* ============================================================
 * 白日梦导演台 · 故事板宫格引擎（v1.23.0）
 *
 * 干什么：把「一镜一张图」变成「一张能直接发出去的宫格故事板」。
 *   每一格优先用这一镜自己搭好的 3D 场景离屏渲染（和分镜板卡片缩略图同一口径），
 *   没有场景的镜回落成占位格，格子下方自动带 镜号 / 景别 / 角度 / 运镜 / 时长 / 台词，
 *   画面角上按运镜画分镜通用的运动箭头，同场次尽量不跨页。
 *
 * 为什么不让 AI 一次画整张宫格：2×3 个 16:9 格子整体是 32:27 ≈ 1.185:1，
 *   模型可选画幅里没有这个比例，硬塞必然裁切或留黑；而且一次画六格 ——
 *   单格糊了没法重抽，格子里的镜号和台词一定会崩成乱码。
 *   正确管线是「逐格出图 + 本地拼格」，所以这里同时提供「🧾 生图提示词包」：
 *   一条提示词对应一个格子，同学拿去即梦 / 豆包 / ComfyUI 逐张生成，
 *   再用「🖼 逐格回填」把图塞回来重拼。接了生图通道以后也是同一套格子。
 *
 * 三段职责：
 *   1) normShot —— 抹平分镜板 shot 与 故事板 shot 的字段差异
 *                   （分镜板存英文 key + 白模 3D 场景；故事板存中文名 + dataURL）
 *   2) Stiller  —— 单格出图：WhiteModelRenderer 离屏静帧 / 已有图（sketch·image）解码
 *   3) composePages —— 版式规划、分页、字幕带、运镜箭头、页头页脚、导出 PNG
 *
 * 消费方：
 *   js/views-core.js —— 分镜板「🎛 宫格图」（ESM 直接 import）
 *   js/miaoning.js  —— 故事板（classic 脚本，走 window.MNGRID）
 * ============================================================ */
import { WhiteModelRenderer, focusPointOf } from './cameraSim.js';
import { moveByKey, sizeByKey, angleByKey } from './breakdown.js';
import { CAMERA_MOVES, ANGLES, SHOT_SIZES } from './data.js';
import { modal, toast, esc, copyText } from './ui.js';

const VERSION_TEXT = '白日梦导演台 v1.24.0';
const moveByName = Object.fromEntries(CAMERA_MOVES.map(m => [m.name, m.key]));
const angleByName = Object.fromEntries(ANGLES.map(a => [a.name, a.key]));
const sizeByName = Object.fromEntries(SHOT_SIZES.map(s => [s.name, s.key]));

/* 故事板老字段是中文名，且和 js/data.js 的 SHOT_SIZES/ANGLES 名字表要对齐
   （data.js 里 CU=近景、ECU=特写、MCU=中近景，别自己另起一套，否则同一个 key 两处显示不同景别） */
const SIZE_CN = { '大远景': 'ELS', '远景': 'LS', '全景': 'LS', '中景': 'MS', '中近景': 'MCU', '近景': 'CU', '特写': 'ECU', '航拍': 'ELS', '其他': 'MS' };
const ANGLE_CN = { '平视': 'eye', '仰拍': 'low', '俯拍': 'high', '鸟瞰': 'bird', '斜角': 'dutch', '斜侧': 'dutch', '过肩': 'ots', '越肩': 'ots' };
/* 故事板五拍骨架里的老写法（'缓慢横移' / '固定 · 微微手持'）认不回 key 时会一律变「固定镜头」，这里补几个别名 */
const MOVE_CN = {
  '固定': 'static', '固定镜头': 'static', '缓慢横移': 'truckLeft', '横移': 'truckLeft',
  '缓慢推近': 'slowPush', '缓推': 'slowPush', '缓慢拉远': 'slowPull', '跟移': 'trackSide',
  '手持': 'handheld', '微微手持': 'handheld', '环绕': 'orbitLeft', '升': 'craneUp', '降': 'craneDown',
};

const ASPECTS = { '16:9': [16, 9], '21:9': [21, 9], '4:3': [4, 3], '1:1': [1, 1], '9:16': [9, 16], '3:4': [3, 4] };
const aspectWH = a => ASPECTS[a] || [16, 9];

/* 版式：cols=列数，per=每页格数（rows 由 per/cols 向上取整） */
const PRESETS = [
  { key: 'auto', cols: 0, per: 0, name: '自动（尽量方正）' },
  { key: '1x2', cols: 2, per: 2, name: '1 行 2 格' },
  { key: '1x3', cols: 3, per: 3, name: '1 行 3 格' },
  { key: '1x4', cols: 4, per: 4, name: '1 行 4 格（横条）' },
  { key: '2x2', cols: 2, per: 4, name: '2×2 四格' },
  { key: '3x2', cols: 3, per: 6, name: '3×2 六格' },
  { key: '2x3', cols: 2, per: 6, name: '2×3 六格' },
  { key: '2x4', cols: 2, per: 8, name: '2×4 八格' },
  { key: '4x2', cols: 4, per: 8, name: '4×2 八格' },
  { key: '3x3', cols: 3, per: 9, name: '3×3 九格' },
  { key: '4x4', cols: 4, per: 16, name: '4×4 十六格' },
];
const QUALITY = [
  { key: 'sm', cellW: 640, name: '紧凑 640（快速看版）' },
  { key: 'md', cellW: 960, name: '标准 960（够用）' },
  { key: 'hd', cellW: 1280, name: '高清 1280（交付）' },
  { key: '4k', cellW: 1920, name: '超清 1920（打印）' },
];
/* 画布像素上限：Chrome 单边约 8192、总面积也有约束，超了就自动降一档而不是白屏 */
const MAX_PAGE_W = 7600, MAX_PAGE_H = 7600;

/* 格子内容的来源顺序：auto 手绘稿→3D→参考图；scene 只 3D；image 已有图优先 */
const ORDER = { auto: ['sketch', '3d', 'image'], scene: ['3d'], image: ['sketch', 'image', '3d'] };

const THEME = {
  light: { page: '#f2f4f8', card: '#ffffff', ink: '#22262f', muted: '#6b7280', line: 'rgba(60,70,90,.18)', band: '#ffffff', head: '#171a21', ground: '#d9dde5' },
  dark: { page: '#101319', card: '#171b23', ink: '#e9edf5', muted: '#9aa4b4', line: 'rgba(255,255,255,.14)', band: '#171b23', head: '#eef2f8', ground: '#2a2f3a' },
};
/* 白模渲染器自己的主题（跟分镜板卡片缩略图同一套配色，别又造一种长相） */
const STILLE = {
  light: { bg1: '#eceff4', bg2: '#e1e5ed', fog: '#e8ebf1', line: 'rgba(96,106,134,.26)', ink: '#2a3040', hud: 'rgba(35,42,60,.38)', ground: '#d9dde5' },
  dark: { bg1: '#1a1d25', bg2: '#141720', fog: '#191d26', line: 'rgba(150,170,210,.22)', ink: '#dfe6f2', hud: 'rgba(220,230,250,.38)', ground: '#2a2f3a' },
};
const ACCENT = ['#2f6db5', '#e1453e', '#3da35d', '#e8a33d', '#7b4fd1', '#1fb6c9', '#d14f9e', '#8a5a2b'];

/* ---------------- 小工具 ---------------- */
const pad2 = n => String(n).padStart(2, '0');
export function dataURLToBlob(u) {
  const s = String(u || '');
  const i = s.indexOf(',');
  if (i < 0) return null;
  const bin = atob(s.slice(i + 1));
  const arr = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
  return new Blob([arr], { type: (s.slice(5, i).split(';')[0] || 'image/png') });
}
function blobToDataURL(blob) {
  return new Promise(res => {
    if (!blob) return res(null);
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}
function loadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function dlBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hashKey(s) {
  let h = 0; const t = String(s || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ---------------- 一、字段归一 ---------------- */
/* 中文名 → key：先按标准表精确匹配，再按别名表「长的优先」做包含匹配
   （'固定 · 微微手持' 要认成手持跟拍，不能停在「固定」上） */
function cnToKey(txt, byName, alias) {
  const t = String(txt || '').trim();
  if (!t) return null;
  if (byName[t]) return byName[t];
  const keys = Object.keys(alias).sort((a, b) => b.length - a.length);
  for (const k of keys) if (t.indexOf(k) >= 0) return alias[k];
  return null;
}
export function normShot(s, i = 0) {
  const boardScene = (s.scene && typeof s.scene === 'object') ? s.scene : (s.boardScene || null);
  const cnScene = typeof s.scene === 'string' ? s.scene : '';
  const sizeKey = s.shotSize || cnToKey(cnScene, sizeByName, SIZE_CN) || 'MS';
  const angleKey = s.angle || cnToKey(s.angleCn, angleByName, ANGLE_CN) || 'eye';
  const moveKey = s.cameraMove || cnToKey(s.camera, moveByName, MOVE_CN) || 'static';
  return {
    raw: s,
    idx: i + 1,
    title: s.title || '',
    desc: s.desc || s.action || '',
    dialogue: s.dialogue || '',
    duration: Math.max(0.5, +s.duration || 3),
    sizeKey, angleKey, moveKey,
    moveSpeed: s.moveSpeed || 'std',
    sizeName: (sizeByKey[sizeKey] || {}).name || sizeKey,
    angleName: (angleByKey[angleKey] || {}).name || '平视',
    moveName: (moveByKey[moveKey] || {}).name || '固定镜头',
    scene: boardScene,
    sceneKey: s.sceneKey || '',
    prompt: s.prompt || '',
    /* 格子图三个来源：手绘/回填稿(sketch) → 3D 场景静帧 → 参考图(image) */
    sketchRef: s.sketch || null,
    imgRef: s.image || null,
    strokes: Array.isArray(s.strokes) ? s.strokes : [],
    aimY: s.aimY, camH: s.camH, focusKind: s.focusKind, focusId: s.focusId, showPath: s.showPath,
  };
}

/* ---------------- 二、版式与分页 ---------------- */
export function planGrid(n, key = 'auto') {
  const p = PRESETS.find(x => x.key === key) || PRESETS[0];
  let cols, per;
  if (p.cols) { cols = p.cols; per = p.per || p.cols; }
  else {
    cols = Math.max(1, Math.min(4, Math.round(Math.sqrt(Math.max(1, n)))));
    per = cols * Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n))));
    if (per > 16) { cols = 4; per = 16; }
  }
  const rows = Math.max(1, Math.ceil(per / cols));
  return { cols, rows, per, single: n <= per };
}

/* 连续同场次算一组，尽量不跨页；组比一页还长时先补满当前页再整页切 */
export function packPages(list, per) {
  const runs = [];
  for (const it of list) {
    const k = it.ns.sceneKey || '';
    const last = runs[runs.length - 1];
    if (last && last.key === k) last.items.push(it); else runs.push({ key: k, items: [it] });
  }
  const pages = [];
  let cur = [];
  const flush = () => { if (cur.length) { pages.push(cur); cur = []; } };
  for (const run of runs) {
    let items = run.items.slice();
    while (items.length > per) {
      const room = per - cur.length;
      if (room > 0) { cur = cur.concat(items.slice(0, room)); items = items.slice(room); }
      flush();
      pages.push(items.slice(0, per));
      items = items.slice(per);
    }
    if (cur.length + items.length > per) flush();
    cur = cur.concat(items);
  }
  flush();
  return pages;
}

/* ---------------- 三、单格出图 ---------------- */
const artCache = new Map();
async function resolveArt(src) {
  if (!src) return null;
  const s = String(src);
  if (/^data:/.test(s)) return s;
  if (artCache.has(s)) return artCache.get(s);
  let url = null;
  try {
    const blob = window.__bdm && await window.__bdm.getImage(s);
    if (blob) url = await blobToDataURL(blob);
  } catch (e) { url = null; }
  artCache.set(s, url);
  return url;
}

class Stiller {
  constructor(aw, ah, cellW, dark) {
    this.W = cellW;
    this.H = Math.round(cellW * ah / aw / 2) * 2;
    const oc = document.createElement('canvas');
    oc.width = this.W; oc.height = this.H;
    this.cv = oc;
    this.r = new WhiteModelRenderer(oc);
    /* 构造时渲染器按 getBoundingClientRect 重设过尺寸，离屏画布会被压成 300×150 —— 盖回去 */
    oc.width = this.W; oc.height = this.H;
    this.r.w = this.W; this.r.h = this.H; this.r._dpr = 1;
    this.r.setTheme(dark ? STILLE.dark : STILLE.light);
    this.base = this.r.theme;
  }
  /* 一张静帧：跟分镜板卡片、动态分镜 mp4 完全同一套参数，三处画面才对得上 */
  render(ns, t = 0.55) {
    const mv = moveByKey[ns.moveKey] || moveByKey.static;
    this.r.setTheme({ ground: (ns.scene && ns.scene.floor) || this.base.ground });
    this.r.render(mv.sim, t, 'stand', {
      duration: ns.duration, hud: false, letterbox: false,
      angle: ns.angleKey, size: ns.sizeKey, moveSpeed: ns.moveSpeed,
      scene: ns.scene, aimY: ns.aimY ?? undefined, camH: ns.camH ?? undefined,
      focus: focusPointOf(ns.scene, ns.focusKind, ns.focusId, ns.aimY),
      focusKind: ns.focusKind || 'auto', showPaths: !!ns.showPath,
    });
    return this.cv.toDataURL('image/jpeg', 0.9);
  }
}

/**
 * 出每一格的画面。
 * mode: 'auto' 已有稿→3D→参考图 ｜ 'scene' 只 3D ｜ 'image' 已有图优先
 * 返回 [{ ns, url, from, idx }]，from ∈ sketch | 3d | image | none
 */
export async function renderStills(shots, opt = {}, onProg = null) {
  const [aw, ah] = aspectWH(opt.aspect);
  const cellW = Math.max(320, Math.round(opt.cellW || 960));
  const stiller = new Stiller(aw, ah, cellW, !!opt.dark);
  const mode = ORDER[opt.mode] ? opt.mode : 'auto';
  const out = [];
  const renderOne = (ns) => { try { return stiller.render(ns, opt.t ?? 0.55); } catch (e) { return null; } };
  for (let i = 0; i < shots.length; i++) {
    const ns = shots[i] && shots[i].idx ? shots[i] : normShot(shots[i], i);
    let url = null, from = 'none';
    /* 手绘/回填稿是「这一格的成品画面」，优先级永远高于参考图 */
    const sketch = mode === 'scene' ? null : (await resolveArt(ns.sketchRef));
    const photo = mode === 'scene' ? null : (await resolveArt(ns.imgRef));
    for (const src of ORDER[mode]) {
      if (url) break;
      if (src === 'sketch') { url = sketch; if (url) from = 'sketch'; }
      else if (src === 'image') { url = photo; if (url) from = 'image'; }
      else if (src === '3d' && ns.scene) { url = renderOne(ns); if (url) from = '3d'; }
    }
    out.push({ ns, url, from, idx: ns.idx });
    if (onProg) onProg(i + 1, shots.length, ns);
    /* 每格渲染之间让出主线程，长列表才不会被浏览器判成「页面无响应」 */
    if (onProg && i % 3 === 2) await sleep(0);
  }
  return out;
}

/* ---------------- 四、运镜箭头 ---------------- */
function arrowKind(sim) {
  if (!sim || sim.type === 'static') return null;
  const t = sim.type, d = sim.dir || '';
  if (t === 'dolly' || t === 'zoom' || t === 'dollyZoom') return d === 'out' ? 'out' : 'in';
  if (t === 'track' || t === 'reveal') return d === 'right' ? 'right' : 'left';
  if (t === 'pan') return d === 'right' ? 'arcR' : 'arcL';
  if (t === 'tilt') return d === 'down' ? 'down' : 'up';
  if (t === 'crane') return d === 'down' ? 'down' : 'up';
  if (t === 'orbit') return d === 'ccw' ? 'ccw' : 'cw';
  if (t === 'spiral') return 'cw';
  if (t === 'follow') return d === 'side' ? 'right' : 'in';
  if (t === 'handheld') return 'shake';
  return null;
}
/* Storyboard 通用语法：四角向内＝推，向外＝拉，横长箭＝移，弧箭＝摇/绕，竖箭＝升降 */
function drawArrow(ctx, x, y, w, h, kind, color) {
  const m = Math.min(w, h) * 0.06;
  const head = Math.min(w, h) * 0.045;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.6, Math.min(w, h) * 0.011);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tip = (px, py, ax, ay) => {
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay); ctx.stroke();
    const a = Math.atan2(py - ay, px - ax);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - head * Math.cos(a - 0.5), py - head * Math.sin(a - 0.5));
    ctx.lineTo(px - head * Math.cos(a + 0.5), py - head * Math.sin(a + 0.5));
    ctx.closePath(); ctx.fill();
  };
  const cx = x + w / 2, cy = y + h / 2;
  if (kind === 'in') {
    const off = Math.min(w, h) * 0.16;
    tip(cx - off, cy - off, x + m * 2.2, y + m * 2.2);
    tip(cx + off, cy - off, x + w - m * 2.2, y + m * 2.2);
    tip(cx - off, cy + off, x + m * 2.2, y + h - m * 2.2);
    tip(cx + off, cy + off, x + w - m * 2.2, y + h - m * 2.2);
  } else if (kind === 'out') {
    const off = Math.min(w, h) * 0.16;
    tip(x + m * 2.2, y + m * 2.2, cx - off, cy - off);
    tip(x + w - m * 2.2, y + m * 2.2, cx + off, cy - off);
    tip(x + m * 2.2, y + h - m * 2.2, cx - off, cy + off);
    tip(x + w - m * 2.2, y + h - m * 2.2, cx + off, cy + off);
  } else if (kind === 'left' || kind === 'right') {
    const yy = y + h * 0.86, s = x + w * 0.16, e = x + w * 0.84;
    if (kind === 'right') tip(e, yy, s, yy); else tip(s, yy, e, yy);
  } else if (kind === 'up' || kind === 'down') {
    const xx = x + w * 0.9;
    const y0 = y + h * 0.82, y1 = y + h * 0.16;
    if (kind === 'up') tip(xx, y1, xx, y0); else tip(xx, y0, xx, y1);
  } else if (kind === 'arcL' || kind === 'arcR') {
    const r = Math.min(w, h) * 0.22;
    ctx.beginPath();
    if (kind === 'arcR') ctx.arc(cx, y + h * 0.2, r, Math.PI * 1.15, Math.PI * 1.95);
    else ctx.arc(cx, y + h * 0.2, r, Math.PI * 1.05, Math.PI * 1.85, true);
    ctx.stroke();
    const a = kind === 'arcR' ? Math.PI * 1.95 : Math.PI * 1.05;
    const px = cx + r * Math.cos(a), py = y + h * 0.2 + r * Math.sin(a);
    tip(px, py, cx + r * Math.cos(a - 0.35), y + h * 0.2 + r * Math.sin(a - 0.35));
  } else if (kind === 'cw' || kind === 'ccw') {
    const r = Math.min(w, h) * 0.2;
    ctx.beginPath();
    if (kind === 'cw') ctx.arc(cx, y + h * 0.86, r, Math.PI * 1.1, Math.PI * 1.9);
    else ctx.arc(cx, y + h * 0.86, r, Math.PI * 1.9, Math.PI * 1.1, true);
    ctx.stroke();
    const a = kind === 'cw' ? Math.PI * 1.9 : Math.PI * 1.1;
    tip(cx + r * Math.cos(a), y + h * 0.86 + r * Math.sin(a), cx + r * Math.cos(a - 0.3), y + h * 0.86 + r * Math.sin(a - 0.3));
  } else if (kind === 'shake') {
    ctx.beginPath();
    const yy = y + h * 0.1, seg = w * 0.06;
    for (let i = 0; i < 5; i++) {
      const px = x + w * 0.14 + i * seg;
      ctx.lineTo(px, yy + (i % 2 ? -1 : 1) * Math.min(h, w) * 0.035);
      if (!i) ctx.moveTo(px, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- 五、文字换行与字幕带 ---------------- */
const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
function wrapText(ctx, text, maxW, maxLines) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const lines = [];
  let cur = '';
  for (const ch of t) {
    const next = cur + ch;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur); cur = ch;
      if (lines.length === maxLines) break;
    } else cur = next;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (lines.length === maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  return lines;
}

/* 字幕带：左侧镜号角标占一整列，正文另起一列 —— 以前正文从带子最左边开始，
   第二三行会压在镜号上（截图里「傍晚，城市街道…」被 01 盖住） */
function drawCaption(ctx, ns, x, y, w, h, th) {
  const accent = ACCENT[hashKey(ns.sceneKey || ns.idx) % ACCENT.length];
  ctx.fillStyle = th.band;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = th.line; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();

  const px = Math.round(w * 0.028);
  const badgeW = Math.round(w * 0.115);
  const badgeH = Math.round(h * 0.44);
  ctx.fillStyle = accent;
  roundRect(ctx, x + px, y + (h - badgeH) / 2, badgeW, badgeH, badgeH * 0.24); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.round(badgeH * 0.6)}px ${FONT}`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(pad2(ns.idx), x + px + badgeW / 2, y + h / 2 + 1);

  const tx = x + px + badgeW + px;
  const tw = x + w - px - tx;
  const tag = ns.sceneKey ? String(ns.sceneKey).slice(0, 10) : '';
  const rows = ns.dialogue ? 3 : 2;
  const lh = (h - px) / rows;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';

  /* 第一行：景别 · 角度 · 运镜 · 时长（右端场次标签） */
  const f1 = Math.round(lh * 0.52);
  ctx.font = `700 ${f1}px ${FONT}`;
  ctx.fillStyle = th.ink;
  const tagW = tag ? Math.round(lh * 0.5) + ctx.measureText(tag).width : 0;
  const clip = (s, maxW) => { let t = s; while (t.length > 3 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1); return ctx.measureText(s).width > maxW ? t + '…' : s; };
  ctx.fillText(clip(`${ns.sizeName} · ${ns.angleName} · ${ns.moveName} · ${ns.duration.toFixed(1)}s`, tw - tagW), tx, y + px * 0.5);
  if (tag) {
    ctx.font = `600 ${Math.round(f1 * 0.82)}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'right';
    ctx.fillText(tag, x + w - px, y + px * 0.5);
    ctx.textAlign = 'left';
  }
  /* 第二行起：画面（有台词时只留一行）+ 台词 */
  const f2 = Math.round(lh * 0.46);
  const bodyMax = rows === 3 ? 1 : 2;
  let cy = y + px * 0.5 + lh;
  const body = wrapText(ctx, ns.desc || (ns.title ? ns.title : '（这一格还没画面）'), tw, bodyMax);
  ctx.font = `400 ${f2}px ${FONT}`;
  ctx.fillStyle = th.muted;
  for (let i = 0; i < body.length; i++) {
    ctx.fillText(body[i], tx, cy);
    cy += lh;
  }
  if (ns.dialogue) {
    ctx.font = `600 ${f2}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(clip(`「${ns.dialogue}」`, tw), tx, cy);
  }
  ctx.textBaseline = 'alphabetic';
}

/* ---------------- 六、拼页 ---------------- */
/**
 * cells: renderStills 的输出；opt: {aspect,cols,rows,per,cellW,meta,arrows,title,sceneBreak,dark}
 * 返回 canvas 数组（一页一个）
 */
export async function composePages(cells, opt = {}) {
  const [aw, ah] = aspectWH(opt.aspect);
  const cellW = Math.max(320, Math.round(opt.cellW || 960));
  const cellH = Math.round(cellW * ah / aw / 2) * 2;
  const capH = opt.meta === false ? 0 : Math.round(cellH * (ah >= aw ? 0.30 : 0.36));
  const gap = Math.round(cellW * 0.02);
  const pad = Math.round(cellW * 0.045);
  const headH = opt.title ? Math.round(cellW * 0.14) : Math.round(cellW * 0.03);
  const footH = Math.round(cellW * 0.055);
  const th = opt.dark ? THEME.dark : THEME.light;

  /* 单边超限时自动降列/降行：先按尺寸修正版式，再分页 —— 
     反过来（先分页后修版式）会让某一页的格子画到画布外面去 */
  let cols = Math.max(1, opt.cols || 2), rows = Math.max(1, opt.rows || 1);
  if (pad * 2 + cols * cellW + (cols - 1) * gap > MAX_PAGE_W) {
    cols = Math.max(1, Math.floor((MAX_PAGE_W - pad * 2 + gap) / (cellW + gap)));
  }
  const rowH = cellH + capH;
  while (headH + footH + pad * 2 + rows * rowH + (rows - 1) * gap > MAX_PAGE_H && rows > 1) rows--;
  const per = Math.max(1, cols * rows);
  const pageW = pad * 2 + cols * cellW + (cols - 1) * gap;
  const pageH = headH + footH + pad * 2 + rows * rowH + (rows - 1) * gap;
  const pages = opt.pages || packPages(cells, per);

  /* 图片先全部解码完再画，避免 drawImage 时图还没就绪 */
  const imgs = new Map();
  for (const c of cells) {
    if (c.url && !imgs.has(c.url)) {
      const im = await loadImg(c.url);
      if (im && im.naturalWidth > 1) imgs.set(c.url, im);
    }
  }

  const date = new Date();
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const out = [];

  pages.forEach((page, pi) => {
    const cv = document.createElement('canvas');
    cv.width = pageW; cv.height = pageH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = th.page; ctx.fillRect(0, 0, pageW, pageH);

    /* 页头 */
    if (opt.title) {
      ctx.textBaseline = 'middle';
      ctx.fillStyle = th.head;
      ctx.font = `800 ${Math.round(cellW * 0.055)}px ${FONT}`;
      ctx.fillText(String(opt.title).slice(0, 40), pad, headH * 0.52);
      ctx.fillStyle = th.muted;
      ctx.font = `600 ${Math.round(cellW * 0.028)}px ${FONT}`;
      const meta = `第 ${pi + 1}/${pages.length} 页 · 本页 ${page.length} 镜 · 全片 ${cells.length} 镜 · ${opt.aspect || '16:9'}`;
      ctx.textAlign = 'right';
      ctx.fillText(meta, pageW - pad, headH * 0.56);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = th.line;
    ctx.fillRect(pad, headH - Math.round(cellW * 0.012), pageW - pad * 2, 1);

    /* 每一格 */
    page.forEach((c, ci) => {
      const gx = ci % cols, gy = Math.floor(ci / cols);
      const x = pad + gx * (cellW + gap);
      const y = headH + pad + gy * (rowH + gap);
      const ns = c.ns;
      ctx.fillStyle = th.card;
      roundRect(ctx, x, y, cellW, rowH, Math.round(cellW * 0.012)); ctx.fill();

      if (c.url && imgs.get(c.url)) {
        const im = imgs.get(c.url);
        const sc = Math.min(cellW / im.naturalWidth, cellH / im.naturalHeight);
        const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
        ctx.fillStyle = th.card;
        ctx.fillRect(x, y, cellW, cellH);
        ctx.save();
        roundRect(ctx, x + 0.5, y + 0.5, cellW - 1, cellH - 1, Math.round(cellW * 0.012));
        ctx.clip();
        ctx.drawImage(im, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
        /* 故事板手绘层（导演台里涂的构图线/箭头）叠在格子上 */
        if (ns.strokes.length && typeof window.paintInkTo === 'function') {
          const tmp = document.createElement('canvas');
          tmp.width = cellW; tmp.height = cellH;
          try { window.paintInkTo(tmp.getContext('2d'), ns.raw, cellW, cellH); ctx.drawImage(tmp, x, y); } catch (e) { /* 墨层坏了不影响出图 */ }
        }
        if (opt.arrows !== false) {
          const kind = arrowKind((moveByKey[ns.moveKey] || {}).sim);
          if (kind) drawArrow(ctx, x, y, cellW, cellH, kind, 'rgba(255,255,255,.86)');
        }
        ctx.restore();
      } else {
        /* 占位格：说清楚为什么空、怎么让它不空 */
        ctx.save();
        ctx.strokeStyle = th.line; ctx.lineWidth = Math.max(1, cellW * 0.004);
        ctx.setLineDash([cellW * 0.02, cellW * 0.014]);
        roundRect(ctx, x + cellW * 0.02, y + cellH * 0.04, cellW * 0.96, cellH * 0.92, cellW * 0.012);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = th.muted;
        ctx.font = `700 ${Math.round(cellW * 0.036)}px ${FONT}`;
        ctx.fillText('未出图', x + cellW / 2, y + cellH * 0.42);
        ctx.font = `400 ${Math.round(cellW * 0.024)}px ${FONT}`;
        const hint = ns.scene ? '渲染失败 · 可重开一次' : '先「🎬 一键搭景」或 AI 出图后回填这一格';
        ctx.fillText(hint, x + cellW / 2, y + cellH * 0.56);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.restore();
      }
      /* 镜框 */
      ctx.strokeStyle = th.line; ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, cellW - 1, rowH - 1, Math.round(cellW * 0.012));
      ctx.stroke();
      /* 镜号角标（字幕带关了也要能认出顺序） */
      if (opt.meta === false) {
        ctx.fillStyle = ACCENT[hashKey(ns.sceneKey || ns.idx) % ACCENT.length];
        roundRect(ctx, x + cellW * 0.02, y + cellH * 0.02, cellW * 0.075, cellH * 0.11, cellW * 0.014); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
        ctx.font = `800 ${Math.round(cellW * 0.042)}px ${FONT}`;
        ctx.fillText(pad2(ns.idx), x + cellW * 0.0575, y + cellH * 0.075);
        ctx.textBaseline = 'alphabetic';
      }
      if (capH) drawCaption(ctx, ns, x, y + cellH, cellW, capH, th);
    });

    /* 页脚 */
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${Math.round(cellW * 0.022)}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${VERSION_TEXT} · ${stamp}`, pad, pageH - footH * 0.5);
    ctx.textAlign = 'right';
    ctx.fillText(pages.length > 1 ? `${pad2(page[0].ns.idx)}–${pad2(page[page.length - 1].ns.idx)} 镜` : '全片连续镜头', pageW - pad, pageH - footH * 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    out.push(cv);
  });
  return out;
}

/* ---------------- 七、生图提示词包 ---------------- */
function sceneCast(ns) {
  const objs = (ns.scene && ns.scene.objects) || [];
  const names = [];
  objs.forEach(o => { if (o && o.type === 'actor' && !o.hidden) names.push(o.name || '人物'); });
  const props = objs.filter(o => o && o.type === 'prop' && o.shape !== 'wall' && !o.hidden).length;
  const walls = objs.filter(o => o && o.shape === 'wall').length;
  return { cast: names, props, walls };
}
/** 单格生图提示词：一条对应一个格子，粘给即梦 / 豆包 / ComfyUI */
export function imagePromptOf(ns, ctx = {}) {
  const size = sizeByKey[ns.sizeKey] || sizeByKey.MS;
  const angle = angleByKey[ns.angleKey] || angleByKey.eye;
  const move = moveByKey[ns.moveKey] || moveByKey.static;
  const { cast, props, walls } = sceneCast(ns);
  const L = [];
  L.push(`【镜 ${pad2(ns.idx)}】${ns.sizeName} · ${ns.angleName} · ${ns.moveName} · ${ns.duration.toFixed(1)} 秒`);
  L.push(`画幅：${ctx.aspect || '16:9'}，单格交付，不要在图里写字、不要宫格、不要边框拼贴。`);
  /* H3 / 时间码分镜导进来的镜头，原文就是最准的那句话（含 @x.y 命中点与镜头规格），
     照抄别改写；只有没有原文时才按字段现拼。 */
  const src = String(ns.prompt || '').trim();
  if (src.length > 30) {
    L.push('原文（照抄，别改写）：' + src.replace(/\s+/g, ' ').slice(0, 700));
  } else {
    L.push(`画面：${ns.desc || ns.title || '（这一镜的画面描述）'}`);
    L.push(`镜头：${size.prompt}；${angle.prompt}；${(move.prompt || ns.moveName)}`);
  }
  if (cast.length) L.push(`人物：${cast.slice(0, 6).join('、')}（同一部片里长相/服装/发型不许变）。`);
  if (ns.scene) L.push(`空间：${walls ? walls + ' 面墙' : '开放式'}、${props} 件道具，同场次${ns.sceneKey ? '「' + ns.sceneKey + '」' : ''}前后镜共用同一套空间。`);
  if (ns.dialogue) L.push(`台词：${ns.dialogue}（口型与台词对得上，嘴里不要有多余的字）。`);
  if (ctx.style) L.push(`风格：${ctx.style}`);
  if (ctx.negative) L.push(`负向：${ctx.negative}`);
  return L.join('\n');
}
export function promptPack(list, ctx = {}) {
  const head = [
    `# ${ctx.title || '故事板'} · 生图提示词包`,
    `# 共 ${list.length} 镜 · 版式 ${ctx.layout || '自动'} · 画幅 ${ctx.aspect || '16:9'}`,
    `# 用法：一条一条生成（一条＝一个格子），生成完在导演台故事板/分镜板点「🖼 逐格回填」把图塞回对应镜号，再一键拼宫格。`,
    `# 一致性：同场次的镜头请连人物描述一起复用；不要一次让模型画整张宫格（格子整体比例对不上、字一定会崩）。`,
    '',
  ].join('\n');
  return head + list.map((ns, i) => {
    const p = ctx.pages && ctx.pages[i];
    const pos = p ? `（第 ${p.page + 1} 页 · 第 ${p.cell + 1} 格）` : '';
    return `===== 镜 ${pad2(ns.idx)} ${pos} =====\n${imagePromptOf(ns, ctx)}\n`;
  }).join('\n');
}

/* ---------------- 八、弹窗（分镜板与故事板共用） ---------------- */
export function openGridModal(cfg = {}) {
  const raw = cfg.shots || [];
  if (!raw.length) { toast('一条镜头都没有，先拆镜或加镜', 'warn'); return null; }
  const list = raw.map((s, i) => normShot(s, i));
  const state = {
    preset: list.length <= 2 ? '1x2' : list.length <= 4 ? '2x2' : list.length <= 6 ? '3x2' : list.length <= 9 ? '3x3' : 'auto',
    quality: 'md',
    mode: 'auto',
    meta: true, arrows: true, title: true, dark: false,
  };
  const body = `
    <div class="bdm-grid">
      <div class="bdm-grid-side">
        <p class="dim" style="margin-top:0">${list.filter(x => x.scene).length}/${list.length} 镜有 3D 场景能自动出图，其余回落成占位格或走「🧾 提示词包」让 AI 逐格画。</p>
        <label class="bdm-grid-row"><span>版式</span>
          <select data-k="preset">${PRESETS.map(p => `<option value="${p.key}" ${p.key === state.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
        <label class="bdm-grid-row"><span>每格画质</span>
          <select data-k="quality">${QUALITY.map(q => `<option value="${q.key}" ${q.key === state.quality ? 'selected' : ''}>${q.name}</option>`).join('')}</select></label>
        <label class="bdm-grid-row"><span>格子内容</span>
          <select data-k="mode">
            <option value="auto">自动：手绘稿 → 3D 场景 → 参考图</option>
            <option value="scene">只用 3D 场景（重渲一遍）</option>
            <option value="image">已有图优先（AI 出图 / 参考图）</option>
          </select></label>
        <div class="bdm-grid-cks">
          <label><input type="checkbox" data-k="meta" checked> 字幕带（镜号/景别/运镜/时长/台词）</label>
          <label><input type="checkbox" data-k="arrows" checked> 运镜箭头（推/拉/移/摇/绕）</label>
          <label><input type="checkbox" data-k="title" checked> 页头片名 + 页码</label>
          <label><input type="checkbox" data-k="dark"> 深色底</label>
        </div>
        <div class="bdm-grid-btns">
          <button class="btn btn-primary" data-act="build">🎨 生成宫格</button>
          <button class="btn btn-ghost" data-act="pack">🧾 生图提示词包</button>
          <button class="btn btn-ghost" data-act="fill">🖼 逐格回填</button>
          <button class="btn btn-ghost" data-act="dl" disabled>📥 下载 PNG</button>
        </div>
        <div class="bdm-grid-prog" hidden><i></i><span></span></div>
      </div>
      <div class="bdm-grid-view">
        <div class="bdm-grid-empty">左边点「🎨 生成宫格」<br><small>同一场次会尽量排在同一页</small></div>
      </div>
    </div>`;
  const m = modal({ title: `🎛 宫格故事板 · ${esc(cfg.title || '')}`, body, wide: true, onClose: cfg.onClose || null });
  const B = m.body;
  const view = B.querySelector('.bdm-grid-view');
  const prog = B.querySelector('.bdm-grid-prog');
  const bar = B.querySelector('.bdm-grid-prog i');
  const ptxt = B.querySelector('.bdm-grid-prog span');
  const dlBtn = B.querySelector('[data-act="dl"]');
  B.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { state[s.dataset.k] = s.value; });
  B.querySelectorAll('input[data-k]').forEach(c => c.onchange = () => { state[c.dataset.k] = !!c.checked; });
  let canvases = [], cells = [];

  const optOf = () => {
    const plan = planGrid(list.length, state.preset);
    const q = QUALITY.find(x => x.key === state.quality) || QUALITY[1];
    const [aw, ah] = aspectWH(cfg.aspect);
    return {
      aspect: cfg.aspect || '16:9', cols: plan.cols, rows: plan.rows, per: plan.per,
      cellW: q.cellW, meta: state.meta, arrows: state.arrows, dark: state.dark,
      title: state.title ? (cfg.title || '故事板') : '', aw, ah,
    };
  };

  async function build() {
    const opt = optOf();
    dlBtn.disabled = true;
    prog.hidden = false;
    ptxt.textContent = '逐格出图…';
    cells = await renderStills(list, { ...opt, mode: state.mode, dark: state.dark },
      (d, total, ns) => { bar.style.width = Math.round(d / total * 70) + '%'; ptxt.textContent = `第 ${d}/${total} 镜 · ${ns.title || ns.desc || ''}`.slice(0, 26); });
    ptxt.textContent = '拼图…';
    await sleep(0);
    try { canvases = await composePages(cells, opt); }
    catch (e) { toast('拼图失败：' + (e && e.message || e), 'warn'); prog.hidden = true; return; }
    bar.style.width = '100%';
    ptxt.textContent = `${canvases.length} 页 · ${canvases[0].width}×${canvases[0].height}`;
    setTimeout(() => { prog.hidden = true; }, 700);
    view.innerHTML = '';
    const miss = cells.filter(c => c.from === 'none').length;
    if (miss) view.appendChild(el2(`<div class="bdm-grid-warn">还有 ${miss} 格没有画面：可以点「🎬 一键搭景」让 3D 出图，或点「🧾 生图提示词包」把这几格丢给 AI，再「🖼 逐格回填」。</div>`));
    canvases.forEach((cv, i) => {
      const img = document.createElement('img');
      img.src = cv.toDataURL('image/png');
      img.alt = `第 ${i + 1} 页`;
      view.appendChild(img);
    });
    dlBtn.disabled = !canvases.length;
  }

  function el2(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  B.querySelector('[data-act="build"]').onclick = () => build();
  B.querySelector('[data-act="dl"]').onclick = async () => {
    const base = (cfg.title || '故事板').replace(/[\\/:*?"<>|]/g, '_').slice(0, 28);
    for (let i = 0; i < canvases.length; i++) {
      const blob = await new Promise(res => canvases[i].toBlob(res, 'image/png'));
      if (blob) dlBlob(blob, `${base}-宫格${canvases.length > 1 ? `-${i + 1}of${canvases.length}` : ''}.png`);
      await sleep(320);
    }
    toast(`已下载 ${canvases.length} 页宫格图 📥`, 'ok');
  };
  B.querySelector('[data-act="pack"]').onclick = () => openPackModal(cfg, list, cells, { ...optOf(), preset: state.preset });
  B.querySelector('[data-act="fill"]').onclick = () => openFillModal(cfg, list, () => {
    artCache.clear();          // 回填后要重读，不然还是拿旧图
    if (state.mode === 'scene') { state.mode = 'auto'; const sel = B.querySelector('select[data-k="mode"]'); if (sel) sel.value = 'auto'; }
    build();
  });
  return m;
}

/* 生图提示词包 */
function openPackModal(cfg, list, cells, opt) {
  const plan = planGrid(list.length, opt.preset || 'auto');
  const ctx = {
    title: cfg.title || '故事板', aspect: cfg.aspect || '16:9',
    style: '电影感实景、自然光、真实皮肤纹理、浅景深、色调统一',
    negative: '文字、字幕、水印、logo、多余手指、畸形手、塑料脸、拼贴多格、黑边',
  };
  const body = `
    <p class="dim" style="margin-top:0">一条提示词＝一个格子。逐张生成再「🖼 逐格回填」拼成宫格，比让 AI 一次画整张宫格稳得多（格子整体比例模型对不上，格里的字必崩）。</p>
    <div class="bdm-grid-row"><span>风格锁</span><input class="input" data-k="style" value="${esc(ctx.style)}"></div>
    <div class="bdm-grid-row"><span>负向锁</span><input class="input" data-k="negative" value="${esc(ctx.negative)}"></div>
    <textarea class="input bdm-pack" rows="16" spellcheck="false"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-act="copy">📋 复制全部</button>
      <button class="btn btn-ghost" data-act="dl">⬇ 下载 .txt</button>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-act="ok">关掉</button>
    </div>`;
  const m = modal({ title: '🧾 生图提示词包', body, wide: true });
  const ta = m.body.querySelector('textarea');
  const refresh = () => {
    ctx.style = m.body.querySelector('[data-k="style"]').value.trim();
    ctx.negative = m.body.querySelector('[data-k="negative"]').value.trim();
    const pages = packPages(cells.map(c => ({ ns: c.ns })), plan.per).map((pg, pi) => pg.map((it, ci) => ({ ...it, page: pi, cell: ci }))).flat();
    ta.value = promptPack(list, { ...ctx, layout: `${plan.cols}×${plan.rows}`, pages });
  };
  m.body.querySelector('[data-k="style"]').oninput = refresh;
  m.body.querySelector('[data-k="negative"]').oninput = refresh;
  refresh();
  m.body.querySelector('[data-act="copy"]').onclick = () => copyText(ta.value).then(ok => toast(ok ? '提示词包已复制' : '复制失败，用下载也行', ok ? 'ok' : 'warn'));
  m.body.querySelector('[data-act="dl"]').onclick = () => {
    const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
    dlBlob(blob, `${(cfg.title || '故事板').replace(/[\\/:*?"<>|]/g, '_').slice(0, 24)}-生图提示词包.txt`);
    toast('提示词包已下载 ⬇', 'ok');
  };
  m.body.querySelector('[data-act="ok"]').onclick = () => m.close(false);
  return m;
}

/* 逐格回填：AI 出图 / 手绘导出后，一张张塞回对应镜号 */
function openFillModal(cfg, list, onDone) {
  if (typeof cfg.onCellArt !== 'function') { toast('这个入口暂时不能回填图片', 'warn'); return null; }
  const body = `
    <p class="dim" style="margin-top:0">按镜号点格子选图（支持 png/jpg）。回填后会自动重拼一次宫格；故事板里的手绘层会叠在这张图上，不用重画构图箭头。</p>
    <div class="bdm-fill-grid">${list.map((ns, i) => `
      <button class="bdm-fill-cell" data-i="${i}">
        <b>${pad2(ns.idx)}</b><small>${esc((ns.title || ns.desc || '').slice(0, 12))}</small>
        <span>${esc(ns.sizeName)} · ${esc(ns.moveName)}</span>
      </button>`).join('')}</div>
    <input type="file" accept="image/*" id="bdmFillFile" hidden>
    <div class="modal-actions"><div class="spacer"></div><button class="btn btn-primary" data-act="ok">完成</button></div>`;
  const m = modal({ title: '🖼 逐格回填', body, wide: true });
  const file = m.body.querySelector('#bdmFillFile');
  let target = 0;
  m.body.querySelectorAll('.bdm-fill-cell').forEach(b => b.onclick = () => {
    target = +b.dataset.i;
    file.value = '';
    file.click();
  });
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const url = await compressToDataURL(f, 1280);
    if (!url) { toast('这张图读不出来，换一张试试', 'warn'); return; }
    const btn = m.body.querySelector(`.bdm-fill-cell[data-i="${target}"]`);
    if (btn) { btn.style.backgroundImage = `url(${url})`; btn.classList.add('has'); }
    /* 消费方负责落库，两边都写「手绘/格子稿」这一槽：分镜板 = sketch（IndexedDB key），
       故事板 = shot.sketch（dataURL 直接进画布存档）。返回的 ref 只用来当场重拼时不拿旧图。 */
    const ret = await cfg.onCellArt(target, url);
    const ref = ret && (ret.ref || ret);
    if (typeof ref === 'string') list[target].sketchRef = ref;
    /* 落库的成功提示交给消费方（store._notify），这里不再叠一条 */
  };
  m.body.querySelector('[data-act="ok"]').onclick = () => { m.close(false); if (onDone) onDone(); };
  return m;
}

async function compressToDataURL(file, maxSide) {
  const url = await blobToDataURL(file);
  if (!url) return null;
  const im = await loadImg(url);
  if (!im) return null;
  const sc = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(im.naturalWidth * sc); cv.height = Math.round(im.naturalHeight * sc);
  cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.88);
}

/* ---------------- 九、暴露 ---------------- */
/* 故事板（classic 脚本）没有 ESM，选项表也走 window 拿 */
const OPTS = {
  sizes: SHOT_SIZES.map(s => ({ key: s.key, name: s.name })),
  angles: ANGLES.map(a => ({ key: a.key, name: a.name })),
  moves: CAMERA_MOVES.map(m => ({ key: m.key, name: m.name })),
};
const nameOf = (arr, key, dft) => (arr.find(x => x.key === key) || {}).name || dft;

window.MNGRID = {
  normShot, planGrid, packPages, renderStills, composePages,
  openGridModal, imagePromptOf, promptPack, compressToDataURL,
  dataURLToBlob, blobToDataURL,
  PRESETS, QUALITY, OPTS,
  sizeName: k => nameOf(OPTS.sizes, k, '中景'),
  angleName: k => nameOf(OPTS.angles, k, '平视'),
  moveName: k => nameOf(OPTS.moves, k, '固定镜头'),
};
