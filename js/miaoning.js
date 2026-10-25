/* ================================================================ 导演台（🎥 页）
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
const PAL = { canvas: '#f2eee6', grid: '#ddd7cd', gridMajor: '#c8bfae', ink: '#121212', muted: '#76716b', accent: '#e1453e', roomFill: '#fdfcf8', roomLine: '#b7ad9c', prop: '#d9b382', paper: '#fcfaf6' };
function syncPal() {
  const dark = $('#mnRoot') && $('#mnRoot').dataset.mnTheme === 'dark';
  PAL.canvas = dark ? '#171717' : '#f2eee6';
  PAL.grid = dark ? '#2c2a27' : '#e2dbcf';
  PAL.gridMajor = dark ? '#3b3835' : '#cfc5b3';
  PAL.ink = dark ? '#f2eee6' : '#121212';
  PAL.muted = dark ? '#b0aaa1' : '#76716b';
  PAL.accent = dark ? '#b31919' : '#e1453e';
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
  sel: null,              // {kind, id}
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
  MN.sel = null; MN.undo = []; MN.redo = [];
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
function pushUndo() {
  MN.undo.push(JSON.stringify(MN.state));
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
  cv.addEventListener('contextmenu', e => { e.preventDefault(); if (MN.wallDraft) { MN.wallDraft = null; paint(); } });
  const cv3 = $('#mn3d'); if (cv3) { cv3.style.display = 'none'; if (window.MN3D) { try { MN3D.ensure(cv3); } catch (e) { } } }
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
    $('#mnModeBadge').textContent = '3D';
    $('#mnStageName').textContent = '立体布景';
    $('#mnStageSub').textContent = '左拖转视角 · 滚轮缩放 · 右键平移 · 双击聚焦';
    $('#mnBtnRise').innerHTML = icon('rotate-ccw', 's14') + '躺下去';
    render3D();
  } else {
    if (c3) c3.style.display = 'none';
    if (c2) c2.style.display = 'block';
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
    <section class="mn-section">
      <div class="mn-sec-head"><span>搭建工具</span><span class="mn-sec-note">够用就行</span></div>
      <div class="mn-tool-list" id="mnToolList"></div>
    </section>
    <section class="mn-section">
      <button class="mn-tree-toggle" id="mnTplHead" style="width:100%">${icon('chevron-down')}<span>场景模板</span><span class="mn-tree-count">${tplCount}</span></button>
    </section>
    <section class="mn-section" id="mnTreeSec"></section>`;
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
  MN.tool = id; MN.wallDraft = null;
  renderToolList(); buildFloatTools(); paint();
  const hints = { select: '点一下，改一点。想改谁，就点谁。', room: '按住拖矩形 · 松手就是一间 · 接着画', wall: '点两下连线 · 斜着也行 · Esc 取消', prop: '拖一个矩形 · 块方的，里面空的', hole: '点一下墙 · 开出个门洞', person: '点一下 · 放个小人', pan: '拖着看 · 松手停' };
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
      const dot = o._k === 'person' ? (o.color || '#e1453e') : o._k === 'prop' ? (o.color || '#d9b382') : o._k === 'light' ? '#f5b301' : o._k === 'room' ? '#9db4c0' : '#5b564e';
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

  $('#mnTreeSearch').oninput = e => { treeQuery = e.target.value; renderTree(); $('#mnTreeSearch').focus(); };
  $('#mnTreeAll').onclick = () => { treeOpen.all = !treeOpen.all; renderTree(); };
  $('#mnTreeAdd').onclick = () => toast('🚧 自定义分组建设中');
  $$('[data-folder]', sec).forEach(b => b.onclick = () => { treeOpen[b.dataset.folder] = !(treeOpen[b.dataset.folder] !== false); renderTree(); });
  $$('[data-folder-label]', sec).forEach(b => b.onclick = () => { treeOpen[b.dataset.folderLabel] = !(treeOpen[b.dataset.folderLabel] !== false); renderTree(); });
  $$('[data-folder-eye]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.folderEye; toggleGroupVis(k); });
  $$('[data-folder-del]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.folderDel; if (confirm(`删除整组「${k}」？`)) delGroup(k); });
  $$('[data-obj]', sec).forEach(r => r.onclick = e => {
    if (e.target.closest('[data-eye]') || e.target.closest('[data-del]')) return;
    const [kind, id] = r.dataset.obj.split(':');
    MN.sel = { kind, id }; renderTree(); renderRight(); paint();
  });
  $$('[data-eye]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const [kind, id] = b.dataset.eye.split(':'); const o = findObj(kind, id); if (o) { o.hidden = !o.hidden; renderTree(); paint(); saveSoon(); } });
  $$('[data-del]', sec).forEach(b => b.onclick = e => { e.stopPropagation(); const [kind, id] = b.dataset.del.split(':'); pushUndo(); delObj(kind, id); renderAll(); saveSoon(); });
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
const PERSON_COLORS = ['#e1453e', '#ffffff', '#f5b301', '#e33e3e', '#c98d6b', '#8a9b8e', '#7d8ca3', '#2b2c2f', '#76716b', '#3c6e9e', '#5b8c5a', '#b0aaa1'];
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
  const cam = MN.state.camera;
  $('#mnCamSize').onchange = e => { cam.size = e.target.value; saveSoon(); };
  $('#mnCamFrame').onchange = e => { cam.frame = e.target.checked; paint(); saveSoon(); };
  $('#mnCamCut').onchange = e => { cam.cutaway = e.target.checked; saveSoon(); };
  $('#mnCamCeil').onchange = e => { cam.ceil = e.target.checked; saveSoon(); };
  $('#mnCamFov').oninput = e => { cam.fov = +e.target.value; e.target.previousElementSibling.querySelector('strong').textContent = cam.fov + '°'; saveSoon(); };
  bindObjPanel(body);
}

function renderObjPanel() {
  const sel = MN.sel && findObj(MN.sel.kind, MN.sel.id) ? MN.sel : null;
  if (!sel) return `<section class="mn-prop"><div class="mn-empty-prop">
      ${icon('mouse-pointer-2')}<h3>点一下，改一点。</h3><p>墙、屋顶、造物、人物、灯。<br />想改谁，就点谁。</p></div></section>`;
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
    <label class="mn-field"><span>颜色</span></label>${swatches(PROP_COLORS, o.color, 'color')}
  </section>`;
  if (sel.kind === 'person') return `<section class="mn-prop">${head}
    <div class="mn-chip-row">
      <button class="mn-chip" data-act="copy">${icon('copy', 's12')}复制</button>
      <button class="mn-chip" data-act="paste">${icon('clipboard-paste', 's12')}粘贴</button>
      <button class="mn-chip active" data-act="move">${icon('move-3d', 's12')}移动</button>
      <button class="mn-chip" data-act="rotate">${icon('rotate-3d', 's12')}旋转</button>
      <button class="mn-chip" data-act="scale">${icon('scan-line', 's12')}缩放</button>
    </div>
    <label class="mn-field"><span>人物姿态</span>
      <select data-f="pose">${['站立', '走路', '坐下', '招手', '躺下', '运动'].map(p => `<option ${o.pose === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    </label>
    <label class="mn-field"><span>人脸大小<strong>${o.face || 1} 倍</strong></span><input type="range" class="mn-range" data-f="face" min="0.5" max="2" step="0.1" value="${o.face || 1}" /></label>
    <label class="mn-field"><span>人物颜色</span></label>${swatches(PERSON_COLORS, o.color, 'color')}
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
      if (inp.type === 'range' && inp.previousElementSibling) { const s = inp.previousElementSibling.querySelector('strong'); if (s) s.textContent = (f === 'fov' ? '' : '') + v + (f === 'faceDir' ? '°' : f === 'face' ? ' 倍' : f === 'jump' ? '' : f === 'intensity' ? '' : ''); }
      renderTree(); paint(); saveSoon();
    });
  });
  $$('[data-sw]', box).forEach(b => b.onclick = () => {
    o[b.dataset.sw] = b.dataset.c;
    renderRight(); paint(); saveSoon();
  });
  $$('[data-act]', box).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'del') { pushUndo(); delObj(MN.sel.kind, MN.sel.id); renderAll(); saveSoon(); }
    else if (a === 'hide') { o.hidden = true; renderTree(); paint(); saveSoon(); }
    else if (a === 'copy') { MN.clipboard = JSON.parse(JSON.stringify(o)); toast('已复制，点「粘贴」放下一个'); }
    else if (a === 'paste' && MN.clipboard) { pushUndo(); const c = JSON.parse(JSON.stringify(MN.clipboard)); c.id = uid(); c.x += 1; c.y += 1; MN.state.scene.persons.push(c); renderAll(); saveSoon(); }
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
      ${shots.map((s, i) => `<div style="flex:0 0 auto;text-align:center"><img class="mn-shot-img" data-shot="${i}" src="${s.image}" style="height:88px;border-radius:8px;border:1px solid var(--line);display:block;cursor:pointer" title="${esc(s.name)}（点击：3D 回到该机位 / 看大图）" /><small style="font-size:11px;color:var(--muted)">${i + 1}. ${esc(s.name)}</small></div>`).join('')}
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
  $('#mnShotDown').onclick = () => shots.length ? downloadShots() : toast('镜头册还是空的');
  $('#mnShotUndo').onclick = undo;
  $('#mnShotRedo').onclick = redo;
  $('#mnShotClear').onclick = () => { if (!shots.length) return; if (!confirm('删除全部 ' + shots.length + ' 个镜头？')) return; pushUndo(); MN.state.directorShots = []; renderShots(); saveSoon(); };
}
function downloadShots() {
  MN.state.directorShots.forEach((s, i) => {
    const a = document.createElement('a');
    a.href = s.image; a.download = (MN.state.scene.title || '镜头') + '-' + (i + 1) + '.png'; a.click();
  });
  toast('开始下载 ' + MN.state.directorShots.length + ' 张');
}
function onShotClick(s) {
  if (MN.state.view.mode === '3d' && s.cam && window.MN3D) {
    MN3D.setCamera(s.cam); MN3D.render(MN.state); toast('已回到该机位'); return;
  }
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
function paint() {
  if (paintRaf) return;
  paintRaf = requestAnimationFrame(() => { paintRaf = null; doPaint(); });
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
    let cur = 0;
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = Math.max(3, (wl.th || 0.2) * C);
    const seg = (t0, t1) => {
      ctx.beginPath();
      ctx.moveTo(a.x + ux * len * t0, a.y + uy * len * t0);
      ctx.lineTo(a.x + ux * len * t1, a.y + uy * len * t1);
      ctx.stroke();
    };
    for (const hp of holes) {
      const t0 = Math.max(cur, hp.t - (hp.w || 1) * 0.5 * (44 / len) * k * 0.5);
      const t1 = Math.min(1, hp.t + (hp.w || 1) * 0.5 * (44 / len) * k * 0.5);
      if (t0 > cur) seg(cur, t0);
      cur = Math.max(cur, t1);
    }
    if (cur < 1) seg(cur, 1);
    if (isSel('wall', wl.id)) {
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]); seg(0, 1); ctx.setLineDash([]);
    }
  }

  /* 造物 */
  for (const p of sc.props) {
    if (p.hidden) continue;
    const q = w2s(p.x, p.y), w = p.w * C, h = p.d * C;
    ctx.fillStyle = p.color || PAL.prop;
    ctx.fillRect(q.x, q.y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(q.x, q.y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    if (w > 30 && h > 14) ctx.fillText(p.name, q.x + w / 2, q.y + h / 2);
    if (isSel('prop', p.id)) selRect(q.x, q.y, w, h);
  }

  /* 人物（火柴人） */
  for (const p of sc.persons) {
    if (p.hidden) continue;
    const q = w2s(p.x, p.y), r = Math.max(5, 0.45 * C);
    ctx.fillStyle = p.color || '#e1453e';
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = p.color || '#e1453e'; ctx.lineWidth = 2;
    const rot = (p.rot || 0) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + Math.cos(rot) * r * 1.7, q.y + Math.sin(rot) * r * 1.7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(q.x + Math.cos(rot) * r * 0.4, q.y + Math.sin(rot) * r * 0.4, Math.max(1.5, r * 0.22 * (p.face || 1)), 0, 7); ctx.fill();
    if (isSel('person', p.id)) {
      ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, r + 5, 0, 7); ctx.stroke();
    }
  }

  /* 光源 */
  for (const l of sc.lights) {
    if (l.hidden) continue;
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

  /* 拖拽预览 / 画墙预览 */
  const d = MN.drag;
  if (d && d.ghost) {
    ctx.strokeStyle = PAL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    const a = w2s(d.x0, d.y0), b = w2s(d.x1, d.y1);
    if (d.kind === 'line') { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    else ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.setLineDash([]);
  }
  if (MN.wallDraft) {
    const a = w2s(MN.wallDraft.x, MN.wallDraft.y);
    ctx.fillStyle = PAL.accent;
    ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, 7); ctx.fill();
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
function isSel(kind, id) { return MN.sel && MN.sel.kind === kind && MN.sel.id === id; }

/* ---------- 命中测试 ---------- */
function hitTest(wx, wy) {
  const sc = MN.state.scene;
  const near = (a, b, t) => Math.abs(a - b) <= t;
  for (const l of sc.lights) if (!l.hidden && near(l.x, wx, 0.5) && near(l.y, wy, 0.5)) return { kind: 'light', id: l.id };
  for (const p of sc.persons) if (!p.hidden && near(p.x, wx, 0.5) && near(p.y, wy, 0.5)) return { kind: 'person', id: p.id };
  for (const p of sc.props) if (!p.hidden && wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.d) return { kind: 'prop', id: p.id };
  for (const r of sc.rooms) if (!r.hidden && wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.d) return { kind: 'room', id: r.id };
  for (const wl of sc.walls) {
    if (wl.hidden) continue;
    const dx = wl.x2 - wl.x1, dy = wl.y2 - wl.y1;
    const L2 = dx * dx + dy * dy; if (!L2) continue;
    let t = ((wx - wl.x1) * dx + (wy - wl.y1) * dy) / L2;
    t = clamp(t, 0, 1);
    if (Math.hypot(wx - (wl.x1 + dx * t), wy - (wl.y1 + dy * t)) <= 0.45) return { kind: 'wall', id: wl.id, t };
  }
  return null;
}

/* ---------- 画布交互 ---------- */
function onPtrDown(e) {
  if (e.button === 2) return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 个别嵌入式 webview 不支持捕获，不耽误拖拽 */ }
  const r = cv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w = s2w(sx, sy);
  const panning = MN.spaceDown || e.button === 1 || MN.tool === 'pan';
  if (panning) { MN.drag = { kind: 'pan', sx, sy, vx: MN.view.x, vy: MN.view.y }; cv.style.cursor = 'grabbing'; return; }
  const tool = MN.tool;
  if (tool === 'select') {
    const hit = hitTest(w.x, w.y);
    if (hit) {
      MN.sel = { kind: hit.kind, id: hit.id };
      const o = findObj(hit.kind, hit.id);
      MN.drag = { kind: 'move', obj: o, ox: o.x != null ? o.x : o.x1, oy: o.y != null ? o.y : o.y1, wx: w.x, wy: w.y, moved: false, wallT: hit.t };
      if (hit.kind === 'wall') MN.drag = { kind: 'wallmove', obj: o, ox1: o.x1, oy1: o.y1, ox2: o.x2, oy2: o.y2, wx: w.x, wy: w.y, moved: false };
      pushUndo();
      renderTree(); renderRight();
    } else { MN.sel = null; renderTree(); renderRight(); }
    paint(); return;
  }
  if (tool === 'room' || tool === 'prop') {
    pushUndo();
    MN.drag = { kind: 'new', what: tool, x0: snap(w.x), y0: snap(w.y), x1: snap(w.x), y1: snap(w.y), ghost: true };
    paint(); return;
  }
  if (tool === 'wall') {
    const p = { x: snap(w.x), y: snap(w.y) };
    if (!MN.wallDraft) { MN.wallDraft = p; }
    else {
      pushUndo();
      const wl = { id: uid(), name: '墙面 ' + (MN.state.scene.walls.length + 1), x1: MN.wallDraft.x, y1: MN.wallDraft.y, x2: p.x, y2: p.y, h: 2.6, th: 0.2, holes: [] };
      if (Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) < 0.5) { MN.undo.pop(); MN.wallDraft = null; return toast('墙太短了'); }
      MN.state.scene.walls.push(wl);
      MN.wallDraft = null;
      MN.sel = { kind: 'wall', id: wl.id };
      renderTree(); renderRight(); saveSoon();
    }
    paint(); return;
  }
  if (tool === 'hole') {
    const hit = hitTest(w.x, w.y);
    if (hit && hit.kind === 'wall') {
      const wl = findObj('wall', hit.id);
      pushUndo();
      (wl.holes = wl.holes || []).push({ t: +hit.t.toFixed(3), w: 1 });
      MN.sel = { kind: 'wall', id: wl.id };
      renderTree(); renderRight(); saveSoon(); paint();
      toast('开了个门洞');
    } else toast('点墙连线才能打洞');
    return;
  }
  if (tool === 'person') {
    pushUndo();
    const p = { id: uid(), name: '人物 ' + (MN.state.scene.persons.length + 1), x: snap(w.x), y: snap(w.y), rot: 0, color: '#e1453e', pose: '站立', face: 1, faceDir: 0, jump: 0 };
    MN.state.scene.persons.push(p);
    MN.sel = { kind: 'person', id: p.id };
    renderTree(); renderRight(); saveSoon(); paint();
    return;
  }
}
function onPtrMove(e) {
  const r = cv.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const w = s2w(sx, sy);
  const d = MN.drag;
  if (!d) {
    cv.style.cursor = MN.tool === 'select' ? (hitTest(w.x, w.y) ? 'pointer' : 'default') : 'crosshair';
    return;
  }
  if (d.kind === 'pan') { MN.view.x = d.vx + (sx - d.sx); MN.view.y = d.vy + (sy - d.sy); paint(); return; }
  if (d.kind === 'move' || d.kind === 'wallmove') {
    d.moved = true;
    const dx = snap(w.x - d.wx), dy = snap(w.y - d.wy);
    if (d.kind === 'move') { d.obj.x = d.ox + dx; d.obj.y = d.oy + dy; }
    else { d.obj.x1 = d.ox1 + dx; d.obj.y1 = d.oy1 + dy; d.obj.x2 = d.ox2 + dx; d.obj.y2 = d.oy2 + dy; }
    paint(); return;
  }
  if (d.kind === 'new') { d.x1 = snap(w.x); d.y1 = snap(w.y); paint(); return; }
}
function onPtrUp(e) {
  const d = MN.drag; if (!d) return;
  MN.drag = null; cv.style.cursor = 'default';
  if (d.kind === 'new') {
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 0.5 || h < 0.5) { MN.undo.pop(); paint(); return toast('太小了，重新拖一个'); }
    if (d.what === 'room') {
      const r = { id: uid(), name: '房间 ' + (MN.state.scene.rooms.length + 1), x, y, w, d: h, h: 4, color: '' };
      MN.state.scene.rooms.push(r); MN.sel = { kind: 'room', id: r.id };
    } else {
      const p = { id: uid(), name: '造物 ' + (MN.state.scene.props.length + 1), x, y, w, d: h, h: Math.min(w, h, 1), color: '' };
      MN.state.scene.props.push(p); MN.sel = { kind: 'prop', id: p.id };
    }
    renderTree(); renderRight(); saveSoon(); paint();
    return;
  }
  if (d.moved) { saveSoon(); }
}
function onWheel(e) {
  e.preventDefault();
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
function openImportModal() {
  let mode = 'full';
  const body = `
    <p class="mn-help-para">导入选项前会再次确认。备份将自动存到当前画布。</p>
    <button class="mn-choice active" data-m="full"><span class="mn-ai-ico">${icon('box', 's18')}</span><span><strong>完整项目<span class="mn-tag">推荐</span></strong><small>模型、机位、截图、全部运镜、故事板、配音和剪辑，一起带走。</small></span></button>
    <button class="mn-choice" data-m="model"><span class="mn-ai-ico">${icon('cuboid')}</span><span><strong>仅模型</strong><small>墙、造物、人物和灯光，只用场景 JSON。</small></span></button>
    <button class="mn-choice" data-m="json"><span class="mn-ai-ico">${icon('file-braces')}</span><span><strong>粘贴 JSON 代码</strong><small>复制过来，直接导入。</small></span></button>
    <div style="margin-top:14px">
      <input type="file" id="mnImpFile" accept=".json,application/json" style="font-size:12.5px" />
      <textarea class="mn-json-box" id="mnImpJson" placeholder="或把 JSON 粘到这里…" style="margin-top:10px"></textarea>
    </div>`;
  openModal('导入什么？', '当前画布', body, [
    { label: '取消', ghost: true },
    { label: '导入', primary: true, fn: () => doImport(mode) },
  ], 'wide');
  const back = $('.mn-modal');
  $$('[data-m]', back).forEach(b => b.onclick = () => {
    $$('[data-m]', back).forEach(x => x.classList.remove('active')); b.classList.add('active'); mode = b.dataset.m;
  });
  $('#mnImpFile', back).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { $('#mnImpJson', back).value = await f.text(); toast('已读取 ' + f.name); } catch (err) { toast('读取失败'); }
  };
}
function doImport(mode) {
  const txt = ($('#mnImpJson') ? $('#mnImpJson').value : '').trim();
  if (!txt) return toast('先选文件或粘 JSON');
  let data;
  try { data = JSON.parse(txt); } catch (e) { return toast('JSON 格式不对：' + e.message); }
  if (!data || typeof data !== 'object' || !data.scene) return toast('这不是导演台项目文件（缺 scene）');
  if (!confirm(mode === 'model' ? '导入模型会覆盖当前画布场景，确定？' : '导入会覆盖当前画布全部内容，确定？')) return;
  pushUndo();
  if (mode === 'model') { MN.state.scene = data.scene; }
  else {
    MN.state.scene = data.scene;
    MN.state.view = Object.assign(MN.state.view, data.view || {});
    MN.state.sun = data.sun || MN.state.sun;
    MN.state.camera = data.camera || MN.state.camera;
    MN.state.directorShots = data.directorShots || [];
    MN.state.project = data.project || null;
    MN.state.cuttingDesk = data.cuttingDesk || null;
    MN.state.cameraPath = data.cameraPath || null;
  }
  MN.sel = null; closeModal(); renderAll(); saveSoon(); toast('导入成功');
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
    <div class="mn-help-step"><span class="mn-step-no">02</span><div><strong>改两下</strong><p>点哪改哪，上色、Shift 多选、Ctrl + C 复制、Ctrl + V 后点位置粘贴。打字可点一格，也可拖出一片，封顶可最高低刷高。</p></div></div>
    <div class="mn-help-step"><span class="mn-step-no">03</span><div><strong>找镜头</strong><p>选中物体，绕着它旋转、缩放、双击聚焦，F 聚全，P 配这截。镜头可拖动画画中，双击看大图。清单里的右下角有快照名。</p></div></div>
    <p class="mn-help-para">左上角「AI 规则」可接脑洞、绘画 AI 搭场景，也可将物体或参考图片直接导入。人数放多少小人或大人；选中大小可选的姿势或编辑环动作，编辑身体、手指及导入人物；编辑环动作与运镜同争，Esc 结束编辑，单击镜头保存在本页预览；轨迹输出可完整重项目、下载图片，工作台下方可中央图形全屏，Esc 退出；旁边可隐藏界面，连续按 666 次复原，人物是抬右边隐藏框，输入 233 站位，重新进入人和角色复。右上角星座图可快捷开存储建，仙人有模式用 Alt 下降，退出后停在原先位置。模拟默认，P 镜头可拖动指定，与故事投五通；新情况默认 3 秒，两边都可下拉全部图片。运镜直接使用镜头从相位，时长同放故事检；直达、旋挥、转向与手持晃动均关注可用。优化比机位能更宽戏，环镜光向中心，查她更多十测，取景框可单拉压额外。像板与面板 02-18 安全可用，日改动能需要方电。录屏预演制十时后收戏，Esc 退出。</p>
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
const DEF_KEYS = { select: 'V', room: 'R', wall: 'L', prop: 'B', hole: 'H', person: 'N', pan: 'Space', sun: 'O', genie: 'J', motion: 'M', cut: 'E' };
function openKeysModal() {
  const prefs = MN.state.editorPreferences;
  const keys = Object.assign({}, DEF_KEYS, prefs.shortcuts || {});
  const rows = [
    ['select', '选择', '默认 V'], ['room', '画房间 / 走进中物体', '默认 R'], ['wall', '画墙', '默认 L'],
    ['prop', '造物', '默认 B'], ['hole', '打洞', '默认 H'], ['person', '放人物', '默认 N'],
    ['pan', '拖住平移', '拖住生效'], ['sun', '光影调节', '默认 O'],
  ];
  const body = `<p class="mn-help-para">点「录制」后按键，就能直接改写。默认除个人，Esc 后会退出。</p>
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

/* ---------- AI 规则弹窗 ---------- */
function openAiModal() {
  const cards = [
    ['描述想法 → 生成立体场景', '把脑子里的场景，交给 AI 搭。', 'sparkles'],
    ['上传单张俯视图 → 还原墙面和物体', '随手图上拍，或是哪里，安心交给物体。', 'upload'],
    ['描述或图片 → 生成可调物体', '先说大小和可调属性，再让 AI 值。', 'cuboid'],
    ['图片或描述 → 生成人物姿势', '让 AI 摆个姿势，再选中人导入导入。', 'user-round'],
    ['描述剧情 → 生成三镜预演', '场景、动作、镜头和运灯光，一起排。', 'clapperboard'],
  ];
  const body = `<p class="mn-help-para">挑一条现成交给 AI，再慢慢改成图片。你管拍啥，先回答大小和可调属性，拿回 JSON，文件化改编都能导入。</p>
    ${cards.map(c => `<button class="mn-ai-card" data-ai="${esc(c[0])}"><span class="mn-ai-ico">${icon(c[2])}</span><span><strong>${c[0]}</strong><small>${c[1]}</small></span>${icon('download', 's14')}</button>`).join('')}
    <p class="mn-help-para" style="margin-top:10px">点诊断，下载後，姿势选中人后导入；三维预览图无需配图导入，格式与蚂蚁版本独立。</p>`;
  const m = openModal('让 AI 搭，你来拍。', '导演台', body, [{ label: '关闭', primary: true }]);
  $$('[data-ai]', m).forEach(b => b.onclick = () => toast('🚧 本地版先用「场景模板」顶一阵，真 AI 生成后续版本接本地模型'));
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
    if (k === 'C') { const o = MN.sel && findObj(MN.sel.kind, MN.sel.id); if (o) { MN.clipboard = JSON.parse(JSON.stringify(o)); toast('已复制'); } return; }
    if (k === 'V') { if (MN.clipboard && MN.clipboard.name !== undefined) { pushUndo(); const c = JSON.parse(JSON.stringify(MN.clipboard)); c.id = uid(); if (c.x != null) { c.x += 1; c.y += 1; MN.state.scene.persons.push(c); } else { c.x1 += 1; c.y1 += 1; c.x2 += 1; c.y2 += 1; MN.state.scene.walls.push(c); } renderAll(); saveSoon(); toast('已粘贴'); } return; }
    if (k === 'K') { e.preventDefault(); const s = $('#mnTreeSearch'); if (s) { s.focus(); } return; }
    return;
  }
  if (e.key === 'Escape') {
    if ($('.mn-modal-back')) { closeModal(); return; }
    if (MN.immersive) { toggleImmersive(); return; }
    if (MN.wallDraft) { MN.wallDraft = null; paint(); return; }
    if (MN.sel) { MN.sel = null; renderTree(); renderRight(); paint(); return; }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (MN.sel) { e.preventDefault(); pushUndo(); delObj(MN.sel.kind, MN.sel.id); renderAll(); saveSoon(); }
    return;
  }
  if (e.key === ' ') { MN.spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
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
  let maxX = 16, maxY = 16;
  sc.rooms.forEach(r => { maxX = Math.max(maxX, r.x + r.w + 2); maxY = Math.max(maxY, r.y + r.d + 2); });
  const k = clamp(Math.min(W / (maxX * CELL), H / (maxY * CELL)), 0.3, 1.2);
  MN.view.k = k;
  MN.view.x = (W - maxX * CELL * k) / 2;
  MN.view.y = (H - maxY * CELL * k) / 2;
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
    hint.innerHTML = `${icon('mouse-pointer-2', 's14')}<span>点一下，改一点。想改谁，就点谁。</span>`;
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
  if (!p.shots.length) { box.innerHTML = `<div class="mn-sb-empty">还没分镜。<br>点右上「一键生成故事板」试试傻瓜模式。</div>`; return; }
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
  if (shots.length) {
    p.shots = shots.map((s, i) => ({ id: uid(), title: s.name || ('机位 ' + (i + 1)), duration: 3, scene: '中景', action: '', dialogue: '', image: s.image || null, strokes: [], audio: null }));
    toast('已从导演台同步 ' + p.shots.length + ' 个分镜（傻瓜模式）');
  } else {
    const tpl = ['开场：交代环境', '发展：人物登场', '转折：冲突浮现', '结尾：收束'];
    p.shots = tpl.map((t, i) => ({ id: uid(), title: t, duration: 3, scene: i === 0 ? '全景' : '中景', action: '', dialogue: '', image: null, strokes: [], audio: null }));
    toast('没在导演台拍镜头，已生成 ' + p.shots.length + ' 个空白分镜模板');
  }
  p.title = ((MN.state.scene && MN.state.scene.title) || '未命名') + '·故事板';
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
  // mdat 在前 → chunk 只有一个，偏移 = ftyp(32) + mdat header(8)
  const mdatBodyLen = samples.reduce((a, s) => a + s.data.length, 0);
  const ftypLen = 8 + 4 + 4 * 4;
  const mdatStart = ftypLen + 8;
  const stco = _fbox('stco', 0, 0, _u32(1), _u32(mdatStart));
  const stsc = _fbox('stsc', 0, 0, _u32(1), _u32(1), _u32(1), _u32(1));
  const avcC = desc ? _box('avcC', desc) : _box('avcC', _u8(1), _u8(0x42), _u8(0xE0), _u8(0x1F), _u8(0xFF), _u8(0xE1), _u16(0), _u16(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(1), _u8(0), _u16(0), _u16(0), _u8(0));
  const avc1 = _box('avc1',
    _cat([_u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0)]), _u16(1), _u16(0), _u16(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0), _u8(0),
    _u16(W), _u16(H), _u32(0x00480000), _u32(0x00480000), _u32(0), _u16(1),
    _cat([_u8(0), _u16(0)]), _u16(0), _u16(0), _u16(0), _u16(0), _u32(0), _u32(0),
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
  const ftyp = _box('ftyp', _str('isom'), _u32(512), _str('isom'), _str('iso2'), _str('avc1'), _str('mp41'));
  const mdat = _cat([_u32(mdatBodyLen + 8), _str('mdat')].concat(samples.map(s => s.data)));
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

/* ---------- QA 句柄 ---------- */
window.miaoningAPI = {
  openStoryboard, closeStoryboard, generateFromDirector, exportStoryboardImages, exportStoryboardMP4,
  renderStoryboard, drawShotFrame, paintInkTo, sbAspectWH, ensureProject, blankProject
};

window.loadMiaoning = loadMiaoning;
/* QA/调试句柄：只读用途为主（playwright 脚本要断言场景数据）。
   与 gencanvas.js 暴露 gcNodes 一个套路。 */
window.MN = MN;

/* ---------- bairimeng-director 集成钩子（2026-10-25 移植时新增） ----------
   场景搭建浮层用：打开时把镜头场景种子注入画布 01，保存时读回完整状态。 */
window.miaoningSeed = function (st) {
  if (!st || !st.scene || !MN.built) return false;
  const fresh = blankState((st.scene && st.scene.title) || '未命名画布');
  MN.state = Object.assign(fresh, st);
  MN.state.format = 'aistudio-director';
  MN.sel = null; MN.undo = []; MN.redo = [];
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
})();
