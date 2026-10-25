/* ============================================================
 * 场景搭建器 v2 · 对齐原版「画空间」工作流
 * 左侧工具栏 → 中央 2D 网格编辑 → 右栏 物体/光影/地面
 * 立起来切 3D（俯视/斜视/正视）· 镜头册存机位
 * ============================================================ */
import { WhiteModelRenderer, solveCamera, propPart, rotXpt, rotYpt } from './cameraSim.js';
import { modal, toast } from './ui.js';

const DEG = Math.PI / 180;
const NL = String.fromCharCode(10);
const ICON = { actor: '👤', box: '📦', pillar: '🏛', table: '🪑', wall: '🧱', door: '🚪', window: '🪟', sofa: '🛋️', tree: '🌳', lamp: '💡' };
const TNAME = { actor: '人物', box: '木箱', pillar: '立柱', table: '桌子', wall: '墙', door: '门框', window: '窗墙', sofa: '沙发', tree: '树', lamp: '灯' };
const PSIZE = { box: [0.8, 0.8], pillar: [0.4, 0.4], table: [1.3, 0.85], door: [1.24, 0.14], window: [2.4, 0.2], sofa: [1.6, 0.85], tree: [1.2, 1.2], lamp: [0.4, 0.4] };
const FLOORS = [['', '默认'], ['#c9a877', '木色'], ['#8fa3ad', '青灰'], ['#e8e2d5', '暖白'], ['#565d6b', '深灰']];

function pathPosAt(obj, t) {
  const pts = obj.path;
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); segs.push(L); total += L; }
  if (total < 0.01) return { x: pts[0].x, z: pts[0].z, yaw: obj.rot || 0 };
  const sp = obj.speed || 1.2;
  let d = (t * sp) % (total * 2), dir = 1;
  if (d > total) { d = total * 2 - d; dir = -1; }
  let acc = 0, i = 0;
  while (i < segs.length - 1 && acc + segs[i] < d) { acc += segs[i]; i++; }
  const f = Math.min(1, (d - acc) / (segs[i] || 0.001));
  const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f;
  const z = pts[i].z + (pts[i + 1].z - pts[i].z) * f;
  let yawDeg = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / DEG;
  if (dir < 0) yawDeg = (yawDeg + 180) % 360;
  return { x, z, yaw: yawDeg };
}

export function openSceneBuilder(shot, onSaved) {
  if (window.__sbOpen) { try { window.__sbOpen.close(); } catch {} window.__sbOpen = null; }

  // ---- 场景数据（清洗） ----
  const scene = shot.scene ? JSON.parse(JSON.stringify(shot.scene)) : {};
  if (!scene.cam || typeof scene.cam !== 'object') scene.cam = { az: 25, dist: 7, h: 1.8, fov: 55 };
  scene.cam = { az: +scene.cam.az || 0, dist: Math.min(12, Math.max(3, +scene.cam.dist || 7)), h: Math.min(9, Math.max(0.4, +scene.cam.h || 1.8)), fov: Math.min(90, Math.max(25, +scene.cam.fov || 55)) };
  if (!scene.light || typeof scene.light !== 'object') scene.light = { az: 0, el: 35, int: 1 };
  scene.light = { az: +scene.light.az || 0, el: Math.min(85, Math.max(5, +scene.light.el ?? 35)), int: Math.min(1.3, Math.max(0.3, +scene.light.int ?? 1)) };
  scene.base = ['plain', 'street', 'room', 'stage'].includes(scene.base) ? scene.base : 'plain';
  scene.floor = scene.floor || '';
  scene.objects = (Array.isArray(scene.objects) ? scene.objects : []).filter(o => o && typeof o === 'object')
    .map(o => ({ ...o, x: +o.x || 0, z: +o.z || 0, rot: +o.rot || 0, scale: Math.min(3, Math.max(0.3, +o.scale || 1)) }))
    .filter(o => isFinite(o.x) && isFinite(o.z));
  if (!scene.cams || !Array.isArray(scene.cams)) scene.cams = [];

  // ---- 状态 ----
  let tool = 'select';            // select | room | wall | obj | person
  let placeShape = 'box';
  let selIdx = -1;
  let view = '2d';                // 2d | 3d
  let v3d = 'oblique';            // top | oblique | front
  let showGrid = true;
  let pathDraw = false, pathTarget = null;
  let drag = null, roomDrag = null;

  // ---- 弹窗骨架（对齐原版布局） ----
  const m = modal({
    title: '🏗 场景搭建 · ' + (shot.desc || '未命名镜头').slice(0, 14),
    wide: true,
    onClose: () => { if (raf) cancelAnimationFrame(raf); window.__sbOpen = null; },
    body: `
      <div class="bk-layout">
        <div class="bk-rail" id="bkRail"></div>
        <div class="bk-center">
          <div class="bk-badge" id="bkBadge">2D 空间草图</div>
          <canvas id="bkCanvas"></canvas>
          <div class="bk-tip" id="bkTip"></div>
          <div class="bk-bottombar" id="bkBottom"></div>
        </div>
        <div class="bk-side">
          <div class="bk-tabs">
            <button class="bk-tab on" data-tab="obj">物体</button>
            <button class="bk-tab" data-tab="light">光影</button>
            <button class="bk-tab" data-tab="ground">地面</button>
          </div>
          <div class="bk-panel" id="bkPanel"></div>
          <div class="bk-lens">
            <div class="bk-lens-title">镜头设置</div>
            <div class="form-row"><label>镜头尺寸</label><select class="input input-sm" disabled><option>16:9</option></select></div>
            <label class="bk-check"><input type="checkbox" id="bkVF" ${scene.vf ? 'checked' : ''}> 显示取景框</label>
            <label class="bk-check"><input type="checkbox" id="bkCut" ${scene.cutaway ? 'checked' : ''}> 剖开前方外墙</label>
          </div>
          <div class="sb-list-head" id="sbListHead"><span id="sbCount">📋 场景清单 0</span><input id="sbSearch" class="input input-sm" placeholder="搜索" style="width:86px;margin-left:6px;padding:2px 6px;font-size:11px"><button class="chip" id="sbHideA" style="padding:1px 8px;font-size:10.5px">人物</button><button class="chip" id="sbHideP" style="padding:1px 8px;font-size:10.5px">道具</button></div>
          <div id="sbList" class="sb-list"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-magic btn-sm" id="bkAI">🤖 AI 搭建</button>
        <button class="btn btn-ghost btn-sm" id="bkClear">🗑 清空</button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="bkCancel">取消</button>
        <button class="btn btn-primary" id="bkSave">💾 保存场景</button>
      </div>`,
  });
  window.__sbOpen = m;
  const cv = m.body.querySelector('#bkCanvas');
  const badge = m.body.querySelector('#bkBadge');

  // ---- 渲染器与循环 ----
  const renderer = new WhiteModelRenderer(cv);
  const sim = { type: 'free' };
  let raf = null, t0 = performance.now(), frame = 0;

  const V3D = { top: { az: 0, h: 9.5, dist: 6, fov: 45 }, oblique: { az: 30, h: 4.5, dist: 8, fov: 50 }, front: { az: 0, h: 1.6, dist: 8, fov: 50 } };

  const loop = (now) => {
    if (!document.body.contains(cv)) return;
    frame++;
    if (frame % 2) { raf = requestAnimationFrame(loop); return; }
    renderer.setTheme({ ground: scene.floor || '#d9dde5' });
    if (view === '2d') { try { draw2D(); } catch (e) { console.warn('2d', e); } }
    else {
      try {
        const v = V3D[v3d];
        scene.cam = { ...scene.cam, az: v.az, h: v.h, dist: v.dist, fov: v.fov };
        renderer.render(sim, ((now - t0) / 4000) % 1, 'stand', { duration: 4, hud: false, letterbox: true, scene });
        if (scene.vf) drawVF();
      } catch (e) { console.warn('3d', e); }
    }
    raf = requestAnimationFrame(loop);
  };

  const drawVF = () => {
    const vc = cv.getContext('2d');
    const cw = cv.clientWidth, ch = cv.clientHeight;
    const fh = cw * 9 / 16;
    if (fh <= ch) {
      const y0 = (ch - fh) / 2;
      vc.strokeStyle = 'rgba(255,255,255,0.55)'; vc.lineWidth = 1.5;
      vc.setLineDash([6, 5]); vc.strokeRect(cw * 0.06, y0, cw * 0.88, fh); vc.setLineDash([]);
    }
  };

  // ---- 2D 绘制 ----
  const W2 = () => cv.clientWidth / 2;
  const S2 = 13;
  const w2p = (x, z) => [W2() + (x / S2) * (W2() - 14), cv.clientHeight / 2 + (z / S2) * (cv.clientHeight / 2 - 14)];
  const p2w = (sx, sy) => [((sx - W2()) / (W2() - 14)) * S2, ((sy - cv.clientHeight / 2) / (cv.clientHeight / 2 - 14)) * S2];
  const PSIZE = { box: [0.8, 0.8], pillar: [0.4, 0.4], table: [1.3, 0.85], door: [1.24, 0.14], window: [2.4, 0.2], sofa: [1.6, 0.85], tree: [1.2, 1.2], lamp: [0.4, 0.4] };

  function draw2D() {
    const c = cv.getContext('2d');
    const cw = cv.clientWidth, ch = cv.clientHeight;
    // 位图尺寸对齐 CSS 尺寸（否则绘制被拉伸，鼠标与网格错位）
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    c.fillStyle = '#f2f3f0'; c.fillRect(0, 0, cw, ch);
    if (showGrid) {
      c.strokeStyle = 'rgba(60,70,90,0.12)'; c.lineWidth = 1;
      for (let gx = -12; gx <= 12; gx++) { const a = w2p(gx, -12), b = w2p(gx, 12); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
      for (let gz = -12; gz <= 12; gz++) { const a = w2p(-12, gz), b = w2p(12, gz); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    }
    // 对象
    scene.objects.forEach((o, i) => {
      const sel = i === selIdx;
      if (o.type === 'prop' && o.shape === 'wall') {
        const half = (o.w || 3) / 2, rr = (o.rot || 0) * DEG;
        const a = w2p(o.x - Math.cos(rr) * half, o.z - Math.sin(rr) * half);
        const b = w2p(o.x + Math.cos(rr) * half, o.z + Math.sin(rr) * half);
        c.strokeStyle = sel ? '#e0485a' : '#2a2f3a'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        return;
      }
      const [px, py] = w2p(o.x, o.z);
      if (o.type === 'actor') {
        c.fillStyle = sel ? '#e0485a' : '#4d8dff';
        c.beginPath(); c.arc(px, py, 9, 0, Math.PI * 2); c.fill();
        const rr = ((o.rot || 0) - (scene.cam?.az || 0)) * DEG;
        c.strokeStyle = sel ? '#e0485a' : '#4d8dff'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(rr) * 15, py + Math.cos(rr) * 15); c.stroke();
      } else {
        const sz = PSIZE[o.shape] || [0.8, 0.8];
        const w = (sz[0] * (o.scale || 1)) / S2 * (W2() - 14), h = (sz[1] * (o.scale || 1)) / S2 * (ch / 2 - 14);
        c.save(); c.translate(px, py); c.rotate((o.rot || 0) * DEG);
        c.fillStyle = sel ? 'rgba(224,72,90,0.35)' : 'rgba(58,64,82,0.30)';
        c.strokeStyle = sel ? '#e0485a' : '#3a4052'; c.lineWidth = 1.5;
        c.fillRect(-w / 2, -h / 2, w, h); c.strokeRect(-w / 2, -h / 2, w, h);
        c.restore();
      }
    });
    // 轨迹
    const tgt = (selIdx >= 0 && scene.objects[selIdx]) || pathTarget;
    if (tgt && tgt.path && tgt.path.length) {
      c.strokeStyle = '#ff5470'; c.lineWidth = 2; c.setLineDash([5, 4]);
      c.beginPath();
      tgt.path.forEach((wp, i) => { const [x, y] = w2p(wp.x, wp.z); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke(); c.setLineDash([]);
      for (const wp of tgt.path) { const [x, y] = w2p(wp.x, wp.z); c.fillStyle = '#ff5470'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
    }
    // 房间拖画预览
    if (roomDrag && roomDrag.moved) {
      const [ax, ay] = w2p(roomDrag.x1, roomDrag.z1), [bx, by] = w2p(roomDrag.x2, roomDrag.z2);
      c.strokeStyle = '#e0485a'; c.lineWidth = 4;
      c.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    }
    // 相机
    const [cxp, cyp] = w2p(Math.sin((scene.cam?.az || 0) * DEG) * (scene.cam?.dist || 7), Math.cos((scene.cam?.az || 0) * DEG) * (scene.cam?.dist || 7));
    c.fillStyle = '#ffc857'; c.beginPath(); c.arc(cxp, cyp, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = '10px sans-serif';
    c.fillText('相机', cxp + 8, cyp - 6);
  }

  // ---- 工具栏（左） ----
  const TOOLS = [
    { k: 'select', icon: '↖', name: '选择' },
    { k: 'room', icon: '▭', name: '画房间' },
    { k: 'wall', icon: '─', name: '画一面墙' },
    { k: 'obj', icon: '◇', name: '造物' },
    { k: 'person', icon: '👤', name: '人物' },
  ];
  const rail = m.body.querySelector('#bkRail');
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'bk-tool' + (t.k === tool ? ' on' : '');
    b.innerHTML = '<span>' + t.icon + '</span><i>' + t.name + '</i>';
    b.onclick = () => {
      tool = t.k;
      pathDraw = false; pathTarget = null;
      rail.querySelectorAll('.bk-tool').forEach(x => x.classList.toggle('on', x === b));
      updateTip();
      if (t.k === 'obj') renderPanel();
    };
    rail.appendChild(b);
  });

  function updateTip() {
    badge.textContent = view === '2d' ? '2D 空间草图' : '3D 预览';
    const tips = {
      select: '选择：点对象选中/挪动 · 右键删除 · 空白处拖拽转机位（3D）',
      room: '画房间：在网格上按住拖一个矩形，松手生成四面墙',
      wall: '画一面墙：按住拖一条线（任意方向）',
      obj: '造物：点网格放置「' + TNAME[placeShape] + '」',
      person: '人物：点网格放置，选中后可画行走轨迹',
    };
    m.body.querySelector('#bkTip').textContent = view === '2d' ? tips[tool] : '3D 预览：拖拽旋转机位 · 滚轮缩放 · 右键删除';
  }

  // ---- 底栏（视图切换） ----
  const bottom = m.body.querySelector('#bkBottom');
  function renderBottom() {
    bottom.innerHTML = `
      <button class="chip ${view === '2d' ? 'chip-on' : ''}" data-v="2d">2D 草图</button>
      <button class="chip ${view === '3d' ? 'chip-on' : ''}" data-v="3d">🎮 3D 预览</button>
      ${view === '3d' ? `<button class="chip" data-v3="top">俯视</button><button class="chip" data-v3="oblique">斜视</button><button class="chip" data-v3="front">正视</button>` : ''}
      <button class="chip ${showGrid ? 'chip-on' : ''}" id="bkGrid">隐藏网格</button>`;
    bottom.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { view = b.dataset.v; setView(); renderBottom(); });
    bottom.querySelectorAll('[data-v3]').forEach(b => b.onclick = () => { v3d = b.dataset.v3; });
    const g = bottom.querySelector('#bkGrid');
    if (g) g.onclick = () => { showGrid = !showGrid; renderBottom(); };
  }
  function setView() {
    badge.textContent = view === '2d' ? '2D 空间草图' : '3D 预览';
    cv.style.display = 'block';
    renderer.resize();
    updateTip();
  }

  // ---- 右栏 tabs ----
  const panel = m.body.querySelector('#bkPanel');
  let curTab = 'obj';
  m.body.querySelectorAll('.bk-tab').forEach(b => b.onclick = () => {
    curTab = b.dataset.tab;
    m.body.querySelectorAll('.bk-tab').forEach(x => x.classList.toggle('on', x === b));
    renderPanel();
  });

  const renderList = () => {
    const lb = m.body.querySelector('#sbList');
    if (!lb) return;
    const q = (m.body.querySelector('#sbSearch')?.value || '').trim();
    const hideA = m.body.querySelector('#sbHideA')?.classList.contains('chip-on');
    const hideP = m.body.querySelector('#sbHideP')?.classList.contains('chip-on');
    const groups = { actor: [], prop: [] };
    scene.objects.forEach((o, i) => {
      const typeKey = o.type === 'actor' ? 'actor' : 'prop';
      if (typeKey === 'actor' && hideA) return;
      if (typeKey === 'prop' && hideP) return;
      const label = (ICON[o.shape || o.type] || '') + (o.type === 'actor' ? '人物' : (TNAME[o.shape] || '物件'));
      if (q && !label.includes(q)) return;
      groups[typeKey].push([o, i]);
    });
    const row = (o, i) => '<div class="sb-list-row' + (i === selIdx ? ' on' : '') + '" data-i="' + i + '"><span>' + (ICON[o.shape || o.type] || '▪') + '</span><span class="sb-list-name">' + (o.type === 'actor' ? '人物' : (TNAME[o.shape] || '物件')) + '</span><span class="dim">' + (+o.x).toFixed(1) + ',' + (+o.z).toFixed(1) + '</span><button class="icon-btn" data-del="' + i + '">✕</button></div>';
    lb.innerHTML = (groups.actor.length ? '<div class="sb-list-group">人物 ' + groups.actor.length + '</div>' + groups.actor.map(([o, i]) => row(o, i)).join('') : '') +
      (groups.prop.length ? '<div class="sb-list-group">道具 ' + groups.prop.length + '</div>' + groups.prop.map(([o, i]) => row(o, i)).join('') : '') +
      (scene.objects.length ? '' : '<div class="dim" style="padding:6px 2px">还没有对象</div>');
    lb.querySelectorAll('.sb-list-row').forEach(r2 => r2.onclick = e => {
      if (e.target.dataset.del !== undefined) { scene.objects.splice(+e.target.dataset.del, 1); if (selIdx === +e.target.dataset.del) selIdx = -1; renderPanel(); return; }
      selIdx = +r2.dataset.i; renderPanel();
    });
    m.body.querySelector('#sbCount').textContent = '📋 场景清单 ' + scene.objects.length;
  };
  function renderPanel() {
    renderList();
    if (curTab === 'obj') return renderObjTab();
    if (curTab === 'light') return renderLightTab();
    return renderGroundTab();
  }

  function renderObjTab() {
    const sel = selIdx >= 0 ? scene.objects[selIdx] : null;
    let html = '';
    if (tool === 'obj' || tool === 'person') {
      html += `<div class="card-title">造物形状</div><div class="sb-palette">` +
        ['box', 'pillar', 'table', 'wall', 'door', 'window', 'sofa', 'tree', 'lamp'].map(sh =>
          `<button class="chip ${placeShape === sh ? 'chip-on' : ''}" data-sh="${sh}">${ICON[sh]} ${TNAME[sh]}</button>`).join('') + `</div>`;
    }
    if (sel) {
      html += `<div class="sb-obj-title">${TNAME[sel.shape || sel.type] || '对象'} · 已选中</div>`;
      if (sel.type === 'actor') {
        html += `<div class="form-row"><label>动作</label><select id="bkAct" class="input">${['stand', 'walk', 'run', 'sit'].map(a => `<option value="${a}" ${sel.action === a ? 'selected' : ''}>${a === 'stand' ? '站立' : a === 'walk' ? '行走' : a === 'run' ? '奔跑' : '坐下'}</option>`).join('')}</select></div>`;
        html += `<div class="form-row"><label>朝向快捷</label><div class="sb-palette">
          <button class="chip" data-f="0">正对</button><button class="chip" data-f="180">背对</button>
          <button class="chip" data-f="90">左侧</button><button class="chip" data-f="-90">右侧</button></div></div>`;
        html += `<div class="form-row"><label>运动轨迹 <span class="dim">(${sel.path?.length >= 2 ? '已设 ' + sel.path.length + ' 点' : '未设置'})</span></label>
          <div class="sb-palette"><button class="btn btn-ghost btn-sm" id="bkPathDraw">${pathDraw && pathTarget === sel ? '✅ 完成绘制' : '🎯 绘制轨迹'}</button>
          ${sel.path?.length ? '<button class="btn btn-ghost btn-sm" id="bkPathClear">🗑 清除</button>' : ''}</div>
          ${sel.path?.length >= 2 ? `<div class="form-row"><label>行走速度 <span id="bkSpdV">${(sel.speed || 1.2).toFixed(1)}</span></label><input type="range" id="bkSpd" class="scrub" min="0.4" max="2.5" step="0.1" value="${sel.speed || 1.2}"></div>` : ''}</div>`;
      }
      html += `<div class="form-row"><label>朝向 <span id="bkRotV">${Math.round(sel.rot || 0)}°</span></label><input type="range" id="bkRot" class="scrub" min="0" max="360" value="${sel.rot || 0}"></div>`;
      html += `<div class="form-row"><label>大小 <span id="bkScaleV">${(sel.scale || 1).toFixed(1)}×</span></label><input type="range" id="bkScale" class="scrub" min="0.6" max="1.8" step="0.1" value="${sel.scale || 1}"></div>`;
      if (sel.shape === 'lamp') html += `<div class="form-row"><label>灯强度 <span id="bkLintV">${(sel.lint ?? 0.55).toFixed(2)}</span></label><input type="range" id="bkLint" class="scrub" min="0.1" max="1" step="0.05" value="${sel.lint ?? 0.55}"></div>`;
      html += `<button class="btn btn-danger btn-sm" id="bkDel">🗑 删除此对象</button>`;
    } else {
      html += `<div class="dim" style="padding:4px 2px">未选中对象。左侧选工具，在${view === '2d' ? '网格' : '场景'}中点击操作。</div>`;
    }
    // 镜头册
    html += `<div class="card-title" style="margin-top:14px">📷 镜头册 <span class="dim">${scene.cams.length}</span></div>
      <div class="sb-palette"><button class="btn btn-ghost btn-sm" id="bkCamSave">📷 保存当前机位</button></div>
      <div id="bkCamList" class="sb-list">${scene.cams.map((cm, i) => `
        <div class="sb-list-row${scene.cam === cm ? ' on' : ''}" data-i="${i}"><span>🎥</span><span class="sb-list-name">机位 ${i + 1}</span><span class="dim">${Math.round(cm.az)}°/${cm.dist}/${cm.h}</span><button class="icon-btn" data-load="${i}">载入</button><button class="icon-btn" data-cdel="${i}">✕</button></div>`).join('') || '<div class="dim" style="padding:4px 2px">还没有保存的机位</div>'}</div>
      <div class="dim" style="font-size:11px;padding:4px 2px">保存场景后，动态分镜按「自由机位」播放当前机位；多个机位可轮流载入微调。</div>`;
    panel.innerHTML = html;
    wireObjTab();
  }

  function wireObjTab() {
    panel.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { placeShape = b.dataset.sh; renderObjTab(); });
    const act = panel.querySelector('#bkAct');
    if (act && selIdx >= 0) act.onchange = () => { scene.objects[selIdx].action = act.value; };
    panel.querySelectorAll('[data-f]').forEach(fb => fb.onclick = () => {
      if (selIdx < 0) return;
      scene.objects[selIdx].rot = Math.round(((scene.cam.az || 0) + (+fb.dataset.f) + 360) % 360);
      const rv = panel.querySelector('#bkRotV'); if (rv) rv.textContent = scene.objects[selIdx].rot + '°';
      const rr = panel.querySelector('#bkRot'); if (rr) rr.value = scene.objects[selIdx].rot;
    });
    const rot = panel.querySelector('#bkRot');
    if (rot) rot.oninput = e => { if (selIdx < 0) return; scene.objects[selIdx].rot = +e.target.value; const v = panel.querySelector('#bkRotV'); if (v) v.textContent = e.target.value + '°'; };
    const sc = panel.querySelector('#bkScale');
    if (sc) sc.oninput = e => { if (selIdx < 0) return; scene.objects[selIdx].scale = +e.target.value; const v = panel.querySelector('#bkScaleV'); if (v) v.textContent = (+e.target.value).toFixed(1) + '×'; };
    const li = panel.querySelector('#bkLint');
    if (li) li.oninput = e => { if (selIdx < 0) return; scene.objects[selIdx].lint = +e.target.value; const v = panel.querySelector('#bkLintV'); if (v) v.textContent = (+e.target.value).toFixed(2); };
    const spd = panel.querySelector('#bkSpd');
    if (spd) spd.oninput = e => { if (pathTarget) pathTarget.speed = +e.target.value; const v = panel.querySelector('#bkSpdV'); if (v) v.textContent = (+e.target.value).toFixed(1); };
    const pd = panel.querySelector('#bkPathDraw');
    if (pd) pd.onclick = () => {
      const o = scene.objects[selIdx];
      if (pathDraw && pathTarget === o) { pathDraw = false; pathTarget = null; }
      else { pathDraw = true; pathTarget = o; if (!o.path) o.path = []; }
      renderObjTab();
      const tp = m.body.querySelector('#bkTip'); if (tp) tp.textContent = pathDraw ? '轨迹绘制中：在 2D 网格上依次点途经点' : '轨迹完成';
      if (view === '3d') { view = '2d'; setView(); renderBottom(); }
    };
    const pc = panel.querySelector('#bkPathClear');
    if (pc) pc.onclick = () => { if (pathTarget) pathTarget.path = null; pathDraw = false; renderObjTab(); };
    const del = panel.querySelector('#bkDel');
    if (del) del.onclick = () => { if (selIdx >= 0) { scene.objects.splice(selIdx, 1); selIdx = -1; renderObjTab(); } };
    const cs = panel.querySelector('#bkCamSave');
    if (cs) cs.onclick = () => {
      scene.cams.push({ ...scene.cam });
      renderObjTab();
      toast('机位已存入镜头册 📷', 'ok');
    };
    panel.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      Object.assign(scene.cam, scene.cams[+b.dataset.load]);
      syncCamSliders();
      toast('机位已载入', 'ok');
    });
    panel.querySelectorAll('[data-cdel]').forEach(b => b.onclick = () => {
      scene.cams.splice(+b.dataset.cdel, 1); renderObjTab();
    });
  }

  function renderLightTab() {
    panel.innerHTML = `
      <div class="card-title">主光（相对机位）</div>
      <div class="sb-palette" id="bkLP">
        <button class="chip" data-l="key">☀️ 顺光</button><button class="chip" data-l="side">🧭 侧光</button>
        <button class="chip" data-l="rim">🌅 侧逆光</button><button class="chip" data-l="back">🌇 逆光</button>
        <button class="chip" data-l="top">🔆 顶光</button><button class="chip" data-l="flat">☁️ 高调平光</button>
      </div>
      <div class="form-row"><label>光方位 <span id="bkLAzV">${scene.light.az}°</span><span class="dim">（0°=顺光/180°=逆光）</span></label><input type="range" id="bkLAz" class="scrub" min="0" max="360" value="${scene.light.az}"></div>
      <div class="form-row"><label>光高度 <span id="bkLElV">${scene.light.el}°</span></label><input type="range" id="bkLEl" class="scrub" min="5" max="85" value="${scene.light.el}"></div>
      <div class="form-row"><label>光强度 <span id="bkLIntV">${scene.light.int}</span></label><input type="range" id="bkLInt" class="scrub" min="0.3" max="1.3" step="0.05" value="${scene.light.int}"></div>
      <div class="dim" style="font-size:11px">额外光源：用左侧「造物」放 💡 灯，选中后调强度。</div>`;
    const PRE = { key: [0, 35, 1], side: [90, 30, 1.05], rim: [140, 28, 1.1], back: [180, 30, 1.15], top: [0, 78, 1.05], flat: [0, 18, 0.45] };
    panel.querySelectorAll('#bkLP .chip').forEach(b => b.onclick = () => {
      const [az, el, int] = PRE[b.dataset.l];
      scene.light = { az, el, int };
      panel.querySelector('#bkLAz').value = az; panel.querySelector('#bkLAzV').textContent = az + '°';
      panel.querySelector('#bkLEl').value = el; panel.querySelector('#bkLElV').textContent = el + '°';
      panel.querySelector('#bkLInt').value = int; panel.querySelector('#bkLIntV').textContent = int;
    });
    [['bkLAz', 'az', '°', 'bkLAzV'], ['bkLEl', 'el', '°', 'bkLElV'], ['bkLInt', 'int', '', 'bkLIntV']].forEach(([id, k, u, vid]) => {
      panel.querySelector('#' + id).oninput = e => { scene.light[k] = +e.target.value; panel.querySelector('#' + vid).textContent = e.target.value + u; };
    });
  }

  function renderGroundTab() {
    panel.innerHTML = `
      <div class="card-title">地面上色</div>
      <div class="sb-palette" id="bkFloor">
        ${FLOORS.map(([c, n]) => `<button class="chip ${(scene.floor || '') === c ? 'chip-on' : ''}" data-c="${c}"><i style="width:10px;height:10px;border-radius:2px;background:${c || '#d9dde5'};display:inline-block;margin-right:4px"></i>${n}</button>`).join('')}
      </div>
      <div class="card-title" style="margin-top:14px">网格</div>
      <label class="bk-check"><input type="checkbox" id="bkGridCh" ${showGrid ? 'checked' : ''}> 显示网格</label>`;
    panel.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      scene.floor = b.dataset.c;
      renderGroundTab();
    });
    const g = panel.querySelector('#bkGridCh');
    if (g) g.onchange = () => { showGrid = g.checked; };
  }

  // ---- 指针交互 ----
  // (drag 声明在状态区)
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    let hit = -1;
    if (view === '2d') {
      const [wx, wz] = p2w(sx, sy);
      let bd = 0.6;
      scene.objects.forEach((o, i) => { const dd = Math.hypot(o.x - wx, o.z - wz); if (dd < bd) { bd = dd; hit = i; } });
    } else {
      const cam0 = solveCamera(sim, 0.35, { x: 0, y: 0, z: 0 }, { scene });
      const fc0 = (renderer.h / 2) / Math.tan(((scene.cam?.fov || 55) * DEG) / 2);
      let bd = 30;
      scene.objects.forEach((o, i) => {
        const pr = renderer.project([o.x, 0.6 * (o.scale || 1), o.z], cam0, fc0, renderer.w / 2, renderer.h / 2);
        if (pr) { const dd = Math.hypot(pr.x - sx, pr.y - sy); if (dd < bd) { bd = dd; hit = i; } }
      });
    }
    if (hit >= 0) { scene.objects.splice(hit, 1); if (selIdx === hit) selIdx = -1; renderPanel(); toast('已删除'); }
  });

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    scene.cam.dist = Math.max(3, Math.min(12, (scene.cam.dist || 7) + (e.deltaY > 0 ? 0.5 : -0.5)));
    syncCamSliders();
  }, { passive: false });

  cv.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    drag = { sx: e.clientX, sy: e.clientY, az: scene.cam.az || 0, h: scene.cam.h || 1.8, moved: false };
    if (view === '2d') {
      const [wx, wz] = p2w(sx, sy);
      drag.x1 = Math.max(-11, Math.min(11, +wx.toFixed(2)));
      drag.z1 = Math.max(-11, Math.min(11, +wz.toFixed(2)));
      drag.wx = wx; drag.wz = wz;
    }
  });

  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    if (view === '3d') {
      scene.cam.az = ((drag.az - dx * 0.45) % 360 + 360) % 360;
      scene.cam.h = Math.max(0.4, Math.min(9, drag.h + dy * 0.02));
      return;
    }
    const r = cv.getBoundingClientRect();
    const [wx, wz] = p2w(e.clientX - r.left, e.clientY - r.top);
    const cx = Math.max(-11, Math.min(11, +wx.toFixed(2))), cz = Math.max(-11, Math.min(11, +wz.toFixed(2)));
    if (tool === 'room') roomDrag = { x1: drag.x1, z1: drag.z1, x2: cx, z2: cz, moved: true };
    else if (tool === 'wall') roomDrag = { x1: drag.x1, z1: drag.z1, x2: cx, z2: cz, moved: true, line: true };
    else if (drag.moveIdx >= 0 && scene.objects[drag.moveIdx]) { scene.objects[drag.moveIdx].x = cx; scene.objects[drag.moveIdx].z = cz; }
  });

  cv.addEventListener('pointerup', e => {
    const wasDrag = drag && drag.moved;
    const up = drag ? { sx: drag.sx, sy: drag.sy, x1: drag.x1, z1: drag.z1, moveIdx: drag.moveIdx } : null;
    setTimeout(() => { drag = null; }, 0);
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;

    if (view === '2d') {
      const [wx, wz] = p2w(sx, sy);
      const cx = Math.max(-11, Math.min(11, +wx.toFixed(2))), cz = Math.max(-11, Math.min(11, +wz.toFixed(2)));
      // 房间
      if (tool === 'room' && wasDrag && roomDrag && roomDrag.moved) {
        const x1 = Math.min(roomDrag.x1, roomDrag.x2), x2 = Math.max(roomDrag.x1, roomDrag.x2);
        const z1 = Math.min(roomDrag.z1, roomDrag.z2), z2 = Math.max(roomDrag.z1, roomDrag.z2);
        if (x2 - x1 > 0.8 && z2 - z1 > 0.8) {
          scene.objects.push(
            { type: 'prop', shape: 'wall', x: +((x1 + x2) / 2).toFixed(2), z: z1, rot: 0, scale: 1, w: +(x2 - x1 + 0.24).toFixed(2), h: 2.4 },
            { type: 'prop', shape: 'wall', x: +((x1 + x2) / 2).toFixed(2), z: z2, rot: 0, scale: 1, w: +(x2 - x1 + 0.24).toFixed(2), h: 2.4 },
            { type: 'prop', shape: 'wall', x: x1, z: +((z1 + z2) / 2).toFixed(2), rot: 90, scale: 1, w: +(z2 - z1 + 0.24).toFixed(2), h: 2.4 },
            { type: 'prop', shape: 'wall', x: x2, z: +((z1 + z2) / 2).toFixed(2), rot: 90, scale: 1, w: +(z2 - z1 + 0.24).toFixed(2), h: 2.4 });
          toast('房间已生成 🏠', 'ok'); window.__bdm.addXP(2, '画房间');
        }
        roomDrag = null; renderPanel();
        return;
      }
      // 墙线
      if (tool === 'wall' && wasDrag && roomDrag && roomDrag.moved) {
        const dx = roomDrag.x2 - roomDrag.x1, dz = roomDrag.z2 - roomDrag.z1;
        const len = Math.hypot(dx, dz);
        if (len > 0.3) {
          scene.objects.push({ type: 'prop', shape: 'wall', x: +((roomDrag.x1 + roomDrag.x2) / 2).toFixed(2), z: +((roomDrag.z1 + roomDrag.z2) / 2).toFixed(2), rot: Math.round(Math.atan2(dz, dx) / DEG), scale: 1, w: +(len + 0.24).toFixed(2), h: 2.4 });
          toast('墙已生成 🧱', 'ok');
        }
        roomDrag = null; renderPanel();
        return;
      }
      // 命中检测（选择/挪动）
      let hit = -1, bd = 0.55;
      scene.objects.forEach((o, i) => { const dd = Math.hypot(o.x - wx, o.z - wz); if (dd < bd) { bd = dd; hit = i; } });
      if (tool === 'select') {
        if (hit >= 0) { selIdx = hit; renderPanel(); return; }
        if (pathDraw && pathTarget && selIdx >= 0 && scene.objects[selIdx] === pathTarget) { pathTarget.path.push({ x: cx, z: cz }); renderPanel(); return; }
        selIdx = -1; renderPanel(); return;
      }
      if (tool === 'person' || tool === 'obj') {
        if (hit >= 0) { selIdx = hit; renderPanel(); return; }
        const o = tool === 'person'
          ? { type: 'actor', x: cx, z: cz, rot: 205, scale: 1, action: 'stand', seed: Math.round(Math.random() * 90) }
          : { type: 'prop', shape: placeShape, x: cx, z: cz, rot: 0, scale: 1 };
        scene.objects.push(o);
        selIdx = scene.objects.length - 1;
        renderPanel(); toast(TNAME[o.shape || o.type] + '已放置', 'ok');
        return;
      }
      return;
    }

    // 3D：选择 / 放置
    const cam0 = solveCamera(sim, 0.35, { x: 0, y: 0, z: 0 }, { scene });
    const fc0 = (renderer.h / 2) / Math.tan(((scene.cam?.fov || 55) * DEG) / 2);
    let best = -1, bd = 30;
    scene.objects.forEach((o, i) => {
      const pr = renderer.project([o.x, 0.6 * (o.scale || 1), o.z], cam0, fc0, renderer.w / 2, renderer.h / 2);
      if (pr) { const dd = Math.hypot(pr.x - sx, pr.y - sy); if (dd < bd) { bd = dd; best = i; } }
    });
    if (best >= 0) { selIdx = best; renderPanel(); return; }
    if (tool === 'person' || tool === 'obj') {
      const g = unproject3D(sx, sy, cam0, fc0, renderer.w, renderer.h);
      if (!g) return;
      const o = tool === 'person'
        ? { type: 'actor', x: g[0], z: g[1], rot: 205, scale: 1, action: 'stand', seed: Math.round(Math.random() * 90) }
        : { type: 'prop', shape: placeShape, x: g[0], z: g[1], rot: 0, scale: 1 };
      scene.objects.push(o);
      selIdx = scene.objects.length - 1;
      renderPanel(); toast('已放置', 'ok');
    }
  });

  function unproject3D(sx, sy, cam, focal, W, H) {
    const A = (sx - W / 2) / focal, B = (H / 2 - sy) / focal;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const denom = B * cp + sp;
    if (Math.abs(denom) < 0.02) return null;
    const d = -cam.pos[1] / denom;
    if (d <= 0.15 || d > 60) return null;
    const x2 = A * d, z2 = B * d * sp - d * cp;
    const cy_ = Math.cos(cam.yaw), sy_ = Math.sin(cam.yaw);
    const wx = cam.pos[0] + x2 * cy_ - z2 * sy_;
    const wz = cam.pos[2] + x2 * sy_ + z2 * cy_;
    return [Math.max(-11, Math.min(11, +wx.toFixed(2))), Math.max(-11, Math.min(11, +wz.toFixed(2)))];
  }

  m.body.querySelector('#sbSearch').oninput = () => renderList();
  m.body.querySelector('#sbHideA').onclick = () => { m.body.querySelector('#sbHideA').classList.toggle('chip-on'); renderList(); };
  m.body.querySelector('#sbHideP').onclick = () => { m.body.querySelector('#sbHideP').classList.toggle('chip-on'); renderList(); };
  function syncCamSliders() {
    const az = panel.querySelector('#bkCamAz');
    if (az) { az.value = scene.cam.az; }
  }

  // ---- AI 搭建 ----
  m.body.querySelector('#bkAI').onclick = () => {
    const am = modal({
      title: '🤖 AI 搭建 · 让 AI 搭，你来拍',
      body: '<div class="dim" style="font-size:12px;margin-bottom:10px">描述场景让 AI 生成搭建 JSON；也可直接粘贴他人分享的 JSON。</div>' +
        '<div class="form-row"><label>场景描述</label><input id="bkAiDesc" class="input" placeholder="例：两室一厅客厅，沙发朝电视，一个人从门口走到沙发坐下"></div>' +
        '<div class="modal-actions"><button class="btn btn-magic btn-sm" id="bkAiGen">🤖 生成 JSON</button><span class="dim" id="bkAiSt"></span></div>' +
        '<div class="form-row"><label>搭建 JSON</label><textarea id="bkAiJson" class="input mono" rows="9"></textarea></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-act="c">取消</button><button class="btn btn-primary" data-act="imp">📥 导入并搭建</button></div>',
    });
    am.body.querySelector('[data-act="c"]').onclick = () => am.close();
    am.body.querySelector('#bkAiGen').onclick = async () => {
      const desc = am.body.querySelector('#bkAiDesc').value.trim();
      if (!desc) { toast('先描述场景', 'warn'); return; }
      if (!window.__bdm.settings.api) { toast('先到 设置 → AI接口 配置接口', 'warn'); return; }
      const st = am.body.querySelector('#bkAiSt');
      st.textContent = '🤖 生成中…';
      try {
        const sys = '你是三维场景搭建助手。只输出 JSON：' + NL +
          '{"base":"plain|street|room|stage","objects":[{"type":"actor","x":数,"z":数,"rot":0-360,"scale":1,"action":"stand|walk|run|sit","path":[{"x":数,"z":数}]},或{"type":"prop","shape":"box|pillar|table|wall|door|window|sofa|tree|lamp","x":数,"z":数,"rot":0-360,"scale":1,"w":数,"h":数,"lint":0.1-1}],"light":{"az":0-360,"el":5-85,"int":0.3-1.3},"cam":{"az":0-360,"dist":3-12,"h":0.4-9,"fov":25-90}}' + NL +
          'x,z ∈ [-11,11]。按描述安排底景、墙体、道具、人物与走位。';
        const { callAI } = await import('./breakdown.js');
        const out = await callAI(window.__bdm.settings, [{ role: 'user', content: sys + NL + NL + '描述：' + desc }], { temperature: 0.4, json: true });
        const mm = out.match(/\{[\s\S]*\}/);
        if (!mm) throw new Error('AI 未返回 JSON');
        am.body.querySelector('#bkAiJson').value = JSON.stringify(JSON.parse(mm[0]), null, 2);
        st.textContent = '✅ 已生成';
      } catch (e) { st.textContent = '❌ ' + e.message; }
    };
    am.body.querySelector('[data-act="imp"]').onclick = () => {
      try {
        const j = JSON.parse(am.body.querySelector('#bkAiJson').value);
        if (j.base) scene.base = j.base;
        if (Array.isArray(j.objects)) scene.objects = j.objects;
        if (j.light) scene.light = j.light;
        if (j.cam) scene.cam = j.cam;
        if (Array.isArray(j.cams)) scene.cams = j.cams;
        selIdx = -1; renderPanel();
        m.body.querySelector('#bkTip').textContent = 'JSON 场景已导入';
        am.close();
        toast('场景已导入 🏗', 'ok');
        window.__bdm.addXP(3, 'AI 搭建');
      } catch (e) { toast('JSON 解析失败：' + e.message, 'warn'); }
    };
  };

  // ---- 保存/清空/取消 ----
  m.body.querySelector('#bkSave').onclick = () => {
    pathDraw = false; pathTarget = null;
    window.__bdm.updateShot(shot.id, {
      scene: scene.objects.length || scene.cams.length ? scene : null,
      ...(scene.objects.length ? { cameraMove: 'free' } : {}),
    });
    window.__bdm.addXP(3, '搭建场景');
    m.close();
    toast('场景已保存 🏗', 'ok');
    if (onSaved) onSaved();
  };
  m.body.querySelector('#bkClear').onclick = () => { scene.objects = []; scene.cams = []; selIdx = -1; renderPanel(); };
  m.body.querySelector('#bkCancel').onclick = () => m.close();
  const __oc = m.close;
  m.close = (r) => { window.__sbOpen = null; __oc(r); };
  m.root.querySelector('.modal-x').onclick = () => m.close(null);

  // ---- 启动 ----
  m.body.classList.add('modal-super-body');
  m.root.querySelector('.modal').classList.add('modal-super');
  setView();
  renderBottom();
  renderPanel();
  updateTip();
  raf = requestAnimationFrame(loop);
}
