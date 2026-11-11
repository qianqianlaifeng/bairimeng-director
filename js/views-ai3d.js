/* ============================================================
 * AI 3D 预演 · 一句话生成白模预演台
 * ------------------------------------------------------------
 * 视频里那一套：一句话 → 白膜场景 → 人物走位 / 运镜 → 播放预演
 *              → 每次生成写入独立 Take，反复比较
 * 纯本地规则，不联网、不配接口也能跑；复用 cameraSim 白模渲染引擎。
 * ============================================================ */
import { esc, toast, modal, confirmDlg, askText, copyText } from './ui.js';
import { WhiteModelRenderer, pathPosAt } from './cameraSim.js';

let store;
export function initViewsAi3d(s) { store = s; }

const LS = 'bdm_ai3d_v1';
const uid = () => 'tk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t * t * (3 - 2 * t);
const clone = o => JSON.parse(JSON.stringify(o));
const EXAMPLE = '深夜便利店，冷白灯。男主推门进来，从门口走到冰柜前停下，摄影机在背后低机位缓慢跟随，时长 8 秒。';

/* ---------- 选项字典 ---------- */
const FOLLOW = {
  behind: { name: '背后跟拍', az: 180, follow: true },
  front: { name: '正面跟拍', az: 0, follow: true },
  side: { name: '侧面跟拍', az: 90, follow: true },
  fixed: { name: '固定机位', az: 0, follow: false },
};
const MODS = {
  none: '不叠加', pushIn: '缓推', pullOut: '拉远', orbit: '环绕',
  craneUp: '升起', craneDown: '下降', track: '横移', handheld: '手持',
};
const SIZES = { ELS: '大远景', LS: '远景', MS: '中景', MCU: '中近景', CU: '近景', ECU: '特写' };
const SIZE_DIST = { ELS: 11, LS: 8, MS: 5.3, MCU: 3.8, CU: 2.6, ECU: 1.7 };
const ANGLES = { eye: '平视', low: '低机位', high: '高机位', bird: '鸟瞰' };
const WALK_PRESETS = [
  { key: 'straight', name: '直线走向', icon: '➡' },
  { key: 'back', name: '后退', icon: '⬅' },
  { key: 'around', name: '绕走一圈', icon: '🔄' },
  { key: 'zigzag', name: '折线绕行', icon: '⤴' },
  { key: 'stand', name: '原地站定', icon: '🧍' },
];
const RES = ['1280x720', '1920x1080', '1080x1920', '1080x1080', '2560x1440'];

function options(dict, val) {
  return Object.entries(dict).map(([k, v]) =>
    `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(typeof v === 'string' ? v : v.name)}</option>`).join('');
}

/* ============================================================
 * 一句话 → 白模场景（纯本地规则）
 * ============================================================ */
const SCENE_TPL = [
  {
    key: 'store', name: '便利店', re: /便利店|超市|小卖部|货架|冰柜|收银|柜台|商店/, floor: '#e8ecef',
    props: () => [
      { shape: 'box', name: '冰柜', x: 2.3, z: -1.8, w: 1.6, d: 0.7, h: 1.9, rot: 0 },
      { shape: 'box', name: '货架', x: -2.4, z: -1.5, w: 1.5, d: 0.55, h: 1.7, rot: 0 },
      { shape: 'box', name: '货架', x: -2.4, z: 0.4, w: 1.5, d: 0.55, h: 1.7, rot: 0 },
      { shape: 'table', name: '柜台', x: 0.4, z: 1.9, w: 2.2, d: 0.7, h: 0.95, rot: 0 },
      { shape: 'window', name: '玻璃门', x: -3.6, z: 2.9, w: 1.6, d: 0.2, h: 2.2, rot: 0 },
    ],
  },
  {
    key: 'classroom', name: '教室', re: /教室|课堂|学校|课桌|黑板|讲台/, floor: '#e6e9ea',
    props: () => {
      const a = [{ shape: 'box', name: '黑板', x: 0, z: -2.9, w: 4.6, d: 0.15, h: 1.4, rot: 0 }];
      for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++)
        a.push({ shape: 'table', name: '课桌', x: c * 1.8, z: r * 1.7 - 0.6, w: 1.1, d: 0.6, h: 0.72, rot: 0 });
      return a;
    },
  },
  {
    key: 'living', name: '客厅', re: /客厅|沙发|家里|家中|房间|屋子/, floor: '#eae6df',
    props: () => [
      { shape: 'sofa', name: '沙发', x: 0, z: -1.8, w: 2.2, d: 0.9, h: 0.8, rot: 0 },
      { shape: 'table', name: '茶几', x: 0, z: -0.2, w: 1.3, d: 0.7, h: 0.45, rot: 0 },
      { shape: 'box', name: '电视柜', x: 0, z: 2.4, w: 2.4, d: 0.45, h: 0.6, rot: 0 },
      { shape: 'window', name: '窗', x: 3.4, z: 0, w: 1.8, d: 0.15, h: 1.6, rot: 90 },
    ],
  },
  {
    key: 'office', name: '办公室', re: /办公室|工位|写字楼|会议|电脑/, floor: '#e7eaee',
    props: () => [
      { shape: 'table', name: '办公桌', x: -1.6, z: -0.8, w: 1.6, d: 0.8, h: 0.75, rot: 0 },
      { shape: 'table', name: '办公桌', x: 1.6, z: -0.8, w: 1.6, d: 0.8, h: 0.75, rot: 0 },
      { shape: 'box', name: '文件柜', x: 3.1, z: 1.6, w: 0.9, d: 0.5, h: 1.8, rot: 0 },
      { shape: 'window', name: '落地窗', x: 0, z: -2.9, w: 4, d: 0.15, h: 2, rot: 0 },
    ],
  },
  {
    key: 'bedroom', name: '卧室', re: /卧室|床上|床头|睡觉|醒来/, floor: '#eae5e0',
    props: () => [
      { shape: 'box', name: '床', x: 1.4, z: -1.2, w: 2, d: 1.8, h: 0.5, rot: 0 },
      { shape: 'box', name: '床头柜', x: -0.2, z: -1.5, w: 0.5, d: 0.5, h: 0.6, rot: 0 },
      { shape: 'window', name: '窗', x: -3.4, z: 0, w: 1.6, d: 0.15, h: 1.6, rot: 90 },
    ],
  },
  {
    key: 'street', name: '街道', re: /街|巷|马路|路上|户外|广场|公园|路口/, floor: '#dfe3e2', outdoor: true,
    props: () => [
      { shape: 'box', name: '建筑', x: -3.6, z: -1, w: 1.8, d: 3.4, h: 3, rot: 0 },
      { shape: 'box', name: '建筑', x: 3.6, z: -1, w: 1.8, d: 3.4, h: 3, rot: 0 },
      { shape: 'lamp', name: '路灯', x: -2.4, z: 1.8, w: 0.2, d: 0.2, h: 3.2, rot: 0 },
      { shape: 'tree', name: '行道树', x: 2.6, z: 1.6, w: 1, d: 1, h: 2.8, rot: 0 },
    ],
  },
  {
    key: 'corridor', name: '走廊', re: /走廊|过道|通道|玄关|楼梯|电梯/, floor: '#e4e7ea',
    props: () => [
      { shape: 'pillar', name: '柱', x: -2, z: -1.2, w: 0.5, d: 0.5, h: 2.8, rot: 0 },
      { shape: 'pillar', name: '柱', x: 2, z: -1.2, w: 0.5, d: 0.5, h: 2.8, rot: 0 },
      { shape: 'door', name: '门', x: 0, z: -2.9, w: 1.3, d: 0.2, h: 2.2, rot: 0 },
    ],
  },
  {
    key: 'room', name: '室内空景', re: /.*/, floor: '#e9ebee',
    props: () => [
      { shape: 'table', name: '长桌', x: 0, z: -1.2, w: 2.4, d: 0.9, h: 0.75, rot: 0 },
      { shape: 'box', name: '矮柜', x: -2.8, z: 1.4, w: 1.2, d: 0.5, h: 0.9, rot: 0 },
      { shape: 'window', name: '窗', x: 0, z: -2.9, w: 2.4, d: 0.15, h: 1.8, rot: 0 },
    ],
  },
];

const NAME_RE = /(男主|女主|男孩|女孩|男生|女生|小林|小王|老人|少年|少女|店员|老师|学生|警察|医生|他|她)/g;
const COLORS = ['#e6b268', '#9b8ae0', '#6ab5a5', '#e08a8a'];

function namesOf(text) {
  const found = [];
  let m;
  NAME_RE.lastIndex = 0;
  while ((m = NAME_RE.exec(text)) && found.length < 3) if (!found.includes(m[1])) found.push(m[1]);
  const count = /三人|三个人|仨人/.test(text) ? 3 : /两人|二人|两个人|俩人|对话|和|与/.test(text) ? 2 : 1;
  const out = found.slice(0, count);
  while (out.length < count) out.push('演员 ' + String.fromCharCode(65 + out.length));
  return out;
}

function pathFor(text, i, base) {
  const s = base;
  if (/站定|原地|不动|静止|站着不动/.test(text)) return [];
  if (/绕一圈|环绕|转一圈|绕着走/.test(text)) {
    return [
      { x: s.x - 1.2, z: s.z }, { x: s.x - 0.6, z: s.z - 1.2 },
      { x: s.x + 0.8, z: s.z - 1.1 }, { x: s.x + 1.3, z: s.z + 0.4 },
      { x: s.x - 0.2, z: s.z + 1.1 }, { x: s.x - 1.2, z: s.z },
    ];
  }
  if (/后退|倒退|往后退/.test(text)) {
    return [{ x: s.x + 1.8, z: s.z + 1.2 }, { x: s.x + 0.8, z: s.z + 0.5 }, { x: s.x - 1.4, z: s.z - 0.6 }];
  }
  if (/折线|绕开|绕过|拐/.test(text)) {
    return [{ x: s.x - 2.4, z: s.z + 1.6 }, { x: s.x - 1.2, z: s.z - 0.4 }, { x: s.x + 0.4, z: s.z + 0.8 }, { x: s.x + 2.2, z: s.z - 1.2 }];
  }
  /* 默认：从门口 / 画面一侧走向目标（窗前、冰柜、桌前…） */
  return [
    { x: clamp(s.x - 2.6, -4.2, 3), z: clamp(s.z + 1.8, -2.4, 3) },
    { x: clamp(s.x - 1.2, -4.2, 3), z: clamp(s.z + 0.7, -2.4, 3) },
    { x: s.x, z: s.z },
  ];
}

function buildFromText(text, prevCfg) {
  const tpl = SCENE_TPL.find(t => t.re.test(text)) || SCENE_TPL[SCENE_TPL.length - 1];
  const names = namesOf(text);
  const sec = (text.match(/(\d+(?:\.\d+)?)\s*秒/) || [])[1];
  const duration = clamp(sec ? +sec : 8, 2, 30);

  const objects = [];
  const W = 4, D = 3.2;
  if (!tpl.outdoor) {
    /* 四面墙，前方留空（cutaway 会剖掉挡镜头的那面） */
    objects.push({ type: 'prop', shape: 'wall', x: 0, z: -D, rot: 0, w: W * 2, h: 2.8, name: '后墙' });
    objects.push({ type: 'prop', shape: 'wall', x: -W, z: 0, rot: -90, w: D * 2, h: 2.8, name: '左墙' });
    objects.push({ type: 'prop', shape: 'wall', x: W, z: 0, rot: -90, w: D * 2, h: 2.8, name: '右墙' });
    objects.push({ type: 'prop', shape: 'wall', x: 0, z: D, rot: 0, w: W * 2, h: 2.8, name: '前墙' });
  }
  tpl.props().forEach((p, i) => objects.push({
    type: 'prop', id: 'p' + i, shape: p.shape, name: p.name,
    x: p.x, z: p.z, rot: p.rot || 0, scale: Math.max(0.4, Math.min(2.4, (p.w || 1) / 1.3)),
    w: p.w, d: p.d, h: p.h,
  }));

  const actors = [];
  names.forEach((nm, i) => {
    const base = { x: i === 0 ? 0.6 : -1.6 + i * 0.8, z: i === 0 ? -0.4 : -1.4 };
    const path = i === 0 ? pathFor(text, i, base) : [];
    actors.push({
      type: 'actor', id: 'a' + i, name: nm, color: COLORS[i % COLORS.length],
      x: base.x, z: base.z, rot: 0, scale: 1,
      action: path.length >= 2 ? 'walk' : 'stand',
      path, speed: 1.2 * duration, sitH: 0,
    });
  });
  objects.push(...actors);

  const scene = {
    base: 'plain', floor: tpl.floor, objects,
    light: { az: /夜|深夜|晚上|暗/.test(text) ? 320 : 300, el: /夜|暗|低光/.test(text) ? 38 : 53, int: 1 },
    cam: { az: 180, dist: SIZE_DIST.MS, h: 1.65, fov: 42, tx: 0, ty: 1.45, tz: 0 },
    cams: [], center: { x: 0, z: 0 }, cutaway: true,
  };

  /* 从文字里推断机位 / 运镜 */
  let follow = 'behind', mod = 'none', size = 'MS', angle = 'eye', camH = 1.65;
  if (/正面|迎面|面对面/.test(text)) follow = 'front';
  if (/侧面|侧拍|侧跟/.test(text)) follow = 'side';
  if (/固定机位|定机位|不动的镜头|固定镜头/.test(text)) follow = 'fixed';
  if (/缓推|推近|推进|慢慢推/.test(text)) mod = 'pushIn';
  if (/拉远|后退镜头|拉开/.test(text)) mod = 'pullOut';
  if (/环绕|绕拍|转一圈拍/.test(text)) mod = 'orbit';
  if (/升起|上升镜头|抬高/.test(text)) mod = 'craneUp';
  if (/下降镜头|压低/.test(text)) mod = 'craneDown';
  if (/横移|平移镜头/.test(text)) mod = 'track';
  if (/手持|晃动|纪录片感/.test(text)) mod = 'handheld';
  if (/特写|大特写/.test(text)) size = 'CU';
  if (/近景/.test(text)) size = 'MCU';
  if (/远景|全景/.test(text)) size = 'LS';
  if (/大远景/.test(text)) size = 'ELS';
  if (/低机位|贴地|仰拍/.test(text)) { angle = 'low'; camH = 0.65; }
  if (/高机位|俯拍|鸟瞰/.test(text)) { angle = 'high'; camH = 3.4; }
  if (/鸟瞰|顶拍/.test(text)) { angle = 'bird'; camH = 6; }

  const cfg = {
    ...defaultCfg(prevCfg), text, tplName: tpl.name,
    duration, follow, mod, size, angle,
    camH, aimY: 1.45, fov: 42, dist: SIZE_DIST[size],
    walkSpeed: 1.2, showPaths: true, actorId: 'a0',
  };
  syncSpeeds(scene, cfg);
  return { scene, cfg, actors, tpl, names };
}

function defaultCfg(prev = {}) {
  return {
    text: EXAMPLE, tplName: '便利店', duration: 8,
    follow: 'behind', mod: 'none', size: 'MS', angle: 'eye',
    camH: 1.65, aimY: 1.45, fov: 42, dist: SIZE_DIST.MS,
    walkSpeed: 1.2, showPaths: true, actorId: 'a0',
    aspect: prev.aspect || '16:9', resolution: prev.resolution || '1920x1080',
    rate: prev.rate || 1, loop: prev.loop !== false,
  };
}
function syncSpeeds(scene, cfg) {
  scene.objects.forEach(o => { if (o.type === 'actor') o.speed = Math.max(0.2, cfg.walkSpeed * cfg.duration); });
}

/* ============================================================
 * Take 存档（localStorage，按项目隔离）
 * ============================================================ */
function dbAll() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
function dbWrite(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { console.warn('[AI3D] 存档失败', e); } }
function pid() { return store?.active?.id || '_guest'; }
function db() { const d = dbAll(); if (!d[pid()]) d[pid()] = { takes: [], activeId: null }; return d; }
function persist(curId, curObj) {
  const d = db(); const box = d[pid()];
  /* cur 是内存里的活动对象，db() 每次都会重新解析 localStorage。
     必须把 cur 覆盖回数组，否则走位/机位的改动刷新后就丢了。 */
  if (curObj) {
    const i = box.takes.findIndex(t => t.id === curObj.id);
    if (i >= 0) box.takes[i] = curObj;
  }
  box.activeId = curId || (curObj && curObj.id) || box.activeId;
  dbWrite(d);
}
function findTake(id) { return db()[pid()].takes.find(t => t.id === id) || null; }

/* ============================================================
 * 摄影机：每帧按人物动线重新算机位（真·跟拍）
 * ============================================================ */
function actorOf(tk) {
  const list = tk.scene.objects.filter(o => o.type === 'actor');
  return list.find(a => a.id === tk.cfg.actorId) || list[0] || { x: 0, z: 0, rot: 0 };
}
function actorPos(a, t) {
  if (a.path && a.path.length >= 2) {
    const p = pathPosAt({ path: a.path, speed: a.speed || 1.2, rot: a.rot || 0 }, clamp(t, 0, 1));
    return { x: p.x, z: p.z, yaw: p.yaw || 0 };
  }
  return { x: a.x, z: a.z, yaw: a.rot || 0 };
}
/* 从四面墙的位置反推室内可用范围；室外（无墙）返回 null */
function sceneBounds(tk) {
  const walls = (tk.scene.objects || []).filter(o => o.shape === 'wall');
  if (walls.length < 3) return null;
  const xs = [], zs = [];
  walls.forEach(w => {
    const r = Math.abs((+w.rot || 0) % 180);
    if (r < 45 || r > 135) zs.push(+w.z || 0); else xs.push(+w.x || 0);
  });
  if (!xs.length || !zs.length) return null;
  return {
    xmin: Math.min(...xs) + 0.55, xmax: Math.max(...xs) - 0.55,
    zmin: Math.min(...zs) + 0.55, zmax: Math.max(...zs) - 0.55,
  };
}

function camAt(tk, t) {
  const c = tk.cfg, a = actorOf(tk);
  const pos = actorPos(a, t), start = actorPos(a, 0);
  const f = FOLLOW[c.follow] || FOLLOW.behind;
  const anchor = f.follow ? pos : start;
  const e = ease(clamp(t, 0, 1));
  let az = f.az + (f.follow ? pos.yaw : start.yaw);
  let dist = +c.dist || 5.3, h = +c.camH || 1.65, fov = +c.fov || 42;
  switch (c.mod) {
    case 'pushIn': dist *= 1 - 0.38 * e; break;
    case 'pullOut': dist *= 1 + 0.55 * e; break;
    case 'orbit': az += e * 110; break;
    case 'craneUp': h += e * 2.8; break;
    case 'craneDown': h = Math.max(0.4, h - e * 1.1); break;
    case 'track': az += (e - 0.5) * 34; break;
    case 'handheld': az += Math.sin(t * 27) * 1.6; h += Math.sin(t * 19) * 0.05; fov += Math.sin(t * 23) * 0.7; break;
  }
  /* 跟拍时人物会走到墙边，按固定 dist 摆机位会把相机甩到房间外，
     于是镜头里只剩墙背面 / 货架背面。这里把 dist 收窄到「相机不出室内」为止。 */
  if (f.follow) {
    const B = sceneBounds(tk);
    if (B) {
      const dx = Math.sin(az * Math.PI / 180), dz = Math.cos(az * Math.PI / 180);
      let maxD = dist;
      if (dx > 1e-4) maxD = Math.min(maxD, (B.xmax - anchor.x) / dx);
      else if (dx < -1e-4) maxD = Math.min(maxD, (B.xmin - anchor.x) / dx);
      if (dz > 1e-4) maxD = Math.min(maxD, (B.zmax - anchor.z) / dz);
      else if (dz < -1e-4) maxD = Math.min(maxD, (B.zmin - anchor.z) / dz);
      dist = Math.max(0.9, Math.min(dist, maxD - 0.25));
    }
  }
  return { az, dist: Math.max(0.9, dist), h: Math.max(0.3, h), fov: clamp(fov, 22, 88), tx: anchor.x, tz: anchor.z, ty: +c.aimY || 1.45 };
}

/* 每帧按「真实机位 → 人物」这条线剖墙。
   cameraSim 自带的 cutaway 假定相机围着世界原点转，而这里的机位是跟着人物走的
   （tx/tz 不为 0），照搬会把挡镜头的墙留下来，画面就只剩一块灰板。 */
function visibleScene(tk, tt) {
  const cam = camAt(tk, tt);
  const a = actorOf(tk), pos = actorPos(a, tt);
  const rad = Math.PI / 180;
  const cx = cam.tx + Math.sin(cam.az * rad) * cam.dist;
  const cz = cam.tz + Math.cos(cam.az * rad) * cam.dist;
  const side = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const cross = (ax, ay, bx, by, cx2, cy2, dx2, dy2) =>
    ((side(ax, ay, bx, by, cx2, cy2) > 0) !== (side(ax, ay, bx, by, dx2, dy2) > 0)) &&
    ((side(cx2, cy2, dx2, dy2, ax, ay) > 0) !== (side(cx2, cy2, dx2, dy2, bx, by) > 0));
  const vx = pos.x - cx, vz = pos.z - cz, len2 = vx * vx + vz * vz || 1;
  const objects = tk.scene.objects.filter(o => {
    if (o.type === 'actor') return true;
    if (o.shape === 'wall') {
      const half = Math.max(0.3, (+o.w || 3) / 2);
      const rr = (+o.rot || 0) * rad;
      const ux = Math.cos(rr), uz = -Math.sin(rr);
      return !cross(cx, cz, pos.x, pos.z,
        o.x - ux * half, o.z - uz * half, o.x + ux * half, o.z + uz * half);
    }
    /* 高道具（货架、冰柜、柱子）挡在镜头与人物之间时同样剖掉，
       矮家具（茶几、床）保留，免得场景被削成空地。 */
    const scale = Math.min(3, Math.max(0.3, +o.scale || 1));
    const height = (+o.h || 0.8) * scale;
    if (height < 1.0) return true;
    const k = clamp(((o.x - cx) * vx + (o.z - cz) * vz) / len2, 0, 1);
    const near = Math.hypot(o.x - (cx + k * vx), o.z - (cz + k * vz));
    const radius = Math.max(+o.w || 1, +o.d || 1) / 2 * scale + 0.2;
    return near > radius;
  });
  /* 主光跟着机位走，侧面/背面跟拍时人物才不会整块发黑；
     高度角与强度仍由文字描述决定（夜戏、低光氛围保留）。 */
  const light = { ...(tk.scene.light || {}), az: cam.az + 25 };
  return { ...tk.scene, cam, objects, light, cutaway: false };
}

/* ============================================================
 * 视图
 * ============================================================ */
export function renderAi3d(container, payload = {}) {
  const p = store.active;
  if (!p) { container.innerHTML = '<div class="empty-tip">先到「项目台」新建或打开一个项目</div>'; return; }

  let data = db()[pid()];
  if (!data.takes.length) {
    const g = buildFromText(EXAMPLE, { aspect: p.aspect || '16:9' });
    const tk = { id: uid(), name: 'Take 01', createdAt: Date.now(), scene: g.scene, cfg: g.cfg };
    data.takes.push(tk); data.activeId = tk.id;
    const all = db(); all[pid()] = data; dbWrite(all);
  }
  let cur = findTake(data.activeId) || data.takes[data.takes.length - 1];
  let compareId = null;
  let playing = false, t = 0, raf = null, paintRaf = null, lastNow = 0, scrubbing = false;
  let renderer = null, rendererB = null, resizeObs = null, promptDirty = false;
  let dragIdx = -1;
  const take = () => cur;

  /* ---------- HTML ---------- */
  container.innerHTML = `
    <div class="page-head">
      <h2>🧊 AI 3D 预演 <span class="dim">· 一句话搭白模、排走位、跑镜头，每版存一个 Take</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost btn-sm" id="a3Help">❓ 怎么用</button>
        <button class="btn btn-ghost btn-sm" id="a3SaveTake">＋ 另存 Take</button>
        <button class="btn btn-primary btn-sm" id="a3ToBoard">🎞 保存到分镜板</button>
      </div>
    </div>

    <div class="card a3-input-card">
      <div class="card-title">① 一句话写下导演想法 <span class="dim">· 不联网也能生成，配了接口也不受影响</span></div>
      <textarea id="a3Text" class="input a3-text" rows="2" placeholder="例：${esc(EXAMPLE)}">${esc(cur.cfg.text)}</textarea>
      <div class="a3-input-row">
        <button class="btn btn-primary" id="a3Gen">⚡ 生成预演</button>
        <button class="btn btn-ghost btn-sm" id="a3Demo">📝 填个示例</button>
        <span class="dim" id="a3GenTip">会自动生成场景、人物走位与机位，并写入一个新的 Take</span>
      </div>
    </div>

    <div class="a3-layout">
      <!-- 左：走位与摄影机控制 -->
      <aside class="a3-left">
        <div class="card a3-card">
          <div class="card-title">② 走位与摄影机控制</div>
          <div class="form-row"><label>选择演员</label><select id="a3Actor" class="input input-sm"></select></div>
          <div class="a3-map-head"><span>俯视走位图</span><span class="dim">点空白加点 · 拖点改线 · 双击删点</span></div>
          <canvas id="a3Map" class="a3-map"></canvas>
          <div class="a3-walk-btns" id="a3WalkBtns"></div>
          <div class="form-row"><label>步速 <span id="a3SpeedLab" class="dim">1.2 m/s</span></label>
            <input id="a3Walk" type="range" class="scrub" min="0.3" max="3" step="0.1" value="${cur.cfg.walkSpeed}"></div>
          <div class="form-row"><label>时长 <span id="a3DurLab" class="dim">${cur.cfg.duration}s</span></label>
            <input id="a3Dur" type="range" class="scrub" min="2" max="20" step="0.5" value="${cur.cfg.duration}"></div>
        </div>

        <div class="card a3-card">
          <div class="card-title">🎥 机位 / 运镜</div>
          <div class="form-row"><label>跟拍方式</label><select id="a3Follow" class="input input-sm">${options(FOLLOW, cur.cfg.follow)}</select></div>
          <div class="form-row"><label>叠加运镜</label><select id="a3Mod" class="input input-sm">${options(MODS, cur.cfg.mod)}</select></div>
          <div class="form-row"><label>景别</label><select id="a3Size" class="input input-sm">${options(SIZES, cur.cfg.size)}</select></div>
          <div class="form-row"><label>角度</label><select id="a3Angle" class="input input-sm">${options(ANGLES, cur.cfg.angle)}</select></div>
          <div class="form-row"><label>跟随距离 <span id="a3DistLab" class="dim">${cur.cfg.dist}m</span></label>
            <input id="a3Dist" type="range" class="scrub" min="1" max="14" step="0.1" value="${cur.cfg.dist}"></div>
          <div class="form-row"><label>机位高度 <span id="a3CamHLab" class="dim">${cur.cfg.camH}m</span></label>
            <input id="a3CamH" type="range" class="scrub" min="0.3" max="7" step="0.1" value="${cur.cfg.camH}"></div>
          <div class="form-row"><label>看向高度 <span id="a3AimLab" class="dim">${cur.cfg.aimY}m</span></label>
            <input id="a3Aim" type="range" class="scrub" min="0.15" max="2.2" step="0.05" value="${cur.cfg.aimY}"></div>
          <div class="form-row"><label>焦距 <span id="a3FovLab" class="dim">${cur.cfg.fov}°</span></label>
            <input id="a3Fov" type="range" class="scrub" min="22" max="88" step="1" value="${cur.cfg.fov}"></div>
          <label class="a3-check"><input type="checkbox" id="a3Paths" ${cur.cfg.showPaths ? 'checked' : ''}><span>显示人物走位线</span></label>
        </div>
      </aside>

      <!-- 中：3D 舞台 -->
      <section class="a3-main">
        <div class="card a3-stage-card">
          <div class="a3-stage-top">
            <span class="tag" id="a3TakeName">${esc(cur.name)}</span>
            <span class="dim" id="a3StageInfo"></span>
            <div class="spacer"></div>
            <span class="mono" id="a3Timecode">00:00.0</span>
          </div>
          <div class="a3-stage-wrap" id="a3StageWrap">
            <div class="a3-stage-box"><canvas id="a3Canvas"></canvas><div class="a3-stage-label" id="a3LabelA"></div></div>
            <div class="a3-stage-box a3-b-box" id="a3BBox" hidden><canvas id="a3CanvasB"></canvas><div class="a3-stage-label" id="a3LabelB"></div></div>
          </div>
          <div class="a3-controls">
            <button class="btn btn-primary btn-sm" id="a3Play">▶ 播放</button>
            <button class="btn btn-ghost btn-sm" id="a3Rewind">⏮ 开头</button>
            <input type="range" id="a3Scrub" class="scrub a3-scrub" min="0" max="1000" value="0">
            <span class="dim mono" id="a3Time">0.0s / ${(+cur.cfg.duration).toFixed(1)}s</span>
            <button class="btn btn-ghost btn-sm" id="a3Loop">🔁 循环 开</button>
            <select id="a3Rate" class="input input-sm a3-rate">
              <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
            </select>
          </div>
        </div>

        <div class="card a3-desc-card">
          <div class="card-title">③ 镜头描述 <span class="dim">· 可直接复制到即梦 / 可灵 / H3 当提示词</span></div>
          <textarea id="a3Prompt" class="input a3-prompt" rows="4"></textarea>
          <div class="a3-desc-row">
            <button class="btn btn-ghost btn-sm" id="a3Copy">📋 复制描述</button>
            <button class="btn btn-ghost btn-sm" id="a3Regen">🔄 重新生成</button>
            <button class="btn btn-ghost btn-sm" id="a3Png">📷 截图 PNG</button>
            <button class="btn btn-ghost btn-sm" id="a3Mp4">🎬 导出预演视频</button>
            <div class="spacer"></div>
            <select id="a3Aspect" class="input input-sm a3-sel"></select>
            <select id="a3Res" class="input input-sm a3-sel"></select>
          </div>
        </div>
      </section>

      <!-- 右：Take 版本 -->
      <aside class="a3-right">
        <div class="card a3-card a3-takes-card">
          <div class="card-title">🎞 Take 版本 <span class="dim" id="a3TakeCount"></span></div>
          <p class="dim a3-hint">每次「生成预演」都会写入独立 Take。改完不满意，载入旧版接着调；点「⬌ 对比」可同屏并排看两版。</p>
          <div id="a3TakeList" class="a3-take-list"></div>
          <button class="btn btn-ghost btn-sm a3-exit" id="a3ExitCmp" hidden>✕ 退出并排对比</button>
        </div>
      </aside>
    </div>`;

  const $ = id => container.querySelector('#' + id);
  const canvasA = $('a3Canvas'), canvasB = $('a3CanvasB'), mapCv = $('a3Map');
  const stageWrap = $('a3StageWrap');
  renderer = new WhiteModelRenderer(canvasA);
  rendererB = new WhiteModelRenderer(canvasB);

  /* ---------- 表单初始化 ---------- */
  $('a3Aspect').innerHTML = ['16:9', '21:9', '9:16', '1:1', '4:3'].map(a =>
    `<option value="${a}" ${a === cur.cfg.aspect ? 'selected' : ''}>${a}</option>`).join('');
  $('a3Res').innerHTML = RES.map(r =>
    `<option value="${r}" ${r === cur.cfg.resolution ? 'selected' : ''}>${r}</option>`).join('');
  $('a3Rate').value = String(cur.cfg.rate);
  $('a3Loop').textContent = cur.cfg.loop ? '🔁 循环 开' : '🔁 循环 关';
  $('a3WalkBtns').innerHTML = WALK_PRESETS.map(w =>
    `<button class="btn btn-ghost btn-xs" data-walk="${w.key}" title="${esc(w.name)}">${w.icon} ${esc(w.name)}</button>`).join('');

  /* ---------- 渲染 ---------- */
  function sizeCanvases() {
    try { renderer.resize(); rendererB.resize(); } catch (e) { /* 忽略布局未完成 */ }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = mapCv.getBoundingClientRect();
    if (r.width > 2) { mapCv.width = Math.round(r.width * dpr); mapCv.height = Math.round(r.height * dpr); }
  }
  function renderInto(rd, tk, tt) {
    if (!tk) return;
    const c = tk.cfg;
    const sc = visibleScene(tk, tt);
    const a = actorOf(tk), pos = actorPos(a, tt);
    rd.render({ type: 'free' }, clamp(tt, 0, 1), pos ? 'walk' : 'stand', {
      duration: c.duration, scene: sc,
      focus: [pos.x, +c.aimY || 1.45, pos.z], focusKind: 'person',
      angle: c.angle, size: c.size, moveSpeed: 'std',
      showPaths: !!c.showPaths, letterbox: false, hud: false,
    });
  }
  function drawMap() {
    const r = mapCv.getBoundingClientRect();
    const W = mapCv.width, H = mapCv.height;
    if (W < 4 || H < 4) return;
    const ctx = mapCv.getContext('2d');
    const X0 = -5.4, X1 = 5.4, Z0 = -4.2, Z1 = 4.2;
    const px = x => (x - X0) / (X1 - X0) * W;
    const pz = z => (z - Z0) / (Z1 - Z0) * H;
    const wx = X => clamp(X0 + (X / W) * (X1 - X0), X0, X1);
    const wz = Y => clamp(Z0 + (Y / H) * (Z1 - Z0), Z0, Z1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'var(--input-bg, #f6f7fa)'; ctx.fillRect(0, 0, W, H);
    /* 网格 */
    ctx.strokeStyle = 'rgba(130,140,165,.18)'; ctx.lineWidth = 1;
    for (let x = -5; x <= 5; x++) { ctx.beginPath(); ctx.moveTo(px(x), 0); ctx.lineTo(px(x), H); ctx.stroke(); }
    for (let z = -4; z <= 4; z++) { ctx.beginPath(); ctx.moveTo(0, pz(z)); ctx.lineTo(W, pz(z)); ctx.stroke(); }
    const objs = cur.scene.objects;
    /* 家具 / 墙 */
    objs.filter(o => o.type === 'prop').forEach(o => {
      ctx.save(); ctx.translate(px(o.x), pz(o.z)); ctx.rotate((o.rot || 0) * Math.PI / 180);
      const w = (o.shape === 'wall' ? (o.w || 3) : (o.w || 1)) / (X1 - X0) * W;
      const d = (o.shape === 'wall' ? 0.16 : (o.d || 1)) / (Z1 - Z0) * H;
      ctx.fillStyle = o.shape === 'wall' ? 'rgba(90,105,135,.55)' : 'rgba(150,160,185,.42)';
      ctx.strokeStyle = 'rgba(80,95,125,.5)';
      ctx.fillRect(-w / 2, -d / 2, Math.max(2, w), Math.max(2, d));
      ctx.strokeRect(-w / 2, -d / 2, Math.max(2, w), Math.max(2, d));
      ctx.restore();
    });
    /* 机位与视线 */
    try {
      const cam = camAt(cur, t);
      const a = actorOf(cur), pos = actorPos(a, t);
      const cx = cam.tx + Math.sin(cam.az * Math.PI / 180) * cam.dist;
      const cz = cam.tz + Math.cos(cam.az * Math.PI / 180) * cam.dist;
      ctx.strokeStyle = 'rgba(220,90,80,.65)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px(cx), pz(cz)); ctx.lineTo(px(pos.x), pz(pos.z)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#d5484a'; ctx.beginPath(); ctx.arc(px(cx), pz(cz), 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(W / 26)}px sans-serif`; ctx.fillText('📷', px(cx) - 7, pz(cz) - 8);
    } catch (e) { /* 忽略 */ }
    /* 人物与路径 */
    objs.filter(o => o.type === 'actor').forEach((a, i) => {
      const on = a.id === cur.cfg.actorId;
      const path = a.path || [];
      if (path.length >= 2) {
        ctx.strokeStyle = on ? a.color || '#e0a24a' : 'rgba(140,150,175,.55)';
        ctx.lineWidth = on ? 3 : 2;
        ctx.beginPath(); ctx.moveTo(px(path[0].x), pz(path[0].z));
        path.slice(1).forEach(q => ctx.lineTo(px(q.x), pz(q.z)));
        ctx.stroke();
        if (on) path.forEach((q, k) => {
          ctx.fillStyle = k === 0 ? '#fff' : k === path.length - 1 ? '#d5484a' : (a.color || '#e0a24a');
          ctx.strokeStyle = '#3c4560'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px(q.x), pz(q.z), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }
      const pp = actorPos(a, t);
      ctx.fillStyle = a.color || '#e0a24a';
      ctx.beginPath(); ctx.arc(px(pp.x), pz(pp.z), on ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b3040'; ctx.font = `${Math.round(W / 28)}px sans-serif`;
      ctx.fillText(a.name || ('演员' + (i + 1)), px(pp.x) + 9, pz(pp.z) + 4);
    });
    mapCv._toWorld = (X, Y) => ({ x: wx(X), z: wz(Y) });
    mapCv._toPx = (x, z) => ({ x: px(x), y: pz(z) });
    void r;
  }
  function paint() {
    renderInto(renderer, cur, t);
    if (compareId) renderInto(rendererB, findTake(compareId), t);
    drawMap();
    if (!scrubbing) $('a3Scrub').value = Math.round(t * 1000);
    const d = +cur.cfg.duration || 8;
    $('a3Time').textContent = `${(t * d).toFixed(1)}s / ${d.toFixed(1)}s`;
    $('a3Timecode').textContent = `00:${(t * d).toFixed(1).padStart(4, '0')}`;
  }
  /* 单帧重绘单独用一个句柄：不能和播放循环共用 raf，
     否则 resize / 改参数会把播放帧的引用清掉，时间轴就停了。 */
  function requestPaint() {
    if (paintRaf) return;
    paintRaf = requestAnimationFrame(() => { paintRaf = null; paint(); });
  }
  function frame(now) {
    raf = null;
    if (!playing) return;
    const dt = (now - lastNow) / 1000;
    lastNow = now;
    t += dt * (+cur.cfg.rate || 1) / (+cur.cfg.duration || 8);
    if (t >= 1) {
      if (cur.cfg.loop) t = 0;
      else { t = 1; playing = false; $('a3Play').textContent = '▶ 播放'; }
    }
    paint();
    if (playing) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (playing) return;
    playing = true; lastNow = performance.now();
    $('a3Play').textContent = '⏸ 暂停';
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function pause() { playing = false; $('a3Play').textContent = '▶ 播放'; if (raf) { cancelAnimationFrame(raf); raf = null; } }

  /* ---------- 描述 / 表单同步 ---------- */
  function describe() {
    const c = cur.cfg, a = actorOf(cur);
    const path = a.path || [];
    const route = path.length >= 2
      ? `${a.name}从 (${path[0].x.toFixed(1)}, ${path[0].z.toFixed(1)}) 沿 ${path.length} 个路径点走到 (${path[path.length - 1].x.toFixed(1)}, ${path[path.length - 1].z.toFixed(1)})，步速 ${(+c.walkSpeed).toFixed(1)} m/s`
      : `${a.name}在 (${(+a.x).toFixed(1)}, ${(+a.z).toFixed(1)}) 原地站定`;
    const others = cur.scene.objects.filter(o => o.type === 'actor' && o.id !== a.id).map(o => o.name).join('、');
    return [
      `【AI 3D 预演 · ${cur.name}】`,
      `场景：${c.tplName}白模空间，${/夜|暗/.test(c.text) ? '冷白灯光、低照度' : '自然光、柔和天光'}；` +
        `${cur.scene.objects.filter(o => o.type === 'prop' && o.shape !== 'wall').map(o => o.name).filter(Boolean).slice(0, 5).join('、')}等陈设。`,
      `人物：${route}${others ? '；同场还有 ' + others : ''}。`,
      `摄影机：${FOLLOW[c.follow].name}${c.mod !== 'none' ? ' + ' + MODS[c.mod] : ''}，` +
        `${SIZES[c.size]} / ${ANGLES[c.angle]}，跟随距离 ${(+c.dist).toFixed(1)}m，机位高 ${(+c.camH).toFixed(1)}m，` +
        `看向 ${(+c.aimY).toFixed(2)}m，视角 ${(+c.fov).toFixed(0)}°${c.showPaths ? '，画面标注走位线' : ''}。`,
      `节奏：时长 ${(+c.duration).toFixed(1)} 秒，画幅 ${c.aspect}，输出 ${c.resolution}。`,
      `原始想法：${c.text}`,
    ].join('\n');
  }
  function refreshPrompt(force = false) {
    if (!promptDirty || force) { $('a3Prompt').value = describe(); promptDirty = false; }
  }
  function syncForm() {
    const c = cur.cfg;
    $('a3Text').value = c.text;
    $('a3TakeName').textContent = cur.name;
    $('a3StageInfo').textContent = `${c.tplName} · ${FOLLOW[c.follow].name}${c.mod !== 'none' ? ' + ' + MODS[c.mod] : ''} · ${SIZES[c.size]}`;
    $('a3Follow').value = c.follow; $('a3Mod').value = c.mod; $('a3Size').value = c.size; $('a3Angle').value = c.angle;
    $('a3Walk').value = c.walkSpeed; $('a3Dur').value = c.duration;
    $('a3Dist').value = c.dist; $('a3CamH').value = c.camH; $('a3Aim').value = c.aimY; $('a3Fov').value = c.fov;
    $('a3Paths').checked = !!c.showPaths; $('a3Aspect').value = c.aspect; $('a3Res').value = c.resolution;
    $('a3Rate').value = String(c.rate); $('a3Loop').textContent = c.loop ? '🔁 循环 开' : '🔁 循环 关';
    $('a3SpeedLab').textContent = (+c.walkSpeed).toFixed(1) + ' m/s';
    $('a3DurLab').textContent = (+c.duration).toFixed(1) + 's';
    $('a3DistLab').textContent = (+c.dist).toFixed(1) + 'm';
    $('a3CamHLab').textContent = (+c.camH).toFixed(1) + 'm';
    $('a3AimLab').textContent = (+c.aimY).toFixed(2) + 'm';
    $('a3FovLab').textContent = (+c.fov).toFixed(0) + '°';
    const list = cur.scene.objects.filter(o => o.type === 'actor');
    $('a3Actor').innerHTML = list.map(a => `<option value="${a.id}" ${a.id === c.actorId ? 'selected' : ''}>${esc(a.name || a.id)}</option>`).join('');
    const [aw, ah] = String(c.aspect).split(':').map(Number);
    stageWrap.querySelectorAll('.a3-stage-box').forEach(b => { b.style.aspectRatio = `${aw || 16} / ${ah || 9}`; });
    syncSpeeds(cur.scene, c);
    refreshPrompt(true);
    renderTakes();
  }
  function cfgChanged(rePaint = true) {
    persist(cur.id, cur);
    syncSpeeds(cur.scene, cur.cfg);
    refreshPrompt();
    if (rePaint) requestPaint();
  }

  /* ---------- Take 列表 ---------- */
  function renderTakes() {
    const d = db()[pid()];
    $('a3TakeCount').textContent = `· ${d.takes.length} 版`;
    $('a3TakeList').innerHTML = d.takes.slice().reverse().map((tk, i) => `
      <div class="a3-take ${tk.id === cur.id ? 'on' : ''} ${tk.id === compareId ? 'cmp' : ''}" data-id="${tk.id}">
        <div class="a3-take-top"><b>${esc(tk.name)}</b><span class="dim">${new Date(tk.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="dim a3-take-meta">${esc(tk.cfg.tplName)} · ${esc(FOLLOW[tk.cfg.follow]?.name || '跟拍')} · ${(+tk.cfg.duration).toFixed(1)}s · ${esc(SIZES[tk.cfg.size] || '')}</div>
        <div class="a3-take-btns">
          <button class="btn btn-ghost btn-xs" data-act="load" data-id="${tk.id}">载入</button>
          <button class="btn btn-ghost btn-xs" data-act="cmp" data-id="${tk.id}">⬌ 对比</button>
          <button class="btn btn-ghost btn-xs" data-act="rename" data-id="${tk.id}">改名</button>
          <button class="btn btn-ghost btn-xs" data-act="del" data-id="${tk.id}">删</button>
        </div>
      </div>`).join('') || '<div class="empty-tip">还没有 Take</div>';
    $('a3ExitCmp').hidden = !compareId;
  }
  function newTakeFrom(g, name) {
    const d = db();
    const tk = { id: uid(), name: name || `Take ${String(d[pid()].takes.length + 1).padStart(2, '0')}`, createdAt: Date.now(), scene: g.scene, cfg: g.cfg };
    d[pid()].takes.push(tk); d[pid()].activeId = tk.id; dbWrite(d);
    return tk;
  }
  function loadTake(id) {
    const tk = findTake(id); if (!tk) return;
    cur = tk; t = 0; pause(); persist(tk.id, cur);
    syncForm(); sizeCanvases(); paint(); play();
    toast('已载入 ' + tk.name, 'ok');
  }
  function toggleCompare(id) {
    if (compareId === id) compareId = null;
    else compareId = id;
    const on = !!compareId;
    $('a3BBox').hidden = !on;
    stageWrap.classList.toggle('a3-split', on);
    const cmp = findTake(compareId);
    $('a3LabelA').textContent = cur.name;
    $('a3LabelB').textContent = cmp ? cmp.name : '';
    renderTakes();
    setTimeout(() => { sizeCanvases(); paint(); }, 30);
  }

  /* ---------- 走位预设 ---------- */
  function applyWalk(kind) {
    const a = actorOf(cur); const b = { x: 0.6, z: -0.4 };
    let path;
    if (kind === 'stand') path = [];
    else if (kind === 'back') path = [{ x: 2.8, z: 1.6 }, { x: 1.4, z: 0.7 }, { x: -1.6, z: -1 }];
    else if (kind === 'around') path = [
      { x: b.x - 1.2, z: b.z }, { x: b.x - 0.6, z: b.z - 1.3 }, { x: b.x + 0.9, z: b.z - 1.1 },
      { x: b.x + 1.3, z: b.z + 0.5 }, { x: b.x - 0.2, z: b.z + 1.2 }, { x: b.x - 1.2, z: b.z }];
    else if (kind === 'zigzag') path = [{ x: -3.1, z: 1.9 }, { x: -1.4, z: -0.6 }, { x: 0.5, z: 0.9 }, { x: 2.7, z: -1.4 }];
    else path = [{ x: -3.1, z: 1.6 }, { x: -1.3, z: 0.7 }, { x: 0.6, z: -0.4 }, { x: 2.6, z: -1.3 }];
    a.path = path;
    a.action = path.length >= 2 ? 'walk' : 'stand';
    cfgChanged();
    toast(path.length >= 2 ? `走位已改成「${WALK_PRESETS.find(w => w.key === kind).name}」` : '已改为原地站定', 'ok');
  }

  /* ---------- 事件绑定 ---------- */
  $('a3Gen').onclick = () => {
    const text = $('a3Text').value.trim();
    if (!text) { toast('先写一句话，描述你想拍的镜头', 'warn'); return; }
    pause();
    try {
      const g = buildFromText(text, cur.cfg);
      cur = newTakeFrom(g);
      t = 0; promptDirty = false;
      syncForm(); sizeCanvases(); paint(); play();
      toast(`已生成 ${cur.name} · ${g.tpl.name}白模 + ${g.actors.length} 人 + ${g.cfg.follow === 'fixed' ? '固定' : '跟拍'}机位`, 'ok');
    } catch (e) { console.error('[AI3D]', e); toast('生成失败：' + e.message, 'warn'); }
  };
  $('a3Demo').onclick = () => { $('a3Text').value = EXAMPLE; toast('示例填好了，点「⚡ 生成预演」', 'ok'); };
  $('a3SaveTake').onclick = async () => {
    const n = await askText({ title: '另存为 Take', label: '版本名称', value: `Take ${String(db()[pid()].takes.length + 1).padStart(2, '0')}`, okText: '保存' });
    if (!n) return;
    cur.cfg.text = $('a3Text').value.trim() || cur.cfg.text;
    const d = db();
    const tk = { id: uid(), name: n.slice(0, 24), createdAt: Date.now(), scene: clone(cur.scene), cfg: clone(cur.cfg) };
    d[pid()].takes.push(tk); d[pid()].activeId = tk.id; dbWrite(d);
    cur = tk; persist(tk.id, cur); syncForm(); paint();
    toast('已另存 ' + tk.name, 'ok');
  };
  $('a3ToBoard').onclick = () => {
    try {
      const c = cur.cfg;
      const s = store.addShot({
        title: 'AI 3D 预演 · ' + cur.name, desc: c.text, duration: c.duration,
        shotSize: c.size, angle: c.angle, cameraMove: 'free', showPath: c.showPaths,
        focusKind: 'auto', aimY: c.aimY, camH: c.camH,
        scene: clone(visibleScene(cur, 0)),
        note: '由 AI 3D 预演生成',
      });
      toast('已加入分镜板（第 ' + (store.active.shots.findIndex(x => x.id === s.id) + 1) + ' 镜）', 'ok');
    } catch (e) { toast('保存失败：' + e.message, 'warn'); }
  };
  $('a3Help').onclick = () => modal({
    title: '🧊 AI 3D 预演 · 怎么用', wide: true,
    body: `<div class="a3-help">
      <p><b>① 写一句话</b>：比如「深夜便利店，男主从门口走到冰柜前，摄影机在背后低机位跟随，8 秒」。点「⚡ 生成预演」，自动搭出白模房间、家具、人物和一条走位路线，并把机位算好。</p>
      <p><b>② 调走位与机位</b>：左边「俯视走位图」上点空白加路径点、拖圆点改路线、双击删点；也能一键换「后退 / 绕一圈 / 站定」。右边滑块调跟随距离、机位高度、看向高度、焦距。</p>
      <p><b>③ 播放预演</b>：摄影机会跟着人物走，按 ▶ 或拖时间轴逐帧检查构图和节奏。「📷 截图 PNG」「🎬 导出预演视频」可直接拿去当参考。</p>
      <p><b>④ 反复比较</b>：每次生成都会写入一个独立 <b>Take</b>。改坏了点旧版「载入」接着调；点「⬌ 对比」同屏并排看两版，同一时间码一起播。</p>
      <p><b>⑤ 接着出片</b>：「📋 复制描述」拿去即梦 / 可灵 / H3；「🎞 保存到分镜板」把这套白模场景和机位写进项目，后面照常做提示词、动态分镜。</p>
      <p class="dim">全部在本机浏览器算，不联网、不上传；Take 存在本地，换设备前记得去「设置 → 数据管理」导出备份。</p>
    </div>`,
  });

  $('a3Play').onclick = () => playing ? pause() : play();
  $('a3Rewind').onclick = () => { t = 0; paint(); };
  $('a3Loop').onclick = () => { cur.cfg.loop = !cur.cfg.loop; $('a3Loop').textContent = cur.cfg.loop ? '🔁 循环 开' : '🔁 循环 关'; cfgChanged(false); };
  $('a3Rate').onchange = e => { cur.cfg.rate = +e.target.value; cfgChanged(false); if (playing) { lastNow = performance.now(); } };
  $('a3Scrub').addEventListener('pointerdown', () => { scrubbing = true; pause(); });
  $('a3Scrub').addEventListener('pointerup', () => { scrubbing = false; });
  $('a3Scrub').addEventListener('input', e => { t = +e.target.value / 1000; paint(); });

  const bindRange = (id, key, lab, fmt) => {
    $(id).oninput = e => {
      cur.cfg[key] = +e.target.value;
      $(lab).textContent = fmt(cur.cfg[key]);
      cfgChanged();
    };
  };
  bindRange('a3Walk', 'walkSpeed', 'a3SpeedLab', v => (+v).toFixed(1) + ' m/s');
  bindRange('a3Dur', 'duration', 'a3DurLab', v => (+v).toFixed(1) + 's');
  bindRange('a3Dist', 'dist', 'a3DistLab', v => (+v).toFixed(1) + 'm');
  bindRange('a3CamH', 'camH', 'a3CamHLab', v => (+v).toFixed(1) + 'm');
  bindRange('a3Aim', 'aimY', 'a3AimLab', v => (+v).toFixed(2) + 'm');
  bindRange('a3Fov', 'fov', 'a3FovLab', v => (+v).toFixed(0) + '°');
  const bindSel = (id, key, fn) => { $(id).onchange = e => { cur.cfg[key] = e.target.value; if (fn) fn(e.target.value); cfgChanged(); }; };
  bindSel('a3Follow', 'follow', () => $('a3StageInfo').textContent = `${cur.cfg.tplName} · ${FOLLOW[cur.cfg.follow].name} · ${SIZES[cur.cfg.size]}`);
  bindSel('a3Mod', 'mod', () => $('a3StageInfo').textContent = `${cur.cfg.tplName} · ${FOLLOW[cur.cfg.follow].name}${cur.cfg.mod !== 'none' ? ' + ' + MODS[cur.cfg.mod] : ''} · ${SIZES[cur.cfg.size]}`);
  bindSel('a3Size', 'size', v => { cur.cfg.dist = SIZE_DIST[v] || cur.cfg.dist; $('a3Dist').value = cur.cfg.dist; $('a3DistLab').textContent = (+cur.cfg.dist).toFixed(1) + 'm'; });
  bindSel('a3Angle', 'angle', v => {
    const H = { eye: 1.65, low: 0.65, high: 3.4, bird: 6 }[v];
    if (H) { cur.cfg.camH = H; $('a3CamH').value = H; $('a3CamHLab').textContent = H.toFixed(1) + 'm'; }
  });
  bindSel('a3Aspect', 'aspect', v => {
    const [aw, ah] = v.split(':').map(Number);
    stageWrap.querySelectorAll('.a3-stage-box').forEach(b => { b.style.aspectRatio = `${aw || 16} / ${ah || 9}`; });
    setTimeout(() => { sizeCanvases(); paint(); }, 20);
  });
  bindSel('a3Res', 'resolution');
  $('a3Actor').onchange = e => { cur.cfg.actorId = e.target.value; cfgChanged(); };
  $('a3Paths').onchange = e => { cur.cfg.showPaths = e.target.checked; cfgChanged(); };
  $('a3WalkBtns').onclick = e => { const b = e.target.closest('[data-walk]'); if (b) applyWalk(b.dataset.walk); };

  $('a3Copy').onclick = () => { copyText($('a3Prompt').value); toast('镜头描述已复制', 'ok'); };
  $('a3Regen').onclick = () => { refreshPrompt(true); toast('已按当前参数重新生成', 'ok'); };
  $('a3Prompt').oninput = () => { promptDirty = true; };
  $('a3Png').onclick = () => {
    try {
      const a = document.createElement('a');
      a.href = canvasA.toDataURL('image/png');
      a.download = `${cur.name}-3D预演截图.png`;
      document.body.appendChild(a); a.click(); a.remove();
      toast('截图已下载', 'ok');
    } catch (e) { toast('截图失败：' + e.message, 'warn'); }
  };
  $('a3Mp4').onclick = async () => {
    if (typeof window.mnExportCanvasVideo !== 'function') { toast('导出器没加载上，刷新页面再试', 'warn'); return; }
    pause();
    const btn = $('a3Mp4'); const old = btn.textContent;
    btn.disabled = true;
    try {
      const [rw, rh] = String(cur.cfg.resolution).split('x').map(Number);
      const [aw, ah] = String(cur.cfg.aspect).split(':').map(Number);
      const W = Math.min(1280, rw || 1280), H = Math.round(W * (ah || 9) / (aw || 16) / 2) * 2;
      const total = +cur.cfg.duration || 8;
      const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
      const offR = new WhiteModelRenderer(oc);
      oc.width = W; oc.height = H; offR.w = W; offR.h = H; offR._dpr = 1;
      const res = await window.mnExportCanvasVideo({
        W, H, fps: 24, total,
        drawFrame: (tt, ctx) => {
          const local = clamp(tt / total, 0, 1);
          offR.render({ type: 'free' }, local, 'walk', {
            duration: total, scene: visibleScene(cur, local),
            angle: cur.cfg.angle, size: cur.cfg.size, showPaths: cur.cfg.showPaths,
            letterbox: false, hud: false,
          });
          ctx.drawImage(oc, 0, 0);
        },
        onProgress: pr => { btn.textContent = `🎬 ${Math.round(pr * 100)}%`; },
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.blob);
      a.download = `${cur.name}-3D预演.${res.ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast(`已导出 ${res.frames} 帧 / ${(res.blob.size / 1048576).toFixed(1)}MB`, 'ok');
    } catch (e) { console.error('[AI3D 导出]', e); toast('导出失败：' + (e.message || e), 'warn'); }
    finally { btn.disabled = false; btn.textContent = old; }
  };

  /* Take 列表事件委托 */
  $('a3TakeList').onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'load') loadTake(id);
    else if (act === 'cmp') toggleCompare(id);
    else if (act === 'rename') {
      const tk = findTake(id); if (!tk) return;
      const n = await askText({ title: '重命名 Take', label: '版本名称', value: tk.name, okText: '改名' });
      if (!n) return;
      const d = db(); const x = d[pid()].takes.find(q => q.id === id); if (x) x.name = n.slice(0, 24);
      dbWrite(d); if (cur.id === id) cur.name = x.name;
      syncForm(); toast('已改名', 'ok');
    } else if (act === 'del') {
      if (db()[pid()].takes.length <= 1) { toast('至少留一个 Take', 'warn'); return; }
      if (!await confirmDlg('删除这个 Take？删了就找不回来了。', { danger: true, okText: '删除' })) return;
      const d = db(); d[pid()].takes = d[pid()].takes.filter(q => q.id !== id);
      if (compareId === id) { compareId = null; $('a3BBox').hidden = true; stageWrap.classList.remove('a3-split'); }
      if (cur.id === id) { cur = d[pid()].takes[d[pid()].takes.length - 1]; d[pid()].activeId = cur.id; }
      dbWrite(d); syncForm(); paint(); toast('已删除', 'ok');
    }
  };
  $('a3ExitCmp').onclick = () => toggleCompare(compareId);

  /* 走位图交互 */
  function mapPt(e) {
    const r = mapCv.getBoundingClientRect();
    const sx = mapCv.width / (r.width || 1), sy = mapCv.height / (r.height || 1);
    return { X: (e.clientX - r.left) * sx, Y: (e.clientY - r.top) * sy };
  }
  mapCv.addEventListener('pointerdown', e => {
    const a = actorOf(cur); if (!a.path) a.path = [];
    const { X, Y } = mapPt(e);
    const toPx = mapCv._toPx || (() => ({ x: -99, y: -99 }));
    let idx = -1, best = 13;
    a.path.forEach((q, i) => {
      const pp = toPx(q.x, q.z), dd = Math.hypot(pp.x - X, pp.y - Y);
      if (dd < best) { best = dd; idx = i; }
    });
    if (idx >= 0) { dragIdx = idx; mapCv.setPointerCapture(e.pointerId); }
    else {
      const w = mapCv._toWorld ? mapCv._toWorld(X, Y) : { x: 0, z: 0 };
      a.path.push({ x: +w.x.toFixed(2), z: +w.z.toFixed(2) });
      a.action = 'walk';
      dragIdx = a.path.length - 1;
      mapCv.setPointerCapture(e.pointerId);
      cfgChanged();
    }
  });
  mapCv.addEventListener('pointermove', e => {
    if (dragIdx < 0) return;
    const a = actorOf(cur); if (!a.path || !a.path[dragIdx]) return;
    const { X, Y } = mapPt(e);
    const w = mapCv._toWorld ? mapCv._toWorld(X, Y) : { x: 0, z: 0 };
    a.path[dragIdx] = { x: +w.x.toFixed(2), z: +w.z.toFixed(2) };
    requestPaint();
  });
  mapCv.addEventListener('pointerup', () => { if (dragIdx >= 0) { dragIdx = -1; cfgChanged(); } });
  mapCv.addEventListener('dblclick', e => {
    e.preventDefault();
    const a = actorOf(cur); if (!a.path || a.path.length <= 2) { toast('至少留两个路径点', 'warn'); return; }
    const { X, Y } = mapPt(e); const toPx = mapCv._toPx || (() => ({ x: -99, y: -99 }));
    let idx = -1, best = 14;
    a.path.forEach((q, i) => { const pp = toPx(q.x, q.z), dd = Math.hypot(pp.x - X, pp.y - Y); if (dd < best) { best = dd; idx = i; } });
    if (idx >= 0) { a.path.splice(idx, 1); cfgChanged(); toast('已删掉一个路径点', 'ok'); }
  });
  mapCv.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- 启动 ---------- */
  syncForm();
  requestAnimationFrame(() => { sizeCanvases(); paint(); play(); });
  try {
    resizeObs = new ResizeObserver(() => { sizeCanvases(); requestPaint(); });
    resizeObs.observe(stageWrap); resizeObs.observe(mapCv);
  } catch (e) { window.addEventListener('resize', onResize); }
  function onResize() { sizeCanvases(); requestPaint(); }

  return () => {
    pause();
    if (paintRaf) cancelAnimationFrame(paintRaf);
    if (resizeObs) resizeObs.disconnect();
    window.removeEventListener('resize', onResize);
  };
}
