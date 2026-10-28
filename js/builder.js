/* ============================================================
 * 场景搭建 · 导演台原生重制（v4 · 2026-10-25）
 * 全屏浮层承载「喵咛导演台」—— B 站玩具 MiorningDYT（v0.6.17）
 * 的完整原生克隆，界面与交互 1:1 复刻：
 *   01 画空间（2D 网格：画房间/画墙/造物/打洞/人物/平移）
 *   → 立起来 → 02 找镜头（3D 导演视图：轨道相机/取景框/剖墙）
 *   → 截图进镜头册 → 故事板 / 剪辑台 / 运镜录制 / 仙人模式
 * 模块文件（index.html 引入）：
 *   js/mn-icons.js    lucide 图标 path 数据（从原版包提取）
 *   js/miaoning.js    应用外壳 + 2D 编辑器 + 故事板（挂 window.MN）
 *   js/miaoning3d.js  自研精简 WebGL 3D 引擎（window.MN3D）
 *   js/miaoning_m3.js 剪辑台 / 运镜录制 / 仙人模式（window.MN3）
 *   css/miaoning.css  纸墨暖色设计系统（亮/暗双主题，自包含）
 *
 * 与剪辑台的数据桥（本文件负责）：
 *   打开 → shot.scene（白模格式）转 喵咛格式，种子注入画布 01
 *   保存 → 喵咛格式转回 白模格式 写进 shot.scene
 *          （运镜预演 / 动态分镜链路不变，照常消费）
 *          镜头册最新截图 → 挂成该镜参考图
 * ============================================================ */
import { toast, askText, confirmDlg } from './ui.js';
import { CAMERA_MOVES, SHOT_SIZES, ANGLES } from './data.js';

const DEG = Math.PI / 180;
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

/* ============================================================
 * 格式转换一：白模场景（cameraSim 消费的 shot.scene）→ 喵咛场景
 * 坐标约定：白模 (x, z) 直接对应 喵咛 2D 平面 (x, y)（y 向下）。
 * 墙：白模 rot=0 时长边沿 X；喵咛墙角 θ=atan2(dy,dx)，两者互为反向。
 * 人：白模 yaw=0 面朝 +z；喵咛 rot=0 面朝 +x → yaw = 90 - rot。
 * ============================================================ */
export function shotSceneToMn(scene, shot) {
  const st = {
    format: 'aistudio-director', version: 1, updatedAt: Date.now(),
    scene: {
      title: ((shot && shot.desc) || '未命名镜头').slice(0, 18),
      rooms: [], walls: [], props: [], persons: [], lights: [],
      ground: { color: (scene && scene.floor) || '#ffffff', grid: true },
    },
    view: { mode: '2d', material: 'original', zoom: 1, x: 0, y: 0, grid: true, floorColor: true },
    sun: { on: true, dir: 300, alt: 53 },
    camera: { size: '16:9', frame: false, cutaway: false, ceil: false, fov: 55 },
    directorShots: [], project: null, cuttingDesk: null, cameraPath: null,
    editorPreferences: {},
  };
  const objs = (scene && Array.isArray(scene.objects)) ? scene.objects : [];
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    if (o.type === 'prop' && o.shape === 'wall') {
      const w = Math.max(0.5, +o.w || 3);
      const r = (+o.rot || 0) * DEG;
      // 白模墙方向 (cos r, -sin r) → 喵咛角 θ = -r
      const th = -r;
      const dx = Math.cos(th) * w / 2, dy = Math.sin(th) * w / 2;
      st.scene.walls.push({ id: uid(), name: '', x1: o.x - dx, y1: o.z - dy, x2: o.x + dx, y2: o.z + dy, h: Math.max(1.5, Math.min(4, +o.h || 2.4)), holes: [] });
    } else if (o.type === 'prop' && o.shape === 'lamp') {
      st.scene.lights.push({ id: uid(), name: '光源', x: o.x, y: o.z, color: '#ffe9b0', hidden: false });
    } else if (o.type === 'prop' && o.kind && window.MN_PROP_KINDS && window.MN_PROP_KINDS[o.kind]) {
      // 道具库条目：kind / 真实尺寸 / 朝向都要还原回来，否则重开导演台又变回一块光板
      // （白模里的 rot 是取过负号的内部值，这里再取负回「俯视顺时针」）
      const K = window.MN_PROP_KINDS[o.kind];
      const w = Math.max(0.05, +o.w || 1), d = Math.max(0.05, +o.d || 1), h = Math.max(0.05, +o.h || 1);
      st.scene.props.push({
        id: uid(), name: K.name || o.kind, kind: o.kind,
        x: o.x - w / 2, y: o.z - d / 2, w, d, h, color: '',
        rot: ((-(+o.rot || 0)) % 360 + 360) % 360, hidden: false,
      });
    } else if (o.type === 'prop') {
      // 其他道具按形状标称尺寸还原成“造物”（方块家具）
      const NOM = { box: [0.8, 0.8, 0.8], pillar: [0.4, 0.4, 2.4], table: [1.3, 0.85, 0.75], door: [1.24, 0.3, 2.1], window: [2.4, 0.3, 2.4], sofa: [1.6, 0.85, 0.75], tree: [1.2, 1.2, 2.8] };
      const n = NOM[o.shape] || NOM.box;
      const s = Math.min(3, Math.max(0.3, +o.scale || 1));
      const w = n[0] * s, d = n[1] * s, h = n[2] * s;
      st.scene.props.push({ id: uid(), name: o.shape === 'box' ? '造物' : o.shape, x: o.x - w / 2, y: o.z - d / 2, w, d, h, color: '', hidden: false });
    } else if (o.type === 'actor') {
      const P2A = { stand: '站立', walk: '走路', run: '运动', turn: '站立', sit: '坐下' };
      st.scene.persons.push({
        id: uid(), name: o.name || '人物', x: o.x, y: o.z, sitH: Math.max(0, Math.min(1.6, +o.sitH || 0)),
        rot: ((90 - (+o.rot || 0)) % 360 + 360) % 360,
        color: o.color || '#2e7cf6', pose: P2A[o.action] || '站立', face: 1, faceDir: 0, jump: 0, hidden: false,
      });
    }
  }
  /* mnToShotScene 把场景平移到了原点；读回导演台时要平移回原来的网格位置 */
  const C = (scene && scene.center) || { x: 0, z: 0 };
  if (C.x || C.z) {
    st.scene.walls.forEach(w => { w.x1 += C.x; w.x2 += C.x; w.y1 += C.z; w.y2 += C.z; });
    st.scene.props.forEach(p => { p.x += C.x; p.y += C.z; });
    st.scene.persons.forEach(p => { p.x += C.x; p.y += C.z; });
    st.scene.lights.forEach(p => { p.x += C.x; p.y += C.z; });
  }
  if (scene && scene.light) {
    st.sun = {
      on: (+scene.light.int ?? 1) > 0.05,
      dir: +scene.light.az || 300,
      alt: Math.min(85, Math.max(5, +scene.light.el ?? 53)),
    };
  }
  if (scene && scene.cam && scene.cam.fov) st.camera.fov = Math.min(90, Math.max(25, +scene.cam.fov));
  return st;
}

/* ============================================================
 * 格式转换二：喵咛场景 → 白模场景（shot.scene）
 * 房间 → 四面墙；墙 → 墙（rot = -θ）；造物 → box（等比缩放）；
 * 人物 → actor（yaw = 90 - rot）；光源 → lamp；太阳 → light。
 * ============================================================ */
export function mnToShotScene(st) {
  const sc = (st && st.scene) || {};
  const objects = [];
  const push = (o) => { if (o && isFinite(o.x) && isFinite(o.z)) objects.push(o); };

  (sc.rooms || []).forEach(r => {
    const h = Math.max(1.5, Math.min(2.4, +r.h || 4));
    const w = Math.max(0.5, +r.w || 1), d = Math.max(0.5, +r.d || 1);
    push({ type: 'prop', shape: 'wall', x: r.x + w / 2, z: r.y, rot: 0, w, h });
    push({ type: 'prop', shape: 'wall', x: r.x + w / 2, z: r.y + d, rot: 0, w, h });
    push({ type: 'prop', shape: 'wall', x: r.x, z: r.y + d / 2, rot: -90, w: d, h });
    push({ type: 'prop', shape: 'wall', x: r.x + w, z: r.y + d / 2, rot: -90, w: d, h });
  });
  (sc.walls || []).forEach(w => {
    const L = Math.hypot((w.x2 || 0) - (w.x1 || 0), (w.y2 || 0) - (w.y1 || 0));
    if (L < 0.05) return;
    const th = Math.atan2((w.y2 || 0) - (w.y1 || 0), (w.x2 || 0) - (w.x1 || 0));
    push({ type: 'prop', shape: 'wall', x: ((w.x1 || 0) + (w.x2 || 0)) / 2, z: ((w.y1 || 0) + (w.y2 || 0)) / 2, rot: -th / DEG, w: L, h: Math.max(1.5, Math.min(2.4, +w.h || 2.6)) });
  });
  (sc.props || []).forEach(p => {
    if (p.hidden) return;
    const w = Math.max(0.05, +p.w || 1), d = Math.max(0.05, +p.d || 1), h = Math.max(0.05, +p.h || 1);
    /* 有道具库种类 → 直接把 kind 与真实尺寸/朝向交给白模，按同一套多部件建模预演 */
    const kind = window.MN_kindOf ? window.MN_kindOf(p) : (p.kind || null);
    if (kind && window.MN_PROP_KINDS && window.MN_PROP_KINDS[kind] && window.MN_propCenter) {
      const ct = window.MN_propCenter(p);
      push({ type: 'prop', shape: 'kind', kind, id: p.id, name: p.name || '', x: ct.x, z: ct.y, w, d, h, rot: -((+p.rot || 0)), scale: 1 });
      return;
    }
    /* 按长宽高比例认回原始形状：桌/沙发/门/窗/树/柱 —— 预演时还原真实家具，
     * 否则所有造物一律渲染成方块，「用场景预演」等于白搭 */
    const CAND = [
      ['door', 1.24, 0.3, 2.1], ['window', 2.4, 0.3, 2.4], ['table', 1.3, 0.85, 0.75],
      ['sofa', 1.6, 0.85, 0.78], ['pillar', 0.4, 0.4, 2.4], ['tree', 1.2, 1.2, 2.8], ['lamp', 0.3, 0.3, 2.0],
    ];
    let best = null, bestErr = Infinity;
    for (const [shape, cw, cd, ch] of CAND) {
      const err = (Math.abs(w - cw) + Math.abs(d - cd) + Math.abs(h - ch)) / (cw + cd + ch);
      if (err < bestErr) { bestErr = err; best = [shape, cw]; }
    }
    const shape = (bestErr < 0.3) ? best[0] : 'box';
    const base = shape === 'box' ? 0.8 : best[1];
    const s = Math.min(3, Math.max(0.3, w / base));
    push({ type: 'prop', shape, id: p.id, name: p.name || '', x: (+p.x || 0) + w / 2, z: (+p.y || 0) + d / 2, rot: 0, scale: s });
  });
  (sc.persons || []).forEach(pe => {
    if (pe.hidden) return;
    const A2P = { '站立': 'stand', '走路': 'walk', '运动': 'walk', '坐下': 'sit', '招手': 'stand', '躺下': 'sit' };
    /* 运动轨迹：带上路径与速度，运镜预演 / 动态分镜里人物会沿轨迹走动 */
    const pathPts = (pe.path || []).map(q => ({ x: +q.x || 0, z: +q.y || 0 }));
    const hasPath = pathPts.length >= 2;
    push({
      type: 'actor', id: pe.id, name: pe.name || '', x: +pe.x || 0, z: +pe.y || 0,
      rot: ((90 - (+pe.rot || 0)) % 360 + 360) % 360, scale: 1,
      action: hasPath ? 'walk' : (A2P[pe.pose] || 'stand'),
      /* 坐在家具上：把坐面高度带给白模，预演里人才不会陷进椅子 */
      sitH: pe.sitOn ? Math.max(0, Math.min(1.6, +pe.sitH || 0)) : 0,
      color: pe.color || '#2e7cf6', name: pe.name || '',
      ...(hasPath ? { path: pathPts, speed: +pe.speed || 1.2 } : {}),
    });
  });
  (sc.lights || []).forEach(l => {
    if (l.hidden) return;
    /* light:true → 白模里只在灯的高度画一颗小光球，不要变成一根立在画面中间的落地灯 */
    push({ type: 'prop', shape: 'lamp', light: true, id: l.id, name: l.name || '', h: Math.max(0.6, Math.min(6, +l.h || 2.5)), x: +l.x || 0, z: +l.y || 0, rot: 0, scale: 1 });
  });

  const sun = st.sun || {};
  const light = { az: +sun.dir || 300, el: Math.min(85, Math.max(5, +sun.alt ?? 53)), int: sun.on === false ? 0.35 : 1 };

  /* ---------- 场景居中 ----------
     白模的机位系统是「围着原点搭台」的：固定机位在 (0,1.7,7) 看向原点、自由机位绕原点转、
     摇臂/环绕/拉远都以原点为中心。用户搭的景可能落在网格任何角落，直接送进预演就只剩边角料。
     所以把整份场景平移到以原点为中心；原中心存进 scene.center，回读导演台时再平移回去。 */
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const o of objects) {
    const hx = o.type === 'actor' ? 0.4 : (o.shape === 'wall' ? Math.abs(+o.w || 3) / 2 + 0.3 : Math.abs(+o.w || 1) / 2);
    const hz = o.type === 'actor' ? 0.4 : (o.shape === 'wall' ? 0.4 : Math.abs(+o.d || 1) / 2);
    minX = Math.min(minX, o.x - hx); maxX = Math.max(maxX, o.x + hx);
    minZ = Math.min(minZ, o.z - hz); maxZ = Math.max(maxZ, o.z + hz);
  }
  const center = isFinite(minX) ? { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 } : { x: 0, z: 0 };
  if (center.x || center.z) {
    for (const o of objects) {
      o.x -= center.x; o.z -= center.z;
      if (Array.isArray(o.path)) o.path.forEach(q => { q.x -= center.x; q.z -= center.z; });
    }
  }

  /* ---------- 机位：导演台「存镜头」时的那台相机 ----------
     MN3D.getCamera() = {theta, phi, r, tx, ty, tz}，eye = target + r(sinφcosθ, cosφ, sinφsinθ)。
     白模自由机位 = eye(az, dist, h) 绕原点 → az = 90° - θ、dist = r·sinφ、h = ty + r·cosφ。 */
  const dirShots = (st.directorShots || []).filter(s => s && s.cam);
  const dc = dirShots.length ? dirShots[dirShots.length - 1].cam : null;
  const fov = Math.min(90, Math.max(25, +((st.camera || {}).fov) || 55));
  const cam = dc && isFinite(dc.theta) && isFinite(dc.r)
    ? {
        az: (((90 - (dc.theta * 180) / Math.PI) % 360) + 360) % 360,
        dist: Math.max(1.2, Math.abs(dc.r * Math.sin(dc.phi || 1.0))),
        h: Math.max(0.3, (+dc.ty || 0) + Math.abs(dc.r * Math.cos(dc.phi || 1.0))),
        fov,
      }
    : { az: 25, dist: 7.5, h: 1.8, fov };

  return {
    base: 'plain',
    floor: (sc.ground && sc.ground.color) || '',
    objects, light, cam, cams: [],
    center,
    /* 剖开前方外墙：导演台里勾了就跟着走；没勾但有 3 面以上墙（= 房间）时默认剖开，
       否则机位一退就被自己搭的墙糊住整个画面，用户看到的是「一面大白墙」 */
    cutaway: !!(st.camera && st.camera.cutaway) || objects.filter(o => o.shape === 'wall').length >= 3,
  };
}

/* ============================================================
 * 浮层承载
 * ============================================================ */
let ovEl = null;
let curShot = null;
let curOnSaved = null;
let libraryMode = false;

function buildOverlay() {
  ovEl = document.createElement('div');
  ovEl.className = 'sb-mn-overlay';
  ovEl.id = 'sbMnOverlay';
  ovEl.innerHTML = `
    <div class="mn-root" id="mnRoot"></div>
    <div class="sb-mn-dock">
      <span class="sb-mn-dock-tip" id="sbMnTip">搭建好后点「保存到镜头」——运镜预演 / 动态分镜就会用这个场景</span>
      <button class="btn btn-ghost btn-sm" id="sbMnAi">🤖 AI 搭景</button>
      <button class="btn btn-ghost btn-sm" id="sbMnLib">📚 存入场景库</button>
      <button class="btn btn-primary btn-sm" id="sbMnSave">💾 保存到镜头</button>
      <button class="btn btn-ghost btn-sm" id="sbMnClose">直接返回</button>
    </div>`;
  document.body.appendChild(ovEl);
  ovEl.querySelector('#sbMnSave').onclick = () => saveAndClose();
  /* ⚠️ 不能直接绑 saveToLibrary：click 事件对象会被当成 st0 传进去，场景被判空 */
  ovEl.querySelector('#sbMnLib').onclick = () => saveToLibrary();
  ovEl.querySelector('#sbMnAi').onclick = () => runAiBuild();
  ovEl.querySelector('#sbMnClose').onclick = () => { closeOverlay(); };
}

/* ============================================================
 * AI 搭景（逐镜确认）：按本镜描述生成场景 + 机位 + 人物走位
 * 只注入导演台做草稿，不落库 —— 用户看过 2D/3D 再点「保存到镜头」
 * ============================================================ */
let aiBusy = false;
const nameOf = (list, key) => (list.find(x => x.key === key) || {}).name || '';

async function runAiBuild() {
  if (aiBusy) return;
  const btn = ovEl.querySelector('#sbMnAi'), tip = ovEl.querySelector('#sbMnTip');
  const st = window.miaoningGetScene ? window.miaoningGetScene() : null;
  if (!st || !window.AI_SCENE) { toast('导演台还没准备好，稍等一下再试', 'warn'); return; }
  const settings = (window.__bdm && window.__bdm.settings) || {};
  if (!settings.api || !settings.api.url || !settings.api.model) {
    toast('先在「设置 → AI 接口」填好地址和模型名，再回来点 AI 搭景', 'warn');
    return;
  }
  const sc0 = st.scene || {};
  const has = ((sc0.rooms || []).length + (sc0.walls || []).length + (sc0.props || []).length + (sc0.persons || []).length) > 0;
  if (has && !(await confirmDlg('AI 搭景会覆盖当前这套搭建（只是草稿，没点「保存到镜头」前都不算数）。继续？', { okText: '覆盖并重搭' }))) return;

  aiBusy = true; btn.disabled = true; btn.textContent = '🤖 搭景中…';
  if (tip) tip.textContent = 'AI 正在按本镜描述搭景（一般 10~40 秒）…';
  try {
    const p = (window.__bdm && window.__bdm.active) || {};
    const shots = p.shots || [];
    const idx = curShot ? shots.findIndex(s => s.id === curShot.id) : -1;
    const r = await window.AI_SCENE.build({
      shot: curShot || { desc: sc0.title || '' },
      project: p, index: idx,
      sceneKey: (curShot && curShot.sceneKey) || '',
      sizeName: nameOf(SHOT_SIZES, (curShot || {}).shotSize) || '中景',
      moveName: nameOf(CAMERA_MOVES, (curShot || {}).cameraMove) || '固定',
      angleName: nameOf(ANGLES, (curShot || {}).angle) || '平视',
      prevDesc: idx > 0 ? (shots[idx - 1].desc || '') : '',
      nextDesc: idx >= 0 && idx < shots.length - 1 ? (shots[idx + 1].desc || '') : '',
      prevScene: (() => {
        /* 连戏：把上一镜搭好的空间压成一行喂给 AI，让它沿用同一套房间与家具位置 */
        const ps = idx > 0 && shots[idx - 1].mnState && shots[idx - 1].mnState.scene;
        if (!ps) return '';
        const rooms = (ps.rooms || []).map(r => `${r.name || '房间'}(${r.x},${r.y} ${r.w}×${r.d})`).join('、');
        const props = (ps.props || []).map(p => `${p.name}@(${(+p.x).toFixed(1)},${(+p.y).toFixed(1)})`).slice(0, 10).join('、');
        const ps2 = (ps.persons || []).map(p => `${p.name}@(${(+p.x).toFixed(1)},${(+p.y).toFixed(1)})`).slice(0, 4).join('、');
        return [rooms && '房间 ' + rooms, props && '家具 ' + props, ps2 && '人物 ' + ps2].filter(Boolean).join('；');
      })(),
      libraryNames: (p.scenes || []).map(x => x.name).slice(0, 6),
      settings,
    });
    if (window.MN && window.MN.renderAll) window.MN.renderAll();
    toast('AI 草稿搭好了：' + r.summary, 'ok');
    if (r.issues && r.issues.length) toast('已自动修正：' + r.issues.join('；'), 'warn');
    if (tip) tip.textContent = 'AI 草稿已就位 —— 看看 2D / 立起来看 3D，满意点「💾 保存到镜头」，不满意点「🤖 重搭」';
    btn.textContent = '🤖 重搭';
  } catch (e) {
    console.error('[AI 搭景]', e);
    toast('AI 搭景失败：' + (e.message || e), 'warn');
    if (tip) tip.textContent = '搭建好后点「保存到镜头」——运镜预演 / 动态分镜就会用这个场景';
  } finally {
    aiBusy = false; btn.disabled = false;
    if (btn.textContent === '🤖 搭景中…') btn.textContent = '🤖 AI 搭景';
  }
}

function closeOverlay() {
  if (!ovEl) return;
  ovEl.classList.remove('open');
  document.body.classList.remove('sb-mn-open');
}

/* 镜头册最新截图 → 挂成镜头参考图（白模预演时可替换白模） */
async function attachLatestShot(st) {
  const shots = (st && st.directorShots) || [];
  if (!shots.length || !window.__bdm || !curShot) return;
  const last = shots[shots.length - 1];
  const img = last && (last.image || last.url);
  if (!img || typeof img !== 'string' || img.indexOf('data:image') !== 0) return;
  try {
    const res = await fetch(img);
    const blob = await res.blob();
    await window.__bdm.attachImage(curShot.id, blob);
  } catch (e) { console.warn('[场景搭建] 参考图挂载失败', e); }
}

/* 场景快照瘦身：镜头册截图是 base64 PNG，整包塞进 localStorage 会爆 5MB 配额，
   所以只留机位参数（cam/name），图片本身已经挂在镜头的参考图里了。 */
function slimMnState(st) {
  const copy = JSON.parse(JSON.stringify(st));
  copy.directorShots = (copy.directorShots || []).map(s => ({ name: s && s.name, cam: s && s.cam }));
  delete copy.project; delete copy.cuttingDesk; delete copy.cameraPath;
  return copy;
}

function saveAndClose() {
  const st = window.miaoningGetScene ? window.miaoningGetScene() : null;
  if (!st) { toast('导演台还没准备好，稍等一下再试', 'warn'); return; }
  /* 存镜头前把穿家具的走位绕一遍：预演和导出的 mp4 里人不会从茶几/沙发里穿过去 */
  try {
    if (window.MN_LAYOUT && st.scene) {
      const routed = window.MN_LAYOUT.routeAllPaths(st.scene);
      if (routed.count) { toast('已把 ' + routed.count + ' 条走位绕开家具', 'ok'); if (window.renderAll) window.renderAll(); }
    }
  } catch (e) { console.warn('[存镜头] 走位避障失败', e); }
  const scene = mnToShotScene(st);
  const has = scene.objects.length > 0;
  /* 独立建景模式（从场景库进入，没有绑定镜头）：只入库 */
  if (libraryMode || !curShot) { saveToLibrary(st, scene, has); return; }
  window.__bdm.updateShot(curShot.id, {
    scene: has ? scene : null,
    /* 2026-10-26：额外存一份导演台原生状态。
       否则「房间」保存后再打开会变成 4 面墙（房间概念丢失），改不动了。 */
    mnState: has ? slimMnState(st) : null,
    sceneId: null,       // 本镜自己改过的场景 → 与场景库条目解绑（库里的仍保留）
    ...(has ? { cameraMove: 'free' } : {}),
  });
  window.__bdm.addXP(3, '搭建场景');
  attachLatestShot(st);
  toast(has ? '场景已保存到本镜 🏗（镜头册截图已挂为参考图）' : '已清空本镜场景', 'ok');
  closeOverlay();
  if (curOnSaved) curOnSaved();
}

/* 存入项目场景库：之后任何镜头都能一键套用同一个景 */
async function saveToLibrary(st0, scene0, has0) {
  const st = st0 || (window.miaoningGetScene ? window.miaoningGetScene() : null);
  if (!st) { toast('导演台还没准备好', 'warn'); return; }
  const scene = scene0 || mnToShotScene(st);
  const has = has0 != null ? has0 : scene.objects.length > 0;
  if (!has) { toast('先搭点东西再存场景库', 'warn'); return; }
  const defName = (curShot && (curShot.desc || '').slice(0, 12)) || ('场景 ' + ((window.__bdm.scenes || []).length + 1));
  const name = await askText({
    title: '存入场景库',
    label: '场景名称（之后任意镜头都能套用）',
    value: defName,
    placeholder: '例如：客厅 A / 街角 / 教室',
    okText: '存入',
  });
  if (name == null) return;
  const shots = (st.directorShots || []);
  const thumb = shots.length ? (shots[shots.length - 1].image || shots[shots.length - 1].url) : null;
  const it = window.__bdm.saveScene({ name: name.trim() || defName, scene, mnState: st, thumb: typeof thumb === 'string' ? thumb : null });
  /* 当前镜头同时指向这条场景，便于「这个景用在哪几镜」统计 */
  if (curShot && !libraryMode) {
    window.__bdm.updateShot(curShot.id, { scene, mnState: slimMnState(st), sceneId: it.id, cameraMove: 'free' });
  }
  window.__bdm.addXP(4, '存入场景库');
  attachLatestShot(st);
  toast(`已存入场景库「${it.name}」，任意镜头都能套用 📚`, 'ok');
  closeOverlay();
  if (curOnSaved) curOnSaved();
}

/* ============================================================
 * 对外入口（views-core.js 的「🏗 场景搭建」按钮调用）
 * ============================================================ */
export function openSceneBuilder(shot, onSaved, opts = {}) {
  curShot = shot || null;
  curOnSaved = onSaved || null;
  libraryMode = !!(opts && opts.library) || !shot;
  /* 新手教程是弹窗层（z-index 高于搭建浮层），会挡住画布点击 —— 进搭建时自动收起 */
  document.querySelectorAll('.modal-ov').forEach(o => {
    if (o.querySelector('#tuBox')) { o.remove(); try { localStorage.setItem('bdm_tutorial_v1', '1'); } catch (e) { } }
  });
  if (!ovEl) buildOverlay();
  ovEl.classList.add('open');
  document.body.classList.add('sb-mn-open');
  /* 停靠条按模式切换文案：独立建景没有「镜头」可存 */
  const tip = ovEl.querySelector('#sbMnTip');
  const saveBtn = ovEl.querySelector('#sbMnSave');
  const aiBtn = ovEl.querySelector('#sbMnAi');
  if (aiBtn) aiBtn.textContent = '🤖 AI 搭景';
  if (libraryMode) {
    if (tip) tip.textContent = '独立建景：搭好后「存入场景库」，之后任何镜头都能一键套用';
    if (saveBtn) saveBtn.textContent = '💾 存入场景库并返回';
  } else {
    if (tip) tip.textContent = '搭建好后点「保存到镜头」——运镜预演 / 动态分镜就会用这个场景';
    if (saveBtn) saveBtn.textContent = '💾 保存到镜头';
  }

  (async () => {
    try {
      if (typeof window.loadMiaoning !== 'function') {
        toast('导演台模块没加载上，请刷新页面重试', 'warn');
        return;
      }
      if (!window.MN || !window.MN.built) await window.loadMiaoning();
      // 主题跟随宿主（曜夜=暗）；之后可用玩具自己的月亮按钮切换
      try {
        const th = window.__bdm && window.__bdm.settings && window.__bdm.settings.theme;
        const root = document.getElementById('mnRoot');
        if (root && th === 'obsidian') root.dataset.mnTheme = 'dark';
      } catch (e) { /*  ignore */ }
      /* 优先用导演台原生快照（房间/墙/道具原样回来）；
         老数据只有 shot.scene（白模），才走格式转换；独立建景则给一张空场景 */
      const st = (curShot && curShot.mnState && curShot.mnState.scene)
        ? curShot.mnState
        : shotSceneToMn(curShot ? curShot.scene : null, curShot || { desc: '新场景' });
      window.miaoningSeed(st);
    } catch (e) {
      console.error('[场景搭建] 初始化失败', e);
      toast('导演台初始化失败：' + e.message, 'warn');
    }
  })();
}
