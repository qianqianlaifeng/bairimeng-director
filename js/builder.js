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
import { toast } from './ui.js';

const DEG = Math.PI / 180;
const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

/* ============================================================
 * 格式转换一：白模场景（cameraSim 消费的 shot.scene）→ 喵咛场景
 * 坐标约定：白模 (x, z) 直接对应 喵咛 2D 平面 (x, y)（y 向下）。
 * 墙：白模 rot=0 时长边沿 X；喵咛墙角 θ=atan2(dy,dx)，两者互为反向。
 * 人：白模 yaw=0 面朝 +z；喵咛 rot=0 面朝 +x → yaw = 90 - rot。
 * ============================================================ */
function shotSceneToMn(scene, shot) {
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
        id: uid(), name: '人物', x: o.x, y: o.z,
        rot: ((90 - (+o.rot || 0)) % 360 + 360) % 360,
        color: '#2e7cf6', pose: P2A[o.action] || '站立', face: 1, faceDir: 0, jump: 0, hidden: false,
      });
    }
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
function mnToShotScene(st) {
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
    const s = Math.min(3, Math.max(0.3, Math.max(+p.w || 1, +p.d || 1, +p.h || 1) / 0.8));
    push({ type: 'prop', shape: 'box', x: (+p.x || 0) + (+p.w || 1) / 2, z: (+p.y || 0) + (+p.d || 1) / 2, rot: 0, scale: s });
  });
  (sc.persons || []).forEach(pe => {
    if (pe.hidden) return;
    const A2P = { '站立': 'stand', '走路': 'walk', '运动': 'walk', '坐下': 'sit', '招手': 'stand', '躺下': 'sit' };
    push({ type: 'actor', x: +pe.x || 0, z: +pe.y || 0, rot: ((90 - (+pe.rot || 0)) % 360 + 360) % 360, scale: 1, action: A2P[pe.pose] || 'stand' });
  });
  (sc.lights || []).forEach(l => {
    if (l.hidden) return;
    push({ type: 'prop', shape: 'lamp', x: +l.x || 0, z: +l.y || 0, rot: 0, scale: 1 });
  });

  const sun = st.sun || {};
  const light = { az: +sun.dir || 300, el: Math.min(85, Math.max(5, +sun.alt ?? 53)), int: sun.on === false ? 0.35 : 1 };
  const cam = { az: 25, dist: 7.5, h: 1.8, fov: Math.min(90, Math.max(25, +((st.camera || {}).fov) || 55)) };
  return {
    base: 'plain',
    floor: (sc.ground && sc.ground.color) || '',
    objects, light, cam, cams: [],
  };
}

/* ============================================================
 * 浮层承载
 * ============================================================ */
let ovEl = null;
let curShot = null;
let curOnSaved = null;

function buildOverlay() {
  ovEl = document.createElement('div');
  ovEl.className = 'sb-mn-overlay';
  ovEl.id = 'sbMnOverlay';
  ovEl.innerHTML = `
    <div class="mn-root" id="mnRoot"></div>
    <div class="sb-mn-dock">
      <span class="sb-mn-dock-tip">搭建好后点「保存到镜头」——运镜预演 / 动态分镜就会用这个场景</span>
      <button class="btn btn-primary btn-sm" id="sbMnSave">💾 保存到镜头</button>
      <button class="btn btn-ghost btn-sm" id="sbMnClose">直接返回</button>
    </div>`;
  document.body.appendChild(ovEl);
  ovEl.querySelector('#sbMnSave').onclick = saveAndClose;
  ovEl.querySelector('#sbMnClose').onclick = () => { closeOverlay(); };
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
  const scene = mnToShotScene(st);
  const has = scene.objects.length > 0;
  window.__bdm.updateShot(curShot.id, {
    scene: has ? scene : null,
    /* 2026-10-26：额外存一份导演台原生状态。
       否则「房间」保存后再打开会变成 4 面墙（房间概念丢失），改不动了。 */
    mnState: has ? slimMnState(st) : null,
    ...(has ? { cameraMove: 'free' } : {}),
  });
  window.__bdm.addXP(3, '搭建场景');
  attachLatestShot(st);
  toast(has ? '场景已保存到本镜 🏗（镜头册截图已挂为参考图）' : '已清空本镜场景', 'ok');
  closeOverlay();
  if (curOnSaved) curOnSaved();
}

/* ============================================================
 * 对外入口（views-core.js 的「🏗 场景搭建」按钮调用）
 * ============================================================ */
export function openSceneBuilder(shot, onSaved) {
  curShot = shot;
  curOnSaved = onSaved || null;
  if (!ovEl) buildOverlay();
  ovEl.classList.add('open');
  document.body.classList.add('sb-mn-open');

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
         老数据只有 shot.scene（白模），才走格式转换 */
      const st = (shot.mnState && shot.mnState.scene) ? shot.mnState : shotSceneToMn(shot.scene, shot);
      window.miaoningSeed(st);
    } catch (e) {
      console.error('[场景搭建] 初始化失败', e);
      toast('导演台初始化失败：' + e.message, 'warn');
    }
  })();
}
