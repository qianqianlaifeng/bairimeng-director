/* ================================================================ 导演台（🎥 页）
   v1.12.5（2026-10-28）：预演可显示人物走位线（镜头级开关 showPath；运镜预演页勾「显示人物走位线」，动态分镜与导出 mp4 跟着走）——
                          出片时能直接看到「路线怎么绕开家具 + 镜头怎么跟着走」。
   v1.12.4（2026-10-28）：走位避障 —— 画完轨迹自动绕开家具与墙（A* + 视线简化，0.2m 网格），门洞算通路；
                          人物面板加「🧵 绕开家具」按钮可重绕当前走位；AI 搭景落地时自动把穿家具的走位绕过。
                          预演里人不再从茶几/沙发里穿过去了。
   v1.12.3（2026-10-28）：防穿模（新 js/mn-layout.js）—— 分离轴碰撞检测；放置家具/人物、2D 拖动松手、3D 拖动松手都会
                          自动让到最近的空位（只挪你正在动的那一件，已摆好的不动）；AI 搭景落地时整场排一遍重叠；
                          家具不许插进墙、人不许站进家具里；门/窗嵌墙、地毯铺在家具下不算穿模；
                          拖动中撞上会把选中框描红警告。另加「🧹 自动摆好」按钮（家具/人物面板、物件库）。
   v1.12.2（2026-10-28）：摇镜焦点 —— 左/右摇、上/下摇现在**终点对准焦点**（以前按固定角度扫完就落在空处），
                          焦点默认是主体人物，也能在「镜头编辑 / 运镜预演」里指定某个人物、某件道具或画面中心；
                          指定道具作焦点时按道具自身高度取景（不再把镜头抬到 1.15m 把人/物顶到画面上沿）。
   v1.12.1（2026-10-28）：3D 操作修复 —— 选中物体旁新增「↻ 拖动旋转」手柄（15° 吸附，按住 Alt 自由转）、Q/E 每次 15°、
                          拖动改成按帧合并 + 只重绘 3D（12k 顶点重场景 3.4ms/帧，不再每来一个指针事件就重建整份几何）、
                          3D 拖动与旋转都能 Ctrl+Z；右键「复制」以前只往剪贴板放一份（画面毫无反应），现在直接就地复制；
                          人物颜色改成整个人跟着变（含皮肤与头发），面板显示当前色 + 「同名角色一起换」；
                          预演：修剖墙判断（以前切掉的是背景墙、留下机位那一侧的墙）、光源不再被渲染成一根立在画面中间的落地灯。
   v1.12.0（2026-10-28）：AI 搭景——按镜头描述（台词/场次/前后镜/同场布局）自动生成房间·家具·光源 + 人物走位 + 机位，
                          本地校验夹取、空场景自动返修一次，注入导演台当草稿（逐镜确认后再「保存到镜头」）；
                          机位被自己搭的墙挡住时自动转到无墙的一侧。
                          动态分镜新增「🎬 导出 mp4」（WebCodecs 逐帧编码 1280×720@24fps，无音轨）；
                          修 mp4 封装器三处错误（ftyp 长度少 4 字节 / stsc 与 stco 不匹配 / avc1 字段拼错）——
                          此前 WebCodecs 路径出的 mp4 根本打不开。
   v1.11.9（2026-10-27）：道具库 23 类多部件精细模型（桌面+围板+四腿 / 沙发坐垫+靠背+扶手 / 柜门+拉手…），
                          2D 俯视符号、3D 导演台、白模预演三端共用同一套部件；3D 与预演里的道具终于会跟随「旋转 Z」。
                          修：3D 朝向与 2D 反向（rot=90 现在三端一起朝向地图下方）；运镜预演/动态分镜真正吃进
                          「本镜场景」（此前 scene 没交给渲染器 = 空舞台），场景自动居中、有墙自动剖开前方外墙；
                          存镜头时把导演台机位一并带进预演。
   v1.11.8（2026-10-27）：新增「运动轨迹」工具（2D 画走位线→3D 蓝线→预演沿轨迹走动）；重命名改用应用内弹窗（原 prompt 被拦截时无反应）。
   v1.11.7（2026-10-27）：3D 头部补全五官（双眼/眉/鼻/嘴）；3D 视图支持点击地面直接放置物件（射线求交，拖拽不误放）。
   v1.11.6（2026-10-27）：新增「连戏检查」页（越轴/人物瞬移/转向/光线突变/换景 + 一键对齐上一镜）、按场次智能归组场景、镜头一键沿用上一镜设置。
   v1.11.5（2026-10-27）：项目级「场景库」——一套景多镜复用（存入/批量套用/新镜头自动继承/使用统计）；修弹窗层级与新手教程遮挡画布。
   v1.11.4（2026-10-27）：3D 关节姿势（站立/走路/运动/招手/坐下/躺下，真实 FK 弯曲 + 落地校准 + 跳跃）；墙面门洞 3D 真镂空（分段墙体 + 门楣）。
   v1.11.3（2026-10-27）：2D 俯视人形（肩宽/头/鼻尖/手臂，朝向与脸朝向都可见）；3D 精细人偶（21 部件）+ 修 pushBox 尺寸语义（墙/道具此前只有 3/4 高且悬空）；3D 包围盒自适应。
   v1.11.2（2026-10-27）：人物命名 + 自定义取色 + 3D 头顶名牌；常驻「＋人物/＋光源/物件库」；连续放置不再抢占选中；Esc 一律取消选中。
   v1.11.1（2026-10-26）：全站换年轻化蓝调主题（晴空蓝 #2e7cf6），画布/3D/人物默认色同步。
   v1.11.0（2026-10-26）：右键菜单 / 右键平移 / 框选多选 / 物件库 / 对齐参考线 / 撤销粒度修复。
   v1.10.28：仿 B 站玩具页 MiorningDYT（v0.6.17）原生重制 —— M1 里程碑：
   应用外壳 + 2D 户型编辑器（画房间/画墙/造物/打洞/放人）+ 场景清单 +
   IndexedDB 八画布 + 导入导出 + 暗色主题 + 帮助/快捷键/AI规则/模板弹窗。
   M2（3D 导演视图）/ M3（剪辑台）/ M4（故事板）入口先做占位 toast。
   依赖：mn-icons.js（MN_ICONS，lucide path 数据，从原版包提取）。 */
(function () {
'use strict';

/* ---------- 基础工具 ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = v => Math.round(v * 2) / 2;                 // 半格吸附
const CELL = 44;                                          // 1 网格 = 44px（k=1）
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* 颜色混合：k=0 原色，k=1 纯白（用于头/皮肤的提亮） */
function tint(hex, k) {
  const h = String(hex || '#2e7cf6').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.round(v + (255 - v) * k);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function icon(name, cls) {
  const d = (window.MN_ICONS || {})[name];
  if (!d) return '';
  return `<svg class="mn-svg ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}
let toastTimer = null;
function toast(msg) {
  const root = $('#mnRoot'); if (!root) return;
  let t = $('.mn-toast', root);
  if (t) { t.textContent = msg; clearTimeout(toastTimer); }
  else { t = el('div', 'mn-toast', esc(msg)); root.appendChild(t); }
  toastTimer = setTimeout(() => { t.remove(); }, 2400);
}

/* ---------- 调色板（跟随主题，canvas 用） ---------- */
const PAL = { canvas: '#f2eee6', grid: '#ddd7cd', gridMajor: '#c8bfae', ink: '#121212', muted: '#76716b', accent: '#2e7cf6', roomFill: '#fdfcf8', roomLine: '#b7ad9c', prop: '#d9b382', paper: '#fcfaf6' };
function syncPal() {
  const dark = $('#mnRoot') && $('#mnRoot').dataset.mnTheme === 'dark';
  PAL.canvas = dark ? '#171717' : '#f2eee6';
  PAL.grid = dark ? '#2c2a27' : '#e2dbcf';
  PAL.gridMajor = dark ? '#3b3835' : '#cfc5b3';
  PAL.ink = dark ? '#f2eee6' : '#121212';
  PAL.muted = dark ? '#b0aaa1' : '#76716b';
  PAL.accent = dark ? '#5b9bff' : '#2e7cf6';
  PAL.roomFill = dark ? '#211f1d' : '#fdfcf8';
  PAL.roomLine = dark ? '#4a463f' : '#b7ad9c';
  PAL.prop = '#d9b382';
  PAL.paper = dark ? '#202020' : '#fcfaf6';
}

/* ---------- IndexedDB ---------- */
const DB_NAME = 'aistudio.director.v1';
let _db = null;
function idb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('canvas')) db.createObjectStore('canvas'); };
    rq.onsuccess = () => { _db = rq.result; _db.onversionchange = () => { _db.close(); _db = null; }; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}
async function dbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const r = db.transaction('canvas', 'readonly').objectStore('canvas').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function dbPut(key, val) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction('canvas', 'readwrite'); tx.objectStore('canvas').put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

/* ---------- 全局状态 ---------- */
const MN = {
  canvasId: '01',
  state: null,            // 当前画布完整状态
  tool: 'select',         // select|room|wall|prop|hole|person|pan
  sel: null,              // {kind, id}  主选中（最后点的那一个）
  selList: [],            // 多选：框选 / Shift 点选累积 [{kind,id}]
  pending: null,          // 物体库待放置：{kind:'prop'|'person', preset:{...}}
  guide: null,            // 拖动时的对齐参考线 {v:[x],h:[y]}
  ctxOpen: false,         // 右键菜单是否打开
  view: { x: 0, y: 0, k: 1 },
  grid: true,
  immersive: false,
  undo: [], redo: [],
  drag: null,             // 进行中的拖拽
  wallDraft: null,        // 画墙第一点
  spaceDown: false,
  clipboard: null,
  saveT: null,
  built: false,
};

function blankState(title) {
  return {
    format: 'aistudio-director', version: 1,
    scene: { title: title || '未命名画布', rooms: [], walls: [], props: [], persons: [], lights: [], ground: { color: '#ffffff', grid: true } },
    view: { mode: '2d', material: 'original', zoom: 1, x: 0, y: 0, grid: true, floorColor: true },
    sun: { on: true, dir: 300, alt: 53 },
    camera: { size: '16:9', frame: false, cutaway: false, ceil: false, fov: 45 },
    directorShots: [], project: null, cuttingDesk: null, cameraPath: null,
    editorPreferences: {},
    updatedAt: Date.now(),
  };
}

/* ---------- 示例场景「二层室」（对齐原版 demo） ---------- */
function sampleScene() {
  const st = blankState('二层室·导演台');
  const R = (name, x, y, w, d) => ({ id: uid(), name, x, y, w, d, h: 4, color: '' });
  st.scene.rooms = [
    R('主卧', 1, 1, 6, 5), R('卧室 2', 8, 1, 5, 5),
    R('客厅', 1, 7, 7, 5), R('厨房', 9, 7, 4, 4), R('卫浴', 9, 12, 4, 3),
  ];
  const W = (x1, y1, x2, y2) => ({ id: uid(), name: '', x1, y1, x2, y2, h: 2.6, holes: [] });
  st.scene.walls = [
    W(1, 1, 1, 15), W(14, 1, 14, 15), W(1, 1, 14, 1), W(1, 15, 14, 15),          // 外墙 4
    W(7, 1, 7, 3), W(7, 4, 7, 6),                                                  // 主卧|卧室2 隔断（留门洞）
    W(1, 6, 3.5, 6), W(4.5, 6, 13, 6),                                             // 上排|客厅 隔断（留门洞）
    W(8, 6, 8, 9), W(8, 10, 8, 15),                                                // 客厅|右列 隔断（留门洞）
    W(8, 11, 10.5, 11), W(11.5, 11, 13, 11),                                       // 厨房|卫浴 隔断（留门洞）
  ];
  st.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1));
  st.scene.props = [{ id: uid(), name: '木头箱子', x: 2.5, y: 8.5, w: 2, d: 2, h: 1, color: '#d9b382' }];
  return st;
}

/* ---------- 场景模板 ---------- */
const TEMPLATES = [
  { name: '空房间', ico: 'square-dashed', make: () => { const s = blankState('空房间'); const r = { id: uid(), name: '房间', x: 2, y: 2, w: 8, d: 6, h: 4, color: '' }; s.scene.rooms = [r]; s.scene.walls = [{ id: uid(), name: '墙面 1', x1: 2, y1: 2, x2: 10, y2: 2, h: 2.6, holes: [] }, { id: uid(), name: '墙面 2', x1: 10, y1: 2, x2: 10, y2: 8, h: 2.6, holes: [] }, { id: uid(), name: '墙面 3', x1: 10, y1: 8, x2: 2, y2: 8, h: 2.6, holes: [] }, { id: uid(), name: '墙面 4', x1: 2, y1: 8, x2: 2, y2: 2, h: 2.6, holes: [] }]; return s; } },
  { name: '一居室', ico: 'house', make: () => { const s = blankState('一居室'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('卧室', 1, 1, 6, 5), R('客厅', 8, 1, 6, 5), R('厨卫', 1, 7, 6, 4), R('阳台', 8, 7, 6, 4)]; s.scene.walls = [W(1, 1, 1, 11), W(14, 1, 14, 11), W(1, 1, 14, 1), W(1, 11, 14, 11), W(7.5, 1, 7.5, 6), W(1, 6.5, 13.5, 6.5), W(7.5, 6.5, 7.5, 11)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); return s; } },
  { name: '两居室', ico: 'house', make: () => { const s = sampleScene(); s.scene.title = '两居室'; return s; } },
  { name: '卧室', ico: 'box', make: () => { const s = blankState('卧室'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('床', 2, 2, 4, 3), R('衣柜', 7, 2, 2, 3), R('书桌', 2, 6, 3, 2), R('过道', 6, 6, 3, 3)]; s.scene.walls = [W(1, 1, 1, 9), W(10, 1, 10, 9), W(1, 1, 10, 1), W(1, 9, 10, 9), W(1, 5.5, 5.5, 5.5), W(5.5, 5.5, 5.5, 9)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); s.scene.props = [{ id: uid(), name: '床', x: 2, y: 2, w: 4, d: 3, h: 0.6, color: '#c98d6b' }]; return s; } },
  { name: '客厅', ico: 'box', make: () => { const s = blankState('客厅'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('会客区', 1, 1, 8, 6), R('电视墙', 10, 1, 4, 6), R('餐厅', 1, 8, 5, 4), R('走廊', 7, 8, 7, 4)]; s.scene.walls = [W(1, 1, 1, 12), W(14, 1, 14, 12), W(1, 1, 14, 1), W(1, 12, 14, 12), W(9.5, 1, 9.5, 7.5), W(1, 7.5, 13.5, 7.5)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); s.scene.props = [{ id: uid(), name: '沙发', x: 2, y: 2, w: 3, d: 1.2, h: 0.8, color: '#8a9b8e' }, { id: uid(), name: '茶几', x: 3, y: 4, w: 1.6, d: 1, h: 0.45, color: '#d9b382' }]; return s; } },
  { name: '厨房', ico: 'box', make: () => { const s = blankState('厨房'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('灶台', 1, 1, 6, 2), R('水槽', 8, 1, 4, 2), R('操作台', 1, 4, 5, 2), R('餐厅', 7, 4, 5, 4)]; s.scene.walls = [W(1, 1, 1, 8), W(12, 1, 12, 8), W(1, 1, 12, 1), W(1, 8, 12, 8), W(7.5, 1, 7.5, 3.5), W(1, 3.5, 11.5, 3.5)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); return s; } },
  { name: '卫浴', ico: 'door-open', make: () => { const s = blankState('卫浴'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('浴缸', 1, 1, 4, 3), R('马桶', 6, 1, 2, 2), R('洗手台', 9, 1, 3, 2), R('过道', 1, 5, 11, 2)]; s.scene.walls = [W(1, 1, 1, 7), W(12, 1, 12, 7), W(1, 1, 12, 1), W(1, 7, 12, 7), W(5.5, 1, 5.5, 4), W(8.5, 1, 8.5, 4), W(1, 4.5, 11.5, 4.5)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); return s; } },
  { name: '工作室', ico: 'film', make: () => { const s = blankState('工作室'); const R = (n, x, y, w, d) => ({ id: uid(), name: n, x, y, w, d, h: 4, color: '' }); const W = (a, b, c, d) => ({ id: uid(), name: '', x1: a, y1: b, x2: c, y2: d, h: 2.6, holes: [] }); s.scene.rooms = [R('工位 A', 1, 1, 5, 4), R('工位 B', 7, 1, 5, 4), R('会议角', 1, 6, 6, 5), R('器材架', 8, 6, 4, 5)]; s.scene.walls = [W(1, 1, 1, 11), W(13, 1, 13, 11), W(1, 1, 13, 1), W(1, 11, 13, 11), W(6.5, 1, 6.5, 5.5), W(1, 5.5, 12.5, 5.5), W(7.5, 5.5, 7.5, 11)]; s.scene.walls.forEach((w, i) => w.name = '墙面 ' + (i + 1)); return s; } },
];

/* ---------- 持久化 ---------- */
async function loadCanvas(id) {
  // 切走前把上一张画布的待存立即落库（saveSoon 是 500ms 防抖，不冲的话快速切页会丢）
  if (MN.saveT) { clearTimeout(MN.saveT); MN.saveT = null; if (MN.state) await saveNow(MN.canvasId, MN.state); }
  MN.canvasId = id;
  let st = await dbGet('canvas:' + id);
  if (!st) {
    // 首绘示例（仅 01 且从没存过 meta 时）；⚠️ 立即落库——
    // 否则用户先编辑别的画布（meta 落库）再刷新，01 会被误判成「非首次」变空白，示例丢失
    const first = id === '01' && !(await dbGet('canvas-meta'));
    st = first ? sampleScene() : blankState();
    try { await dbPut('canvas:' + id, st); } catch (e) { /* 存储失败不打断，内存里照样能用 */ }
  }
  MN.state = st;
  MN.sel = null; MN.selList = []; MN.pending = null; MN.pathDraft = null; MN.undo = []; MN.redo = [];
  MN.view = { x: 0, y: 0, k: st.view && st.view.zoom || 1 };
  MN.grid = !!(st.view && st.view.grid !== false);
  fitView();
  renderAll();
  setMode((st.view && st.view.mode === '3d') ? '3d' : '2d');
}
function saveSoon() {
  clearTimeout(MN.saveT);
  // ⚠️ 必须把「存哪张、存什么」在排程时定死：debounce 500ms 内用户可能切了画布，
  // 晚点再读 MN.canvasId/MN.state 会把保存写到新画布上（1.10.28 QA 实测丢标题）
  const id = MN.canvasId, st = MN.state;
  MN.saveT = setTimeout(() => saveNow(id, st), 500);
}
async function saveNow(id, st) {
  id = id || MN.canvasId; st = st || MN.state;
  if (!st) return;
  st.updatedAt = Date.now();
  try {
    await dbPut('canvas:' + id, st);
    if (id === MN.canvasId) {
      await dbPut('canvas-meta', { activeCanvas: MN.canvasId, migrated: true });
      const ss = $('#mnSaveStatus');
      if (ss) { const d = new Date(); ss.textContent = '已存本机 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    }
  } catch (e) { /* 存储失败不打断操作 */ }
}
function pushUndo(snapStr) {
  MN.undo.push(snapStr || JSON.stringify(MN.state));
  if (MN.undo.length > 60) MN.undo.shift();
  MN.redo = [];
}
function undo() {
  if (!MN.undo.length) return toast('没有可撤销的');
  MN.redo.push(JSON.stringify(MN.state));
  MN.state = JSON.parse(MN.undo.pop());
  MN.sel = null; renderAll(); saveSoon();
}
function redo() {
  if (!MN.redo.length) return toast('没有可重做的');
  MN.undo.push(JSON.stringify(MN.state));
  MN.state = JSON.parse(MN.redo.pop());
  MN.sel = null; renderAll(); saveSoon();
}

/* ---------- 坐标换算 ---------- */
const w2s = (wx, wy) => ({ x: wx * CELL * MN.view.k + MN.view.x, y: wy * CELL * MN.view.k + MN.view.y });
const s2w = (sx, sy) => ({ x: (sx - MN.view.x) / (CELL * MN.view.k), y: (sy - MN.view.y) / (CELL * MN.view.k) });

/* ---------- 应用外壳 ---------- */
function buildShell() {
  const root = $('#mnRoot');
  root.innerHTML = '';
  const app = el('div', 'mn-app');
  app.innerHTML = `
    <header class="mn-header">
      <div class="mn-brand">
        <div class="mn-brand-mark">导</div>
        <div class="mn-brand-txt"><h1>导演台</h1><p>更简单易用的导演台。</p></div>
        <button class="mn-wf-switch" id="mnToStory">${icon('arrow-up-right')}去往故事板</button>
        <button class="mn-wf-switch" id="mnBackHome">${icon('house')}返回桌面</button>
      </div>
      <nav class="mn-steps">
        <button class="active" id="mnStep1"><span>01</span>画空间</button>
        ${icon('chevron-right')}
        <button id="mnStep2"><span>02</span>找镜头</button>
      </nav>
      <div class="mn-header-actions">
        <span class="mn-save-status" id="mnSaveStatus">已存本机</span>
        <button class="mn-icon-btn" id="mnBtnKeys" title="快捷键">${icon('keyboard')}</button>
        <button class="mn-icon-btn" id="mnBtnTheme" title="白天 / 天黑">${icon('moon')}</button>
        <button class="mn-icon-btn" id="mnBtnHelp" title="帮助">${icon('circle-question-mark')}</button>
        <button class="mn-btn primary" id="mnBtnRise">${icon('cuboid')}立起来</button>
      </div>
    </header>
    <div class="mn-mobile-notice">鼠标操作更顺手。手机建议横屏。</div>
    <div class="mn-workspace">
      <aside class="mn-sidebar left" id="mnLeft"></aside>
      <main class="mn-stage" id="mnStage">
        <canvas class="mn-canvas" id="mnCanvas"></canvas>
        <canvas class="mn-canvas" id="mn3d"></canvas>
        <div class="mn-stage-topbar">
          <div class="mn-stage-label">
            <span class="mn-mode-badge" id="mnModeBadge">2D</span>
            <div><strong id="mnStageName">空间草图</strong><small id="mnStageSub">先让故事有个地方待着。</small></div>
          </div>
          <div class="mn-stage-controls">
            <div class="mn-material-balls" id="mnMaterials">
              <button class="mn-material-ball original active" data-mat="original" title="原图"><i></i></button>
              <button class="mn-material-ball random" data-mat="random" title="随机"><i></i></button>
              <button class="mn-material-ball depth" data-mat="depth" title="深度"><i></i></button>
            </div>
            <button class="mn-icon-btn" id="mnUndo" title="撤销">${icon('undo-2')}</button>
            <button class="mn-icon-btn" id="mnRedo" title="重做">${icon('redo-2')}</button>
            <span class="mn-ctl-div"></span>
            <button class="mn-icon-btn" id="mnMaximize" title="最大化">${icon('maximize')}</button>
          </div>
        </div>
        <div class="mn-floating-tools" id="mnFloatTools"></div>
        <div class="mn-canvas-hint" id="mnHint"></div>
        <div class="mn-view-controls" id="mnViewCtl"></div>
      </main>
      <aside class="mn-sidebar right" id="mnRight"></aside>
    </div>
    <section class="mn-shotstrip" id="mnShotStrip"></section>`;
  root.appendChild(app);
  bindShell();
  buildFloatTools();
  buildViewCtl();
}

function bindShell() {
  $('#mnBtnKeys').onclick = () => openKeysModal();
  $('#mnBtnHelp').onclick = () => openHelpModal();
  $('#mnBtnTheme').onclick = () => toggleTheme();
  $('#mnBtnRise').onclick = () => toggleRise();
  $('#mnStep1').onclick = () => { };
  $('#mnStep2').onclick = () => enterFindShot();
  $('#mnToStory').onclick = () => openStoryboard();
  $('#mnBackHome').onclick = () => { if (window.__mnExit) window.__mnExit(); else if (window.goto) window.goto('chat'); };
  $('#mnUndo').onclick = undo;
  $('#mnRedo').onclick = redo;
  $('#mnMaximize').onclick = () => toggleImmersive();
  $$('#mnMaterials .mn-material-ball').forEach(b => b.onclick = () => {
    $$('#mnMaterials .mn-material-ball').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if (MN.state) { MN.state.view.material = b.dataset.mat; saveSoon(); }
    toast('材质：' + (b.dataset.mat === 'original' ? '原图' : b.dataset.mat === 'random' ? '随机' : '深度') + '（3D 视图生效）');
    render3D();
  });
  const cv = $('#mnCanvas');
  cv.addEventListener('pointerdown', onPtrDown);
  cv.addEventListener('pointermove', onPtrMove);
  cv.addEventListener('pointerup', onPtrUp);
  cv.addEventListener('pointercancel', onPtrUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    /* 右键拖动 = 平移画布，松手不该弹菜单 */
    if (MN.drag && MN.drag.kind === 'rpan' && MN.drag.moved) return;
    if (MN._ctxDrag && Date.now() - MN._ctxDrag.t < 400 && MN._ctxDrag.moved) return;
    const r = cv.getBoundingClientRect();
    const w = s2w(e.clientX - r.left, e.clientY - r.top);
    if (MN.wallDraft) { MN.wallDraft = null; paint(); return; }   // 画墙画到一半，右键先取消
    const hit = hitTest(w.x, w.y);
    if (hit) {
      if (!inSel(hit.kind, hit.id)) { selectOnly(hit.kind, hit.id); refreshSel(); }
    } else if (selList().length) { clearSel(); refreshSel(); }
    openCtx(e.clientX, e.clientY, hit);
  });
  /* 双击物体 = 直接改名（不用先去右侧面板翻） */
  cv.addEventListener('dblclick', e => {
    const r = cv.getBoundingClientRect();
    const w = s2w(e.clientX - r.left, e.clientY - r.top);
    const hit = hitTest(w.x, w.y);
    if (!hit) return;
    selectOnly(hit.kind, hit.id); refreshSel(); renameSel();
  });
  const cv3 = $('#mn3d'); if (cv3) { cv3.style.display = 'none'; if (window.MN3D) { try { MN3D.ensure(cv3); } catch (e) { } } }
  /* 3D 视图里点地面直接放置（射线求交地面 → 世界 x,z） */
  if (window.MN3D) {
    window.MN3D.isPlacing = () => !!(MN.pending || MN.tool === 'person' || MN.tool === 'light');
    window.MN3D.onSelect = (kind, id) => {
      if (!kind) { clearSel(); refreshSel(); return; }
      selectOnly(kind, id); refreshSel();
    };
    /* 3D 拖动：只重绘 3D。2D 画布此时是隐藏的，paint() 里的 doPaint 纯属白烧 CPU（拖起来就卡） */
    window.MN3D.onMoveStart = () => { pushUndo(); };
    window.MN3D.onMove = () => { saveSoon(); paint3D(); };
    window.MN3D.onMoveEnd = (kind, id, dragged) => {
      /* 3D 里拖完也自动让开（只挪这一件） */
      if (dragged && (kind === 'prop' || kind === 'person')) settleOne(kind, id, false);
      saveSoon(); paint(); renderTree();
    };
    window.MN3D.onRotateStart = () => { pushUndo(); };
    window.MN3D.onRotate = () => { };
    window.MN3D.onRotateEnd = () => { refreshSel(); renderAll(); saveSoon(); toast('已旋转（Ctrl+Z 可撤销）'); };
    window.MN3D.onContext = (kind, id, x, y) => {
      if (kind) { selectOnly(kind, id); refreshSel(); }
      openCtx(x, y, kind ? { kind, id } : null);
    };
    window.MN3D.onPlace = (x, z) => {
      const px = snap(x), pz = snap(z);
      if (MN.pending) { placePending(px, pz); return; }
      if (MN.tool === 'person' || MN.tool === 'light') {
        pushUndo();
        if (MN.tool === 'person') {
          const o = { id: uid(), name: '人物 ' + (MN.state.scene.persons.length + 1), x: px, y: pz, rot: 0, color: '#2e7cf6', pose: '站立', face: 1, faceDir: 0, jump: 0 };
          MN.state.scene.persons.push(o); selectOnly('person', o.id);
        } else {
          const o = { id: uid(), name: '光源 ' + (MN.state.scene.lights.length + 1), x: px, y: pz, color: '#ffe9b0', intensity: 1, h: 2.5 };
          MN.state.scene.lights.push(o); selectOnly('light', o.id);
        }
        refreshSel(); saveSoon(); paint(); toast('已放在 3D 地面上的这个位置');
        return;
      }
      toast('先在右侧物件库点一个物件（或左侧「人物 / 光源」），再点 3D 地面放置', 'warn');
    };
  }
}

/* ---------- 3D 视图（M2） ---------- */
function render3D() { if (MN.state && MN.state.view.mode === '3d' && window.MN3D) MN3D.render(MN.state); }
function setMode(mode) {
  if (!MN.state) return;
  MN.state.view.mode = mode;
  const c2 = $('#mnCanvas'), c3 = $('#mn3d');
  if (mode === '3d') {
    if (c2) c2.style.display = 'none';
    if (c3) c3.style.display = 'block';
    const lb = document.querySelector('.mn3d-labels'); if (lb) lb.style.display = '';
    if (c3) c3.style.cursor = MN.pending || MN.tool === 'person' || MN.tool === 'light' ? 'copy' : 'default';
    $('#mnModeBadge').textContent = '3D';
    $('#mnStageName').textContent = '立体布景';
    $('#mnStageSub').textContent = '左拖转视角 · 滚轮缩放 · 右键平移 / 菜单 · 选中后拖 ↻ 旋转（Q/E 微调 15°）';
    $('#mnBtnRise').innerHTML = icon('rotate-ccw', 's14') + '躺下去';
    render3D();
  } else {
    if (c3) c3.style.display = 'none';
    if (c2) c2.style.display = 'block';
    const lb = document.querySelector('.mn3d-labels'); if (lb) lb.style.display = 'none';
    $('#mnModeBadge').textContent = '2D';
    $('#mnStageName').textContent = '空间草图';
    $('#mnStageSub').textContent = '先让故事有个地方待着。';
    $('#mnBtnRise').innerHTML = icon('cuboid', 's14') + '立起来';
    paint();
  }
  saveSoon();
}
function toggleRise() {
  if (!window.MN3D) { toast('3D 引擎没加载'); return; }
  if (!MN3D.ok) { toast('当前环境不支持 WebGL，立不起来'); return; }
  setMode(MN.state.view.mode === '3d' ? '2d' : '3d');
}
function enterFindShot() {
  if (!window.MN3D || !MN3D.ok) { toast('3D 引擎不可用，先用 2D 画好空间'); return; }
  if (MN.state.view.mode !== '3d') setMode('3d');
  MN3D.setView('oblique'); MN3D.render(MN.state);
  toast('找镜头：拖动画面转视角，调好点「立起来，再找镜头」存机位');
}

/* ---------- 左侧栏 ---------- */
const TOOLS = [
  { id: 'room', name: '画房间', sub: '划拉一个矩形', key: 'R', ico: 'square-dashed' },
  { id: 'wall', name: '画一面墙', sub: '任意两端连线，斜着也行', key: 'L', ico: 'minus' },
  { id: 'prop', name: '造物', sub: '画块方的，里面空的', key: 'B', ico: 'cuboid' },
  { id: 'hole', name: '打洞', sub: '点一格，或拖一片', key: 'H', ico: 'door-open' },
  { id: 'person', name: '人物', sub: '放个小人，演不演随它', key: 'N', ico: 'user-round' },
  { id: 'path', name: '运动轨迹', sub: '给人物画一条走位线', key: 'P', ico: 'route' },
  { id: 'sun', name: '光影调节', sub: '太阳比我有前途', key: 'O', ico: 'sun' },
  { id: 'light', name: '额外光源', sub: '有光也不一定有用', key: 'I', ico: 'lightbulb' },
  { id: 'genie', name: '仙人模式', sub: '我超威！', key: 'J', ico: 'sparkles' },
  { id: 'motion', name: '运镜录制', sub: '镜头自己走。你歇着。', key: 'M', ico: 'clapperboard' },
  { id: 'cut', name: '剪辑台', sub: '剪两刀，凑一段。', key: 'E', ico: 'scissors' },
];

function renderLeft() {
  const box = $('#mnLeft'); if (!box) return;
  const st = MN.state;
  const tplCount = TEMPLATES.length;
  box.innerHTML = `
    <section class="mn-section">
      <div class="mn-sec-head"><span>当前画布</span></div>
      <div style="display:flex;gap:6px;align-items:center">
        <select class="mn-canvas-slot" id="mnCanvasSel">${Array.from({ length: 8 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select>
        <span style="font-size:11px;color:var(--muted)">共 8 个</span>
      </div>
      <input class="mn-project-title" id="mnProjTitle" value="${esc(st.scene.title)}" maxlength="30" />
      <div class="mn-project-actions">
        <button class="mn-ghost" id="mnNew">${icon('plus', 's12')}新建</button>
        <button class="mn-ghost" id="mnImport">${icon('upload', 's12')}导入</button>
        <button class="mn-ghost" id="mnExport">${icon('download', 's12')}导出</button>
      </div>
      <button class="mn-ai-entry" id="mnAiRules">${icon('file-braces', 's14')}<strong>AI 规则</strong><span>让 AI 帮你搭</span><span class="mn-ai-entry-r">${icon('download', 's12')}</span></button>
    </section>
    <section class="mn-section" id="mnTreeSec"></section>
    <section class="mn-section">
      <div class="mn-sec-head"><span>搭建工具</span><span class="mn-sec-note">够用就行</span></div>
      <div class="mn-tool-list" id="mnToolList"></div>
    </section>
    <section class="mn-section">
      <button class="mn-tree-toggle" id="mnTplHead" style="width:100%">${icon('chevron-down')}<span>场景模板</span><span class="mn-tree-count">${tplCount}</span></button>
    </section>`;
  $('#mnCanvasSel').value = MN.canvasId;
  $('#mnCanvasSel').onchange = e => loadCanvas(e.target.value);
  $('#mnProjTitle').oninput = e => { st.scene.title = e.target.value; saveSoon(); };
  $('#mnNew').onclick = () => {
    if (!confirm('新建会清空当前画布的内容，确定吗？（可先导出备份）')) return;
    pushUndo(); MN.state = blankState('未命名画布'); MN.sel = null; renderAll(); saveSoon(); toast('已新建空白画布');
  };
  $('#mnImport').onclick = () => openImportModal();
  $('#mnExport').onclick = () => exportProject();
  $('#mnAiRules').onclick = () => openAiModal();
  $('#mnTplHead').onclick = () => openTplModal();
  renderToolList();
  renderTree();
}

function renderToolList() {
  const box = $('#mnToolList'); if (!box) return;
  box.innerHTML = '';
  TOOLS.forEach(t => {
    const b = el('button', 'mn-tool-card' + (MN.tool === t.id ? ' active' : ''));
    b.innerHTML = `<span class="mn-tool-icon">${icon(t.ico)}</span><span class="mn-tool-copy"><strong>${t.name}</strong><small>${t.sub}</small></span><kbd>${t.key}</kbd>`;
    b.onclick = () => setTool(t.id);
    box.appendChild(b);
  });
}

function setTool(id) {
  const t = TOOLS.find(x => x.id === id);
  if (t && t.soon) { toast(`🚧 「${t.name}」建设中（${t.soon}）`); return; }
  if (id === 'sun') { openSunModal(); return; }
  if (id === 'light') { openLightModal(); return; }
  if (id === 'genie') { if (window.MN3) MN3.openGenie(); return; }
  if (id === 'motion') { if (window.MN3) MN3.openMotion(); return; }
  if (id === 'cut') { if (window.MN3) MN3.openCut(); return; }
  MN.tool = id; MN.wallDraft = null; MN.pending = null; MN.pathDraft = null;
  renderToolList(); buildFloatTools(); paint();
  const hints = { select: '点选 · 拖动移动 · 右键删除 · 空白拖动框选', room: '按住拖矩形 · 松手就是一间 · 接着画', wall: '点两下连线 · 斜着也行 · Esc 取消', prop: '拖一个矩形 · 块方的，里面空的', hole: '点一下墙 · 开出个门洞', person: '点一下 · 放个小人', pan: '拖着看 · 松手停' };
  $('#mnHint').innerHTML = `${icon('mouse-pointer-2', 's14')}<span>${hints[id] || ''}</span>`;
}

/* ---------- 光影 / 额外光源（M2） ---------- */
function openSunModal() {
  const sun = MN.state.sun || (MN.state.sun = { on: true, dir: 300, alt: 53 });
  const body = `<p class="mn-help-para">拖动调太阳方向和高低，3D 里实时出光影。影响 3D 视图与截图。</p>
    <label class="mn-field"><span>方向 <b id="mnSunDirV">${Math.round(sun.dir)}°</b></span>
      <input type="range" id="mnSunDir" min="0" max="360" value="${Math.round(sun.dir)}" /></label>
    <label class="mn-field"><span>高度 <b id="mnSunAltV">${Math.round(sun.alt)}°</b></span>
      <input type="range" id="mnSunAlt" min="5" max="89" value="${Math.round(sun.alt)}" /></label>
    <label class="mn-check"><input type="checkbox" id="mnSunOn" ${sun.on !== false ? 'checked' : ''} /><span>太阳开</span></label>`;
  const m = openModal('光影调节', '导演台', body, [{ label: '完成', primary: true }]);
  const apply = () => {
    const d = +$('#mnSunDir', m).value, a = +$('#mnSunAlt', m).value;
    $('#mnSunDirV', m).textContent = d + '°'; $('#mnSunAltV', m).textContent = a + '°';
    MN.state.sun.dir = d; MN.state.sun.alt = a; MN.state.sun.on = $('#mnSunOn', m).checked;
    saveSoon(); render3D();
  };
  $('#mnSunDir', m).oninput = apply; $('#mnSunAlt', m).oninput = apply; $('#mnSunOn', m).onchange = apply;
}
function computeBoundsCenter() {
  const sc = MN.state.scene; let minX = 0, maxX = 14, minZ = 0, maxZ = 14;
  const acc = (x0, z0, x1, z1) => { minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1); };
  sc.rooms.forEach(r => acc(r.x, r.y, r.x + r.w, r.y + r.d));
  sc.walls.forEach(w => acc(Math.min(w.x1, w.x2), Math.min(w.y1, w.y2), Math.max(w.x1, w.x2), Math.max(w.y1, w.y2)));
  if (maxX - minX < 2) maxX = minX + 2; if (maxZ - minZ < 2) maxZ = minZ + 2;
  return { x: (minX + maxX) / 2, y: (minZ + maxZ) / 2 };
}
function openLightModal() {
  const sc = MN.state.scene;
  const m = openModal('额外光源', '导演台', '', [{ label: '完成', primary: true }]);
  const body0 = `<p class="mn-help-para">额外光源会在 3D 里发光并照亮周围（最多 4 个）。位置落在场景中心，高度 2.5。</p>
    <div id="mnLightList"></div>
    <button class="btn btn-primary btn-sm" id="mnLightAdd">＋ 加一个光源</button>`;
  $('.mn-modal-body', m).innerHTML = body0;
  const refresh = () => {
    const list = (sc.lights || []).map((l, i) => `<div class="mn-light-row">
      <span class="mn-dot" style="background:${esc(l.color || '#ffe9b0')}"></span>
      <input type="color" class="mn-light-col" data-li="${i}" value="${esc(l.color || '#ffe9b0')}" title="颜色" />
      <input type="range" class="mn-light-int" data-li="${i}" min="0.2" max="3" step="0.1" value="${l.intensity != null ? l.intensity : 1}" title="强度" />
      <button class="mn-ghost" data-del="${i}">${icon('trash-2', 's12')}</button></div>`).join('') || '<p class="mn-help-para">还没有额外光源，点下面加一个。</p>';
    $('#mnLightList', m).innerHTML = list;
    $$('[data-li]', m).forEach(e => e.oninput = () => { const i = +e.dataset.li; if (e.type === 'color') sc.lights[i].color = e.value; else sc.lights[i].intensity = +e.value; saveSoon(); render3D(); renderTree(); });
    $$('[data-del]', m).forEach(b => b.onclick = () => { sc.lights.splice(+b.dataset.del, 1); saveSoon(); render3D(); renderTree(); refresh(); });
  };
  refresh();
  $('#mnLightAdd', m).onclick = () => {
    const b = computeBoundsCenter();
    sc.lights = sc.lights || [];
    sc.lights.push({ id: uid(), x: b.x, y: b.y, color: '#ffe9b0', intensity: 1, h: 2.5 });
    saveSoon(); render3D(); renderTree(); refresh();
  };
}

/* ---------- 场景清单 ---------- */
const treeOpen = { 场景: true, 人物: true, 光源: true, 造物: true };
let treeQuery = '';
function renderTree() {
  const sec = $('#mnTreeSec'); if (!sec) return;
  const sc = MN.state.scene;
  const q = treeQuery.trim();
  const match = n => !q || (n || '').includes(q);
  const groups = [
    { key: '场景', items: [...sc.rooms.map(o => ({ ...o, _k: 'room' })), ...sc.walls.map(o => ({ ...o, _k: 'wall' }))] },
    { key: '人物', items: sc.persons.map(o => ({ ...o, _k: 'person' })) },
    { key: '光源', items: sc.lights.map(o => ({ ...o, _k: 'light' })) },
    { key: '造物', items: sc.props.map(o => ({ ...o, _k: 'prop' })) },
  ];
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  let html = `<div class="mn-tree-head">
      <button class="mn-tree-toggle ${treeOpen.all ? '' : 'closed'}" id="mnTreeAll">${icon('chevron-down')}场景清单<span class="mn-tree-count">${total}</span></button>
      <button class="mn-tree-act" id="mnTreeAdd" title="新建分组">${icon('folder-plus', 's14')}</button>
    </div>
    <label class="mn-search">${icon('search', 's14')}<input id="mnTreeSearch" placeholder="搜索物体" value="${esc(q)}" /><kbd class="mn-kbd">Ctrl + K</kbd></label>
    <div class="mn-obj-list">`;
  groups.forEach(g => {
    const items = g.items.filter(o => match(o.name));
    if (q && !items.length) return;
    const open = q ? true : treeOpen[g.key] !== false;
    html += `<div class="mn-tree-group"><div class="mn-tree-row">
        <button class="mn-grip" title="拖动排序">${icon('grip-vertical', 's14')}</button>
        <button class="mn-folder-chev ${open ? '' : 'closed'}" data-folder="${g.key}">${icon('chevron-down', 's14')}</button>
        <button class="mn-obj-name" data-folder-label="${g.key}">${icon('folder', 's14')}<span>${g.key}</span></button>
        <span class="mn-row-acts">
          <button class="mn-row-act" data-folder-eye="${g.key}" title="显隐">${icon('eye', 's14')}</button>
          <button class="mn-row-act danger" data-folder-del="${g.key}" title="删除整组">${icon('trash-2', 's14')}</button>
        </span></div>`;
    if (open) html += `<div class="mn-tree-kids">` + items.map(o => {
      const sel = MN.sel && MN.sel.kind === o._k && MN.sel.id === o.id;
      const dot = o._k === 'person' ? (o.color || '#2e7cf6') : o._k === 'prop' ? (o.color || '#d9b382') : o._k === 'light' ? '#f5b301' : o._k === 'room' ? '#9db4c0' : '#5b564e';
      return `<div class="mn-tree-row ${sel ? 'sel' : ''}" data-obj="${o._k}:${o.id}" style="${o.hidden ? 'opacity:.45' : ''}">
        <button class="mn-grip">${icon('grip-vertical', 's14')}</button>
        <button class="mn-obj-name"><span class="mn-obj-dot" style="background:${dot}"></span><span>${esc(o.name || '未命名')}</span></button>
        <span class="mn-row-acts">
          <button class="mn-row-act" data-eye="${o._k}:${o.id}" title="显隐">${icon(o.hidden ? 'eye-off' : 'eye', 's14')}</button>
          <button class="mn-row-act danger" data-del="${o._k}:${o.id}" title="删除">${icon('trash-2', 's14')}</button>
        </span></div>`;
    }).join('') + `</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  sec.innerHTML = html;

  $('#mnTreeSearch').oninput = e => {
    /* 保留光标位置：整块重绘后 focus() 会把光标甩到末尾，中文输入中间改字很难受 */
    const pos = e.target.selectionStart;
    treeQuery = e.target.value;
    renderTree();
    const s2 = $('#mnTreeSearch');
    if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) { } }
  };
  $('#mnTreeAll').onclick = () => { treeOpen.all = !treeOpen.all; renderTree(); };
  $('#mnTreeAdd').onclick = () => toast('🚧 自定义分组建设中');
  $$('[data-folder]', sec).forEach(b => b.onclick = () => { treeOpen[b.dataset.folder] = !(treeOpen[b.dataset.folder] !== false); renderTree(); });
  $$('[data-folder-label]', sec).forEach(b => b.onclick = () => { treeOpen[b.dataset.folderLabel] = !(treeOpen[b.dataset.folderLabel] !== false); renderTree(); });
  $$('[data-folder-eye]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.folderEye; toggleGroupVis(k); });
  $$('[data-folder-del]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.folderDel; if (confirm(`删除整组「${k}」？`)) delGroup(k); });
  $$('[data-obj]', sec).forEach(r => r.onclick = e => {
    if (e.target.closest('[data-eye]') || e.target.closest('[data-del]')) return;
    const [kind, id] = r.dataset.obj.split(':');
    if (e.shiftKey) toggleSel(kind, id); else selectOnly(kind, id);
    renderTree(); renderRight(); paint();
  });
  $$('[data-eye]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const [kind, id] = b.dataset.eye.split(':'); const o = findObj(kind, id); if (o) { o.hidden = !o.hidden; renderTree(); paint(); saveSoon(); } });
  $$('[data-del]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const [kind, id] = b.dataset.del.split(':'); pushUndo(); delObj(kind, id); MN.selList = selList().filter(s => !(s.kind === kind && s.id === id)); if (MN.sel && MN.sel.id === id) MN.sel = MN.selList[MN.selList.length - 1] || null; renderAll(); saveSoon(); });
}

function toggleGroupVis(key) {
  const sc = MN.state.scene;
  const arr = key === '场景' ? [...sc.rooms, ...sc.walls] : key === '人物' ? sc.persons : key === '光源' ? sc.lights : sc.props;
  const anyShow = arr.some(o => !o.hidden);
  arr.forEach(o => o.hidden = anyShow);
  renderTree(); paint(); saveSoon();
}
function delGroup(key) {
  pushUndo();
  const sc = MN.state.scene;
  if (key === '场景') { sc.rooms = []; sc.walls = []; }
  else if (key === '人物') sc.persons = [];
  else if (key === '光源') sc.lights = [];
  else sc.props = [];
  MN.sel = null; renderAll(); saveSoon();
}
function findObj(kind, id) {
  const sc = MN.state.scene;
  const arr = kind === 'room' ? sc.rooms : kind === 'wall' ? sc.walls : kind === 'prop' ? sc.props : kind === 'person' ? sc.persons : sc.lights;
  return arr.find(o => o.id === id);
}
function delObj(kind, id) {
  const sc = MN.state.scene;
  if (kind === 'room') sc.rooms = sc.rooms.filter(o => o.id !== id);
  else if (kind === 'wall') sc.walls = sc.walls.filter(o => o.id !== id);
  else if (kind === 'prop') sc.props = sc.props.filter(o => o.id !== id);
  else if (kind === 'person') sc.persons = sc.persons.filter(o => o.id !== id);
  else sc.lights = sc.lights.filter(o => o.id !== id);
  if (MN.sel && MN.sel.id === id) MN.sel = null;
}

/* ---------- 浮动工具 & 视图控制 ---------- */
const FLOAT_TOOLS = [
  { id: 'select', ico: 'mouse-pointer-2', t: '选择' },
  { id: 'room', ico: 'square-dashed', t: '画房间' },
  { id: 'wall', ico: 'minus', t: '画墙' },
  { id: 'prop', ico: 'cuboid', t: '造物' },
  { id: 'hole', ico: 'door-open', t: '打洞' },
  { id: 'person', ico: 'user-round', t: '人物' },
  { id: 'pan', ico: 'hand', t: '平移' },
];
function buildFloatTools() {
  const box = $('#mnFloatTools'); if (!box) return;
  box.innerHTML = '';
  FLOAT_TOOLS.forEach(t => {
    const b = el('button', 'mn-icon-btn' + (MN.tool === t.id ? ' active' : ''));
    b.innerHTML = icon(t.ico); b.title = t.t;
    b.onclick = () => setTool(t.id);
    box.appendChild(b);
  });
}
function buildViewCtl() {
  const box = $('#mnViewCtl'); if (!box) return;
  box.innerHTML = `
    <button class="mn-vc active" data-view="top">俯视</button>
    <button class="mn-vc" data-view="oblique">斜视</button>
    <button class="mn-vc" data-view="front">正视</button>
    <button class="mn-vc icon" id="mnZoomOut" title="缩小">${icon('minus', 's12')}</button>
    <button class="mn-vc icon" id="mnZoomIn" title="放大">${icon('plus', 's12')}</button>
    <button class="mn-vc ${MN.grid ? 'active' : ''}" id="mnGridBtn">${icon('grid-2x2', 's12')}隐藏网格</button>
    <button class="mn-vc" id="mnFloorBtn">${icon('paintbrush', 's12')}地面上色</button>
    <button class="mn-vc" id="mnFullBtn">${icon('maximize', 's12')}工作台全屏</button>
    <button class="mn-vc" id="mnHideUi">${icon('eye-off', 's12')}隐藏界面</button>`;
  $$('[data-view]', box).forEach(b => b.onclick = () => {
    const v = b.dataset.view;
    $$('[data-view]', box).forEach(x => x.classList.remove('active')); b.classList.add('active');
    if (MN.state.view.mode !== '3d') {
      if (v === 'top') { toast('当前就是俯视（2D 平面）'); return; }
      setMode('3d');
    }
    MN3D.setView(v); MN3D.render(MN.state);
  });
  $('#mnZoomIn').onclick = () => zoomBy(1.25);
  $('#mnZoomOut').onclick = () => zoomBy(0.8);
  $('#mnGridBtn').onclick = () => { MN.grid = !MN.grid; $('#mnGridBtn').classList.toggle('active', MN.grid); if (MN.state) { MN.state.view.grid = MN.grid; saveSoon(); } paint(); };
  $('#mnFloorBtn').onclick = () => { if (MN.state) { MN.state.view.floorColor = !MN.state.view.floorColor; paint(); saveSoon(); render3D(); toast(MN.state.view.floorColor ? '房间已上色' : '房间改成线框'); } };
  $('#mnFullBtn').onclick = () => toggleImmersive();
  $('#mnHideUi').onclick = () => toggleImmersive();
}
function zoomBy(f) {
  const cv = $('#mnCanvas');
  const r = cv.getBoundingClientRect();
  const cx = r.width / 2, cy = r.height / 2;
  const w = s2w(cx, cy);
  MN.view.k = clamp(MN.view.k * f, 0.3, 3);
  MN.view.x = cx - w.x * CELL * MN.view.k;
  MN.view.y = cy - w.y * CELL * MN.view.k;
  if (MN.state) { MN.state.view.zoom = MN.view.k; MN.state.view.x = MN.view.x; MN.state.view.y = MN.view.y; saveSoon(); }
  paint();
}
function toggleImmersive() {
  MN.immersive = !MN.immersive;
  const app = $('.mn-app');
  app.style.display = MN.immersive ? 'block' : '';
  $('#mnStage').style.position = MN.immersive ? 'fixed' : '';
  $('#mnStage').style.inset = MN.immersive ? '0' : '';
  $('#mnStage').style.zIndex = MN.immersive ? '500' : '';
  if (MN.immersive) {
    const bar = el('div', 'mn-view-controls');
    bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:600;justify-content:center';
    bar.innerHTML = `<button class="mn-vc" id="mnExitFull">${icon('minimize', 's12')}退出全屏</button>`;
    $('.mn-app').appendChild(bar);
    $('#mnExitFull').onclick = toggleImmersive;
    resizeCanvas();
  } else {
    const bar = $('#mnExitFull'); if (bar) bar.parentElement.remove();
    $('#mnStage').style.cssText = '';
    resizeCanvas();
  }
  paint();
}

/* ---------- 右侧栏 ---------- */
const ROOM_COLORS = ['', '#f3e9d8', '#e8eef3', '#eaf0e6', '#f5e6e4', '#efe8f2'];
const PROP_COLORS = ['#d9b382', '#c98d6b', '#8a9b8e', '#7d8ca3', '#b8b0a4', '#a3b8c9', '#d4a5a5', '#c9b8d4'];
const PERSON_COLORS = ['#2e7cf6', '#ffffff', '#f5b301', '#e33e3e', '#c98d6b', '#8a9b8e', '#7d8ca3', '#2b2c2f', '#76716b', '#3c6e9e', '#5b8c5a', '#b0aaa1'];
const GROUND_COLORS = ['#ffffff', '#f1ece3', '#e3e5e7', '#d9d2c5', '#c4cdd6', '#b8c9b8', '#e8d5c0', '#d4c4b0', '#9aa5b1', '#5b564e'];

function renderRight() {
  const box = $('#mnRight'); if (!box) return;
  const tab = MN._tab || 'obj';
  const c = MN.state.camera;
  let body = '';
  if (tab === 'obj') body = renderObjPanel();
  else if (tab === 'sun') body = renderSunPanel();
  else body = renderGroundPanel();
  box.innerHTML = `
    <div class="mn-quickadd">
      <button class="mn-chip" data-quick="person">＋ 人物</button>
      <button class="mn-chip" data-quick="light">＋ 光源</button>
      <button class="mn-chip" data-quick="lib">物件库</button>
    </div>
    <div class="mn-panel-tabs">
      <button class="${tab === 'obj' ? 'active' : ''}" data-tab="obj">物体</button>
      <button class="${tab === 'sun' ? 'active' : ''}" data-tab="sun">光影</button>
      <button class="${tab === 'grd' ? 'active' : ''}" data-tab="grd">地面</button>
    </div>
    ${body}
    <section class="mn-section">
      <div class="mn-sec-head"><span>镜头设置</span>${icon('camera', 's14')}</div>
      <label class="mn-field"><span>镜头尺寸</span>
        <select id="mnCamSize">${['16:9', '21:9', '3:4', '4:3', '9:16', '1:1'].map(s => `<option ${c.size === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </label>
      <label class="mn-check"><input type="checkbox" id="mnCamFrame" ${c.frame ? 'checked' : ''} /><span>显示取景框<small>按中央 16:9 区域导出</small></span></label>
      <label class="mn-check"><input type="checkbox" id="mnCamCut" ${c.cutaway ? 'checked' : ''} /><span>剖开前方外墙<small>看清室内，方便找机位</small></span></label>
      <label class="mn-check"><input type="checkbox" id="mnCamCeil" ${c.ceil ? 'checked' : ''} /><span>封顶<small>按最低墙高封顶 · 可上色、打洞</small></span></label>
      <label class="mn-field"><span>镜头视角<strong>${c.fov}°</strong></span><input type="range" class="mn-range" id="mnCamFov" min="15" max="90" value="${c.fov}" /></label>
    </section>
    <div class="mn-tips">
      <span class="mn-eyebrow">导演，随意点。</span>
      <h3>像那么回事就行。</h3>
      <p>这是镜头草图。细节先欠着。</p>
    </div>
    <div class="mn-sc-row"><span>平移画布</span><kbd class="mn-kbd">空格 + 拖动</kbd></div>
    <div class="mn-sc-row" style="margin-bottom:14px"><span>反悔</span><kbd class="mn-kbd">Ctrl + Z</kbd></div>`;
  $$('[data-tab]', box).forEach(b => b.onclick = () => { MN._tab = b.dataset.tab; renderRight(); });
  /* 常驻快捷按钮：不用先取消选中也能直接放人物/光源、回物件库 */
  $$('[data-quick]', box).forEach(b => b.onclick = () => {
    const q = b.dataset.quick;
    if (q === 'lib') { MN.pending = null; clearSel(); refreshSel(); return; }
    MN.pending = { kind: q, preset: { name: q === 'person' ? '人物' : '光源', w: 0.9, d: 0.9, color: '' } };
    clearSel(); refreshSel();
    toast(q === 'person' ? '在画布上点一下放人物（可连点）' : '在画布上点一下放光源（可连点）');
  });
  const cam = MN.state.camera;
  $('#mnCamSize').onchange = e => { cam.size = e.target.value; saveSoon(); };
  $('#mnCamFrame').onchange = e => { cam.frame = e.target.checked; paint(); saveSoon(); };
  $('#mnCamCut').onchange = e => { cam.cutaway = e.target.checked; saveSoon(); };
  $('#mnCamCeil').onchange = e => { cam.ceil = e.target.checked; saveSoon(); };
  $('#mnCamFov').oninput = e => { cam.fov = +e.target.value; e.target.previousElementSibling.querySelector('strong').textContent = cam.fov + '°'; saveSoon(); };
  bindObjPanel(body);
  bindLibrary();
}

/* 物件库预设：直接吃道具库 mn-props.js 的全部种类，每类一个精细模型 */
const PRESETS = (window.MN_PROP_ORDER || []).map(k => {
  const K = window.MN_PROP_KINDS[k] || {};
  return { kind: k, name: K.name || k, w: K.w || 1, d: K.d || 1, h: K.h || 1, color: K.color || '#d9b382' };
});

function renderObjPanel() {
  const sel = MN.sel && findObj(MN.sel.kind, MN.sel.id) ? MN.sel : null;
  if (!sel) return renderLibrary();
  const o = findObj(sel.kind, sel.id);
  const head = `<div class="mn-prop-head"><strong>${esc(o.name || '未命名')}</strong>
    <button class="mn-ghost" data-act="hide">${icon('eye-off', 's12')}隐藏</button>
    <button class="mn-ghost" data-act="del" style="color:var(--accent)">${icon('trash-2', 's12')}</button></div>`;
  const swatches = (arr, cur, attr) => `<div class="mn-swatches">${arr.map(c => `<button class="mn-swatch ${c === (cur || '') ? 'active' : ''}" style="background:${c || 'var(--soft)'}" data-sw="${attr}" data-c="${c || ''}"></button>`).join('')}</div>`;
  if (sel.kind === 'room') return `<section class="mn-prop">${head}
    <label class="mn-field"><span>名称</span><input type="text" data-f="name" value="${esc(o.name)}" /></label>
    <div class="mn-num3">
      <label class="mn-field"><span>宽 X</span><input type="number" step="0.5" data-f="w" value="${o.w}" /></label>
      <label class="mn-field"><span>深 Y</span><input type="number" step="0.5" data-f="d" value="${o.d}" /></label>
      <label class="mn-field"><span>高度</span><input type="number" step="0.5" data-f="h" value="${o.h}" /></label>
    </div>
    <label class="mn-field"><span>地板颜色</span></label>${swatches(ROOM_COLORS, o.color, 'color')}
  </section>`;
  if (sel.kind === 'wall') return `<section class="mn-prop">${head}
    <label class="mn-field"><span>名称</span><input type="text" data-f="name" value="${esc(o.name)}" /></label>
    <div class="mn-num3">
      <label class="mn-field"><span>墙高</span><input type="number" step="0.1" data-f="h" value="${o.h}" /></label>
      <label class="mn-field"><span>厚度</span><input type="number" step="0.1" data-f="th" value="${o.th || 0.2}" /></label>
    </div>
    <div class="mn-chip-row"><span style="font-size:12.5px;color:var(--muted)">门洞 ${(o.holes || []).length} 个</span>
      <button class="mn-chip" data-act="addhole">${icon('plus', 's12')}墙上加洞</button></div>
  </section>`;
  if (sel.kind === 'prop') return `<section class="mn-prop">${head}
    <label class="mn-field"><span>名称</span><input type="text" data-f="name" value="${esc(o.name)}" /></label>
    <div class="mn-num3">
      <label class="mn-field"><span>宽 X</span><input type="number" step="0.5" data-f="w" value="${o.w}" /></label>
      <label class="mn-field"><span>深 Y</span><input type="number" step="0.5" data-f="d" value="${o.d}" /></label>
      <label class="mn-field"><span>高 Z</span><input type="number" step="0.5" data-f="h" value="${o.h}" /></label>
    </div>
    <div class="mn-num3">
      <label class="mn-field"><span>旋转 Z</span><input type="number" step="15" data-f="rot" value="${o.rot || 0}" /></label>
      <label class="mn-field"><span>模型</span><input type="text" value="${(window.MN_PROP_KINDS[o.kind] || {}).name || o.kind || '方块'}" disabled /></label>
    </div>
    <label class="mn-field"><span>颜色</span></label>${swatches(PROP_COLORS, o.color, 'color')}
    <div class="mn-chip-row"><button class="mn-chip" data-act="autolayout" title="把重叠的家具/人物排开，墙和房间不动">${icon('sparkles', 's12')}自动摆好</button></div>
  </section>`;
  if (sel.kind === 'person') return `<section class="mn-prop">${head}
    <div class="mn-chip-row">
      <button class="mn-chip" data-act="copy">${icon('copy', 's12')}复制</button>
      <button class="mn-chip" data-act="paste">${icon('clipboard-paste', 's12')}粘贴</button>
      <button class="mn-chip active" data-act="move">${icon('move-3d', 's12')}移动</button>
      <button class="mn-chip" data-act="rotate">${icon('rotate-3d', 's12')}旋转</button>
      <button class="mn-chip" data-act="scale">${icon('scan-line', 's12')}缩放</button>
      <button class="mn-chip" data-act="autolayout" title="把重叠的家具/人物排开">${icon('sparkles', 's12')}自动摆好</button>
    </div>
    <label class="mn-field"><span>人物名称</span><input type="text" data-f="name" value="${esc(o.name || '')}" placeholder="给这个角色起个名字（3D 里显示在头顶）" /></label>
    <label class="mn-field"><span>人物姿态</span>
      <select data-f="pose">${['站立', '走路', '坐下', '招手', '躺下', '运动'].map(p => `<option ${o.pose === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    </label>
    <label class="mn-field"><span>人脸大小<strong>${o.face || 1} 倍</strong></span><input type="range" class="mn-range" data-f="face" min="0.5" max="2" step="0.1" value="${o.face || 1}" /></label>
    <label class="mn-field"><span>人物颜色</span></label>${swatches(PERSON_COLORS, o.color, 'color')}
    <label class="mn-field mn-color-row"><span>人物颜色 <b class="mn-color-now" style="background:${o.color || '#2e7cf6'}"></b><code>${esc(o.color || '#2e7cf6')}</code></span><input type="color" class="mn-color" data-f="color" value="${o.color || '#2e7cf6'}" /></label>
    ${((MN.state.scene && MN.state.scene.persons) || []).some(p => p.id !== o.id && p.name === o.name) ? `<div class="mn-chip-row"><button class="mn-chip" data-act="samecolor">${icon('users', 's12')}同名角色一起换</button></div>` : ''}
    <label class="mn-field"><span>运动轨迹<strong>${(o.path || []).length ? `${o.path.length} 点 · ${pathLen(o.path).toFixed(1)}m` : '未画'}</strong></span></label>
    <div class="mn-chip-row">
      <button class="mn-chip" data-act="drawpath">${icon('route', 's12')}画轨迹</button>
      <button class="mn-chip" data-act="routepath" title="让这条走位线绕开家具和墙">${icon('route', 's12')}绕开家具</button>
      <button class="mn-chip" data-act="clearpath">${icon('eraser', 's12')}清除</button>
    </div>
    ${(o.path || []).length ? `<label class="mn-field"><span>行走速度<strong>${o.speed || 1.2} m/s</strong></span><input type="range" class="mn-range" data-f="speed" min="0.3" max="4" step="0.1" value="${o.speed || 1.2}" /></label>` : ''}
    <div class="mn-num3">
      <label class="mn-field"><span>位置 X</span><input type="number" step="0.5" data-f="x" value="${o.x}" /></label>
      <label class="mn-field"><span>位置 Y</span><input type="number" step="0.5" data-f="y" value="${o.y}" /></label>
      <label class="mn-field"><span>旋转 Z</span><input type="number" step="15" data-f="rot" value="${o.rot || 0}" /></label>
    </div>
    <label class="mn-field"><span>人脸朝向<strong>${o.faceDir || 0}°</strong></span><input type="range" class="mn-range" data-f="faceDir" min="0" max="360" step="15" value="${o.faceDir || 0}" /></label>
    <label class="mn-field"><span>跳跃高度<strong>${o.jump || 0}</strong></span><input type="range" class="mn-range" data-f="jump" min="0" max="3" step="0.1" value="${o.jump || 0}" /></label>
  </section>`;
  /* light */
  return `<section class="mn-prop">${head}
    <label class="mn-field"><span>名称</span><input type="text" data-f="name" value="${esc(o.name)}" /></label>
    <div class="mn-num3">
      <label class="mn-field"><span>位置 X</span><input type="number" step="0.5" data-f="x" value="${o.x}" /></label>
      <label class="mn-field"><span>位置 Y</span><input type="number" step="0.5" data-f="y" value="${o.y}" /></label>
      <label class="mn-field"><span>高度 Z</span><input type="number" step="0.5" data-f="z" value="${o.z || 2.5}" /></label>
    </div>
    <label class="mn-field"><span>强度<strong>${o.intensity || 1}</strong></span><input type="range" class="mn-range" data-f="intensity" min="0.2" max="3" step="0.1" value="${o.intensity || 1}" /></label>
    <label class="mn-field"><span>颜色</span></label>${swatches(['#ffe9b0', '#ffffff', '#ffd6a0', '#cfe4ff', '#ffc9c9', '#d4ffd4'], o.color, 'color')}
  </section>`;
}

/* 没选中东西时显示物件库（原来这里只有一句「点一下，改一点」，白瞎一块面板） */
function renderLibrary() {
  const pend = MN.pending;
  const pendName = pend ? (pend.preset && pend.preset.name) || (pend.kind === 'person' ? '人物' : '光源') : '';
  const n = selList().length;
  return `<section class="mn-prop">
    <div class="mn-lib-head"><strong>物件库</strong><span>点一下 → 画布上点一下落地</span>
      <button class="mn-linkbtn" data-act="autolayout" title="把重叠的家具/人物排开">🧹 自动摆好</button></div>
    ${pend ? `<div class="mn-lib-pending">正在放 <b>${esc(pendName)}</b> · 连着点就连续放 · <button class="mn-linkbtn" data-libcancel>退出</button></div>` : ''}
    ${n > 1 ? `<div class="mn-lib-pending">已选 <b>${n}</b> 个 · Del 一起删 · 方向键一起挪</div>` : ''}
    <div class="mn-lib-grid">
      ${PRESETS.map((p, i) => `<button class="mn-lib-item ${pend && pend.preset && pend.preset.name === p.name ? 'active' : ''}" data-preset="${i}">
        <i style="background:${p.color}"></i><span>${p.name}</span><small>${p.w}×${p.d}</small></button>`).join('')}
    </div>
    <div class="mn-lib-row">
      <button class="mn-chip" data-preset-kind="person">${icon('user-round', 's12')}人物</button>
      <button class="mn-chip" data-preset-kind="light">${icon('lightbulb', 's12')}光源</button>
    </div>
    <p class="mn-help-para" style="margin-top:10px">选中后：<b>右键</b>删除 / 复制 / 改名 · 拖动移动 · 方向键微调（Shift 更细）· 空白处拖动框选</p>
  </section>`;
}
function bindLibrary() {
  const root = $('#mnRight'); if (!root) return;
  $$('[data-preset]', root).forEach(b => b.onclick = () => {
    const p = PRESETS[+b.dataset.preset];
    MN.pending = { kind: 'prop', preset: p };
    MN.tool = 'select'; renderToolList(); buildFloatTools();
    renderRight(); paint();
    toast('点画布放「' + p.name + '」· 连续点连续放 · Esc 退出');
  });
  $$('[data-preset-kind]', root).forEach(b => b.onclick = () => {
    const kind = b.dataset.presetKind;
    MN.pending = { kind, preset: { name: kind === 'person' ? '人物' : '光源', w: 0.9, d: 0.9, color: '' } };
    MN.tool = 'select'; renderToolList(); buildFloatTools();
    renderRight(); paint();
    toast('点画布放一个' + (kind === 'person' ? '人物' : '光源') + ' · Esc 退出');
  });
  const c = $('[data-libcancel]', root); if (c) c.onclick = () => { MN.pending = null; renderRight(); paint(); };
  const al = $('[data-act="autolayout"]', root); if (al) al.onclick = () => autoLayout();
}

function bindObjPanel() {
  const box = $('#mnRight'); if (!box || !MN.sel) return;
  const o = findObj(MN.sel.kind, MN.sel.id); if (!o) return;
  $$('[data-f]', box).forEach(inp => {
    const f = inp.dataset.f;
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      let v = inp.type === 'number' || inp.type === 'range' ? +inp.value : inp.value;
      if (f === 'name') v = String(v).slice(0, 20);
      o[f] = v;
      if (f === 'range' && inp.previousElementSibling) { const s = inp.previousElementSibling.querySelector('strong'); if (s) s.textContent = (f === 'fov' ? '' : '') + v + (f === 'faceDir' ? '°' : f === 'face' ? ' 倍' : f === 'jump' ? '' : f === 'intensity' ? '' : ''); }
      renderTree(); paint(); saveSoon();
      /* 换色时把「当前色」色块也刷一下（不然面板上还是旧颜色，看着像没生效） */
      if (f === 'color') {
        const chip = box.querySelector('.mn-color-now');
        if (chip) chip.style.background = String(v);
        const code = chip && chip.nextElementSibling;
        if (code && code.tagName === 'CODE') code.textContent = String(v);
      }
    });
  });
  $$('[data-sw]', box).forEach(b => b.onclick = () => {
    o[b.dataset.sw] = b.dataset.c;
    renderRight(); paint(); saveSoon();
  });
  $$('[data-act]', box).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'del') { delSel(); }
    else if (a === 'hide') { hideSel(); }
    else if (a === 'drawpath') {
      MN.tool = 'path'; renderToolList(); buildFloatTools();
      MN.pathDraft = { id: o.id, pts: (o.path || []).map(p => ({ x: p.x, y: p.y })) };
      paint(); toast('在画布上逐点点击画走位线 · 右键或 Esc 结束');
    }
    else if (a === 'clearpath') {
      pushUndo(); delete o.path; renderRight(); paint(); saveSoon(); toast('已清除轨迹');
    }
    else if (a === 'routepath') {
      if (!o.path || o.path.length < 2) { toast('先画一条走位线', 'warn'); return; }
      if (!window.MN_LAYOUT) return;
      pushUndo();
      const r = window.MN_LAYOUT.routePath(MN.state.scene, o.path, {});
      if (r.changed) {
        o.path = r.pts; renderRight(); paint(); saveSoon();
        toast(`已绕开家具：${o.path.length} 个点（新增 ${r.added} 个拐点）`, 'ok');
      } else toast('这条线没有穿过任何东西');
    }
    else if (a === 'copy') { copySel(); }
    else if (a === 'paste') { pasteClip(1, 1); }
    else if (a === 'autolayout') { autoLayout(); }
    else if (a === 'samecolor') {
      /* 连戏：同一个角色出现在多个镜/多个位置时，一次把同名角色都换色 */
      const list = (MN.state.scene.persons || []).filter(p => p.name && p.name === o.name);
      pushUndo(); list.forEach(p => { p.color = o.color; });
      renderAll(); saveSoon();
      toast(`已把「${o.name}」的 ${list.length} 个角色都换成 ${o.color}`, 'ok');
    }
    else if (a === 'addhole') { pushUndo(); (o.holes = o.holes || []).push({ t: 0.5, w: 1 }); renderRight(); paint(); saveSoon(); }
    else if (['move', 'rotate', 'scale'].includes(a)) { $$('[data-act]', box).forEach(x => x.classList.remove('active')); b.classList.add('active'); toast('变换模式：' + a + '（3D 视图生效）'); }
  });
}

function renderSunPanel() {
  const s = MN.state.sun;
  return `<section class="mn-section">
    <div class="mn-sec-head"><span>光影调节</span><span class="mn-sec-note">太阳比我有前途</span></div>
    <label class="mn-check"><input type="checkbox" id="mnSunOn" ${s.on ? 'checked' : ''} /><span>显示太阳<small>关掉就是阴天，全局变暗</small></span></label>
    <label class="mn-field"><span>太阳方向<strong>${s.dir}°</strong></span><input type="range" class="mn-range" id="mnSunDir" min="0" max="360" value="${s.dir}" /></label>
    <label class="mn-field"><span>太阳高度<strong>${s.alt}°</strong></span><input type="range" class="mn-range" id="mnSunAlt" min="5" max="90" value="${s.alt}" /></label>
    <p class="mn-help-para">3D 导演视图（M2）里，太阳方向和高度会实时照亮每个房间。</p>
  </section>`;
}
function renderGroundPanel() {
  const g = MN.state.scene.ground;
  return `<section class="mn-section">
    <div class="mn-sec-head"><span>房间外地面</span>${icon('paintbrush', 's14')}</div>
    <label class="mn-field"><span>室外地面颜色</span></label>
    <div class="mn-swatches">${GROUND_COLORS.map(c => `<button class="mn-swatch ${c === g.color ? 'active' : ''}" style="background:${c}" data-g="${c}"></button>`).join('')}</div>
    <p class="mn-help-para" style="margin-top:8px">点一个颜色，外面一整片都换。</p>
    <label class="mn-check"><input type="checkbox" id="mnRoomGrid" ${g.grid ? 'checked' : ''} /><span>显示房间内网格<small>格子上色更稳</small></span></label>
  </section>`;
}

/* ---------- 底部镜头册 ---------- */
function renderShots() {
  const box = $('#mnShotStrip'); if (!box) return;
  const shots = MN.state.directorShots || [];
  box.innerHTML = `
    <div class="mn-shot-title">
      <span class="mn-eyebrow">拍都拍了</span>
      <strong>镜头册 <span>${String(shots.length).padStart(2, '0')}</span></strong>
      <small>双击看大图 · 拖动调整顺序</small>
      <div class="mn-shot-actions">
        <button class="mn-shot-act" id="mnShotDown" title="下载全部">${icon('download', 's14')}</button>
        <button class="mn-shot-act" id="mnShotUndo" title="撤销">${icon('undo-2', 's14')}</button>
        <button class="mn-shot-act" id="mnShotRedo" title="重做">${icon('redo-2', 's14')}</button>
        <button class="mn-shot-act danger" id="mnShotClear" title="全部删除">${icon('trash-2', 's14')}</button>
      </div>
    </div>
    <div class="mn-shot-list">
      <button class="mn-shot-add" id="mnShotAdd"><span class="mn-plus">${icon('plus', 's14')}</span>立起来，再找镜头</button>
      ${shots.length ? '' : `<div class="mn-shot-empty"><b>还没拍。问题不大。</b>记住机位 · 导出无界面图片</div>`}
      ${shots.map((s, i) => `<div class="mn-shot-cell">${s.image
      ? `<img class="mn-shot-img" data-shot="${i}" src="${s.image}" style="height:88px;border-radius:8px;border:1px solid var(--line);display:block;cursor:pointer" title="${esc(s.name)}（点击：3D 回到该机位 / 看大图）" />`
      : `<div class="mn-shot-img mn-shot-ph" data-shot="${i}" title="${esc(s.name)}（AI 给的机位，点击回该机位）">${icon('camera', 's18')}<b>${i + 1}</b></div>`}<button class="mn-shot-del" data-shotdel="${i}" title="删掉这个镜头">✕</button><small style="font-size:11px;color:var(--muted)">${i + 1}. ${esc(s.name)}</small></div>`).join('')}
    </div>`;
  $('#mnShotAdd').onclick = () => {
    if (!window.MN3D || !MN3D.ok) { toast('3D 引擎不可用，先在 3D 里看一眼'); return; }
    if (MN.state.view.mode !== '3d') setMode('3d');
    const img = MN3D.capture();
    if (!img) { toast('3D 还没渲染好，稍等'); return; }
    pushUndo();
    MN.state.directorShots.push({ image: img, name: '机位 ' + (MN.state.directorShots.length + 1), cam: MN3D.getCamera() });
    renderShots(); saveSoon();
    toast('已存一个镜头到镜头册');
  };
  $$('.mn-shot-img', box).forEach(img => img.onclick = () => { const s = (MN.state.directorShots || [])[+img.dataset.shot]; if (s) onShotClick(s); });
  $$('[data-shotdel]', box).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const i = +b.dataset.shotdel;
    pushUndo();
    MN.state.directorShots.splice(i, 1);
    renderShots(); saveSoon();
    toast('删了这个镜头');
  });
  $('#mnShotDown').onclick = () => shots.length ? downloadShots() : toast('镜头册还是空的');
  $('#mnShotUndo').onclick = undo;
  $('#mnShotRedo').onclick = redo;
  $('#mnShotClear').onclick = () => { if (!shots.length) return; if (!confirm('删除全部 ' + shots.length + ' 个镜头？')) return; pushUndo(); MN.state.directorShots = []; renderShots(); saveSoon(); };
}
function downloadShots() {
  const list = (MN.state.directorShots || []).filter(s => s && s.image);
  if (!list.length) { toast('镜头册里没有可下载的图（AI 机位只有角度，进 3D 点一下再存）', 'warn'); return; }
  list.forEach((s, i) => {
    const a = document.createElement('a');
    a.href = s.image; a.download = (MN.state.scene.title || '镜头') + '-' + (i + 1) + '.png'; a.click();
  });
  toast('开始下载 ' + list.length + ' 张', 'ok');
}
function onShotClick(s) {
  if (s && s.cam && window.MN3D && MN3D.ok) {
    if (MN.state.view.mode !== '3d') setMode('3d');
    MN3D.setCamera(s.cam);
    toast(s.image ? '已回到该机位' : '已回到该机位（AI 只给了角度 · 想留图就点「立起来，再找镜头」）', 'ok');
    return;
  }
  if (!s || !s.image) { toast('这个机位没有图', 'warn'); return; }
  showShotBig(s);
}
function showShotBig(s) {
  const body = `<div style="text-align:center"><img src="${s.image}" style="max-width:100%;max-height:60vh;border-radius:8px;border:1px solid var(--line)" /><p class="mn-help-para" style="margin-top:8px">${esc(s.name || '')}</p></div>`;
  openModal('镜头大图', '导演台', body, [{ label: '关闭', primary: true }], 'wide');
}

/* ================================================================ 2D 画布 */
let cv, ctx, dpr = 1;
function resizeCanvas() {
  cv = $('#mnCanvas'); if (!cv) return;
  const st = $('#mnStage');
  const w = st.clientWidth, h = st.clientHeight;
  if (!w || !h) return;
  dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = h * dpr;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c3 = $('#mn3d'); if (c3) { c3.width = w * dpr; c3.height = h * dpr; c3.style.width = w + 'px'; c3.style.height = h + 'px'; }
  if (MN.state && MN.state.view.mode === '3d' && window.MN3D && c3 && c3.style.display !== 'none') MN3D.resize(w, h);
  else paint();
}
let paintRaf = null;
let paint3dRaf = null;
/* 只重绘 3D（3D 里拖动物体时用）：不碰隐藏的 2D 画布，也不重建右侧面板 */
function paint3D() {
  if (paint3dRaf) return;
  paint3dRaf = requestAnimationFrame(() => {
    paint3dRaf = null;
    if (MN.state && window.MN3D && MN3D.ok) { try { MN3D.render(MN.state); } catch (e) { } }
  });
}
function paint() {
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(() => {
    paintRaf = null; doPaint();
    /* 3D 模式下同步重绘（改颜色/改名/移动要立刻在立体视图里看到） */
    if (MN.state && MN.state.view.mode === '3d' && window.MN3D && MN3D.ok) {
      try { MN3D.render(MN.state); } catch (e) { }
    }
  });
}
function doPaint() {
  if (!cv || !ctx || !MN.state) return;
  const W = cv.width / dpr, H = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = PAL.canvas; ctx.fillRect(0, 0, W, H);
  const sc = MN.state.scene;
  const k = MN.view.k, C = CELL * k;

  /* 网格 */
  if (MN.grid) {
    const x0 = Math.floor(-MN.view.x / C), x1 = Math.ceil((W - MN.view.x) / C);
    const y0 = Math.floor(-MN.view.y / C), y1 = Math.ceil((H - MN.view.y) / C);
    ctx.lineWidth = 1;
    for (let gx = x0; gx <= x1; gx++) {
      ctx.strokeStyle = (gx % 4 === 0) ? PAL.gridMajor : PAL.grid;
      ctx.beginPath(); ctx.moveTo(gx * C + MN.view.x, 0); ctx.lineTo(gx * C + MN.view.x, H); ctx.stroke();
    }
    for (let gy = y0; gy <= y1; gy++) {
      ctx.strokeStyle = (gy % 4 === 0) ? PAL.gridMajor : PAL.grid;
      ctx.beginPath(); ctx.moveTo(0, gy * C + MN.view.y); ctx.lineTo(W, gy * C + MN.view.y); ctx.stroke();
    }
  }

  /* 房间 */
  ctx.font = '12px -apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of sc.rooms) {
    if (r.hidden) continue;
    const p = w2s(r.x, r.y), w = r.w * C, h = r.d * C;
    ctx.fillStyle = (MN.state.view.floorColor !== false && r.color) ? r.color : PAL.roomFill;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.strokeStyle = PAL.roomLine; ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x, p.y, w, h);
    ctx.fillStyle = PAL.muted;
    if (w > 34 && h > 16) ctx.fillText(r.name, p.x + w / 2, p.y + h / 2);
    if (isSel('room', r.id)) selRect(p.x, p.y, w, h);
  }

  /* 墙（带门洞缺口） */
  ctx.lineCap = 'round';
  for (const wl of sc.walls) {
    if (wl.hidden) continue;
    const a = w2s(wl.x1, wl.y1), b = w2s(wl.x2, wl.y2);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const holes = (wl.holes || []).slice().sort((m, n) => m.t - n.t);
    /* 门洞宽度换算：holes[].w 是「米」（1 = 1 格），先转成沿墙的比例 t */
    const wallLen = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) || 1;
    let cur = 0;
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = Math.max(3, (wl.th || 0.2) * C);
    const seg = (t0, t1) => {
      ctx.beginPath();
      ctx.moveTo(a.x + ux * len * t0, a.y + uy * len * t0);
      ctx.lineTo(a.x + ux * len * t1, a.y + uy * len * t1);
      ctx.stroke();
    };
    for (const hp of holes) {
      const half = ((hp.w || 1) * 0.5) / wallLen;
      const t0 = Math.max(cur, hp.t - half);
      const t1 = Math.min(1, hp.t + half);
      if (t0 > cur) seg(cur, t0);
      cur = Math.max(cur, t1);
    }
    if (cur < 1) seg(cur, 1);
    if (isSel('wall', wl.id)) {
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]); seg(0, 1); ctx.setLineDash([]);
    }
  }

  /* 造物：按道具库精细模型画俯视符号，跟随「旋转 Z」 */
  for (const p of sc.props) {
    if (p.hidden) continue;
    const ctr = window.MN_propCenter(p);
    const q = w2s(ctr.x, ctr.y);
    const w = p.w * C, h = p.d * C;
    const kind = window.MN_kindOf(p);
    const K = window.MN_PROP_KINDS[kind];
    const baseCol = p.color || (K && K.color) || PAL.prop;
    const st = { fill: baseCol, dark: tint(baseCol, 0.18), light: tint(baseCol, 0.62), accent: (K && K.accent) || '#8d8f94' };
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate((p.rot || 0) * Math.PI / 180);
    if (isSel('prop', p.id)) {
      /* 撞上了就描红：不用等松手才知道这里放不下 */
      const bad = window.MN_LAYOUT && MN.drag && MN.drag.moved && MN_LAYOUT.collides(MN.state.scene, 'prop', p);
      ctx.strokeStyle = bad ? '#e5484d' : PAL.accent; ctx.lineWidth = bad ? 3 : 2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
    }
    if (K && K.top) { ctx.scale(C, C); K.top(ctx, p.w, p.d, st); }
    else { ctx.fillStyle = st.fill; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h); }
    ctx.restore();
    /* 名称（不跟随旋转） */
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    if (w > 30 && h > 14) ctx.fillText(p.name, q.x, q.y);
  }

  /* 人物（俯视人形：肩宽椭圆 + 头 + 鼻尖朝向 + 手臂 + 名字）
     —— 身体跟「旋转 Z」转，头/鼻尖跟「人脸朝向」转，两个朝向都能一眼看出来 */
  for (const p of sc.persons) {
    if (p.hidden) continue;
    const q = w2s(p.x, p.y);
    const R = Math.max(9, 0.6 * C);                          // 肩宽半径
    const rot = (p.rot || 0) * Math.PI / 180;                 // 身体朝向
    const fd = rot + (p.faceDir || 0) * Math.PI / 180;        // 人脸朝向（头相对身体可转）
    const bodyCol = p.color || '#2e7cf6';
    const headR = Math.max(3.6, R * 0.42 * (p.face || 1));
    ctx.save();
    ctx.translate(q.x, q.y);
    /* 落地阴影 */
    ctx.fillStyle = 'rgba(30,36,52,.12)';
    ctx.beginPath(); ctx.ellipse(1.5, 2.5, R * 1.02, R * 0.8, 0, 0, 7); ctx.fill();
    /* 身体：肩宽横向、前后薄（局部 x = 正面） */
    ctx.save(); ctx.rotate(rot);
    ctx.fillStyle = bodyCol;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.5, R * 0.92, 0, 0, 7); ctx.fill();
    /* 两条手臂：肩端小椭圆 */
    ctx.fillStyle = tint(bodyCol, 0.18);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0, s * R * 1.02, R * 0.24, R * 0.36, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(10,14,24,.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.5, R * 0.95, 0, 0, 7); ctx.stroke();
    ctx.restore();
    /* 头 + 鼻尖（跟人脸朝向） */
    ctx.save(); ctx.rotate(fd);
    ctx.fillStyle = tint(bodyCol, 0.62);
    ctx.beginPath(); ctx.arc(R * 0.16, 0, headR, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,24,.34)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(20,24,34,.72)';
    ctx.beginPath();
    ctx.moveTo(R * 0.16 + headR * 1.02, 0);
    ctx.lineTo(R * 0.16 + headR * 0.42, -headR * 0.4);
    ctx.lineTo(R * 0.16 + headR * 0.42, headR * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    /* 名字 */
    if (R > 6 && p.name) {
      ctx.fillStyle = 'rgba(28,34,48,.78)';
      ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, 0, R * 1.5 + 9);
      ctx.textAlign = 'left';
    }
    if (isSel('person', p.id)) {
      const bad = window.MN_LAYOUT && MN.drag && MN.drag.moved && MN_LAYOUT.collides(MN.state.scene, 'person', p);
      ctx.strokeStyle = bad ? '#e5484d' : PAL.accent; ctx.lineWidth = bad ? 3 : 2;
      ctx.beginPath(); ctx.ellipse(0, 0, R * 1.06, R * 1.28, 0, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  /* 运动轨迹（人物走位线）：虚线 + 途经点 + 终点箭头 + 长度 */
  for (const p of sc.persons) {
    const draft = (MN.pathDraft && MN.pathDraft.id === p.id) ? MN.pathDraft.pts : null;
    const list = draft && draft.length ? draft : (p.path || []);
    if (!list || list.length < 2) continue;
    const sp = list.map(pt => w2s(pt.x, pt.y));
    ctx.save();
    ctx.strokeStyle = draft ? PAL.accent : 'rgba(46,124,246,.72)';
    ctx.lineWidth = draft ? 2.4 : 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); sp.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    ctx.setLineDash([]);
    sp.forEach((q, i) => {
      ctx.fillStyle = i === 0 ? 'rgba(46,124,246,.92)' : 'rgba(255,255,255,.96)';
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, i === 0 ? 4.5 : 3.2, 0, 7); ctx.fill(); ctx.stroke();
    });
    const a = sp[sp.length - 2], b = sp[sp.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.fillStyle = PAL.accent;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - Math.cos(ang - 0.4) * 11, b.y - Math.sin(ang - 0.4) * 11);
    ctx.lineTo(b.x - Math.cos(ang + 0.4) * 11, b.y - Math.sin(ang + 0.4) * 11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(28,34,48,.72)'; ctx.font = '11px sans-serif';
    ctx.fillText(pathLen(list).toFixed(1) + 'm', (a.x + b.x) / 2 + 9, (a.y + b.y) / 2 - 7);
    ctx.restore();
  }

  /* 光源 */
  for (const l of sc.lights) {    if (l.hidden) continue;
    const q = w2s(l.x, l.y);
    ctx.fillStyle = l.color || '#ffe9b0';
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(4, 0.35 * C), 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke();
    if (isSel('light', l.id)) selRect(q.x - 12, q.y - 12, 24, 24);
  }

  /* 取景框 */
  const cam = MN.state.camera;
  if (cam.frame) {
    const ratio = { '16:9': 16 / 9, '21:9': 21 / 9, '3:4': 3 / 4, '4:3': 4 / 3, '9:16': 9 / 16, '1:1': 1 }[cam.size] || 16 / 9;
    let fw = W * 0.7, fh = fw / ratio;
    if (fh > H * 0.8) { fh = H * 0.8; fw = fh * ratio; }
    ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
    ctx.strokeRect((W - fw) / 2, (H - fh) / 2, fw, fh);
    ctx.setLineDash([]);
    ctx.fillStyle = PAL.accent; ctx.font = '11px sans-serif';
    ctx.fillText('取景框 ' + cam.size, W / 2, (H - fh) / 2 - 8);
  }

  /* 拖拽预览 / 画墙预览 / 框选 */
  const d = MN.drag;
  if (d && d.ghost) {
    const a = w2s(d.x0, d.y0), b = w2s(d.x1, d.y1);
    if (d.kind === 'line') {
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (d.kind === 'marquee') {
      ctx.fillStyle = 'rgba(225,69,62,.08)';
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else {
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(225,69,62,.06)';
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }
    ctx.setLineDash([]);
  }
  if (MN.wallDraft) {
    const a = w2s(MN.wallDraft.x, MN.wallDraft.y);
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, 7); ctx.fill();
  }

  /* 对齐参考线（拖动时出现，帮你对齐别人的边） */
  if (MN.guide) {
    ctx.save();
    ctx.strokeStyle = '#2f8fff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    MN.guide.v.forEach(x => { const p = w2s(x, 0); ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, H); ctx.stroke(); });
    MN.guide.h.forEach(y => { const p = w2s(0, y); ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(W, p.y); ctx.stroke(); });
    ctx.restore();
  }

  /* 物体库待放置：跟着鼠标画个虚影 */
  if (MN.pending && MN.mouse) {
    const pr = MN.pending.preset || { w: 1, d: 1 };
    const q = w2s(MN.mouse.x - pr.w / 2, MN.mouse.y - pr.d / 2);
    ctx.save();
    ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.strokeRect(q.x, q.y, pr.w * C, pr.d * C);
    ctx.fillStyle = 'rgba(225,69,62,.10)';
    ctx.fillRect(q.x, q.y, pr.w * C, pr.d * C);
    ctx.restore();
  }

  /* 空场景提示 */
  if (!sc.rooms.length && !sc.walls.length && !sc.props.length) {
    ctx.fillStyle = PAL.muted; ctx.font = '13px sans-serif';
    ctx.fillText('画布空空如也', W / 2, H / 2 - 26);
    ctx.font = '12px sans-serif';
    ctx.fillText('左侧选「画房间」，按住拖一个矩形试试', W / 2, H / 2 - 4);
  }
}
function selRect(x, y, w, h) {
  ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2;
  ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = PAL.accent;
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(p => ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6));
}
function isSel(kind, id) { return inSel(kind, id); }

/* ---------- 命中测试 ----------
   优先级（2026-10-26 修复）：灯 → 人 → 造物 → 墙 → 房间。
   ⚠️ 房间必须放最后：房间是「地板面」，面积最大；以前排在墙前面，
   点在房间里的隔断墙上永远先命中房间 —— 结果就是「想删墙，删掉的是整个房间」。 */
function hitTest(wx, wy) {
  const sc = MN.state.scene;
  const near = (a, b, t) => Math.abs(a - b) <= t;
  for (const l of sc.lights) if (!l.hidden && near(l.x, wx, 0.5) && near(l.y, wy, 0.5)) return { kind: 'light', id: l.id };
  for (const p of sc.persons) if (!p.hidden && near(p.x, wx, 0.5) && near(p.y, wy, 0.5)) return { kind: 'person', id: p.id };
  for (const p of sc.props) { if (p.hidden) continue; const b = window.MN_propAABB(p); if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.d) return { kind: 'prop', id: p.id }; }
  for (const wl of sc.walls) {
    if (wl.hidden) continue;
    const dx = wl.x2 - wl.x1, dy = wl.y2 - wl.y1;
    const L2 = dx * dx + dy * dy; if (!L2) continue;
    let t = ((wx - wl.x1) * dx + (wy - wl.y1) * dy) / L2;
    t = clamp(t, 0, 1);
    if (Math.hypot(wx - (wl.x1 + dx * t), wy - (wl.y1 + dy * t)) <= 0.45) return { kind: 'wall', id: wl.id, t };
  }
  for (const r of sc.rooms) if (!r.hidden && wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.d) return { kind: 'room', id: r.id };
  return null;
}

/* ---------- 选中集 ---------- */
function selList() { return (MN.selList && MN.selList.length) ? MN.selList : (MN.sel ? [MN.sel] : []); }
function selectOnly(kind, id) { MN.sel = { kind, id }; MN.selList = [{ kind, id }]; }
function clearSel() { MN.sel = null; MN.selList = []; }
function inSel(kind, id) { return selList().some(s => s.kind === kind && s.id === id); }
function toggleSel(kind, id) {
  const has = inSel(kind, id);
  if (has) {
    MN.selList = selList().filter(s => !(s.kind === kind && s.id === id));
    if (!MN.selList.length) MN.sel = null;
    else if (MN.sel && MN.sel.kind === kind && MN.sel.id === id) MN.sel = MN.selList[MN.selList.length - 1];
  } else {
    MN.selList = selList().concat([{ kind, id }]);
    MN.sel = { kind, id };
  }
}
/* 选中后刷新三处（清单 / 属性面板 / 画布） */
function refreshSel() {
  renderTree(); renderRight(); paint();
  /* 3D 视图同步选中高亮环 */
  if (window.MN3D && window.MN3D.setSel) {
    try { window.MN3D.setSel(MN.sel ? { kind: MN.sel.kind, id: MN.sel.id } : null); } catch (e) { }
  }
}

/* ---------- 画布交互 ---------- */
/* ---------- 画布交互（2026-10-26 重做）
   新增：右键菜单（删除/复制/隐藏/改名/置顶/旋转/打洞）、右键拖动平移、
        框选多选、Shift 加选、拖动对齐参考线、物体库连续放置。
   撤销粒度修复：单击选中不再入撤销栈，只有真正改动才入栈。 */
function snapshotSel() {
  return selList().map(s => {
    const o = findObj(s.kind, s.id); if (!o) return null;
    if (s.kind === 'wall') return { kind: s.kind, obj: o, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 };
    return { kind: s.kind, obj: o, x: o.x, y: o.y };
  }).filter(Boolean);
}
function moveBy(it, dx, dy) {
  if (it.kind === 'wall') { it.obj.x1 = it.x1 + dx; it.obj.y1 = it.y1 + dy; it.obj.x2 = it.x2 + dx; it.obj.y2 = it.y2 + dy; }
  else { it.obj.x = it.x + dx; it.obj.y = it.y + dy; }
}
/* 对齐参考线：拖动时把选中物体的边与其他物体的边对齐，并画出参考线 */
function calcGuides(moving) {
  const sc = MN.state.scene;
  const skip = new Set(moving.map(m => m.obj.id));
  const tv = [], th = [];
  const add = (arr, v) => { if (arr.every(x => Math.abs(x - v) > 0.01)) arr.push(v); };
  sc.rooms.forEach(o => { if (o.hidden || skip.has(o.id)) return; add(tv, o.x); add(tv, o.x + o.w); add(th, o.y); add(th, o.y + o.d); });
  sc.props.forEach(o => { if (o.hidden || skip.has(o.id)) return; add(tv, o.x); add(tv, o.x + o.w); add(th, o.y); add(th, o.y + o.d); });
  sc.walls.forEach(o => {
    if (o.hidden || skip.has(o.id)) return;
    if (Math.abs(o.x1 - o.x2) < 0.01) add(tv, o.x1); else if (Math.abs(o.y1 - o.y2) < 0.01) add(th, o.y1);
  });
  const v = [], h = [];
  moving.forEach(m => {
    if (m.kind === 'wall') return;
    const o = m.obj, w = o.w || 0, d = o.d || 0;
    [o.x, o.x + w].forEach(x => tv.forEach(t => { if (Math.abs(x - t) < 0.06) add(v, t); }));
    [o.y, o.y + d].forEach(y => th.forEach(t => { if (Math.abs(y - t) < 0.06) add(h, t); }));
  });
  return (v.length || h.length) ? { v, h } : null;
}
/* 框选命中：造物/人物/光源按包含，墙按包围盒相交，房间要求整间被框住（否则框内永远先选中房间） */
function objectsInRect(x0, y0, x1, y1) {
  const sc = MN.state.scene, out = [];
  const inter = (ax, ay, aw, ah) => ax < x1 && ax + aw > x0 && ay < y1 && ay + ah > y0;
  const inside = (ax, ay) => ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1;
  sc.rooms.forEach(o => { if (!o.hidden && o.x >= x0 && o.y >= y0 && o.x + o.w <= x1 && o.y + o.d <= y1) out.push({ kind: 'room', id: o.id }); });
  sc.props.forEach(o => { if (!o.hidden) { const b = window.MN_propAABB(o); if (inter(b.x, b.y, b.w, b.d)) out.push({ kind: 'prop', id: o.id }); } });
  sc.walls.forEach(o => { if (!o.hidden && inter(Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1))) out.push({ kind: 'wall', id: o.id }); });
  sc.persons.forEach(o => { if (!o.hidden && inside(o.x, o.y)) out.push({ kind: 'person', id: o.id }); });
  sc.lights.forEach(o => { if (!o.hidden && inside(o.x, o.y)) out.push({ kind: 'light', id: o.id }); });
  return out;
}

/* ---------- 物体库：点一下落地（连续放置，Esc 退出） ---------- */
/* 结束轨迹绘制：写进人物 path（>=2 点才算） */
function pathLen(pts) { let L = 0; for (let i = 1; i < (pts || []).length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; }
function finishPath() {
  const d = MN.pathDraft; MN.pathDraft = null;
  if (!d) return;
  const per = findObj('person', d.id);
  if (per) {
    if (d.pts.length >= 2) {
      pushUndo();
      per.path = d.pts;
      per.speed = per.speed || 1.2;
      /* 画完自动绕开家具和墙：不然预演里人会从茶几、沙发上穿过去 */
      let note = '';
      if (window.MN_LAYOUT) {
        const r = window.MN_LAYOUT.routePath(MN.state.scene, per.path, {});
        if (r.changed) { per.path = r.pts; note = '，已自动绕开家具'; }
      }
      toast(`轨迹已保存：${per.path.length} 个点 / ${pathLen(per.path).toFixed(1)}m${note}`);
    } else {
      toast('至少要点两个位置才能形成轨迹', 'warn');
    }
  }
  renderAll(); saveSoon();
}

/* ---------- 防穿模：自动让位 ----------
   只挪「你正在放/正在拖的那一件」，已经摆好的东西不动。
   放置、拖动松手、3D 拖动松手、AI 搭景之后都会走这里。 */
function settleOne(kind, id, quiet) {
  if (!window.MN_LAYOUT || !MN.state || !MN.state.scene) return false;
  const o = findObj(kind, id); if (!o) return false;
  const r = window.MN_LAYOUT.settle(MN.state.scene, kind, o);
  if (r.moved) { if (!quiet) toast('已自动让开 ' + r.dist + 'm（不穿模）', 'ok'); return true; }
  if (r.failed && !quiet) toast('这附近放不下，先挪开别的家具吧', 'warn');
  return false;
}
function settleSel(quiet) {
  const list = selList().filter(x => x.kind === 'prop' || x.kind === 'person');
  let n = 0;
  list.forEach(x => { if (settleOne(x.kind, x.id, true)) n++; });
  if (n && !quiet) toast('自动让开 ' + n + ' 件（不穿模）', 'ok');
  return n;
}
/* 整场排开（按钮用） */
function autoLayout() {
  if (!window.MN_LAYOUT || !MN.state) return;
  pushUndo();
  const moved = window.MN_LAYOUT.resolveScene(MN.state.scene, { maxR: 3 });
  renderAll(); saveSoon();
  toast(moved.length ? '已排开 ' + moved.length + ' 件（Ctrl+Z 可撤销）' : '场上没有重叠，不用排', moved.length ? 'ok' : undefined);
}

function placePending(wx, wy) {  const p = MN.pending; if (!p) return;
  pushUndo();
  let added = null;
  /* 放置后「不选中」新物体：右侧继续留在物件库，方便接着换下一个预设连放
     （之前会选中刚放的东西，物件库被属性面板顶掉，想再放别的东西就点不到了） */
  if (p.kind === 'person') {
    const o = { id: uid(), name: '人物 ' + (MN.state.scene.persons.length + 1), x: snap(wx), y: snap(wy), rot: 0, color: p.preset.color || '#2e7cf6', pose: '站立', face: 1, faceDir: 0, jump: 0 };
    MN.state.scene.persons.push(o); added = o;
  } else if (p.kind === 'light') {
    const o = { id: uid(), name: '光源 ' + (MN.state.scene.lights.length + 1), x: snap(wx), y: snap(wy), color: '#ffe9b0', intensity: 1, h: 2.5 };
    MN.state.scene.lights.push(o);
  } else {
    const pr = p.preset;
    const o = { id: uid(), name: pr.name, x: snap(wx - pr.w / 2), y: snap(wy - pr.d / 2), w: pr.w, d: pr.d, h: pr.h, color: pr.color || '', kind: pr.kind || window.MN_kindOf({ name: pr.name }), rot: 0 };
    MN.state.scene.props.push(o);
    added = o;
  }
  /* 放下去就自动躲开已有家具/墙，省得你自己挪 */
  if (added) settleOne(p.kind, added.id, false);
  renderAll(); saveSoon();
}

function onPtrDown(e) {
  closeCtx();
  if (!MN.state) return;
  const r = cv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w = s2w(sx, sy);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 个别嵌入式 webview 不支持捕获，不耽误拖拽 */ }

  /* 右键：起手先记位置 —— 拖动超过 4px 算平移，没动才算「点右键弹菜单」 */
  if (e.button === 2) {
    if (MN.pathDraft) { finishPath(); return; }
    MN.drag = { kind: 'rpan', sx, sy, vx: MN.view.x, vy: MN.view.y, moved: false }; return;
  }
  if (e.button === 1 || MN.spaceDown || MN.tool === 'pan') {
    MN.drag = { kind: 'pan', sx, sy, vx: MN.view.x, vy: MN.view.y }; cv.style.cursor = 'grabbing'; return;
  }
  /* 物体库待放置：点一下落地（按住 Shift 连续放，Esc 退出） */
  if (MN.pending) { placePending(w.x, w.y); return; }

  const tool = MN.tool;
  /* 运动轨迹：先点人物，再逐点画走位线；右键 / Esc 结束 */
  if (tool === 'path') {
    if (!MN.pathDraft) {
      const hit = hitTest(w.x, w.y);
      if (!hit || hit.kind !== 'person') { toast('先点一个人物，再逐点画它的走位线', 'warn'); return; }
      const per = findObj('person', hit.id);
      MN.pathDraft = { id: hit.id, pts: (per.path || []).map(p => ({ x: p.x, y: p.y })) };
      selectOnly('person', hit.id); refreshSel();
      toast('接着在画布上逐点点击画轨迹 · 右键或 Esc 结束');
      return;
    }
    MN.pathDraft.pts.push({ x: snap(w.x), y: snap(w.y) });
    paint();
    return;
  }
  if (tool === 'select') {
    const hit = hitTest(w.x, w.y);
    if (hit) {
      if (e.shiftKey) { toggleSel(hit.kind, hit.id); refreshSel(); return; }
      if (!inSel(hit.kind, hit.id)) selectOnly(hit.kind, hit.id);
      else MN.sel = { kind: hit.kind, id: hit.id };
      MN.drag = { kind: 'move', items: snapshotSel(), wx: w.x, wy: w.y, moved: false, snap: JSON.stringify(MN.state.scene) };
      refreshSel();
      return;
    }
    /* 空白：框选（Shift = 追加） */
    if (!e.shiftKey) clearSel();
    MN.drag = { kind: 'marquee', x0: snap(w.x), y0: snap(w.y), x1: snap(w.x), y1: snap(w.y), ghost: true, base: e.shiftKey ? selList().slice() : [] };
    refreshSel();
    return;
  }
  if (tool === 'room' || tool === 'prop') {
    MN.drag = { kind: 'new', what: tool, x0: snap(w.x), y0: snap(w.y), x1: snap(w.x), y1: snap(w.y), ghost: true, snap: JSON.stringify(MN.state.scene) };
    paint(); return;
  }
  if (tool === 'wall') {
    const p = { x: snap(w.x), y: snap(w.y) };
    if (!MN.wallDraft) { MN.wallDraft = p; }
    else {
      const wl = { id: uid(), name: '墙面 ' + (MN.state.scene.walls.length + 1), x1: MN.wallDraft.x, y1: MN.wallDraft.y, x2: p.x, y2: p.y, h: 2.6, th: 0.2, holes: [] };
      if (Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) < 0.5) { MN.wallDraft = null; paint(); return toast('墙太短了'); }
      pushUndo();
      MN.state.scene.walls.push(wl);
      MN.wallDraft = null;
      selectOnly('wall', wl.id);
      refreshSel(); saveSoon();
    }
    paint(); return;
  }
  if (tool === 'hole') {
    const hit = hitTest(w.x, w.y);
    if (hit && hit.kind === 'wall') {
      const wl = findObj('wall', hit.id);
      pushUndo();
      (wl.holes = wl.holes || []).push({ t: +hit.t.toFixed(3), w: 1 });
      selectOnly('wall', wl.id);
      refreshSel(); saveSoon(); paint();
      toast('开了个门洞');
    } else toast('点墙连线才能打洞');
    return;
  }
  if (tool === 'person') {
    pushUndo();
    const p = { id: uid(), name: '人物 ' + (MN.state.scene.persons.length + 1), x: snap(w.x), y: snap(w.y), rot: 0, color: '#2e7cf6', pose: '站立', face: 1, faceDir: 0, jump: 0 };
    MN.state.scene.persons.push(p);
    selectOnly('person', p.id);
    refreshSel(); saveSoon(); paint();
    return;
  }
}
function onPtrMove(e) {
  const r = cv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w = s2w(sx, sy);
  const d = MN.drag;
  MN.mouse = { x: w.x, y: w.y };
  if (!d) {
    cv.style.cursor = MN.pending ? 'copy' : MN.tool === 'select' ? (hitTest(w.x, w.y) ? 'pointer' : 'default') : 'crosshair';
    if (MN.pending) paint();
    return;
  }
  if (d.kind === 'rpan' || d.kind === 'pan') {
    const dx = sx - d.sx, dy = sy - d.sy;
    if (d.kind === 'rpan' && !d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true; cv.style.cursor = 'grabbing';
    }
    MN.view.x = d.vx + dx; MN.view.y = d.vy + dy; paint(); return;
  }
  if (d.kind === 'move') {
    if (!d.moved) { d.moved = true; pushUndo(d.snap); }
    const dx = snap(w.x - d.wx), dy = snap(w.y - d.wy);
    d.items.forEach(it => moveBy(it, dx, dy));
    MN.guide = calcGuides(d.items);
    paint(); return;
  }
  if (d.kind === 'new' || d.kind === 'marquee') { d.x1 = snap(w.x); d.y1 = snap(w.y); paint(); return; }
}
function onPtrUp(e) {
  const d = MN.drag; if (!d) return;
  MN.drag = null; MN.guide = null; cv.style.cursor = 'default';
  if (d.kind === 'rpan') {
    /* 记住这一下是不是「拖动」—— contextmenu 事件紧跟其后，拖过就不弹菜单 */
    MN._ctxDrag = { moved: d.moved, t: Date.now() };
    paint(); return;
  }
  if (d.kind === 'pan') { paint(); return; }
  if (d.kind === 'move') {
    if (d.moved) { settleSel(false); renderTree(); renderRight(); saveSoon(); }
    paint(); return;
  }
  if (d.kind === 'marquee') {
    const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), x1 = Math.max(d.x0, d.x1), y1 = Math.max(d.y0, d.y1);
    if (x1 - x0 > 0.3 || y1 - y0 > 0.3) {
      const merged = (d.base || []).slice();
      objectsInRect(x0, y0, x1, y1).forEach(p => { if (!merged.some(m => m.kind === p.kind && m.id === p.id)) merged.push(p); });
      MN.selList = merged; MN.sel = merged[merged.length - 1] || null;
      refreshSel();
      if (merged.length) toast('选中 ' + merged.length + ' 个（Del 删除 · 方向键微调）');
    } else {
      refreshSel();
    }
    paint(); return;
  }
  if (d.kind === 'new') {
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 0.5 || h < 0.5) { paint(); return toast('太小了，重新拖一个'); }
    pushUndo(d.snap);
    if (d.what === 'room') {
      const r = { id: uid(), name: '房间 ' + (MN.state.scene.rooms.length + 1), x, y, w, d: h, h: 4, color: '' };
      MN.state.scene.rooms.push(r); selectOnly('room', r.id);
    } else {
      const p = { id: uid(), name: '造物 ' + (MN.state.scene.props.length + 1), x, y, w, d: h, h: Math.min(w, h, 1), color: '' };
      MN.state.scene.props.push(p); selectOnly('prop', p.id);
      settleOne('prop', p.id, false);
    }
    refreshSel(); saveSoon(); paint();
    return;
  }
}

/* ============================================================
 * 右键菜单（本次核心：搭好的东西右键就能删）
 * ============================================================ */
function closeCtx() {
  const m = $('#mnCtx'); if (m) m.remove();
  MN.ctxOpen = false;
}
function openCtx(x, y, hit) {
  closeCtx();
  const root = $('#mnRoot'); if (!root) return;
  const items = [];
  const sep = () => items.push({ sep: true });
  if (hit) {
    const kind = hit.kind, o = findObj(kind, hit.id);
    const n = selList().length;
    /* ⚠️ 2026-10-28 修：这里以前绑的是 copySel（只进剪贴板，画面没变化），
       用户点「复制」以为坏了。右键「复制」= Ctrl+D 直接就地复制一份。 */
    items.push({ icon: 'copy', label: n > 1 ? `复制这 ${n} 个` : '复制', hint: 'Ctrl+D', fn: duplicateSel });
    items.push({ icon: 'clipboard-paste', label: '再粘贴一个', hint: 'Ctrl+V', fn: () => pasteClip(1, 1) });
    sep();
    items.push({ icon: o && o.hidden ? 'eye' : 'eye-off', label: o && o.hidden ? '显示' : '隐藏', fn: hideSel });
    items.push({ icon: 'pencil-line', label: '重命名', hint: 'F2', fn: renameSel });
    items.push({ icon: 'arrow-up-right', label: '置顶（盖住别的）', fn: bringFront });
    if (kind === 'person' || kind === 'prop') items.push({ icon: 'rotate-3d', label: '旋转 90°', fn: rotateSel });
    if (kind === 'wall') items.push({ icon: 'door-open', label: '在点击处打洞', fn: () => holeAt(hit.id, hit.t) });
    sep();
    items.push({ icon: 'trash-2', label: n > 1 ? `删除选中的 ${n} 个` : '删除', hint: 'Del', danger: true, fn: delSel });
  } else {
    items.push({ icon: 'clipboard-paste', label: '粘贴', hint: 'Ctrl+V', disabled: !MN.clipboard, fn: () => pasteClip(1, 1) });
    items.push({ icon: 'check', label: '全选', hint: 'Ctrl+A', fn: selectAll });
    sep();
    items.push({ icon: 'maximize', label: '适配视图', hint: 'F', fn: () => { fitView(); paint(); } });
    items.push({ icon: 'grid-2x2', label: MN.grid ? '隐藏网格' : '显示网格', fn: () => { MN.grid = !MN.grid; paint(); } });
    sep();
    items.push({ icon: 'square-dashed', label: '画房间', hint: 'R', fn: () => setTool('room') });
    items.push({ icon: 'minus', label: '画一面墙', hint: 'L', fn: () => setTool('wall') });
    items.push({ icon: 'user-round', label: '放个人物', hint: 'N', fn: () => setTool('person') });
  }
  const m = el('div', 'mn-ctx');
  m.id = 'mnCtx';
  m.innerHTML = items.map((it, i) => it.sep
    ? '<div class="mn-ctx-sep"></div>'
    : `<button class="mn-ctx-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}" data-i="${i}">${icon(it.icon, 's14')}<span>${it.label}</span>${it.hint ? `<kbd>${it.hint}</kbd>` : ''}</button>`).join('');
  root.appendChild(m);
  /* 贴边翻转，别跑出屏幕 */
  const rect = m.getBoundingClientRect();
  let left = x, top = y;
  if (left + rect.width > innerWidth - 8) left = Math.max(8, x - rect.width);
  if (top + rect.height > innerHeight - 8) top = Math.max(8, y - rect.height);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  $$('.mn-ctx-item', m).forEach(b => {
    const it = items[+b.dataset.i];
    if (it.disabled) { b.onclick = () => toast('剪贴板是空的，先右键复制一个'); return; }
    b.onclick = () => { closeCtx(); it.fn(); };
  });
  MN.ctxOpen = true;
  setTimeout(() => {
    document.addEventListener('pointerdown', function h(ev) {
      if (!m.contains(ev.target)) { closeCtx(); document.removeEventListener('pointerdown', h); }
    });
  }, 0);
}

/* ---------- 选中对象操作 ---------- */
function delSel() {
  const list = selList(); if (!list.length) return toast('先选中要删的东西');
  pushUndo();
  list.forEach(s => delObj(s.kind, s.id));
  clearSel(); renderAll(); saveSoon();
  toast('删了 ' + list.length + ' 个（Ctrl+Z 可撤销）', 'ok');
}
function copySel() {
  const list = selList().map(s => ({ kind: s.kind, data: JSON.parse(JSON.stringify(findObj(s.kind, s.id))) })).filter(x => x.data);
  if (!list.length) return toast('先选中要复制的东西');
  MN.clipboard = list;
  toast('已复制 ' + list.length + ' 个 · Ctrl+V 粘贴', 'ok');
}
function pasteClip(dx, dy) {
  let list = MN.clipboard;
  if (!list) return toast('剪贴板是空的');
  if (!Array.isArray(list)) list = [{ kind: list.x1 != null ? 'wall' : 'person', data: list }];  // 兼容旧格式
  pushUndo();
  const added = [];
  list.forEach(({ kind, data }) => {
    const c = JSON.parse(JSON.stringify(data)); c.id = uid();
    if (kind === 'wall') { c.x1 += dx; c.y1 += dy; c.x2 += dx; c.y2 += dy; MN.state.scene.walls.push(c); }
    else if (kind === 'room') { c.x += dx; c.y += dy; MN.state.scene.rooms.push(c); }
    else if (kind === 'light') { c.x += dx; c.y += dy; MN.state.scene.lights.push(c); }
    else if (kind === 'person') { c.x += dx; c.y += dy; MN.state.scene.persons.push(c); }
    else { c.x += dx; c.y += dy; MN.state.scene.props.push(c); }
    added.push({ kind, id: c.id });
  });
  MN.selList = added; MN.sel = added[added.length - 1] || null;
  renderAll(); saveSoon();
  toast('粘贴了 ' + added.length + ' 个', 'ok');
}
function duplicateSel() { copySel(); pasteClip(1, 1); }
function hideSel() {
  const list = selList(); if (!list.length) return;
  pushUndo();
  const anyShow = list.some(s => { const o = findObj(s.kind, s.id); return o && !o.hidden; });
  list.forEach(s => { const o = findObj(s.kind, s.id); if (o) o.hidden = anyShow; });
  renderAll(); saveSoon();
  toast(anyShow ? '已隐藏（在左侧清单点眼睛恢复）' : '已显示');
}
function renameSel() {
  const s = MN.sel; if (!s) return toast('先选中一个东西');
  const o = findObj(s.kind, s.id); if (!o) return;
  /* 2026-10-27：原来用浏览器原生 prompt()，部分环境（webview/嵌入/被策略拦截）会直接返回 null，
     表现为「点重命名没反应」。改用应用内弹窗，任何环境都稳。 */
  const kindName = { room: '房间', wall: '墙', prop: '造物', person: '人物', light: '光源' }[s.kind] || '物体';
  const m = openModal('改个名字', kindName,
    `<label class="mn-field"><span>名称</span><input type="text" id="mnRenameInput" value="${esc(o.name || '')}" maxlength="20" placeholder="给它起个名字" /></label>`,
    [
      { label: '取消', fn: closeModal },
      {
        label: '保存', primary: true, fn: () => {
          const inp = $('#mnRenameInput', m);
          const v = ((inp && inp.value) || '').trim();
          if (v) { pushUndo(); o.name = v.slice(0, 20); renderAll(); saveSoon(); toast('已改名为「' + o.name + '」'); }
          closeModal();
        },
      },
    ]);
  const inp = $('#mnRenameInput', m);
  if (inp) {
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const btn = $('[data-fi="1"]', m); if (btn) btn.click(); } };
  }
}
function bringFront() {
  const s = MN.sel; if (!s) return;
  const sc = MN.state.scene;
  const arr = s.kind === 'room' ? sc.rooms : s.kind === 'prop' ? sc.props : s.kind === 'person' ? sc.persons : s.kind === 'wall' ? sc.walls : sc.lights;
  const i = arr.findIndex(o => o.id === s.id); if (i < 0 || i === arr.length - 1) return;
  pushUndo(); arr.push(arr.splice(i, 1)[0]); renderTree(); paint(); saveSoon();
  toast('已置顶');
}
function rotateSel() {
  const list = selList(); if (!list.length) return;
  pushUndo();
  list.forEach(s => {
    if (s.kind !== 'person' && s.kind !== 'prop') return;
    const o = findObj(s.kind, s.id); if (!o) return;
    if (s.kind === 'person') o.rot = ((o.rot || 0) + 90) % 360;
    else o.rot = ((o.rot || 0) + 90) % 360;      // 造物：用旋转角，宽深不变
  });
  renderAll(); saveSoon();
}
function holeAt(id, t) {
  const wl = findObj('wall', id); if (!wl) return;
  pushUndo();
  (wl.holes = wl.holes || []).push({ t: +(t || 0.5).toFixed(3), w: 1 });
  selectOnly('wall', id); refreshSel(); saveSoon();
  toast('开了个门洞');
}
function selectAll() {
  const sc = MN.state.scene;
  const list = [];
  sc.rooms.forEach(o => { if (!o.hidden) list.push({ kind: 'room', id: o.id }); });
  sc.walls.forEach(o => { if (!o.hidden) list.push({ kind: 'wall', id: o.id }); });
  sc.props.forEach(o => { if (!o.hidden) list.push({ kind: 'prop', id: o.id }); });
  sc.persons.forEach(o => { if (!o.hidden) list.push({ kind: 'person', id: o.id }); });
  sc.lights.forEach(o => { if (!o.hidden) list.push({ kind: 'light', id: o.id }); });
  MN.selList = list; MN.sel = list[list.length - 1] || null;
  refreshSel();
  toast('全选 ' + list.length + ' 个');
}
function nudgeSel(dx, dy) {
  const list = selList(); if (!list.length) return;
  pushUndo();
  list.forEach(s => {
    const o = findObj(s.kind, s.id); if (!o) return;
    if (s.kind === 'wall') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
    else { o.x = +(o.x + dx).toFixed(2); o.y = +(o.y + dy).toFixed(2); }
  });
  renderTree(); renderRight(); paint(); saveSoon();
}
function onWheel(e) {
  e.preventDefault();
  closeCtx();
  const r = cv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w = s2w(sx, sy);
  const f = e.deltaY < 0 ? 1.12 : 0.89;
  MN.view.k = clamp(MN.view.k * f, 0.3, 3);
  MN.view.x = sx - w.x * CELL * MN.view.k;
  MN.view.y = sy - w.y * CELL * MN.view.k;
  if (MN.state) { MN.state.view.zoom = MN.view.k; saveSoon(); }
  paint();
}

/* ---------- 导入导出 ---------- */
function exportProject() {
  const st = MN.state;
  const out = { format: st.format, version: st.version, scene: st.scene, view: st.view, sun: st.sun, camera: st.camera, directorShots: st.directorShots || [], project: st.project || null, cuttingDesk: st.cuttingDesk || null, cameraPath: st.cameraPath || null, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (st.scene.title || '导演台项目') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('已导出完整项目 JSON');
}
function openImportModal(preMode) {
  let mode = preMode === 'model' ? 'model' : 'auto';
  const body = `
    <p class="mn-help-para">智能导入会自己认：完整项目 / 只有造物 / 只有人物 / 机位 / 分镜表。加东西不覆盖，整项目才会问一句。</p>
    <button class="mn-choice ${mode === 'auto' ? 'active' : ''}" data-m="auto"><span class="mn-ai-ico">${icon('sparkles', 's18')}</span><span><strong>智能导入<span class="mn-tag">推荐</span></strong><small>AI 给的 JSON 直接贴进来；只加不删，已有场景保留。</small></span></button>
    <button class="mn-choice ${mode === 'model' ? 'active' : ''}" data-m="model"><span class="mn-ai-ico">${icon('cuboid')}</span><span><strong>只替换场景</strong><small>保留镜头册、故事板、剪辑台，只换墙 / 造物 / 人物 / 灯光。</small></span></button>
    <div style="margin-top:14px">
      <input type="file" id="mnImpFile" accept=".json,application/json" style="font-size:12.5px" />
      <textarea class="mn-json-box" id="mnImpJson" placeholder="或把 AI 回的 JSON 粘到这里…（带 json 代码块围栏也能自动剥掉）" style="margin-top:10px"></textarea>
    </div>`;
  const m = openModal('导入什么？', '当前画布', body, [
    { label: '取消', ghost: true },
    { label: '导入', primary: true, fn: () => doImport(mode) },
  ], 'wide');
  $$('[data-m]', m).forEach(b => b.onclick = () => {
    $$('[data-m]', m).forEach(x => x.classList.remove('active')); b.classList.add('active'); mode = b.dataset.m;
  });
  $('#mnImpFile', m).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { $('#mnImpJson', m).value = await f.text(); toast('已读取 ' + f.name); } catch (err) { toast('读取失败', 'warn'); }
  };
  setTimeout(() => { const t = $('#mnImpJson', m); if (t) t.focus(); }, 60);
}

/* ---------- 智能导入 ----------
   认 5 种 AI 产物，只加不删（整场景才提示覆盖）：
     ① 完整项目 {scene:{...}, sun, camera, shots, storyboard}
     ② 只有场景 {scene:{...}}（mode=model 时保留机位/故事板）
     ③ 造物补丁 {props:[...]} 或 {prop:{...}}
     ④ 人物补丁 {persons:[...]} 或 {person:{...}}
     ⑤ 机位 / 分镜 {shots:[{cam}]} / {storyboard:[...]} */
function arrOf(x) { if (!x) return []; return (Array.isArray(x) ? x : [x]).filter(Boolean); }
function numOr(v, d) { const n = +v; return isFinite(n) ? n : d; }
function strOr(v, d, max) { const s = (v == null ? '' : String(v)).trim(); return (s || d).slice(0, max || 40); }

function normProp(p, i, center) {
  const w = Math.max(0.05, numOr(p.w, 1)), d = Math.max(0.05, numOr(p.d, 1)), h = Math.max(0.05, numOr(p.h, 1));
  const has = isFinite(+p.x) && isFinite(+p.y);
  return {
    id: p.id || uid(), name: strOr(p.name, '造物 ' + (i + 1), 12),
    x: has ? +p.x : center.x - w / 2, y: has ? +p.y : center.y - d / 2,
    w, d, h, color: p.color || '',
    kind: p.kind || window.MN_kindOf(p), rot: ((numOr(p.rot, 0) % 360) + 360) % 360,
    hidden: !!p.hidden,
  };
}
function normPerson(p, i, center) {
  const POSES = ['站立', '走路', '坐下', '招手', '躺下', '运动'];
  const has = isFinite(+p.x) && isFinite(+p.y);
  /* 运动轨迹：AI 搭景会直接给 path（2~6 个途经点），手工导入也认 */
  const path = arrOf(p.path).filter(q => q && isFinite(+q.x) && isFinite(+q.y)).slice(0, 8)
    .map(q => ({ x: +q.x, y: +q.y }));
  return {
    id: p.id || uid(), name: strOr(p.name, '人物 ' + (i + 1), 12),
    x: has ? +p.x : center.x, y: has ? +p.y : center.y,
    rot: ((numOr(p.rot, 90) % 360) + 360) % 360,
    color: p.color || '#2e7cf6',
    pose: path.length >= 2 ? '走路' : (POSES.indexOf(p.pose) >= 0 ? p.pose : '站立'),
    face: clamp(numOr(p.face, 1), 0.5, 2), faceDir: numOr(p.faceDir, 0), jump: clamp(numOr(p.jump, 0), 0, 3),
    ...(path.length >= 2 ? { path, speed: clamp(numOr(p.speed, 1.2), 0.3, 3) } : {}),
    hidden: !!p.hidden,
  };
}
function normScene(sc) {
  const out = {
    title: strOr(sc.title, '未命名画布', 30),
    rooms: [], walls: [], props: [], persons: [], lights: [],
    ground: Object.assign({ color: '#ffffff', grid: true }, sc.ground || {}),
  };
  arrOf(sc.rooms).forEach((r, i) => out.rooms.push({
    id: r.id || uid(), name: strOr(r.name, '房间 ' + (i + 1), 12),
    x: numOr(r.x, 0), y: numOr(r.y, 0),
    w: Math.max(0.5, numOr(r.w, 4)), d: Math.max(0.5, numOr(r.d, 4)),
    h: clamp(numOr(r.h, 4), 2.4, 8), color: r.color || '',
  }));
  arrOf(sc.walls).forEach((w, i) => out.walls.push({
    id: w.id || uid(), name: strOr(w.name, '墙面 ' + (i + 1), 12),
    x1: numOr(w.x1, 0), y1: numOr(w.y1, 0), x2: numOr(w.x2, 4), y2: numOr(w.y2, 0),
    h: clamp(numOr(w.h, 2.6), 1.2, 4),
    holes: arrOf(w.holes).map(hp => ({ t: clamp(numOr(hp.t, 0.5), 0.02, 0.98), w: clamp(numOr(hp.w, 1), 0.3, 4) })),
  }));
  arrOf(sc.props).forEach((p, i) => out.props.push(normProp(p, i, { x: 0, y: 0 })));
  arrOf(sc.persons).forEach((p, i) => out.persons.push(normPerson(p, i, { x: 0, y: 0 })));
  arrOf(sc.lights).forEach((l, i) => out.lights.push({
    id: l.id || uid(), name: strOr(l.name, '光源 ' + (i + 1), 12),
    x: numOr(l.x, 4), y: numOr(l.y, 4), color: l.color || '#ffe9b0', hidden: !!l.hidden,
  }));
  return out;
}
function applyShotList(list) {
  MN.state.directorShots = MN.state.directorShots || [];
  let n = 0;
  list.forEach((s) => {
    if (!s || !s.cam) return;
    MN.state.directorShots.push({
      image: (typeof s.image === 'string' && s.image.indexOf('data:image') === 0) ? s.image : null,
      name: strOr(s.name, '机位 ' + (MN.state.directorShots.length + 1), 20),
      note: strOr(s.note, '', 60),
      cam: {
        theta: numOr(s.cam.theta, 0.6), phi: clamp(numOr(s.cam.phi, 1), 0.02, 1.52),
        r: clamp(numOr(s.cam.r, 10), 4, 120),
        tx: numOr(s.cam.tx, 4), ty: numOr(s.cam.ty, 1.5), tz: numOr(s.cam.tz, 4),
      },
    });
    n++;
  });
  return n;
}
function applyStoryboard(list) {
  const p = ensureProject();
  let n = 0;
  list.forEach((s) => {
    if (!s) return;
    p.shots.push({
      id: uid(), title: strOr(s.title || s.name, '分镜 ' + (p.shots.length + 1), 30),
      duration: clamp(numOr(s.duration, 3), 1, 20),
      scene: strOr(s.scene || s.shot, '中景', 10),
      action: s.action || '', dialogue: s.dialogue || '', camera: s.camera || '',
      image: null, strokes: [], audio: null,
    });
    n++;
  });
  return n;
}

function importAiData(data, mode) {
  if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象');
  const st = MN.state;
  const center = computeBoundsCenter();
  const hasScene = !!(data.scene && typeof data.scene === 'object');
  const propsIn = arrOf(data.props || data.prop || data.objects);
  const personsIn = arrOf(data.persons || data.person || data.actors);
  const lightsIn = arrOf(data.lights || data.light);
  const allShots = arrOf(data.shots || data.directorShots);
  const shotsIn = allShots.filter(s => s && s.cam);
  const boardIn = arrOf(data.storyboard || data.board).concat(allShots.filter(s => s && !s.cam && (s.action != null || s.duration != null || s.scene != null)));
  const parts = [];

  if (hasScene) {
    pushUndo();
    const sc = normScene(data.scene);
    if (mode === 'model') {
      st.scene = sc;
      if (data.sun) st.sun = Object.assign(st.sun || {}, data.sun);
      if (data.camera) st.camera = Object.assign(st.camera || {}, data.camera);
      parts.push('场景（保留机位/故事板）');
    } else {
      st.scene = sc;
      if (data.view) st.view = Object.assign(st.view || {}, data.view);
      if (data.sun) st.sun = Object.assign(st.sun || {}, data.sun);
      if (data.camera) st.camera = Object.assign(st.camera || {}, data.camera);
      if (Array.isArray(data.directorShots)) st.directorShots = [];
      st.project = data.project || null;
      st.cuttingDesk = data.cuttingDesk || null;
      st.cameraPath = data.cameraPath || null;
      parts.push(`${sc.rooms.length} 房间 / ${sc.walls.length} 墙 / ${sc.props.length} 造物 / ${sc.persons.length} 人`);
    }
  } else {
    const addProps = propsIn.map((p, i) => normProp(p, i, center));
    const addPersons = personsIn.map((p, i) => normPerson(p, i, center));
    const addLights = lightsIn.map((l, i) => ({
      id: l.id || uid(), name: strOr(l.name, '光源 ' + (i + 1), 12),
      x: numOr(l.x, center.x), y: numOr(l.y, center.y), color: l.color || '#ffe9b0', hidden: false,
    }));
    if (addProps.length || addPersons.length || addLights.length) pushUndo();
    if (addProps.length) { st.scene.props = (st.scene.props || []).concat(addProps); parts.push(addProps.length + ' 个造物'); }
    if (addPersons.length) { st.scene.persons = (st.scene.persons || []).concat(addPersons); parts.push(addPersons.length + ' 个人物'); }
    if (addLights.length) { st.scene.lights = (st.scene.lights || []).concat(addLights); parts.push(addLights.length + ' 个光源'); }
  }

  const nShots = applyShotList(shotsIn);
  if (nShots) parts.push(nShots + ' 个机位');
  const nBoard = applyStoryboard(boardIn);
  if (nBoard) parts.push(nBoard + ' 条分镜');

  if (!parts.length) throw new Error('没认出里面的场景 / 造物 / 人物 / 机位 / 分镜');
  MN.sel = null;
  return { msg: '导入成功：' + parts.join(' · ') + (hasScene ? '（点「立起来」看立体）' : '') };
}

function doImport(mode) {
  let txt = ($('#mnImpJson') ? $('#mnImpJson').value : '').trim();
  if (!txt) { toast('先选文件或粘 JSON', 'warn'); return; }
  // AI 常把 JSON 包在 ```json 代码块里，顺手剥掉
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) txt = fence[1].trim();
  let data;
  try { data = JSON.parse(txt); } catch (e) { return toast('JSON 格式不对：' + e.message, 'warn'); }
  const hasScene = !!(data && data.scene);
  if (hasScene && !confirm(mode === 'model' ? '只替换场景？墙 / 造物 / 人物 / 灯光会换掉，机位和故事板保留。' : '这是一个完整项目，会覆盖当前画布全部内容（可先导出备份）。继续？')) return;
  try {
    const r = importAiData(data, mode);
    closeModal(); renderAll(); saveSoon();
    toast(r.msg, 'ok');
  } catch (e) { toast('导入失败：' + e.message, 'warn'); }
}

/* 拖文件 / 粘文本的快捷入口（AI 给的 .json 直接丢进窗口就行） */
function importText(txt, label) {
  let t = String(txt || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  let data;
  try { data = JSON.parse(t); } catch (e) { toast((label || 'JSON') + ' 解析失败：' + e.message, 'warn'); return false; }
  if (data && data.scene && !confirm('这是一个完整场景，会覆盖当前画布内容（可先导出备份）。继续？')) return false;
  try {
    const r = importAiData(data, 'auto');
    renderAll(); saveSoon(); toast(r.msg, 'ok'); return true;
  } catch (e) { toast('导入失败：' + e.message, 'warn'); return false; }
}

/* ---------- 主题 ---------- */
function toggleTheme() {
  const root = $('#mnRoot');
  const dark = root.dataset.mnTheme === 'dark';
  root.dataset.mnTheme = dark ? '' : 'dark';
  try { localStorage.setItem('miorning-director-dark', dark ? '0' : '1'); } catch (e) { }
  syncPal();
  const btn = $('#mnBtnTheme');
  if (btn) btn.innerHTML = icon(dark ? 'moon' : 'sun');
  paint();
}

/* ---------- 弹窗框架 ---------- */
function openModal(title, eyebrow, bodyHtml, footBtns, wide) {
  closeModal();
  const back = el('div', 'mn-modal-back');
  const m = el('div', 'mn-modal' + (wide ? ' wide' : ''));
  m.innerHTML = `<div class="mn-modal-head"><div>${eyebrow ? `<span class="mn-eyebrow">${esc(eyebrow)}</span>` : ''}<strong>${esc(title)}</strong></div>
    <button class="mn-modal-x">${icon('x')}</button></div>
    <div class="mn-modal-body">${bodyHtml}</div>
    ${footBtns && footBtns.length ? `<div class="mn-modal-foot"><span class="sp"></span>${footBtns.map((b, i) => `<button class="mn-btn ${b.primary ? 'primary' : ''}" data-fi="${i}">${b.label}</button>`).join('')}</div>` : ''}`;
  back.appendChild(m);
  $('#mnRoot').appendChild(back);
  $('.mn-modal-x', m).onclick = closeModal;
  back.onclick = e => { if (e.target === back) closeModal(); };
  if (footBtns) footBtns.forEach((b, i) => { const btn = $(`[data-fi="${i}"]`, m); if (btn) btn.onclick = () => (b.fn ? b.fn() : closeModal()); });
  return m;
}
function closeModal() { const b = $('.mn-modal-back'); if (b) b.remove(); }

/* ---------- 帮助弹窗 ---------- */
function openHelpModal() {
  const body = `
    <div class="mn-help-step"><span class="mn-step-no">01</span><div><strong>画空间</strong><p>拖框画房间，两两连续画墙，造物也划拉矩形，默认高 4 格。拖的时候，空格拖动平移。</p></div></div>
    <div class="mn-help-step"><span class="mn-step-no">02</span><div><strong>改两下</strong><p><b>右键点物体</b>：删除 / 复制 / 改名 / 置顶 / 旋转 / 打洞。<b>右键拖画布</b>：平移。<b>空白处拖动</b>：框选多个（Shift 加选）。方向键微调，Del 删除，Ctrl+Z 撤销，双击改名。</p></div></div>
    <div class="mn-help-step"><span class="mn-step-no">03</span><div><strong>找镜头</strong><p>选中物体，绕着它旋转、缩放、双击聚焦，F 聚全，P 配这截。镜头可拖动画画中，双击看大图。清单里的右下角有快照名。</p></div></div>
    <div class="mn-help-step"><span class="mn-step-no">04</span><div><strong>让 AI 搭</strong><p>左上角「AI 规则」里有 5 条现成规则：描述想法出场景、俯视图还原、生成造物、生成人物姿势、剧情出三镜预演。复制 / 下载交给 AI，拿回的 JSON 拖进窗口就导入。</p></div></div>
    <p class="mn-help-para">想省事就用「物件库」：右侧点一个家具，再点画布就落地，连着点连着放，Esc 退出。3D 里左拖转视角、滚轮缩放、右键平移、双击聚焦；「立起来」之后点「＋」把当前机位存进镜头册，双击镜头回机位。剪辑台（E）把镜头册的图排成片：拖入拆分、空格播放、Ctrl+C 在播放头处分割、Delete 删除片段，最后导出成片。</p>
    <p class="mn-help-para">剪辑台（E）：上下方向素材，下方排成片，拖入可拆分。空格 播放/暂停，Ctrl+C 分割，Ctrl+Z 恢复撤销，停转拖右边调长短，右侧可补录、配音、加转场与手转效果，再导出成片；完整项目可一起保存。</p>
    <div class="mn-help-more" id="mnHelpMore">${icon('chevron-down', 's14')}更细说明</div>
    <div id="mnHelpMoreBox" hidden>
      <p class="mn-help-para" style="margin-top:10px">画房间后可以直接拖墙改格局；画墙时斜着也行，两头的端点会自动吸附网格。打洞点一下墙就开门洞，做门做窗都快。造物默认 1 格高，右侧可以改宽深高和颜色，也能复制粘贴摆一排。人物放下去后，右侧能改姿态、人脸大小、颜色、位置和朝向——摆好站位，再去 3D 里找镜头。</p>
    </div>`;
  const m = openModal('会划拉，就能搭。', '导演台', body, null, 'wide');
  $('#mnHelpMore', m).onclick = () => {
    const box = $('#mnHelpMoreBox', m);
    box.hidden = !box.hidden;
    $('#mnHelpMore', m).style.transform = box.hidden ? '' : 'rotate(180deg)';
  };
}

/* ---------- 快捷键弹窗 ---------- */
const DEF_KEYS = { select: 'V', room: 'R', wall: 'L', prop: 'B', hole: 'H', person: 'N', path: 'P', pan: 'Space', sun: 'O', genie: 'J', motion: 'M', cut: 'E' };
function openKeysModal() {
  const prefs = MN.state.editorPreferences;
  const keys = Object.assign({}, DEF_KEYS, prefs.shortcuts || {});
  const rows = [
    ['select', '选择', '默认 V'], ['room', '画房间 / 走进中物体', '默认 R'], ['wall', '画墙', '默认 L'],
    ['prop', '造物', '默认 B'], ['hole', '打洞', '默认 H'], ['person', '放人物', '默认 N'],
    ['pan', '拖住平移', '拖住生效'], ['sun', '光影调节', '默认 O'],
  ];
  const editRows = [
    ['右键点物体', '删除 / 复制 / 改名 / 置顶 / 旋转 / 打洞'],
    ['右键拖画布', '平移视图'],
    ['空白处拖动', '框选多个（Shift 追加）'],
    ['Del', '删除选中的全部'],
    ['Ctrl + Z / Y', '撤销 / 重做'],
    ['Ctrl + D', '原地复制一份'],
    ['Ctrl + C / V', '复制 / 粘贴'],
    ['Ctrl + A', '全选'],
    ['方向键', '微调 0.5 格（Shift 0.1 格）'],
    ['F2 / 双击', '重命名'],
    ['滚轮', '以鼠标为中心缩放'],
    ['Esc', '退出放置 / 取消选择'],
  ];
  const body = `<div class="mn-key-static">${editRows.map(r => `<div class="mn-key-static-row"><kbd>${r[0]}</kbd><span>${r[1]}</span></div>`).join('')}</div>
    <p class="mn-help-para" style="margin:12px 0 8px">下面这些是工具键。点「录制」后按键，就能直接改写。</p>
    <div style="column-count:2;column-gap:24px">${rows.map(r => `<div class="mn-key-row"><span class="mn-key-name">${r[1]}<small>${r[2]}</small></span><input class="mn-key-input" data-k="${r[0]}" value="${esc(keys[r[0]])}" readonly /><button class="mn-ghost" data-rec="${r[0]}">${icon('loader-circle', 's12')}录制</button></div>`).join('')}</div>
    <p class="mn-help-para" style="margin-top:10px">保存后立即生效，只存在这台机器。</p>`;
  const m = openModal('快捷键，按你的来。', '导演台', body, [
    { label: '恢复默认', ghost: true, fn: () => { prefs.shortcuts = {}; saveSoon(); closeModal(); toast('已恢复默认'); } },
    { label: '保存', primary: true, fn: () => { prefs.shortcuts = keys; saveSoon(); closeModal(); toast('快捷键已保存'); } },
  ]);
  $$('[data-rec]', m).forEach(b => b.onclick = () => {
    const inp = $(`[data-k="${b.dataset.rec}"]`, m);
    inp.classList.add('recording'); inp.value = '按下…'; inp.focus();
    const h = e => {
      e.preventDefault(); e.stopPropagation();
      const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      inp.value = k; keys[b.dataset.rec] = k;
      inp.classList.remove('recording');
      window.removeEventListener('keydown', h, true);
    };
    window.addEventListener('keydown', h, true);
  });
  $$('[data-k]', m).forEach(inp => inp.onclick = () => { inp.select(); });
}

/* ---------- AI 规则弹窗（2026-10-26 重做：5 条真规则，可预览 / 复制 / 下载 / 直接导入） ----------
   规则正文在 js/mn-rules.js（window.MN_RULES），这里只负责界面。 */
function copyText(txt) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove(); return ok;
    } catch (e) { return false; }
  };
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(txt).then(() => true).catch(fallback);
  }
  return Promise.resolve(fallback());
}
function downloadText(name, txt, mime) {
  const blob = new Blob([txt], { type: (mime || 'text/markdown') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
let aiRuleIdx = 0;
function openAiModal(startIdx) {
  const rules = window.MN_RULES || [];
  if (!rules.length) { toast('规则文件没加载上，刷新页面再试', 'warn'); return; }
  aiRuleIdx = Math.max(0, Math.min(rules.length - 1, startIdx | 0));
  const body = `
    <p class="mn-help-para">挑一条交给 AI —— 你管拍啥，AI 管搭。规则整个复制走，豆包 / 通义 / Claude / GPT 都行；把 AI 回的 JSON 贴回来就能导入。</p>
    <div class="mn-ai-wrap">
      <div class="mn-ai-list" id="mnAiList">
        ${rules.map((r, i) => `<button class="mn-ai-card" data-rule="${i}">
          <span class="mn-ai-ico">${icon(r.icon, 's18')}</span>
          <span class="mn-ai-txt"><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></span>
          <span class="mn-ai-tag">${esc(r.tag || '')}</span>
        </button>`).join('')}
      </div>
      <div class="mn-ai-pane">
        <div class="mn-ai-pane-head">
          <strong id="mnAiPaneTitle"></strong>
          <span class="mn-ai-pane-acts">
            <button class="mn-ghost" id="mnAiCopy">${icon('copy', 's12')}复制规则</button>
            <button class="mn-ghost" id="mnAiDown">${icon('download', 's12')}下载 .md</button>
          </span>
        </div>
        <pre class="mn-ai-pre" id="mnAiPre"></pre>
        <div class="mn-ai-steps">
          <span><b>1</b> 复制 / 下载规则</span>
          <span><b>2</b> 粘给 AI，改掉文末「我的描述」</span>
          <span><b>3</b> 把 AI 回的 JSON 导进来</span>
        </div>
      </div>
    </div>`;
  const m = openModal('让 AI 搭，你来拍。', '导演台 · 5 条规则', body, [
    { label: '⬇ 下载全部规则', ghost: true, fn: () => { downloadText('白日梦导演台-AI搭建规则合集.md', window.MN_RULES_ALL ? window.MN_RULES_ALL() : ''); toast('已下载规则合集（5 条）', 'ok'); } },
    { label: '导入 AI 生成的 JSON', primary: true, fn: () => { closeModal(); setTimeout(() => openImportModal(), 80); } },
  ], 'wide');
  const list = $$('.mn-ai-card', m);
  const show = (i) => {
    aiRuleIdx = i;
    const r = rules[i];
    list.forEach((b, j) => b.classList.toggle('active', j === i));
    $('#mnAiPaneTitle', m).textContent = r.title;
    const pre = $('#mnAiPre', m);
    pre.textContent = r.md; pre.scrollTop = 0;
  };
  list.forEach((b, i) => b.onclick = () => show(i));
  $('#mnAiCopy', m).onclick = () => copyText(rules[aiRuleIdx].md).then(ok => toast(ok ? '规则已复制，去粘给 AI 吧' : '复制失败，用「下载 .md」也一样', ok ? 'ok' : 'warn'));
  $('#mnAiDown', m).onclick = () => { downloadText(rules[aiRuleIdx].file, rules[aiRuleIdx].md); toast('已下载：' + rules[aiRuleIdx].file, 'ok'); };
  show(aiRuleIdx);
}

/* ---------- 场景模板弹窗 ---------- */
function openTplModal() {
  const body = `<p class="mn-help-para">点一个直接铺进当前画布（会覆盖现有内容，先导出备份）。</p>
    <div class="mn-template-grid">${TEMPLATES.map((t, i) => `<button class="mn-template-card" data-tpl="${i}"><span class="mn-tpl-thumb">${icon(t.ico)}</span><span>${t.name}</span></button>`).join('')}</div>`;
  const m = openModal('场景模板', '导演台 · 搭好的直接拿', body, [{ label: '关闭', ghost: true }], 'wide');
  $$('[data-tpl]', m).forEach(b => b.onclick = () => {
    const t = TEMPLATES[+b.dataset.tpl];
    if (!confirm(`把「${t.name}」铺进当前画布？现有内容会被覆盖。`)) return;
    pushUndo();
    MN.state = t.make();
    MN.sel = null; closeModal(); renderAll(); saveSoon(); toast('已换上模板：' + t.name);
  });
}

/* ---------- 键盘 ---------- */
function onKeyDown(e) {
  if (MN.storyOpen) return;   // 故事板里不触发导演台快捷键
  if (!secActive()) return;   // 移植版：AI-Studio 页面激活 或 场景搭建浮层打开
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const prefs = MN.state ? MN.state.editorPreferences : {};
  const keys = Object.assign({}, DEF_KEYS, prefs.shortcuts || {});
  const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (k === 'Z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (k === 'Y') { e.preventDefault(); redo(); return; }
    if (k === 'C') { e.preventDefault(); copySel(); return; }
    if (k === 'V') { e.preventDefault(); pasteClip(1, 1); return; }
    if (k === 'D') { e.preventDefault(); duplicateSel(); return; }
    if (k === 'A') { e.preventDefault(); selectAll(); return; }
    if (k === 'K') { e.preventDefault(); const s = $('#mnTreeSearch'); if (s) { s.focus(); } return; }
    return;
  }
  if (e.key === 'Escape') {
    if ($('.mn-modal-back')) { closeModal(); return; }
    if ($('#mnCtx')) { closeCtx(); return; }
    if (MN.pathDraft) { finishPath(); return; }
    if (MN.pending) { MN.pending = null; clearSel(); refreshSel(); toast('退出放置'); return; }
    if (MN.immersive) { toggleImmersive(); return; }
    if (MN.wallDraft) { MN.wallDraft = null; paint(); return; }
    if (selList().length) { clearSel(); refreshSel(); return; }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selList().length) { e.preventDefault(); delSel(); }
    return;
  }
  if (e.key === 'F2') { e.preventDefault(); renameSel(); return; }
  /* 方向键微调：0.5 格，按住 Shift 0.1 格 */
  if (e.key.indexOf('Arrow') === 0) {
    if (!selList().length) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.5;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    nudgeSel(dx, dy);
    return;
  }
  if (e.key === ' ') { MN.spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
  /* 3D 视图：Q/E 旋转选中物体（墙绕中点转，其余改 rot） */
  if (MN.state && MN.state.view.mode === '3d' && (k === 'Q' || k === 'E') && selList().length) {
    e.preventDefault();
    const step = k === 'E' ? 15 : -15;
    pushUndo();
    selList().forEach(s => {
      const o = findObj(s.kind, s.id); if (!o) return;
      if (s.kind === 'wall') {
        const cx = (o.x1 + o.x2) / 2, cz = (o.y1 + o.y2) / 2;
        const a = step * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        const rp = (x, z) => [cx + (x - cx) * ca - (z - cz) * sa, cz + (x - cx) * sa + (z - cz) * ca];
        const p1 = rp(o.x1, o.y1), p2 = rp(o.x2, o.y2);
        o.x1 = p1[0]; o.y1 = p1[1]; o.x2 = p2[0]; o.y2 = p2[1];
      } else {
        o.rot = ((+o.rot || 0) + step + 360) % 360;
      }
    });
    refreshSel(); saveSoon();
    toast(`旋转 ${step > 0 ? '+' : ''}${step}°`);
    return;
  }
  for (const [id, kk] of Object.entries(keys)) {
    // ⚠️ 别再把 select 排除掉：原版 V=选择，排除后按 V 没反应，点击会继续放小人（1.10.28 QA 实测）
    if (k === kk.toUpperCase()) {
      e.preventDefault();
      if (id === 'pan') { setTool('pan'); return; }
      if (id === 'sun') { openSunModal(); return; }
      if (id === 'light') { openLightModal(); return; }
    const t2 = TOOLS.find(x => x.id === id);
    if (t2 && t2.soon) { toast(`🚧 「${t2.name}」建设中（${t2.soon}）`); return; }
    setTool(id);
    return;
    }
  }
  if (k === 'F' && MN.state && MN.state.view.mode === '3d' && window.MN3D) { MN3D.frame(); return; }
}
function onKeyUp(e) {
  if (e.key === ' ') { MN.spaceDown = false; if (cv) cv.style.cursor = 'default'; }
}

/* ---------- 总渲染 ---------- */
function renderAll() {
  renderLeft(); renderRight(); renderShots(); paint(); render3D();
}
function fitView() {
  const st = $('#mnStage'); if (!st) { MN.view = { x: 80, y: 60, k: 1 }; return; }
  const W = st.clientWidth, H = st.clientHeight;
  const sc = MN.state.scene;
  /* 2026-10-26：原来只算房间，纯墙场景 / 只有道具的场景会「适配」到奇怪的位置 */
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x0, y0, x1, y1) => { minX = Math.min(minX, x0); minY = Math.min(minY, y0); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1); };
  sc.rooms.forEach(r => acc(r.x, r.y, r.x + r.w, r.y + r.d));
  sc.walls.forEach(w => acc(Math.min(w.x1, w.x2), Math.min(w.y1, w.y2), Math.max(w.x1, w.x2), Math.max(w.y1, w.y2)));
  sc.props.forEach(p => acc(p.x, p.y, p.x + p.w, p.y + p.d));
  sc.persons.forEach(p => acc(p.x, p.y, p.x, p.y));
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 16; maxY = 16; }
  const pad = 2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const bw = Math.max(2, maxX - minX), bh = Math.max(2, maxY - minY);
  const k = clamp(Math.min(W / (bw * CELL), H / (bh * CELL)), 0.3, 1.2);
  MN.view.k = k;
  MN.view.x = (W - bw * CELL * k) / 2 - minX * CELL * k;
  MN.view.y = (H - bh * CELL * k) / 2 - minY * CELL * k;
}

/* ---------- 启动 ---------- */
async function loadMiaoning() {
  const root = $('#mnRoot');
  if (!root) return;
  if (!MN.built) {
    MN.built = true;
    try { if (localStorage.getItem('miorning-director-dark') === '1') root.dataset.mnTheme = 'dark'; } catch (e) { }
    syncPal();
    buildShell();
    cv = $('#mnCanvas');
    ctx = cv.getContext('2d');
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => { if (secActive()) resizeCanvas(); if (MN.storyOpen) sbFitStage(); });
    const hint = $('#mnHint');
    hint.innerHTML = `${icon('mouse-pointer-2', 's14')}<span>点选 · 拖动移动 · 右键删除 · 空白拖动框选</span>`;
    // 拖一个 .json 进来 = 导入（AI 产出的文件直接丢进窗口）
    root.addEventListener('dragover', e => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); root.classList.add('mn-dropping'); }
    });
    root.addEventListener('dragleave', e => { if (!e.relatedTarget) root.classList.remove('mn-dropping'); });
    root.addEventListener('drop', async e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault(); root.classList.remove('mn-dropping');
      if (!/\.json$/i.test(f.name) && (f.type || '').indexOf('json') < 0) { toast('只认 .json 文件（规则文件是 .md，用来喂 AI 的）', 'warn'); return; }
      try { importText(await f.text(), f.name); } catch (err) { toast('文件读不动：' + err.message, 'warn'); }
    });
    // Ctrl/Cmd + Shift + V：把剪贴板里的 JSON 直接导入（比开弹窗快一步）
    document.addEventListener('paste', e => {
      if (!secActive() || MN.storyOpen) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const txt = (e.clipboardData || window.clipboardData || {}).getData ? (e.clipboardData || window.clipboardData).getData('text') : '';
      if (!txt || txt.trim().charAt(0) !== '{') return;
      e.preventDefault(); importText(txt, '剪贴板');
    });
  }
  await loadCanvas(MN.canvasId);
  setTimeout(resizeCanvas, 60);
}
/* 激活判定：AI-Studio 的 #page-miaoning.active，或 bairimeng-director 的场景搭建浮层 #sbMnOverlay.open（2026-10-25 移植新增） */
function secActive() {
  const s = $('#page-miaoning');
  if (s && s.classList.contains('active')) return true;
  const ov = $('#sbMnOverlay');
  return !!(ov && ov.classList.contains('open'));
}
/* 页面每次显示时重算画布尺寸（切页回来不小） */
const _origGoto = window.goto;
if (typeof _origGoto === 'function') {
  window.goto = function (p) { const r = _origGoto.apply(this, arguments); if (p === 'miaoning') setTimeout(resizeCanvas, 80); return r; };
}

/* ================================================================ 故事板（M4）
   v1.10.43：实现「去往故事板」。仿 B 站喵咛导演台，但加了「傻瓜模式」——
   一键把导演台镜头册同步成故事板分镜，灵魂画手也能用。支持 4K 图片导出与 MP4 导出。 */

/* ---------- 故事板数据 ---------- */
function blankProject() {
  return { title: (MN.state && MN.state.scene && MN.state.scene.title) || '未命名故事板', aspect: '16:9', target: 30, shots: [] };
}
function ensureProject() { if (!MN.state.project) MN.state.project = blankProject(); return MN.state.project; }
function sbAspectWH(aspect) {
  const m = { '16:9': [16, 9], '21:9': [21, 9], '4:3': [4, 3], '1:1': [1, 1], '9:16': [9, 16] };
  return m[aspect] || [16, 9];
}
function sbCanvasSize(aspect) {              // 内部分辨率（最长边 1600），CSS 再缩放显示
  const [w, h] = sbAspectWH(aspect);
  return w >= h ? { w: 1600, h: Math.round(1600 * h / w) } : { w: Math.round(1600 * w / h), h: 1600 };
}
const SB_COLORS = ['#121212', '#e1453e', '#e8a33d', '#3da35d', '#2f6db5', '#7b4fd1', '#d14f9e', '#1fb6c9', '#8a5a2b', '#c9c9c9', '#ffffff', '#000000'];
const SB_SIZES = [3, 6, 12];
function pad2(n) { return String(n).padStart(2, '0'); }
function sbCurrentShot() { const p = MN.state && MN.state.project; if (!p || !p.shots.length) return null; const i = MN.sbSel | 0; return p.shots[i] || p.shots[0]; }

/* ---------- 打开 / 关闭 ---------- */
function openStoryboard() {
  MN.storyOpen = true;
  MN.sbSel = 0;
  ensureProject();
  const root = $('#mnRoot'); if (!root) return;
  const app = $('.mn-app', root);
  if (app) app.style.display = 'none';
  let sb = $('#mnStory', root);
  if (!sb) { sb = el('div', 'mn-story'); sb.id = 'mnStory'; root.appendChild(sb); }
  sb.style.display = 'flex';
  renderStoryboard();
}
function closeStoryboard() {
  MN.storyOpen = false;
  const root = $('#mnRoot');
  const sb = $('#mnStory', root); if (sb) sb.style.display = 'none';
  const app = $('.mn-app', root); if (app) app.style.display = 'flex';
  saveSoon();
  if (secActive()) renderAll();
}

/* ---------- 渲染骨架 ---------- */
function renderStoryboard() {
  const root = $('#mnStory'); if (!root) return;
  const p = ensureProject();
  const dark = $('#mnRoot').dataset.mnTheme === 'dark';
  root.dataset.mnTheme = dark ? 'dark' : '';
  const sz = sbCanvasSize(p.aspect);
  root.innerHTML = `
    <header class="mn-sb-top">
      <button class="mn-sb-back" id="sbBack">${icon('arrow-left')} 返回导演台</button>
      <input class="mn-sb-title" id="sbTitle" value="${esc(p.title)}" maxlength="40" />
      <span class="mn-sb-meta">画幅
        <select id="sbAspect" class="mn-sb-sel">
          ${['16:9', '21:9', '4:3', '1:1', '9:16'].map(a => `<option ${a === p.aspect ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
      </span>
      <span class="mn-sb-meta">目标 <input id="sbTarget" class="mn-sb-num" type="number" min="1" value="${p.target}" /> 秒 · 当前 <b id="sbTotal">0</b> 秒</span>
      <span class="mn-sb-spacer"></span>
      <button class="mn-sb-btn" id="sbAiRule" title="让 AI 按规则出三镜预演 + 分镜表">${icon('file-braces')} AI 分镜规则</button>
      <button class="mn-sb-btn primary" id="sbGen">${icon('sparkles')} 一键生成故事板</button>
      <button class="mn-sb-btn" id="sbImg4k">${icon('image')} 下载全部图片(4K)</button>
      <button class="mn-sb-btn" id="sbMp4">${icon('film')} 导出 MP4</button>
      <button class="mn-sb-btn icon" id="sbTheme" title="夜间">${icon(dark ? 'sun' : 'moon')}</button>
    </header>
    <div class="mn-sb-main">
      <aside class="mn-sb-left">
        <div class="mn-sb-left-head"><span>分镜列表</span><button class="mn-sb-mini" id="sbAdd">+ 新增</button></div>
        <div class="mn-sb-list" id="sbList"></div>
      </aside>
      <section class="mn-sb-center">
        <div class="mn-sb-proj">
          <span class="mn-eyebrow">项目头</span>
          <strong>${esc(p.title) || '未命名故事板'}</strong>
          <small>不会画，也能拍片。</small>
        </div>
        <div class="mn-sb-canvas-wrap" id="sbWrap">
          <div class="mn-sb-stage" id="sbStage">
            <canvas class="mn-sb-bg" id="sbBg" width="${sz.w}" height="${sz.h}"></canvas>
            <canvas class="mn-sb-ink" id="sbInk" width="${sz.w}" height="${sz.h}"></canvas>
          </div>
        </div>
        <div class="mn-sb-tools">
          <button class="mn-sb-tool active" data-tool="pen" id="sbPen">${icon('pen')} 画笔</button>
          <button class="mn-sb-tool" data-tool="eraser" id="sbEraser">${icon('eraser')} 橡皮</button>
          <span class="mn-sb-colors" id="sbColors"></span>
          <span class="mn-sb-sizes" id="sbSizes"></span>
          <span class="mn-sb-spacer"></span>
          <button class="mn-sb-mini" id="sbUndo">撤销</button>
          <button class="mn-sb-mini danger" id="sbClear">清空本镜</button>
        </div>
      </section>
      <aside class="mn-sb-right" id="sbRight"></aside>
    </div>
    <footer class="mn-sb-timeline">
      <div class="mn-sb-tl-head">
        <span>节奏时间线</span>
        <span class="mn-sb-tl-actions">
          <button class="mn-sb-mini" id="sbDup">复制</button>
          <button class="mn-sb-mini danger" id="sbDel">删除</button>
          <button class="mn-sb-mini" id="sbUp">上移</button>
          <button class="mn-sb-mini" id="sbDown">下移</button>
        </span>
      </div>
      <div class="mn-sb-tl-track" id="sbTimeline"></div>
    </footer>`;
  bindStoryboard();
  buildSbColorChips();
  buildSbSizeChips();
  sbRenderList();
  sbRenderCanvas();
  sbRenderRight();
  sbRenderTimeline();
  sbUpdateTotal();
}

/* ---------- 绑定事件 ---------- */
function bindStoryboard() {
  MN.sbColor = MN.sbColor || '#121212'; MN.sbSize = MN.sbSize || 6; MN.sbTool = MN.sbTool || 'pen';
  $('#sbBack').onclick = closeStoryboard;
  $('#sbTitle').oninput = e => { ensureProject().title = e.target.value; saveSoon(); const h = $('#mn-sb-proj strong'); if (h) h.textContent = e.target.value || '未命名故事板'; };
  $('#sbAspect').onchange = e => { ensureProject().aspect = e.target.value; saveSoon(); renderStoryboard(); };
  $('#sbTarget').oninput = e => { const v = parseFloat(e.target.value); ensureProject().target = isNaN(v) ? 30 : v; saveSoon(); sbUpdateTotal(); };
  $('#sbGen').onclick = generateFromDirector;
  $('#sbAiRule').onclick = () => openAiModal(4);
  $('#sbImg4k').onclick = () => exportStoryboardImages();
  $('#sbMp4').onclick = () => exportStoryboardMP4();
  $('#sbTheme').onclick = () => { const r = $('#mnRoot'); const d = r.dataset.mnTheme === 'dark'; r.dataset.mnTheme = d ? '' : 'dark'; try { localStorage.setItem('miorning-director-dark', d ? '0' : '1'); } catch (e) { } syncPal(); renderStoryboard(); };
  $('#sbAdd').onclick = () => sbAddShot();
  $('#sbDup').onclick = () => sbDupShot();
  $('#sbDel').onclick = () => sbDelShot();
  $('#sbUp').onclick = () => sbMoveShot(-1);
  $('#sbDown').onclick = () => sbMoveShot(1);
  $('#sbUndo').onclick = sbUndoInk;
  $('#sbClear').onclick = sbClearInk;
  $$('.mn-sb-tool').forEach(b => b.onclick = () => { $$('.mn-sb-tool').forEach(x => x.classList.remove('active')); b.classList.add('active'); MN.sbTool = b.dataset.tool; });
  // 画布指针事件
  const ink = $('#sbInk');
  ink.addEventListener('pointerdown', sbPointerDown);
  ink.addEventListener('pointermove', sbPointerMove);
  ink.addEventListener('pointerup', sbPointerUp);
  ink.addEventListener('pointercancel', sbPointerUp);
  ink.addEventListener('pointerleave', sbPointerUp);
}

function buildSbColorChips() {
  const box = $('#sbColors'); if (!box) return;
  box.innerHTML = SB_COLORS.map((c, i) => `<button class="mn-sb-color ${i === 0 ? 'active' : ''}" data-c="${c}" style="background:${c}"></button>`).join('');
  $$('.mn-sb-color', box).forEach(b => b.onclick = () => { $$('.mn-sb-color', box).forEach(x => x.classList.remove('active')); b.classList.add('active'); MN.sbColor = b.dataset.c; if (MN.sbTool === 'eraser') { MN.sbTool = 'pen'; $('#sbEraser').classList.remove('active'); $('#sbPen').classList.add('active'); } });
}
function buildSbSizeChips() {
  const box = $('#sbSizes'); if (!box) return;
  box.innerHTML = SB_SIZES.map((s, i) => `<button class="mn-sb-size ${i === 1 ? 'active' : ''}" data-s="${s}"><i style="width:${s}px;height:${i === 2 ? 12 : (i ? 7 : 4)}px"></i></button>`).join('');
  $$('.mn-sb-size', box).forEach(b => b.onclick = () => { $$('.mn-sb-size', box).forEach(x => x.classList.remove('active')); b.classList.add('active'); MN.sbSize = +b.dataset.s; });
}

/* ---------- 分镜列表 ---------- */
function sbRenderList() {
  const box = $('#sbList'); if (!box) return;
  const p = ensureProject();
  if (!p.shots.length) {
    box.innerHTML = `<div class="mn-sb-empty">还没分镜。<br>点右上「一键生成故事板」试试傻瓜模式。
      <button class="mn-sb-mini" id="sbEmptyGen" style="margin-top:10px">${icon('sparkles', 's12')} 现在就生成</button></div>`;
    const b = $('#sbEmptyGen', box); if (b) b.onclick = generateFromDirector;
    return;
  }
  box.innerHTML = p.shots.map((s, i) => `
    <div class="mn-sb-shot ${i === (MN.sbSel | 0) ? 'active' : ''}" data-i="${i}">
      <img class="mn-sb-shot-img" src="${s.image || ''}" ${s.image ? '' : 'data-empty="1"'} />
      <div class="mn-sb-shot-info">
        <b>${pad2(i + 1)}. ${esc(s.title || '未命名')}</b>
        <small>${esc(s.scene || '景别')} · ${s.duration || 3}s</small>
      </div>
    </div>`).join('');
  $$('.mn-sb-shot', box).forEach(d => d.onclick = () => { MN.sbSel = +d.dataset.i; sbRenderList(); sbRenderCanvas(); sbRenderRight(); });
}
function sbAddShot() {
  const p = ensureProject();
  p.shots.push({ id: uid(), title: '新分镜 ' + (p.shots.length + 1), duration: 3, scene: '中景', action: '', dialogue: '', image: null, strokes: [], audio: null });
  MN.sbSel = p.shots.length - 1; saveSoon(); sbRenderList(); sbRenderCanvas(); sbRenderRight(); sbRenderTimeline(); sbUpdateTotal();
}
function sbDupShot() {
  const p = ensureProject(); const i = MN.sbSel | 0; if (!p.shots[i]) return;
  const c = JSON.parse(JSON.stringify(p.shots[i])); c.id = uid(); c.title = (c.title || '分镜') + ' 副本';
  p.shots.splice(i + 1, 0, c); MN.sbSel = i + 1; saveSoon(); sbRenderList(); sbRenderCanvas(); sbRenderRight(); sbRenderTimeline(); sbUpdateTotal();
}
function sbDelShot() {
  const p = ensureProject(); const i = MN.sbSel | 0; if (!p.shots[i]) return;
  if (!confirm('删除第 ' + (i + 1) + ' 个分镜？')) return;
  p.shots.splice(i, 1); MN.sbSel = Math.max(0, Math.min(i, p.shots.length - 1)); saveSoon(); sbRenderList(); sbRenderCanvas(); sbRenderRight(); sbRenderTimeline(); sbUpdateTotal();
}
function sbMoveShot(d) {
  const p = ensureProject(); const i = MN.sbSel | 0; const j = i + d; if (!p.shots[i] || !p.shots[j]) return;
  const t = p.shots[i]; p.shots[i] = p.shots[j]; p.shots[j] = t; MN.sbSel = j; saveSoon(); sbRenderList(); sbRenderTimeline();
}

/* ---------- 草图画布 ---------- */
function sbFitStage() {
  const wrap = $('#sbWrap'); const stage = $('#sbStage'); if (!wrap || !stage) return;
  const p = ensureProject(); const [aw, ah] = sbAspectWH(p.aspect);
  const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
  const r = containRect(aw, ah, w, h); stage.style.width = r.w + 'px'; stage.style.height = r.h + 'px';
}
function sbRenderCanvas() {
  const bg = $('#sbBg'), ink = $('#sbInk'); if (!bg || !ink) return;
  const p = ensureProject(); const sz = sbCanvasSize(p.aspect);
  if (bg.width !== sz.w) { bg.width = sz.w; bg.height = sz.h; ink.width = sz.w; ink.height = sz.h; }
  const shot = sbCurrentShot();
  sbFitStage();
  // 背景
  const bx = bg.getContext('2d'); bx.clearRect(0, 0, sz.w, sz.h);
  if (shot && shot.image) {
    const img = new Image();
    img.onload = () => { bx.clearRect(0, 0, sz.w, sz.h); const r = containRect(img.width, img.height, sz.w, sz.h); bx.drawImage(img, r.x, r.y, r.w, r.h); };
    img.src = shot.image;
  } else { bx.fillStyle = PAL.paper; bx.fillRect(0, 0, sz.w, sz.h); }
  // 墨层（矢量 strokes）
  paintInkTo(ink.getContext('2d'), shot, sz.w, sz.h);
  // 空分镜给一行提示，别让人对着白板发呆（有笔画或图就自动消失）
  if (!shot || (!shot.image && !(shot.strokes || []).length)) {
    const cx = ink.getContext('2d');
    const dark = $('#mnRoot').dataset.mnTheme === 'dark';
    cx.save();
    cx.fillStyle = dark ? 'rgba(255,255,255,.30)' : 'rgba(120,110,100,.55)';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = Math.round(sz.w * 0.019) + 'px -apple-system,"Microsoft YaHei",sans-serif';
    cx.fillText('这个分镜还没有画面', sz.w / 2, sz.h / 2 - sz.h * 0.045);
    cx.font = Math.round(sz.w * 0.0135) + 'px -apple-system,"Microsoft YaHei",sans-serif';
    cx.fillText('回导演台拍个机位，或者直接在这里画两笔', sz.w / 2, sz.h / 2 + sz.h * 0.045);
    cx.restore();
  }
}
function containRect(iw, ih, cw, ch) {
  const s = Math.min(cw / iw, ch / ih); const w = iw * s, h = ih * s; return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}
function paintInkTo(ctx, shot, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!shot || !shot.strokes || !shot.strokes.length) return;
  const scale = W / 1600;
  shot.strokes.forEach(st => {
    if (!st.pts || st.pts.length < 1) return;
    ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = st.erase ? 'rgba(0,0,0,1)' : (st.color || '#121212');
    ctx.lineWidth = (st.size || 3) * scale;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    st.pts.forEach((pt, j) => { const X = pt[0] * W, Y = pt[1] * H; if (j) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    if (st.pts.length === 1) { ctx.lineTo(st.pts[0][0] * W + 0.01, st.pts[0][1] * H + 0.01); }
    ctx.stroke();
  });
  ctx.globalCompositeOperation = 'source-over';
}
function sbPointerDown(e) {
  const shot = sbCurrentShot(); if (!shot) return;
  MN.sbDraw = { color: MN.sbColor || '#121212', size: MN.sbSize || 6, erase: MN.sbTool === 'eraser', pts: [sbNorm(e)] };
  MN.sbRedoInk = (shot.strokes || []).slice();
}
function sbPointerMove(e) {
  if (!MN.sbDraw) return;
  const shot = sbCurrentShot(); if (!shot) return;
  MN.sbDraw.pts.push(sbNorm(e));
  // 实时画到墨层
  const ink = $('#sbInk'); const ctx = ink.getContext('2d'); const W = ink.width, H = ink.height;
  const st = MN.sbDraw;
  ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = st.erase ? 'rgba(0,0,0,1)' : st.color;
  ctx.lineWidth = st.size * (W / 1600); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = st.pts; const a = pts[pts.length - 2], b = pts[pts.length - 1];
  ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
function sbPointerUp() {
  if (!MN.sbDraw) return;
  const shot = sbCurrentShot(); if (shot) { shot.strokes = shot.strokes || []; shot.strokes.push(MN.sbDraw); }
  MN.sbDraw = null; saveSoon();
  sbRenderCanvas();   // 重画一遍：空画面提示该收掉了
}
function sbNorm(e) {
  const ink = $('#sbInk'); const r = ink.getBoundingClientRect();
  return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
}
function sbUndoInk() {
  const shot = sbCurrentShot(); if (!shot || !shot.strokes || !shot.strokes.length) return;
  shot.strokes.pop(); saveSoon(); sbRenderCanvas();
}
function sbClearInk() {
  const shot = sbCurrentShot(); if (!shot) return;
  if (shot.strokes && shot.strokes.length && !confirm('清空本镜所有草图？')) return;
  shot.strokes = []; saveSoon(); sbRenderCanvas();
}

/* ---------- 镜头详情（右栏） ---------- */
function sbRenderRight() {
  const box = $('#sbRight'); if (!box) return;
  const p = ensureProject(); const shot = sbCurrentShot();
  if (!shot) { box.innerHTML = `<div class="mn-sb-empty">没有选中的分镜。</div>`; return; }
  box.innerHTML = `
    <div class="mn-sb-r-head">镜头详情</div>
    <label class="mn-sb-field"><span>镜头名称</span><input id="sbRName" value="${esc(shot.title)}" maxlength="30" /></label>
    <label class="mn-sb-field"><span>景别</span><select id="sbRScene">${['全景', '中景', '近景', '特写', '航拍', '其他'].map(s => `<option ${s === shot.scene ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label class="mn-sb-field"><span>成片用时（秒）</span><input id="sbRDur" type="number" min="0.5" step="0.5" value="${shot.duration || 3}" /></label>
    <label class="mn-sb-field"><span>画面与动作</span><textarea id="sbRAction" rows="4" placeholder="谁，在哪里，做什么">${esc(shot.action || '')}</textarea></label>
    <label class="mn-sb-field"><span>对话 / 旁白</span><textarea id="sbRDlg" rows="3" placeholder="这一镜说的话">${esc(shot.dialogue || '')}</textarea></label>
    <div class="mn-sb-field"><span>本地配音</span><button class="mn-sb-btn block" id="sbRec">${icon('mic')} 开始录音</button></div>`;
  $('#sbRName').oninput = e => { shot.title = e.target.value; saveSoon(); const t = $('.mn-sb-shot.active .mn-sb-shot-info b'); if (t) t.textContent = pad2((MN.sbSel | 0) + 1) + '. ' + (e.target.value || '未命名'); };
  $('#sbRScene').onchange = e => { shot.scene = e.target.value; saveSoon(); };
  $('#sbRDur').oninput = e => { const v = parseFloat(e.target.value); shot.duration = isNaN(v) ? 3 : v; saveSoon(); sbRenderTimeline(); sbUpdateTotal(); };
  $('#sbRAction').oninput = e => { shot.action = e.target.value; saveSoon(); };
  $('#sbRDlg').oninput = e => { shot.dialogue = e.target.value; saveSoon(); };
  $('#sbRec').onclick = () => sbRecord(shot);
}
async function sbRecord(shot) {
  const btn = $('#sbRec');
  if (btn && btn.dataset.rec === '1') { if (MN._sbRec) MN._sbRec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream); const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const fr = new FileReader();
      fr.onload = () => { shot.audio = fr.result; saveSoon(); toast('配音已保存到本镜'); if (btn) { btn.dataset.rec = ''; btn.innerHTML = icon('mic') + ' 开始录音'; } };
      fr.readAsDataURL(blob);
      stream.getTracks().forEach(t => t.stop());
    };
    rec.start();
    MN._sbRec = rec;
    if (btn) { btn.dataset.rec = '1'; btn.innerHTML = icon('square') + ' 停止录音'; }
    toast('录音中… 再次点停止');
  } catch (e) { toast('无法录音（需麦克风权限）'); }
}

/* ---------- 节奏时间线 ---------- */
function sbRenderTimeline() {
  const box = $('#sbTimeline'); if (!box) return;
  const p = ensureProject();
  const total = p.shots.reduce((s, x) => s + (x.duration || 3), 0);
  if (!p.shots.length) { box.innerHTML = `<div class="mn-sb-tl-empty">时间线空空，先有分镜。</div>`; return; }
  box.innerHTML = p.shots.map((s, i) => `<div class="mn-sb-tl-block ${i === (MN.sbSel | 0) ? 'active' : ''}" data-i="${i}" style="flex:${Math.max(1, s.duration || 3)}">
      <b>${pad2(i + 1)}</b><small>${esc(s.title || '分镜')}</small><span>${s.duration || 3}s</span></div>`).join('');
  $$('.mn-sb-tl-block', box).forEach(d => d.onclick = () => { MN.sbSel = +d.dataset.i; sbRenderList(); sbRenderCanvas(); sbRenderRight(); sbRenderTimeline(); });
}
function sbUpdateTotal() {
  const p = ensureProject(); const el2 = $('#sbTotal'); if (!el2) return;
  const total = p.shots.reduce((s, x) => s + (x.duration || 3), 0);
  el2.textContent = total.toFixed(1);
}

/* ---------- 傻瓜模式：一键生成 ---------- */
function generateFromDirector() {
  const shots = (MN.state.directorShots || []);
  const p = ensureProject();
  const old = p.shots.length;
  if (old && !confirm(`故事板里已经有 ${old} 条分镜，一键生成会替换掉。继续？`)) return;
  if (shots.length) {
    p.shots = shots.map((s, i) => ({
      id: uid(), title: s.name || ('机位 ' + (i + 1)),
      duration: 3, scene: i === 0 ? '全景' : (i === shots.length - 1 ? '近景' : '中景'),
      action: s.note || '', dialogue: '', image: s.image || null, camera: '', strokes: [], audio: null,
    }));
    toast('已把导演台 ' + p.shots.length + ' 个机位同步成分镜', 'ok');
  } else {
    // 没有机位：按「一句话梗概」铺一套能直接改的五镜结构，不再是四行空白
    const src = strOr((p.title || '').replace(/[·:：].*$/, ''), '这个故事', 24);
    const beats = [
      ['定场', '大远景', `交代空间与时间：${src}`, '', 4, '缓慢横移'],
      ['人物进画', '全景', '主角从画面外走进来，停在关键位置', '', 4, '跟移'],
      ['事情发生', '中景', '两个人同框，视线交错，说第一句话', '（这里填台词）', 5, '缓慢推近'],
      ['转折', '近景', '情绪变的一刻，表情先动', '', 4, '固定 · 微微手持'],
      ['收束', '特写', '关键道具或眼神定格', '', 3, '固定'],
    ];
    p.shots = beats.map(([t, sc, act, dlg, sec, cam]) => ({
      id: uid(), title: t, duration: sec, scene: sc,
      action: act, dialogue: dlg, camera: cam, image: null, strokes: [], audio: null,
    }));
    toast('机器还没拍到镜头，先按梗概铺了 ' + p.shots.length + ' 条分镜骨架，直接改就行', 'ok');
  }
  p.title = p.title || ((MN.state.scene && MN.state.scene.title) || '未命名') + '·故事板';
  MN.sbSel = 0; saveSoon(); renderStoryboard();
}

/* ---------- 导出：4K 图片 ---------- */
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function drawShotFrame(ctx, shot, W, H, p) {
  const dark = $('#mnRoot').dataset.mnTheme === 'dark';
  // 背景
  ctx.fillStyle = dark ? '#202020' : PAL.paper; ctx.fillRect(0, 0, W, H);
  if (shot && shot.image) {
    const img = new Image();
    const r = containRect(img.width, img.height, W, H);
    // 同步画：drawShotFrame 用于离屏导出，图片可能未加载完，这里用 onload 异步处理在导出函数里
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  }
  // 墨层（矢量）→ 临时透明画布再合成（保证橡皮只去墨不去底）
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  paintInkTo(tmp.getContext('2d'), shot, W, H);
  ctx.drawImage(tmp, 0, 0);
  // 底部元信息条
  const barH = Math.round(H * 0.16);
  ctx.fillStyle = dark ? 'rgba(0,0,0,.62)' : 'rgba(20,20,20,.66)';
  ctx.fillRect(0, H - barH, W, barH);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.font = '700 ' + Math.round(H * 0.045) + 'px -apple-system,"Microsoft YaHei",sans-serif';
  const title = (shot ? (shot.title || '分镜') : '分镜');
  ctx.fillText(title, W * 0.03, H - barH * 0.66);
  ctx.font = Math.round(H * 0.03) + 'px -apple-system,"Microsoft YaHei",sans-serif';
  const meta = [shot && shot.scene, shot && shot.action, shot && shot.dialogue].filter(Boolean).join(' ｜ ');
  ctx.fillText(meta || '（无备注）', W * 0.03, H - barH * 0.28);
}
function exportStoryboardImages() {
  const p = ensureProject();
  if (!p.shots.length) return toast('故事板还是空的，先生成分镜');
  const [aw, ah] = sbAspectWH(p.aspect);
  const W = 3840, H = Math.round(3840 * ah / aw);
  let pending = p.shots.length;
  p.shots.forEach((shot, i) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const finish = () => { drawShotFrame(x, shot, W, H, p); c.toBlob(b => { if (b) downloadBlob(b, (p.title || '故事板') + '-分镜' + pad2(i + 1) + '.png'); if (--pending === 0) toast('已导出 ' + p.shots.length + ' 张 4K 图片'); }, 'image/png'); };
    if (shot && shot.image) { const img = new Image(); img.onload = finish; img.onerror = finish; img.src = shot.image; }
    else finish();
  });
  toast('正在导出 ' + p.shots.length + ' 张 4K 图片…');
}

/* ---------- 导出：MP4 ----------
   关键结论（1.10.45 实测）：canvas.captureStream + MediaRecorder 在「完整 app 页面」
   里一帧都抓不到（软件渲染/WebView2 禁 GPU 时合成器不给帧）→ 永远导出 0 字节。
   改为 WebCodecs VideoEncoder 逐帧编码 + 自写 MP4 封装(mp4 muxer)，不依赖合成器。
   WebCodecs 不可用时，才回退到旧的 MediaRecorder 方案。 */

/* --- 极简 MP4 封装器（ISO BMFF） --- */
function _u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
function _u16(n) { return new Uint8Array([(n >>> 8) & 255, n & 255]); }
function _u8(n) { return new Uint8Array([n & 255]); }
function _str(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
function _cat(list) { let n = 0; for (const a of list) n += a.length; const o = new Uint8Array(n); let p = 0; for (const a of list) { o.set(a, p); p += a.length; } return o; }
function _box(type) { const parts = Array.prototype.slice.call(arguments, 1); const body = _cat(parts); return _cat([_u32(body.length + 8), _str(type), body]); }
function _fbox(type, ver, flags) { const parts = Array.prototype.slice.call(arguments, 3); return _box.apply(null, [type, _u32(((ver & 255) << 24) | (flags & 0xffffff))].concat(parts)); }
const _UNITY_MATRIX = _cat([_u32(0x00010000), _u32(0), _u32(0), _u32(0), _u32(0x00010000), _u32(0), _u32(0), _u32(0), _u32(0x40000000)]);

/* 从第一个关键帧（长度前缀 / AVCC 格式）里解析 SPS、PPS，构造 avcC。
   实测这版 Chromium 不通过 chunk.metadata 暴露 decoderConfig，只能自解析。 */
function avcCFromSamples(samples) {
  for (const s of samples) {
    if (!s.key) continue;
    const d = s.data; let sps = null, pps = null; let i = 0;
    while (i + 4 < d.length) {
      let len = (d[i] << 24 >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3];
      const st = i + 4;
      if (len <= 0 || st + len > d.length) break;      // 长度前缀解析失败 → 放弃
      const t = d[st] & 0x1f;
      if (t === 7 && !sps) sps = d.slice(st, st + len);
      else if (t === 8 && !pps) pps = d.slice(st, st + len);
      i = st + len;
      if (sps && pps) break;
    }
    if (sps && pps && sps.length >= 4) {
      return _cat([
        _u8(1), _u8(sps[1]), _u8(sps[2]), _u8(sps[3]),
        _u8(0xff),                        // 6 bits reserved + lengthSizeMinusOne=3
        _u8(0xe1),                        // 3 bits reserved + numOfSPS=1
        _u16(sps.length), sps,
        _u8(1), _u16(pps.length), pps
      ]);
    }
  }
  return null;
}

function muxMP4(samples, desc, W, H, fps, totalMs) {
  // samples: [{data:Uint8Array, key:bool}]  desc: avcC 内容(encoder 给的 description)
  const n = samples.length;
  const syncs = [];             // stss 关键帧序号(1-based)
  for (let i = 0; i < n; i++) { if (samples[i].key) syncs.push(i + 1); }
  const dur = Math.round(90000 / fps);   // 固定帧间隔 → stts 只需一条
  const stts = _fbox('stts', 0, 0, _u32(1), _u32(n), _u32(dur));
  const stss = _box.apply(null, ['stss', _u32(0), _u32(0)].concat(syncs.length ? [_u32(syncs.length)].concat(syncs.map(_u32)) : []));
  const stsz = _fbox('stsz', 0, 0, _u32(0), _u32(n), _cat(samples.map(s => _u32(s.data.length))));
  /* ⚠️ 2026-10-27 修：ftyp 实际是 8(头)+4(major)+4(minor)+16(兼容品牌)=32 字节，
     原来按 28 算 → 每个样本偏移都少了 4 字节，播放器读到的是错位数据（"能下载但打不开"）。
     同时改成「每个样本一个 chunk」，stsc 的 samples_per_chunk=1 才对得上 stco 的 n 条偏移。 */
  const ftyp = _box('ftyp', _str('isom'), _u32(512), _str('isom'), _str('iso2'), _str('avc1'), _str('mp41'));
  const mdatStart = ftyp.length + 8;
  const offs = []; { let o = mdatStart; for (const s of samples) { offs.push(o); o += s.data.length; } }
  const stco = _fbox('stco', 0, 0, _u32(n), _cat(offs.map(_u32)));
  const stsc = _fbox('stsc', 0, 0, _u32(1), _u32(1), _u32(1), _u32(1));
  const avcC = desc ? _box('avcC', desc) : _box('avcC', _u8(1), _u8(0x42), _u8(0xE0), _u8(0x1F), _u8(0xFF), _u8(0xE1), _u16(0), _u16(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(1), _u8(0), _u16(0), _u16(0), _u8(0));
  /* avc1 视觉样本条目：按 ISO/IEC 14496-12 VisualSampleEntry 逐字段写。
     之前这段字段拼错（pre_defined[3] 只写了 8 字节、尾部字段缺失），
     导致宽高/子盒偏移全错，Chrome 直接判定「无法解码」。 */
  const cmpName = new Uint8Array(32);                        // compressorname：长度字节 + 31 字节名
  const avc1 = _box('avc1',
    _cat([_u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0)]),  // reserved[6]
    _u16(1),                                                 // data_reference_index
    _u16(0), _u16(0),                                        // pre_defined, reserved
    _cat([_u32(0), _u32(0), _u32(0)]),                       // pre_defined[3]（12 字节）
    _u16(W), _u16(H),                                        // width, height
    _u32(0x00480000), _u32(0x00480000),                      // 72 dpi
    _u32(0),                                                 // reserved
    _u16(1),                                                 // frame_count
    cmpName,                                                 // compressorname(32)
    _u16(0x0018),                                            // depth = 24
    _u16(0xFFFF),                                            // pre_defined = -1
    avcC);
  const stsd = _fbox('stsd', 0, 0, _u32(1), avc1);
  const stbl = _box('stbl', stsd, stts, stss, stsc, stsz, stco);
  const url = _fbox('url ', 0, 1);
  const dref = _fbox('dref', 0, 0, _u32(1), url);
  const minf = _box('minf', _fbox('vmhd', 0, 1, _u16(0), _u16(0), _u16(0), _u16(0)), _box('dinf', dref), stbl);
  const hdlr = _fbox('hdlr', 0, 0, _u32(0), _str('vide'), _u32(0), _u32(0), _u32(0), _str('VideoHandler\0'));
  const durTs = n * dur;
  const mdhd = _fbox('mdhd', 0, 0, _u32(0), _u32(0), _u32(90000), _u32(durTs), _u16(0x55C4), _u16(0));
  const mdia = _box('mdia', mdhd, hdlr, minf);
  const durMs = Math.round(totalMs || (durTs / 90000 * 1000));
  const tkhd = _fbox('tkhd', 0, 3, _u32(0), _u32(0), _u32(1), _u32(0), _u32(durMs), _u32(0), _u32(0), _u16(0), _u16(0), _u16(0), _u16(0), _UNITY_MATRIX, _u32(W << 16), _u32(H << 16));
  const trak = _box('trak', tkhd, mdia);
  const mvhd = _fbox('mvhd', 0, 0, _u32(0), _u32(0), _u32(1000), _u32(durMs), _u32(0x00010000), _u16(0x0100), _u16(0), _u32(0), _u32(0), _UNITY_MATRIX, _cat([_u32(0), _u32(0), _u32(0), _u32(0), _u32(0), _u32(0)]), _u32(2));
  const moov = _box('moov', mvhd, trak);
  const mdat = _box('mdat', _cat(samples.map(s => s.data)));
  return _cat([ftyp, mdat, moov]);
}

function pickRecordMime() {
  const cands = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of cands) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return { mime: m, ext: m.indexOf('mp4') >= 0 ? 'mp4' : 'webm' }; } catch (e) { } }
  return null;
}
async function pickAvcCodec(W, H, fps) {
  const cands = ['avc1.4D401F', 'avc1.42E01F', 'avc1.640028', 'avc1.42001f'];
  for (const codec of cands) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: W, height: H, bitrate: 6_000_000, framerate: fps, avc: { format: 'avc' } });
      if (s && s.supported) return codec;
    } catch (e) { }
  }
  return null;
}

/* 编码器冷启动修复：软件渲染(WebView2 禁 GPU / swiftshader)下，页面里【第一个】
   MediaRecorder 初始化未完成就把整段帧丢掉 → 导出 0 字节。做个一次性预热：
   真实挂载一个小 canvas 录 ~0.4s 后丢弃，之后真实导出用的是已就绪的编码器。
   仅每页首次导出付出 ~0.5s。 */
let _mp4Warmed = false;
async function warmMp4Encoder() {
  if (_mp4Warmed) return;
  _mp4Warmed = true;                    // 先置位，避免并发重复预热
  let c = null;
  try {
    if (!window.MediaRecorder) return;
    const mime = pickRecordMime(); if (!mime) return;
    c = document.createElement('canvas'); c.width = 320; c.height = 180;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;width:160px;pointer-events:none;';
    const x = c.getContext('2d');
    document.body.appendChild(c);       // 必须可见，否则 captureStream 无帧
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const s = c.captureStream(30);
    const rec = new MediaRecorder(s, { mimeType: mime.mime });
    const done = new Promise(r => { rec.onstop = r; });
    rec.start();
    const t0 = performance.now();
    await new Promise(rs => {
      const iv = setInterval(() => {
        const el = performance.now() - t0;
        x.fillStyle = (Math.floor(el / 60) % 2) ? '#000' : '#fff'; x.fillRect(0, 0, 320, 180);
        if (el >= 400) { clearInterval(iv); try { rec.stop(); } catch (e) { } rs(); }
      }, 33);
    });
    await done;
  } catch (e) { } finally { if (c) { try { c.remove(); } catch (e) { } } }
}

/* 主方案：可见挂载 canvas + captureStream + MediaRecorder。
   ★实测铁律（1.10.45）：canvas.captureStream() 只有在该 canvas **真正参与合成器
     （插入 DOM 且可见）** 时才产帧。不挂载 / display:none / opacity:0 → 一帧都没有
     → 导出 0 字节。所以导出时必须把画布真实显示出来（放在故事板舞台位置）。
     这样得到的是浏览器原生合法 MP4，且分镜配音音轨也能混进去。 */
async function exportStoryboardViaRecorder(p) {
  if (!window.MediaRecorder) return toast('当前环境不支持视频录制（MediaRecorder）');
  const mime = pickRecordMime();
  if (!mime) return toast('浏览器不支持任何可录制视频格式');
  if (!_mp4Warmed) { toast('正在准备视频编码器…'); await warmMp4Encoder(); }
  const [aw, ah] = sbAspectWH(p.aspect);
  const W = 1280, H = Math.round(1280 * ah / aw);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.id = 'sbExportCanvas';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;' +
    'width:' + Math.min(W, 640) + 'px;height:auto;background:#000;';
  const x = c.getContext('2d');
  document.body.appendChild(c);              // 必须真实可见，否则 captureStream 无帧
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));  // 等进合成器
  let cvStream; try { cvStream = c.captureStream(30); } catch (e) { cvStream = null; }
  if (!cvStream) { c.remove(); return toast('无法创建画布视频流'); }
  const cleanup = () => { try { c.remove(); } catch (e) { } };
  // 配音音轨（尽力而为）
  const audioEls = [];
  const audioStream = (() => { try { return new MediaStream(); } catch (e) { return null; } })();
  p.shots.forEach((s, i) => {
    if (!s.audio) return;
    try {
      const a = new Audio(); a.src = s.audio; a.loop = false; a.preload = 'auto';
      const as = a.captureStream ? a.captureStream() : null;
      if (as && as.getAudioTracks().length && audioStream) { as.getAudioTracks().forEach(t => audioStream.addTrack(t)); audioEls.push({ el: a, idx: i }); }
    } catch (e) { }
  });
  const outStream = (audioStream && audioStream.getAudioTracks().length) ? new MediaStream([...cvStream.getVideoTracks(), ...audioStream.getAudioTracks()]) : cvStream;
  let rec;
  try { rec = new MediaRecorder(outStream, { mimeType: mime.mime, videoBitsPerSecond: 4_000_000 }); } catch (e) { cleanup(); return toast('无法创建录制器：' + e.message); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: rec.mimeType || mime.mime });
    cleanup(); audioEls.forEach(o => { try { o.el.pause(); } catch (e) { } });
    if (!blob.size) return toast('录制结果为空，请改用 4K 图片导出');
    downloadBlob(blob, (p.title || '故事板') + '-故事板.' + mime.ext);
    toast('视频导出完成（' + mime.ext.toUpperCase() + ' / ' + (blob.size / 1024).toFixed(0) + 'KB）');
  };
  const durations = p.shots.map(s => clamp(s.duration || 3, 0.5, 8));
  const starts = []; let acc = 0; durations.forEach(d => { starts.push(acc); acc += d; }); const total = acc;
  const imgs = p.shots.map(s => { if (s && s.image) { const im = new Image(); im.src = s.image; return im; } return null; });
  const drawAt = (i) => { const shot = p.shots[i]; x.fillStyle = '#202020'; x.fillRect(0, 0, W, H); const im = imgs[i]; if (im && im.complete && im.naturalWidth) { const r = containRect(im.naturalWidth, im.naturalHeight, W, H); x.drawImage(im, r.x, r.y, r.w, r.h); } else { x.fillStyle = PAL.paper; x.fillRect(0, 0, W, H); } const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; paintInkTo(tmp.getContext('2d'), shot, W, H); x.drawImage(tmp, 0, 0); };
  drawAt(0);
  rec.start();
  const t0 = performance.now();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const el = (performance.now() - t0) / 1000;
    let i = 0; for (let k = 0; k < starts.length; k++) { if (el >= starts[k]) i = k; }
    drawAt(i);
    // 触发该镜配音
    audioEls.forEach(o => { if (o.idx === i && !o._played) { try { o.el.currentTime = 0; o.el.play(); o._played = true; } catch (e) { } } });
    if (el >= total) { stopped = true; rec.stop(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  toast('正在录制视频（' + total.toFixed(1) + ' 秒，请勿切走窗口）…');
}

async function exportStoryboardMP4() {
  const p = ensureProject();
  if (!p.shots.length) return toast('故事板还是空的，先生成分镜');

  // ---- 方案 A（主）：可见挂载 canvas + captureStream + MediaRecorder ----
  // 产出浏览器原生合法 MP4/WebM，配音音轨也能混进去。
  if (window.MediaRecorder) {
    try {
      await exportStoryboardViaRecorder(p);
      return;
    } catch (e) {
      console.warn('[视频] MediaRecorder 方案失败，尝试 WebCodecs', e);
      toast('常规录制不可用，改用高速编码…');
    }
  }

  // 预载背景图 + 计算时间轴
  const [aw, ah] = sbAspectWH(p.aspect);
  const W = 1280, H = Math.round(1280 * ah / aw);
  const durations = p.shots.map(s => clamp(s.duration || 3, 0.5, 8));
  const starts = []; let acc = 0; durations.forEach(d => { starts.push(acc); acc += d; }); const total = acc;
  const imgs = p.shots.map(s => { if (s && s.image) { const im = new Image(); im.src = s.image; return im; } return null; });
  const drawAt = (i, p2) => {
    const shot = p.shots[i]; const x = drawAt.x;
    x.fillStyle = '#202020'; x.fillRect(0, 0, W, H);
    const im = imgs[i];
    if (im && im.complete && im.naturalWidth) { const r = containRect(im.naturalWidth, im.naturalHeight, W, H); x.drawImage(im, r.x, r.y, r.w, r.h); }
    else { x.fillStyle = PAL.paper; x.fillRect(0, 0, W, H); }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    paintInkTo(tmp.getContext('2d'), shot, W, H);
    x.drawImage(tmp, 0, 0);
  };

  // ---- 方案 B（兜底）：WebCodecs 硬编 + 自写 MP4 封装（不依赖合成器） ----
  if (window.VideoEncoder && window.VideoFrame) {
    const fps = 24;
    const codec = await pickAvcCodec(W, H, fps);
    if (codec) {
      try {
        toast('正在编码视频（' + total.toFixed(1) + ' 秒）…');
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d'); drawAt.x = x;
        const samples = []; let desc = null;
        const enc = new VideoEncoder({
          output: (chunk) => {
            const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
            samples.push({ data: data, key: chunk.type === 'key' });
          },
          error: (e) => { console.warn('[MP4] encoder', e); }
        });
        enc.configure({ codec: codec, width: W, height: H, bitrate: 6_000_000, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' });
        const N = Math.max(1, Math.round(total * fps));
        for (let f = 0; f < N; f++) {
          const el = f / fps;
          let i = 0; for (let k = 0; k < starts.length; k++) { if (el >= starts[k]) i = k; }
          drawAt(i, el - starts[i]);
          const vf = new VideoFrame(c, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
          enc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
          vf.close();
          if (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 8));
          if (f % 6 === 0) { toast('正在编码视频 ' + Math.round(f / N * 100) + '%'); await new Promise(r => setTimeout(r, 0)); }
        }
        await enc.flush();
        try { enc.close(); } catch (e) { }
        if (samples.length) {
          if (!desc) desc = avcCFromSamples(samples);
          if (!desc) throw new Error('未能解析 H.264 参数集(SPS/PPS)');
          const bytes = muxMP4(samples, desc, W, H, fps, total * 1000);
          const blob = new Blob([bytes], { type: 'video/mp4' });
          downloadBlob(blob, (p.title || '故事板') + '-故事板.mp4');
          toast('MP4 导出完成（' + samples.length + ' 帧 / ' + (blob.size / 1024).toFixed(0) + 'KB）');
          return;
        }
        throw new Error('编码器未产出任何帧');
      } catch (e) {
        console.warn('[视频] WebCodecs 编码失败', e);
        toast('视频编码失败，请改用 4K 图片导出');
      }
    }
  }
  toast('当前浏览器不支持视频导出，请改用 4K 图片导出');
}

/* ============================================================
 * 通用视频导出：给「预演视频 / 动态分镜导出」用
 * drawFrame(t, ctx, w, h) 负责画第 t 秒那一帧，其余交给编码器。
 * 优先 WebCodecs 离线逐帧编码（快、不挑时长），不支持时退回 MediaRecorder 实时录。
 * ============================================================ */
async function mnExportCanvasVideo({ W, H, fps = 24, total, drawFrame, onProgress }) {
  if (!(total > 0)) throw new Error('时长无效');
  const w = Math.max(64, Math.round(W)), h = Math.max(64, Math.round(H));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const report = p => { try { if (onProgress) onProgress(p); } catch (e) { } };

  if (window.VideoEncoder && window.VideoFrame) {
    const codec = await pickAvcCodec(w, h, fps);
    if (codec) {
      const samples = []; let desc = null;
      const toU8 = v => (v instanceof Uint8Array ? v.slice() : new Uint8Array(v));
      const enc = new VideoEncoder({
        output: (ch, md) => {
          /* 现行 Chromium 会把 SPS/PPS 放进 decoderConfig.description（AVCDecoderConfigurationRecord），
             而不是关键帧里——直接用它是 muxMP4 要的 avcC 正文。 */
          try {
            const dsc = md && md.decoderConfig && md.decoderConfig.description;
            if (!desc && dsc) desc = toU8(dsc);
          } catch (e) { /* 拿不到就退回自解析 */ }
          const d = new Uint8Array(ch.byteLength); ch.copyTo(d);
          samples.push({ data: d, key: ch.type === 'key' });
        },
        error: (e) => console.warn('[MP4] encoder', e),
      });
      enc.configure({ codec, width: w, height: h, bitrate: 8_000_000, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' });
      const N = Math.max(1, Math.round(total * fps));
      for (let f = 0; f < N; f++) {
        drawFrame(f / fps, ctx, w, h);
        const vf = new VideoFrame(c, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(vf, { keyFrame: f % (fps * 2) === 0 });
        vf.close();
        if (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 6));
        if (f % 8 === 0) { report(f / N); await new Promise(r => setTimeout(r, 0)); }
      }
      await enc.flush();
      try { enc.close(); } catch (e) { }
      if (samples.length) {
        if (!desc) desc = avcCFromSamples(samples);
        if (!desc) throw new Error('未能解析 H.264 参数集(SPS/PPS)');
        const bytes = muxMP4(samples, desc, w, h, fps, total * 1000);
        report(1);
        return { blob: new Blob([bytes], { type: 'video/mp4' }), ext: 'mp4', frames: samples.length };
      }
      throw new Error('编码器没有产出任何帧');
    }
  }

  const mime = pickRecordMime();
  if (!mime) throw new Error('当前浏览器不支持视频编码');
  /* captureStream 要求画布参与布局，藏到屏幕外而不是 display:none */
  c.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + w + 'px;height:' + h + 'px;';
  document.body.appendChild(c);
  const stream = c.captureStream(fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime.mime, videoBitsPerSecond: 6_000_000 });
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start(200);
  const t0 = performance.now();
  await new Promise(resolve => {
    const loop = () => {
      const el0 = (performance.now() - t0) / 1000;
      drawFrame(Math.min(el0, total), ctx, w, h);
      report(Math.min(1, el0 / total));
      if (el0 >= total + 0.15) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  rec.stop(); await stopped;
  c.remove();
  return { blob: new Blob(chunks, { type: mime.mime }), ext: mime.ext, frames: Math.round(total * fps) };
}
window.mnExportCanvasVideo = mnExportCanvasVideo;

/* ---------- QA 句柄 ---------- */
window.miaoningAPI = {
  openStoryboard, closeStoryboard, generateFromDirector, exportStoryboardImages, exportStoryboardMP4,
  mnExportCanvasVideo,
  renderStoryboard, drawShotFrame, paintInkTo, sbAspectWH, ensureProject, blankProject,
  openAiModal, importAiData, importText, openImportModal,
};

window.loadMiaoning = loadMiaoning;
/* QA/调试句柄：只读用途为主（playwright 脚本要断言场景数据）。
   与 gencanvas.js 暴露 gcNodes 一个套路。 */
window.MN = MN;

/* ---------- 全局桥（给 miaoning_m3.js 用） ----------
   ⚠️ 2026-10-26 修复：这些函数以前一个都没挂到 window，
   m3（剪辑台/仙人模式/运镜录制）里 G.toast / G.saveSoon / G.pushUndo / G.renderAll /
   G.openModal 全部取到 undefined → 静默降级成「不存盘、不提示、不刷新、弹窗没样式」。 */
Object.assign(window, {
  toast, saveSoon, pushUndo, undo, redo, renderAll, paint, icon, openModal, closeModal, setMode, fitView, setTool,
  mnSel: selectOnly, mnRefresh: refreshSel, mnDel: delSel, mnCtxClose: closeCtx,
});

/* ---------- bairimeng-director 集成钩子（2026-10-25 移植时新增） ----------
   场景搭建浮层用：打开时把镜头场景种子注入画布 01，保存时读回完整状态。 */
window.miaoningSeed = function (st) {
  if (!st || !st.scene || !MN.built) return false;
  const fresh = blankState((st.scene && st.scene.title) || '未命名画布');
  MN.state = Object.assign(fresh, st);
  MN.state.format = 'aistudio-director';
  MN.sel = null; MN.selList = []; MN.pending = null; MN.pathDraft = null; MN.undo = []; MN.redo = [];
  MN.view = { x: 0, y: 0, k: (st.view && st.view.zoom) || 1 };
  MN.grid = !(st.view && st.view.grid === false);
  fitView();
  renderAll(); saveSoon();
  setTimeout(resizeCanvas, 60);
  return true;
};
window.miaoningGetScene = function () {
  return MN.state ? JSON.parse(JSON.stringify(MN.state)) : null;
};
/* AI 搭景落地：走同一个 importAiData（mode='model' 只换场景、保留机位与故事板），
   返回一句中文摘要给浮层提示用。 */
window.miaoningApplyAiScene = function (data) {
  const r = importAiData(data, 'model');            // 返回 {msg}，不是数组
  let msg = (r && r.msg) ? r.msg : '已应用 AI 场景';
  /* AI 生成的东西经常叠在一起 → 落地时整场排一遍，保证不穿模 */
  if (window.MN_LAYOUT && MN.state && MN.state.scene) {
    const moved = window.MN_LAYOUT.resolveScene(MN.state.scene, { maxR: 3 });
    if (moved.length) msg += ' · 自动排开 ' + moved.length + ' 件重叠';
    const routed = window.MN_LAYOUT.routeAllPaths(MN.state.scene);
    if (routed.count) msg += ' · 走位绕开障碍 ' + routed.count + ' 条';
  }
  fitView(); renderAll(); saveSoon();
  return msg;
};
})();
