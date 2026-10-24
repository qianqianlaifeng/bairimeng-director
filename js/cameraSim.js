/* ============================================================
 * 白日梦导演台 · 白模运镜模拟引擎
 * 极简软件级 3D 渲染器（Canvas 2D）：
 *   透视投影 + 画家算法 + 平面光照 + 雾
 * 相机模型：pos / yaw / pitch / fov
 * 坐标系：Y 向上，相机默认朝 -Z
 * ============================================================ */

const DEG = Math.PI / 180;
const NEAR = 0.15;

/* ---------- 小工具 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);

/* ---------- 盒体几何 ---------- */
function makeBox(cx, cy, cz, w, h, d, opt = {}) {
  return { c: [cx, cy, cz], s: [w, h, d], ...opt }; // opt: pivot, rotX, shade, skipFaces
}
function boxCorners(b) {
  const px = b.pivot ? b.pivot[0] : 0, py = b.pivot ? b.pivot[1] : 0, pz = b.pivot ? b.pivot[2] : 0;
  const cx = b.c[0] - px, cy = b.c[1] - py, cz = b.c[2] - pz;
  const hx = b.s[0] / 2, hy = b.s[1] / 2, hz = b.s[2] / 2;
  const out = [];
  for (const dz of [-1, 1]) for (const dy of [-1, 1]) for (const dx of [-1, 1])
    out.push([cx + dx * hx, cy + dy * hy, cz + dz * hz]);
  return out;
}
/* 8 角标号：
 * 0(-,-,-) 1(+,-,-) 2(-,+,-) 3(+,+,-) 4(-,-,+) 5(+,-,+) 6(-,+,+) 7(+,+,+)
 * 六个面（外向为准，仅用于光照法线，剔除交给画家算法） */
const BOX_FACES = [
  [4, 5, 7, 6], // +z
  [1, 0, 2, 3], // -z
  [5, 1, 3, 7], // +x
  [0, 4, 6, 2], // -x
  [6, 7, 3, 2], // +y
  [0, 1, 5, 4], // -y
];
const FACE_NORMALS = [
  [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
];

/* ---------- 演员（人形白模） ---------- */
function buildActor(pose) {
  // pose: {phase, walk(0~1 强度), sit, lean}
  const swing = Math.sin(pose.phase) * pose.walk;
  const parts = [];
  const P = (x, y, z) => [x, y, z];
  if (pose.sit) {
    // 坐姿：降低躯干，大腿前伸
    parts.push(makeBox(0, 0.72, 0.02, 0.46, 0.6, 0.28, { shade: 0.98 }));            // 躯干(坐)
    parts.push(makeBox(0, 1.14, 0.02, 0.26, 0.26, 0.24, { shade: 1.0 }));            // 头
    parts.push(makeBox(0, 0.5, -0.32, 0.16, 0.14, 0.55, { shade: 0.9 }));            // 大腿前伸
    parts.push(makeBox(0, 0.14, -0.34, 0.14, 0.5, 0.14, { shade: 0.88 }));           // 小腿垂直
  } else {
    parts.push(makeBox(0, 1.18, 0, 0.5, 0.66, 0.3, { shade: 0.98 }));                // 躯干
    parts.push(makeBox(0, 1.60, 0, 0.27, 0.27, 0.25, { shade: 1.0 }));               // 头
    // 腿：绕髋部 X 轴摆动
    parts.push(makeBox(-0.13, 0.42, 0, 0.17, 0.8, 0.2, { pivot: P(-0.13, 0.83, 0), rotX: swing * 0.7, shade: 0.88 }));
    parts.push(makeBox(0.13, 0.42, 0, 0.17, 0.8, 0.2, { pivot: P(0.13, 0.83, 0), rotX: -swing * 0.7, shade: 0.86 }));
    // 手臂：绕肩部反相摆动
    parts.push(makeBox(-0.34, 1.12, 0, 0.13, 0.58, 0.16, { pivot: P(-0.34, 1.38, 0), rotX: -swing * 0.55, shade: 0.94 }));
    parts.push(makeBox(0.34, 1.12, 0, 0.13, 0.58, 0.16, { pivot: P(0.34, 1.38, 0), rotX: swing * 0.55, shade: 0.92 }));
  }
  return parts;
}

/* ---------- 场景布景 ---------- */
function buildScene(sceneKey, actorX, actorZ) {
  const boxes = [];
  if (sceneKey === 'street') {
    for (let i = -3; i <= 3; i++) {
      if (Math.abs(i) < 1) continue;
      const h = 3 + ((i * 7 + 5) % 4);
      boxes.push(makeBox(i * 3.2, h / 2, -7, 2.4, h, 2.4, { shade: 0.8 }));
      boxes.push(makeBox(i * 3.2, h / 2 - 0.6, 7.5, 2.4, h + 1, 2.4, { shade: 0.74 }));
    }
    boxes.push(makeBox(0, 0.02, 0, 24, 0.04, 5, { shade: 0.62 })); // 路面
  } else if (sceneKey === 'room') {
    boxes.push(makeBox(0, 2, -5.4, 12, 4, 0.3, { shade: 0.84 }));   // 后墙
    boxes.push(makeBox(-5.8, 2, 0, 0.3, 4, 11, { shade: 0.78 }));   // 左墙
    boxes.push(makeBox(5.8, 2, 0, 0.3, 4, 11, { shade: 0.78 }));    // 右墙
    boxes.push(makeBox(-3.4, 0.5, -3.4, 2.4, 0.1, 1.4, { pivot: [-3.4, 1.0, -3.4], rotX: 0, shade: 0.9 })); // 桌板
    boxes.push(makeBox(-3.4, 0.42, -3.4, 0.12, 0.85, 0.12, { shade: 0.7 }));
    boxes.push(makeBox(-3.4, 0.42, -2.4, 0.12, 0.85, 0.12, { shade: 0.7 }));
    boxes.push(makeBox(3.2, 0.55, -4.2, 1.4, 1.1, 0.5, { shade: 0.76 })); // 柜子
  } else if (sceneKey === 'stage') {
    boxes.push(makeBox(0, 0.3, 0, 6, 0.6, 5, { shade: 0.92 }));      // 台面
    boxes.push(makeBox(-2.8, 1.8, -1.8, 0.5, 3.6, 0.5, { shade: 0.7 }));
    boxes.push(makeBox(2.8, 1.8, -1.8, 0.5, 3.6, 0.5, { shade: 0.7 }));
    boxes.push(makeBox(0, 4.6, -3.4, 10, 0.4, 1.2, { shade: 0.82 })); // 顶幕
  }
  return boxes;
}

/* ---------- 相机求解 ---------- */
function lookAt(pos, target) {
  const dx = target[0] - pos[0], dy = target[1] - pos[1], dz = target[2] - pos[2];
  const yaw = Math.atan2(dx, -dz);
  const pitch = Math.asin(clamp(dy / Math.hypot(dx, dy, dz), -1, 1));
  return { yaw, pitch };
}

/* 依据运镜定义与进度 t ∈ [0,1] 求相机状态 */
function solveCamera(sim, t, actor) {
  const head = [actor.x, actor.y + 1.5, actor.z];
  const e = easeInOut(t);
  const sp = sim.speed || 0.5;
  const cam = { pos: [0, 1.7, 7], fov: 55, yaw: 0, pitch: 0 };
  const set = (p, target = head) => { cam.pos = p; Object.assign(cam, lookAt(p, target)); };

  switch (sim.type) {
    case 'static':
      set([0, 1.7, 7], head);
      break;
    case 'dolly': {
      if (sim.dir === 'in') {
        const z = lerp(8, 3.2, e * (0.4 + sp));
        set([0, lerp(1.8, 1.5, e), z], head);
      } else {
        const z = lerp(3.5, 9.5, e * (0.4 + sp));
        set([0, lerp(1.5, 2.2, e), z], head);
      }
      if (sim.hold) { /* 急甩停顿：前段快速，后段定住 */
        const t2 = clamp(t / (1 - sim.hold), 0, 1), e2 = easeOut(t2);
        const z = lerp(8, 3.2, e2 * (0.4 + sp));
        set([0, lerp(1.8, 1.5, e2), z], head);
      }
      break;
    }
    case 'zoom': {
      set([0, 1.7, 7.5], head);
      if (sim.dir === 'in') cam.fov = lerp(55, 26, easeInOut(t) * (0.5 + sp * 0.6));
      else cam.fov = lerp(28, 60, easeInOut(t) * (0.5 + sp * 0.6));
      break;
    }
    case 'dollyZoom': {
      const z = lerp(8, 4, e);
      set([0, 1.7, z], head);
      cam.fov = lerp(38, 74, e); // 反向变焦保持主体大小
      break;
    }
    case 'track': {
      const x = sim.dir === 'left' ? lerp(4, -4, e) : lerp(-4, 4, e);
      set([x, 1.7, 6.5], head);
      break;
    }
    case 'pan': {
      const p = [0, 1.7, 6.5];
      const base = lookAt(p, head);
      const sweep = (sim.speed > 1.5 ? 0.9 : 0.55) * (0.5 + sp);
      const a = sim.dir === 'left' ? lerp(sweep, -sweep, e) : lerp(-sweep, sweep, e);
      cam.pos = p;
      cam.yaw = base.yaw + a;
      cam.pitch = base.pitch;
      cam.blur = sim.blur && sp * Math.abs(Math.sin(t * Math.PI)) > 0.4;
      break;
    }
    case 'tilt': {
      const p = [0, 1.6, 6.5];
      cam.pos = p;
      cam.fov = 55;
      cam.yaw = lookAt(p, [0, 1.5, 0]).yaw;
      cam.pitch = sim.dir === 'up' ? lerp(-0.45, 0.5, e) : lerp(0.5, -0.45, e);
      break;
    }
    case 'crane': {
      if (sim.dir === 'up') {
        const y = lerp(1.2, 6.5, e);
        set([0.5, y, lerp(5, 8, e)], [0, lerp(1.4, 0.5, e), 0]);
      } else {
        const y = lerp(6.5, 1.0, e);
        set([0.5, y, lerp(8, 4.5, e)], head);
      }
      break;
    }
    case 'orbit': {
      const r = 5.5, a0 = 0.6;
      const dir = sim.dir === 'cw' ? -1 : 1;
      const a = a0 + dir * e * (0.9 + sp) * Math.PI;
      const p = [Math.sin(a) * r, 2.0, Math.cos(a) * r];
      set(p, [0, 1.25, 0]);
      break;
    }
    case 'spiral': {
      const r = sim.rise ? 6 : lerp(6.5, 3, e);
      const a = 0.4 + e * Math.PI * 1.1;
      const y = sim.rise ? lerp(1.6, 6.5, e) : 1.8;
      const p = [Math.sin(a) * r, y, Math.cos(a) * r];
      set(p, [0, sim.rise ? lerp(1.3, 0.2, e) : 1.25, 0]);
      break;
    }
    case 'follow': {
      // actor 行走由外部按 t 驱动，相机保持相对偏移
      if (sim.dir === 'front') set([actor.x, 1.55, actor.z + 3.4], [actor.x, actor.y + 1.4, actor.z - 1]);
      else if (sim.dir === 'behind') set([actor.x, 1.6, actor.z - 3.6], head);
      else set([actor.x + 3.2, 1.55, actor.z + 0.6], [actor.x, actor.y + 1.35, actor.z]);
      break;
    }
    case 'reveal': {
      const x = sim.dir === 'left' ? lerp(4.5, -1.5, e) : lerp(-4.5, 1.5, e);
      set([x, 1.6, 6.2], head);
      break;
    }
    case 'handheld': {
      const n = (f, s) => Math.sin(t * 21 * f + s) * 0.045 + Math.sin(t * 13 * f + s * 2) * 0.03;
      const p = [n(1, 0), 1.62 + n(1.7, 5), 6.4 + n(0.8, 2)];
      set(p, [head[0] + n(2, 1), head[1] + n(1.4, 3), head[2]]);
      break;
    }
    case 'fly': {
      if (sim.dir === 'dive') {
        const e2 = easeOut(t);
        const p = [0, lerp(18, 3.2, e2), lerp(-2, 5.5, e2)];
        set(p, [0, lerp(0, 1.3, e2), lerp(1, 0, e2)]);
      } else {
        const p = [0, lerp(2.2, 16, e), lerp(5, -2, e)];
        set(p, [0, lerp(1.4, 0, e), lerp(0, 1, e)]);
      }
      break;
    }
    case 'rotate': {
      const p = [0.01, 15, 0.01];
      cam.pos = p;
      const base = lookAt(p, [0, 0, 0]);
      cam.yaw = base.yaw + t * Math.PI * 0.6;
      cam.pitch = base.pitch;
      cam.fov = 60;
      break;
    }
    case 'swingOver': {
      const a = lerp(Math.PI * 0.94, Math.PI * 0.4, easeInOut(t));
      const r = 4.6;
      const p = [Math.sin(a) * r, 1.75, Math.cos(a) * r];
      set(p, [0, 1.4, 0]);
      break;
    }
    case 'pov': {
      const bob = Math.sin(t * Math.PI * 8) * 0.05;
      const p = [Math.sin(t * 3) * 0.15, 1.58 + bob, lerp(-3.5, 3.5, t)];
      set(p, [p[0] * 0.3, 1.5 + bob * 0.5, p[2] + 2]);
      break;
    }
    default:
      set([0, 1.7, 7], head);
  }
  return cam;
}

/* ---------- 演员动作求解 ---------- */
function solveActor(action, t, sim, dur) {
  const actor = { x: 0, y: 0, z: 0, yaw: 0, phase: 0, walk: 0, sit: false };
  const isFollow = sim.type === 'follow';
  const isPov = sim.type === 'pov';
  switch (action) {
    case 'walk':
      actor.walk = 0.55; actor.phase = t * Math.PI * 6;
      if (isFollow) actor.x = lerp(-6, 6, t);
      else if (isPov) { actor.z = lerp(-3.5, 3.5, t); }
      else actor.z = Math.sin(t * Math.PI) * 1.6;
      break;
    case 'run':
      actor.walk = 0.95; actor.phase = t * Math.PI * 10;
      if (isFollow) actor.x = lerp(-7, 7, t);
      else actor.z = Math.sin(t * Math.PI) * 2.2;
      break;
    case 'turn':
      actor.yaw = t * Math.PI * 2;
      break;
    case 'sit':
      actor.sit = true;
      break;
    default: // stand
      if (isFollow) actor.x = lerp(-5, 5, t);
  }
  return actor;
}

/* ============================================================
 * 渲染器
 * ============================================================ */
class WhiteModelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = 'plain';
    this.theme = { bg1: '#eef1f5', bg2: '#e2e6ed', ground: '#d9dde5', line: 'rgba(96,106,134,.30)', fog: '#e9ecf1', ink: '#2a3040', hud: 'rgba(35,42,60,.38)' };
    this._shadeLo = 150; this._shadeHi = 255;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.w = w; this.h = h;
  }
  setTheme(t) {
    Object.assign(this.theme, t);
    // 亮色场景自动改用「白模在浅灰舞台」的明暗区间
    const hx = this.theme.bg1;
    if (typeof hx === 'string' && /^#[0-9a-fA-F]{6}$/.test(hx)) {
      const r = parseInt(hx.slice(1, 3), 16), g = parseInt(hx.slice(3, 5), 16), b = parseInt(hx.slice(5, 7), 16);
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      if (lum > 128) {
        this._shadeLo = 178; this._shadeHi = 251;
        if (!this.theme.hud) this.theme.hud = 'rgba(35,42,60,.38)';
        if (!this.theme.ink) this.theme.ink = '#2a3040';
      } else {
        this._shadeLo = 150; this._shadeHi = 255;
      }
    }
  }

  /* 投影单个点 → 屏幕坐标（返回 null 表示在近裁剪面后） */
  project(p, cam, focal, cx, cy) {
    let x = p[0] - cam.pos[0], y = p[1] - cam.pos[1], z = p[2] - cam.pos[2];
    const cyaw = Math.cos(-cam.yaw), syaw = Math.sin(-cam.yaw);
    let x2 = x * cyaw - z * syaw, z2 = x * syaw + z * cyaw;
    const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
    let y2 = y * cp - z2 * sp, z3 = y * sp + z2 * cp;
    const depth = -z3;
    if (depth < NEAR) return null;
    return { x: cx + (x2 / depth) * focal, y: cy - (y2 / depth) * focal, d: depth };
  }

  render(sim, t, action, opts = {}) {
    const ctx = this.ctx, W = this.w, H = this.h;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const th = this.theme;
    const isLight = this._shadeLo > 170;
    // 天空渐变
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 舞台顶光（柔光晕，制造摄影棚氛围）
    const glow = ctx.createRadialGradient(W / 2, H * 0.30, 0, W / 2, H * 0.30, Math.max(W, H) * 0.62);
    if (isLight) {
      glow.addColorStop(0, 'rgba(255,255,255,0.32)');
      glow.addColorStop(0.55, 'rgba(232,238,250,0.10)');
    } else {
      glow.addColorStop(0, 'rgba(140,175,255,0.14)');
      glow.addColorStop(0.55, 'rgba(120,150,230,0.05)');
    }
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const actor = solveActor(action, t, sim, opts.duration || 4);
    // POV 模式不画演员（自己就是演员）
    const cam = solveCamera(sim, t, actor);
    const focal = (H / 2) / Math.tan((cam.fov * DEG) / 2);
    const cx = W / 2, cyv = H / 2;

    // 演员部件（局部 → 世界）
    const parts = (opts.hideActor || sim.type === 'pov') ? [] : buildActor({
      phase: actor.phase, walk: actor.walk, sit: actor.sit,
    });
    const rotY = (p, yaw) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    };
    const toWorld = (local, part) => {
      let p = local.slice();
      if (part.rotX) { // 绕 pivot 的 X 轴旋转
        const pv = part.pivot;
        const dy = p[1], dz = p[2];
        const c = Math.cos(part.rotX), s = Math.sin(part.rotX);
        p = [p[0], dy * c - dz * s, dy * s + dz * c];
        p = [p[0] + pv[0], p[1] + pv[1], p[2] + pv[2]];
      } else {
        p = [p[0] + part.c[0], p[1] + part.c[1], p[2] + part.c[2]];
      }
      p = rotY(p, actor.yaw);
      return [p[0] + actor.x, p[1] + actor.y, p[2] + actor.z];
    };

    /* ---- 收集多边形 ---- */
    const polys = [];
    const pushBox = (part, worldFn) => {
      const corners = boxCorners(part).map(l => worldFn(l, part));
      for (let f = 0; f < 6; f++) {
        const idx = BOX_FACES[f];
        const pts = idx.map(i => this.project(corners[i], cam, focal, cx, cyv));
        if (pts.some(p => !p)) continue;
        const n = rotY(FACE_NORMALS[f], actor.yaw);
        polys.push({ pts, n, shade: part.shade || 0.85, d: (pts[0].d + pts[1].d + pts[2].d + pts[3].d) / 4 });
      }
    };
    // 布景
    for (const b of buildScene(this.scene)) pushBox(b, (l, part) => [l[0] + part.c[0], l[1] + part.c[1], l[2] + part.c[2]]);
    // 演员
    for (const part of parts) pushBox(part, toWorld);

    /* ---- 地面（填充面 + 网格） ---- */
    ctx.lineWidth = 1;
    const G = 12;
    // 先铺一层地面填充，高机位时不再像漂浮在半空
    {
      const gc = [[-G, -G], [G, -G], [G, G], [-G, G]].map(([x, z]) => this.project([x, 0, z], cam, focal, cx, cyv));
      if (gc.every(p => p)) {
        ctx.fillStyle = th.ground;
        ctx.beginPath();
        ctx.moveTo(gc[0].x, gc[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(gc[i].x, gc[i].y);
        ctx.closePath(); ctx.fill();
      }
    }
    for (let i = -G; i <= G; i += 1.5) {
      ctx.beginPath();
      let started = false;
      for (const [a, b2] of [[[i, -G], [i, G]], [[-G, i], [G, i]]]) {
        const p1 = this.project([a[0], 0, a[1]], cam, focal, cx, cyv);
        const p2 = this.project([b2[0], 0, b2[1]], cam, focal, cx, cyv);
        if (!p1 || !p2) { started = false; continue; }
        const dd = (p1.d + p2.d) / 2;
        const alpha = clamp(1.1 - dd / 26, 0.05, 0.5);
        ctx.strokeStyle = th.line.replace(/[\d.]+\)$/, alpha.toFixed(3) + ')');
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
    }

    /* ---- 演员脚下阴影（画在人物之前，避免盖在身体上） ---- */
    if (parts.length) {
      const sp1 = this.project([actor.x - 0.42, 0.012, actor.z - 0.32], cam, focal, cx, cyv);
      const sp2 = this.project([actor.x + 0.42, 0.012, actor.z + 0.32], cam, focal, cx, cyv);
      if (sp1 && sp2) {
        ctx.fillStyle = isLight ? 'rgba(50,58,80,0.28)' : 'rgba(8,10,20,0.35)';
        ctx.beginPath();
        ctx.ellipse((sp1.x + sp2.x) / 2, (sp1.y + sp2.y) / 2, Math.abs(sp2.x - sp1.x) / 2, Math.abs(sp2.y - sp1.y) / 2 + 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* ---- 画家算法绘制 ---- */
    polys.sort((a, b) => b.d - a.d);
    const L = [0.45, 0.8, 0.4]; // 光方向
    for (const poly of polys) {
      const n = poly.n;
      const lit = clamp(n[0] * L[0] + n[1] * L[1] + n[2] * L[2], 0, 1);
      const v = this._shadeLo + (this._shadeHi - this._shadeLo) * lit * (poly.shade || 0.9);
      const fog = clamp(1 - poly.d / 30, 0.25, 1);
      const c = mixColor(th.fog, v, fog);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
      ctx.closePath(); ctx.fill();
      if (poly.d < 14) { // 近处描边
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.stroke();
      }
    }

    /* ---- 甩镜运动模糊 ---- */
    if (cam.blur) {
      ctx.fillStyle = 'rgba(20,26,44,0.25)';
      ctx.fillRect(0, 0, W, H);
    }

    /* ---- 暗角（电影质感，浅色场景收敛强度） ---- */
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, isLight ? 'rgba(40,48,70,0.14)' : 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

    /* ---- 电影黑边 + 标记 ---- */
    if (opts.letterbox) {
      const bar = Math.round(H * 0.055);
      ctx.fillStyle = '#05070d';
      ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    }
    // 画面中心十字与 REC 角标（预演感）
    if (opts.hud) {
      ctx.strokeStyle = th.hud || 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cyv); ctx.lineTo(cx + 8, cyv);
      ctx.moveTo(cx, cyv - 8); ctx.lineTo(cx, cyv + 8);
      ctx.stroke();
      if (Math.floor(t * 100) % 2 === 0) {
        ctx.fillStyle = '#ff5470';
        ctx.beginPath(); ctx.arc(18, 18, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = th.ink || 'rgba(255,255,255,0.75)';
      ctx.font = '10px system-ui';
      ctx.fillText('REC  ' + Math.round(t * 100) + '%', 30, 22);
    }
  }
}

function mixColor(fogHex, v, mix) {
  const r = parseInt(fogHex.slice(1, 3), 16), g = parseInt(fogHex.slice(3, 5), 16), b = parseInt(fogHex.slice(5, 7), 16);
  // 高光带一点冷蓝（摄影棚白光质感）
  const rr = Math.round(lerp(r, v * 0.94, mix)), gg = Math.round(lerp(g, v * 0.97, mix)), bb = Math.round(lerp(b, Math.min(255, v * 1.08), mix));
  return `rgb(${rr},${gg},${bb})`;
}

/* ============================================================
 * 播放器：驱动 renderer 按时长播放一次运镜
 * ============================================================ */
class MovePlayer {
  constructor(canvas) {
    this.renderer = new WhiteModelRenderer(canvas);
    this.playing = false;
    this.loop = false;
    this._raf = null;
    this._t0 = 0;
    this.onEnd = null;
    this.onTick = null;
    this.speed = 1;
    this.duration = 4;
    this.hud = true;
  }
  play(sim, { duration = 4, action = 'stand', scene = 'plain', loop = false, fromT = 0 } = {}) {
    this.sim = sim; this.duration = duration;
    this.action = action; this.loop = loop;
    this.renderer.scene = scene;
    this.playing = true;
    this._start = performance.now() - fromT * duration * 1000 / this.speed;
    if (!this._raf) this._raf = requestAnimationFrame(this._frame.bind(this));
  }
  seek(sim, t, opts) {
    this.sim = sim; this.action = opts?.action || this.action || 'stand';
    this.renderer.scene = opts?.scene || this.renderer.scene;
    this.duration = opts?.duration || this.duration;
    this.renderer.render(this.sim, clamp(t, 0, 1), this.action, { duration: this.duration, hud: this.hud, letterbox: true });
  }
  stop() { this.playing = false; }
  destroy() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  _frame(now) {
    this._raf = null;
    if (this.playing) {
      const el = (now - this._start) / 1000 * this.speed;
      let t = el / this.duration;
      if (t >= 1) {
        if (this.loop) { this._start = now; t = 0; }
        else { t = 1; this.playing = false; if (this.onEnd) this.onEnd(); }
      }
      this.t = t;
      this.renderer.render(this.sim, t, this.action, { duration: this.duration, hud: this.hud, letterbox: true });
      if (this.onTick) this.onTick(t);
      this._raf = requestAnimationFrame(this._frame.bind(this));
    }
  }
}

/* ---------- 参考图的 Ken Burns 式运镜映射（有参考图时替代白模） ---------- */
function imageTransformFor(sim, t) {
  const e = easeInOut(clamp(t, 0, 1));
  let scale = 1.04, dx = 0, dy = 0, rot = 0;
  switch (sim.type) {
    case 'dolly': scale = sim.dir === 'in' ? lerp(1.02, 1.28, e) : lerp(1.28, 1.02, e); break;
    case 'zoom': scale = sim.dir === 'in' ? lerp(1.02, 1.35, e) : lerp(1.3, 1.02, e); break;
    case 'dollyZoom': scale = lerp(1.3, 1.05, e); rot = lerp(-2, 2, e) * DEG; break;
    case 'track': dx = lerp(-0.06, 0.06, e) * (sim.dir === 'left' ? 1 : -1); scale = 1.12; break;
    case 'pan': dx = lerp(-0.08, 0.08, e) * (sim.dir === 'left' ? 1 : -1); scale = 1.18; break;
    case 'tilt': dy = lerp(-0.07, 0.07, e) * (sim.dir === 'up' ? 1 : -1); scale = 1.18; break;
    case 'crane': dy = lerp(0.08, -0.08, e) * (sim.dir === 'up' ? 1 : -1); scale = 1.15; break;
    case 'orbit': case 'spiral': case 'swingOver':
      scale = lerp(1.05, 1.22, e); dx = lerp(-0.05, 0.05, e); rot = lerp(2, -2, e) * DEG; break;
    case 'follow': dx = lerp(0.05, -0.05, e); scale = 1.14; break;
    case 'fly': scale = sim.dir === 'dive' ? lerp(1.5, 1.05, e) : lerp(1.05, 1.5, e); break;
    case 'rotate': rot = lerp(-4, 4, e) * DEG; scale = 1.2; break;
    case 'handheld': scale = 1.12; dx = Math.sin(t * 18) * 0.008; dy = Math.cos(t * 15) * 0.008; break;
    case 'reveal': dx = lerp(0.07, 0, e); scale = 1.16; break;
    case 'pov': dy = Math.sin(t * 12) * 0.01; scale = 1.12; break;
    default: scale = 1.03;
  }
  return { scale, dx, dy, rot };
}

export { WhiteModelRenderer, MovePlayer, imageTransformFor, solveCamera, solveActor, clamp, lerp, easeInOut, easeOut };
