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
/* 把角度归一到 (-π, π]，用于求 yaw 的最短角差 */
const wrapPi = a => { a = a % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

/* ---------- 变换工具 ---------- */
function rotXpt(pt, pivot, ang) {
  if (!ang) return pt;
  const dy = pt[1] - pivot[1], dz = pt[2] - pivot[2];
  const c = Math.cos(ang), s = Math.sin(ang);
  return [pt[0], pivot[1] + dy * c - dz * s, pivot[2] + dy * s + dz * c];
}
function rotYpt(pt, pivot, ang) {
  if (!ang) return pt;
  const dx = pt[0] - pivot[0], dz = pt[2] - pivot[2];
  const c = Math.cos(ang), s = Math.sin(ang);
  return [pivot[0] + dx * c + dz * s, pt[1], pivot[2] - dx * s + dz * c];
}

/* ---------- 几何图元（返回 {pts, n, shade} 多边形列表，中性演员局部坐标） ---------- */
function boxPolys(cx, cy, cz, w, h, d, shade = 0.9) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const q = (a, b, c2, d2, n) => ({ pts: [a, b, c2, d2], n, shade });
  return [
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]),
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]),
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]),
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]),
    q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]),
    q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]),
  ];
}
/* 棱台（圆截面柱/锥台）：躯干、四肢 */
function frustumPolys(cx, cy, cz, r1, r2, h, sides = 8, shade = 0.94) {
  const polys = [], bot = [], top = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    bot.push([cx + ca * r1, cy, cz + sa * r1]);
    top.push([cx + ca * r2, cy + h, cz + sa * r2]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const mx = (bot[i][0] + bot[j][0] + top[i][0] + top[j][0]) / 4 - cx;
    const mz = (bot[i][2] + bot[j][2] + top[i][2] + top[j][2]) / 4 - cz;
    const l = Math.hypot(mx, mz) || 1;
    polys.push({ pts: [bot[i], bot[j], top[j], top[i]], n: [mx / l, 0, mz / l], shade });
  }
  polys.push({ pts: top.slice().reverse(), n: [0, 1, 0], shade: Math.min(1.04, shade + 0.06) });
  polys.push({ pts: bot, n: [0, -1, 0], shade: shade - 0.12 });
  return polys;
}
/* 低多边形球：头、手 */
function spherePolys(cx, cy, cz, r, stacks = 4, sectors = 8, shade = 0.97) {
  const polys = [];
  const pt = (i, j) => {
    const th = (i / stacks) * Math.PI, ph = (j / sectors) * Math.PI * 2;
    return [cx + r * Math.sin(th) * Math.cos(ph), cy + r * Math.cos(th), cz + r * Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < stacks; i++) for (let j = 0; j < sectors; j++) {
    const j2 = (j + 1) % sectors;
    const a = pt(i, j), b = pt(i, j2), c2 = pt(i + 1, j2), d = pt(i + 1, j);
    let n = [(a[0] + b[0] + c2[0] + d[0]) / 4 - cx, (a[1] + b[1] + c2[1] + d[1]) / 4 - cy, (a[2] + b[2] + c2[2] + d[2]) / 4 - cz];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    polys.push({ pts: [a, b, c2, d], n: [n[0] / l, n[1] / l, n[2] / l], shade });
  }
  return polys;
}

/* ---------- 人物运动轨迹：沿折线路径来回行走 ---------- */
function pathPosAt(obj, t) {
  const pts = obj.path;
  const NL = null;
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    segs.push(L); total += L;
  }
  if (total < 0.01) return { x: pts[0].x, z: pts[0].z, yaw: (obj.rot || 0) * DEG };
  const sp = obj.speed || 1.2;
  let d = (t * sp) % (total * 2);
  let dir = 1;
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

/* ---------- 场景道具（世界坐标烘焙） ---------- */
function propPart(o) {
  let polys = [];
  const sc = o.scale || 1;
  if (o.shape === 'box') polys = boxPolys(0, 0.4, 0, 0.8, 0.8, 0.8, 0.85);
  else if (o.shape === 'pillar') polys = frustumPolys(0, 0, 0, 0.16, 0.2, 2.4, 8, 0.88);
  else if (o.shape === 'table') polys = [...boxPolys(0, 0.72, 0, 1.3, 0.08, 0.85, 0.92), ...boxPolys(0, 0.36, 0, 0.18, 0.72, 0.7, 0.78)];
  else if (o.shape === 'wall') { const wh = o.h || 2.4; polys = boxPolys(0, wh / 2, 0, o.w || 3, wh, 0.24, 0.8); }
  else if (o.shape === 'door') polys = [...boxPolys(-0.55, 1.05, 0, 0.14, 2.1, 0.14, 0.82), ...boxPolys(0.55, 1.05, 0, 0.14, 2.1, 0.14, 0.82), ...boxPolys(0, 2.15, 0, 1.24, 0.14, 0.16, 0.82)];
  else if (o.shape === 'window') polys = [...boxPolys(-0.9, 1.2, 0, 0.6, 2.4, 0.2, 0.82), ...boxPolys(0.9, 1.2, 0, 0.6, 2.4, 0.2, 0.82), ...boxPolys(0, 2.05, 0, 1.2, 0.7, 0.2, 0.82), ...boxPolys(0, 0.75, 0, 1.2, 0.3, 0.26, 0.86)];
  else if (o.shape === 'sofa') polys = [...boxPolys(0, 0.3, 0.15, 1.6, 0.35, 0.85, 0.9), ...boxPolys(0, 0.68, -0.28, 1.6, 0.75, 0.24, 0.88), ...boxPolys(-0.72, 0.52, 0.08, 0.18, 0.6, 0.85, 0.86), ...boxPolys(0.72, 0.52, 0.08, 0.18, 0.6, 0.85, 0.86)];
  else if (o.shape === 'tree') polys = [...frustumPolys(0, 0, 0, 0.15, 0.11, 1.5, 8, 0.78), ...spherePolys(0, 2.05, 0, 0.78, 4, 8, 0.72)];
  else if (o.shape === 'lamp') polys = [...frustumPolys(0, 0, 0, 0.05, 0.04, 1.7, 6, 0.5), ...frustumPolys(0, 1.68, 0, 0.3, 0.13, 0.3, 8, 0.98)];
  else polys = boxPolys(0, 0.4, 0, 0.8, 0.8, 0.8, 0.85);
  const rot = (o.rot || 0) * DEG;
  polys = polys.map(p => ({
    pts: p.pts.map(pt => {
      let w = [pt[0] * sc, pt[1] * sc, pt[2] * sc];
      if (rot) w = rotYpt(w, [0, 0, 0], rot);
      return [w[0] + o.x, w[1], w[2] + o.z];
    }),
    n: rot ? rotYpt(p.n, [0, 0, 0], rot) : p.n,
    shade: p.shade,
  }));
  return { polys, joints: [] };
}

/* ---------- 演员白模（关节链接的小人：肩/肘/髋/膝 正向动力学） ----------
 * parts: [{ polys, joints }]，joints 从近端到远端排列，渲染时按远端优先依次施加旋转 */
/* 五官：深色眼睛/眉毛/嘴（贴在头球正面 +z），让特写能读到脸和朝向 */
function addFace(hx, hy, r) {
  const parts = [];
  const eye = (ex, ey) => ({ polys: boxPolys(ex, ey, r * 0.86, 0.034, 0.034, 0.02, 0.22), joints: [] });
  parts.push(eye(hx - 0.055, hy + 0.03), eye(hx + 0.055, hy + 0.03));
  parts.push({ polys: boxPolys(hx - 0.055, hy + 0.075, r * 0.86, 0.052, 0.013, 0.02, 0.3), joints: [] });
  parts.push({ polys: boxPolys(hx + 0.055, hy + 0.075, r * 0.86, 0.052, 0.013, 0.02, 0.3), joints: [] });
  parts.push({ polys: boxPolys(hx, hy - 0.045, r * 0.9, 0.06, 0.014, 0.02, 0.4), joints: [] });
  return parts;
}

function buildActor(pose) {
  const p = pose.phase, wk = pose.walk;
  const parts = [];
  const add = (polys, joints) => parts.push({ polys, joints: joints || [] });

  if (pose.sit) {
    add(boxPolys(0, 0.50, 0.02, 0.36, 0.17, 0.26, 0.96));                            // 骨盆
    add(frustumPolys(0, 0.585, 0, 0.13, 0.165, 0.50));                               // 躯干
    add(frustumPolys(0, 1.085, 0, 0.05, 0.05, 0.09));                                // 颈
    add(spherePolys(0, 1.30, 0, 0.14));                                              // 头
    for (const fp of addFace(0, 1.30, 0.14)) parts.push(fp);
    for (const s of [-1, 1]) {
      const hipJ = { pivot: [s * 0.09, 0.56, 0], angle: -1.42 };
      const kneeJ = { pivot: [s * 0.09, 0.24, 0], angle: 1.36 };
      add(frustumPolys(s * 0.09, 0.24, 0, 0.062, 0.05, 0.34), [hipJ]);               // 大腿
      add(frustumPolys(s * 0.09, -0.08, 0, 0.05, 0.036, 0.32), [hipJ, kneeJ]);       // 小腿
      add(boxPolys(s * 0.09, -0.25, 0.05, 0.09, 0.05, 0.18, 0.86), [hipJ, kneeJ]);   // 脚
      const shJ = { pivot: [s * 0.20, 1.06, 0], angle: 0.4 };
      const elJ = { pivot: [s * 0.20, 0.80, 0], angle: 0.55 };
      add(frustumPolys(s * 0.20, 0.80, 0, 0.045, 0.037, 0.26), [shJ]);               // 上臂
      add(frustumPolys(s * 0.20, 0.54, 0, 0.037, 0.03, 0.24), [shJ, elJ]);           // 前臂
      add(spherePolys(s * 0.20, 0.505, 0, 0.04, 3, 6, 0.99), [shJ, elJ]);            // 手
    }
    return parts;
  }

  const thighA = Math.sin(p) * 0.55 * wk;
  const thighB = -Math.sin(p) * 0.55 * wk;
  const kneeA = Math.max(0, -Math.sin(p - 0.8)) * 0.85 * wk + 0.06;
  const kneeB = Math.max(0, Math.sin(p - 0.8)) * 0.85 * wk + 0.06;
  const armA = -Math.sin(p) * 0.5 * wk;
  const armB = Math.sin(p) * 0.5 * wk;

  add(boxPolys(0, 0.84, 0, 0.34, 0.16, 0.24, 0.96));                                 // 骨盆
  add(frustumPolys(0, 0.92, 0, 0.135, 0.17, 0.50));                                  // 躯干
  add(frustumPolys(0, 1.42, 0, 0.05, 0.05, 0.09));                                   // 颈
  add(spherePolys(0, 1.655, 0, 0.145));                                              // 头
  for (const fp of addFace(0, 1.655, 0.145)) parts.push(fp);                          // 五官
  for (const s of [-1, 1]) {
    const isA = s === -1;
    const th = isA ? thighA : thighB;
    const kn = isA ? kneeA : kneeB;
    const hipJ = { pivot: [s * 0.09, 0.84, 0], angle: th };
    const kneeJ = { pivot: [s * 0.09, 0.50, 0], angle: kn };
    add(frustumPolys(s * 0.09, 0.50, 0, 0.065, 0.052, 0.34), [hipJ]);                // 大腿
    add(frustumPolys(s * 0.09, 0.19, 0, 0.05, 0.037, 0.33), [hipJ, kneeJ]);          // 小腿
    add(boxPolys(s * 0.09, 0.035, 0.05, 0.095, 0.06, 0.19, 0.86), [hipJ, kneeJ]);    // 脚
    const shJ = { pivot: [s * 0.215, 1.36, 0], angle: isA ? armA : armB };
    const elJ = { pivot: [s * 0.215, 1.10, 0], angle: 0.28 + Math.max(0, isA ? armA : armB) * 0.8 };
    add(frustumPolys(s * 0.215, 1.10, 0, 0.048, 0.038, 0.26), [shJ]);                // 上臂
    add(frustumPolys(s * 0.215, 0.84, 0, 0.038, 0.03, 0.24), [shJ, elJ]);            // 前臂
    add(spherePolys(s * 0.215, 0.80, 0, 0.042, 3, 6, 0.99), [shJ, elJ]);             // 手
  }
  return parts;
}

/* ---------- 场景布景（白模方块） ---------- */
function buildScene(sceneKey) {
  const parts = [];
  const B = (...args) => parts.push({ polys: boxPolys(...args), joints: [] });
  if (sceneKey === 'street') {
    for (let i = -3; i <= 3; i++) {
      if (Math.abs(i) < 1) continue;
      const h = 3 + ((i * 7 + 5) % 4);
      B(i * 3.2, h / 2, -7, 2.4, h, 2.4, 0.8);
      B(i * 3.2, h / 2 - 0.6, 7.5, 2.4, h + 1, 2.4, 0.74);
    }
    B(0, 0.02, 0, 24, 0.04, 5, 0.62); // 路面
  } else if (sceneKey === 'room') {
    B(0, 2, -5.4, 12, 4, 0.3, 0.84);   // 后墙
    B(-5.8, 2, 0, 0.3, 4, 11, 0.78);   // 左墙
    B(5.8, 2, 0, 0.3, 4, 11, 0.78);    // 右墙
    B(-3.4, 0.95, -3.4, 2.4, 0.1, 1.4, 0.9);  // 桌板
    B(-3.4, 0.42, -3.4, 0.12, 0.85, 0.12, 0.7);
    B(-3.4, 0.42, -2.4, 0.12, 0.85, 0.12, 0.7);
    B(3.2, 0.55, -4.2, 1.4, 1.1, 0.5, 0.76);  // 柜子
  } else if (sceneKey === 'stage') {
    B(0, 0.3, 0, 6, 0.6, 5, 0.92);     // 台面
    B(-2.8, 1.8, -1.8, 0.5, 3.6, 0.5, 0.7);
    B(2.8, 1.8, -1.8, 0.5, 3.6, 0.5, 0.7);
    B(0, 4.6, -3.4, 10, 0.4, 1.2, 0.82); // 顶幕
  }
  return parts;
}

/* ---------- 相机求解 ---------- */
function lookAt(pos, target) {
  const dx = target[0] - pos[0], dy = target[1] - pos[1], dz = target[2] - pos[2];
  const yaw = Math.atan2(dx, -dz);
  const pitch = Math.asin(clamp(dy / Math.hypot(dx, dy, dz), -1, 1));
  return { yaw, pitch };
}

/* 依据运镜定义与进度 t ∈ [0,1] 求相机状态 */
function solveCamera(sim, t, actor, opts = {}) {
  const head = [actor.x, actor.y + 1.5, actor.z];
  const e = easeInOut(t);
  const sp = sim.speed || 0.5;
  const cam = { pos: [0, 1.7, 7], fov: 55, yaw: 0, pitch: 0 };
  const set = (p, target = head) => { cam.pos = p; cam._tgt = target; Object.assign(cam, lookAt(p, target)); };

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
      cam.pos = p; cam._tgt = head;
      cam.yaw = base.yaw + a;
      cam.pitch = base.pitch;
      cam.blur = sim.blur && sp * Math.abs(Math.sin(t * Math.PI)) > 0.4;
      break;
    }
    case 'tilt': {
      const p = [0, 1.6, 6.5];
      cam.pos = p; cam._tgt = head;
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
      cam.pos = p; cam._tgt = [0, 0, 0];
      const base = lookAt(p, [0, 0, 0]);
      cam.yaw = base.yaw + t * Math.PI * 0.6;
      cam.pitch = base.pitch;
      cam.fov = 60;
      break;
    }
    case 'free': {
      const c = (opts.scene && opts.scene.cam) || { az: 25, dist: 7, h: 1.8, fov: 55 };
      const path = opts.scene && opts.scene.camPath;
      let cv = { ...c };
      if (Array.isArray(path) && path.length >= 2) {
        // 按进度 t 在关键帧间插值（az 走最短角）
        const tt = clamp(t, 0, 1) * (path[path.length - 1].t || 1);
        let i = 0;
        while (i < path.length - 2 && path[i + 1].t < tt) i++;
        const a0 = path[i], a1 = path[i + 1];
        const span = Math.max(0.0001, (a1.t - a0.t) || 1);
        const f = clamp((tt - a0.t) / span, 0, 1);
        let dAz = (a1.az - a0.az) % 360;
        if (dAz > 180) dAz -= 360; if (dAz < -180) dAz += 360;
        cv = {
          az: a0.az + dAz * f,
          h: lerp(a0.h, a1.h, f),
          dist: lerp(a0.dist, a1.dist, f),
          fov: lerp(a0.fov ?? 55, a1.fov ?? 55, f),
        };
      }
      const a = (cv.az || 0) * DEG;
      const p = [Math.sin(a) * (cv.dist || 7), cv.h || 1.8, Math.cos(a) * (cv.dist || 7)];
      set(p, [0, 1.15, 0]);
      cam.fov = cv.fov || 55;
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

  /* 角度型运镜（pan / tilt / rotate）的运动只存在于 yaw/pitch 里：
   * 后面「景别重定位」和「角度叠加」都会用 lookAt 依据机位重新瞄准并覆盖 yaw/pitch，
   * 若直接覆盖会把这类运动整段抹平（表现为右摇 / 甩镜 / 摆镜 / 上摇设了却完全不动）。
   * 这里先量出「相对准星」的角偏移，重瞄之后再原样加回去。位置型运镜此项≈0，不受影响。 */
  let dYaw = 0, dPitch = 0;
  if (cam._tgt) {
    const aim0 = lookAt(cam.pos, cam._tgt);
    dYaw = wrapPi(cam.yaw - aim0.yaw);
    dPitch = cam.pitch - aim0.pitch;
  }
  const reaim = (target) => {
    const tg = target || cam._tgt;
    if (!tg) return;
    const aim = lookAt(cam.pos, tg);
    cam.yaw = aim.yaw + dYaw;
    cam.pitch = clamp(aim.pitch + dPitch, -1.45, 1.45);
  };

  /* 景别：按标准取景重定位 —— 保留运镜的相对运动，把距离重映射到该景别的目标距离
   * 大远景=人物极小 · 远景=全身带环境 · 中景=膝盖以上 · 中近景=胸上 · 近景=上半身 · 特写=脸充满画面 */
  const SIZE_CFG = { ELS: { d: 6.7, fov: 55, aim: 1.0 }, LS: { d: 3.1, fov: 45, aim: 1.05 }, MS: { d: 2.2, fov: 34, aim: 1.15 }, MCU: { d: 2.0, fov: 30, aim: 1.26 }, CU: { d: 2.1, fov: 26, aim: 1.45 }, ECU: { d: 1.35, fov: 18, aim: 1.66 } };
  if (sim.type !== 'free' && opts.size && SIZE_CFG[opts.size] && cam._tgt) {
    const cfg = SIZE_CFG[opts.size];
    const mid = solveCamera(sim, 0.5, actor, { scene: opts.scene });
    const mt = mid._tgt || [0, 1.2, 0];
    const D0 = Math.hypot(mid.pos[0] - mt[0], mid.pos[1] - mt[1], mid.pos[2] - mt[2]) || 1;
    const k = Math.max(0.95, cfg.d) / D0;
    const dx = cam.pos[0] - cam._tgt[0], dy = cam.pos[1] - cam._tgt[1], dz = cam.pos[2] - cam._tgt[2];
    cam.pos = [cam._tgt[0] + dx * k, cam._tgt[1] + dy * k, cam._tgt[2] + dz * k];
    const aimY = cfg.aim ?? cam._tgt[1];
    const tg = [cam._tgt[0], aimY, cam._tgt[2]];
    cam._tgt = tg;
    reaim(tg);   // 只调整取景距离/高度，保留 pan/tilt 的角偏移
    if (cfg.fov) cam.fov = cfg.fov;
  }

  /* 角度叠加：在运镜机位基础上抬高/压低/偏移/转屏 */
  const ang = opts.angle || 'eye';
  if (sim.type !== 'free' && ang !== 'eye') {
    if (ang === 'low') cam.pos = [cam.pos[0], Math.max(0.35, cam.pos[1] * 0.35), cam.pos[2]];
    else if (ang === 'high') cam.pos = [cam.pos[0], cam.pos[1] + 4.2, cam.pos[2]];
    else if (ang === 'bird') cam.pos = [cam.pos[0], cam.pos[1] + 9.5, cam.pos[2]];
    else if (ang === 'ots') {
      // 越肩：机位撤到主体斜后方、贴近前景人物肩膀的高度
      if (actor && (actor.x || actor.z)) {
        const dx = cam.pos[0] - actor.x, dz = cam.pos[2] - actor.z;
        const len = Math.hypot(dx, dz) || 1;
        const nd = Math.max(1.05, len * 0.38);
        const px = -dz / len, pz = dx / len; // 侧向
        cam.pos = [actor.x + (dx / len) * nd + px * 0.52, Math.max(1.42, cam.pos[1] * 0.55 + 0.72), actor.z + (dz / len) * nd + pz * 0.52];
      } else {
        cam.pos = [cam.pos[0] + 0.95, Math.max(1.42, cam.pos[1] - 0.1), cam.pos[2]];
      }
    }
    else if (ang === 'dutch') cam.roll = 0.16;
    if (ang !== 'dutch' && cam._tgt) reaim();   // 保留 pan/tilt 的角偏移
  }
  cam.roll = cam.roll || 0;
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
    this._dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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
    // 运镜速度：快推提前走完并定住，慢推到结束时只走一部分
    const speedF = opts.moveSpeed === 'slow' ? 0.62 : opts.moveSpeed === 'fast' ? 1.55 : 1;
    // POV 模式不画演员（自己就是演员）
    const cam = solveCamera(sim, clamp(t * speedF, 0, 1), actor, { angle: opts.angle, size: opts.size, scene: opts.scene });
    const focal = (H / 2) / Math.tan((cam.fov * DEG) / 2);
    const cx = W / 2, cyv = H / 2;

    // 演员部件（局部 → 世界）
    /* 场景对象：多人物（各自动作/朝向/大小）+ 道具 */
    const objs = ((opts.scene && opts.scene.objects) || []).filter(o => o && typeof o === 'object')
      .map(o => ({ ...o, x: +o.x || 0, z: +o.z || 0, rot: +o.rot || 0, scale: Math.min(3, Math.max(0.3, +o.scale || 1)) }))
      .filter(o => isFinite(o.x) && isFinite(o.z));
    const sceneActors = objs.filter(o => o.type === 'actor');
    let actorDefs = sceneActors.length
      ? sceneActors.map((o, i) => {
          let x = o.x, z = o.z, yaw = (o.rot || 0) * DEG;
          let moving = o.action === 'walk' || o.action === 'run';
          if (o.path && o.path.length >= 2) {
            const pp = pathPosAt(o, t);
            x = pp.x; z = pp.z;
            yaw = pp.yaw * DEG;
            moving = true;
          }
          return {
            x, z, yaw, scale: o.scale || 1,
            pose: { phase: t * Math.PI * 6 * (o.action === 'run' ? 1.7 : 1) + i * 1.7, walk: moving ? (o.action === 'run' ? 0.95 : 0.55) : 0, sit: o.action === 'sit' },
          };
        })
      : [{ x: actor.x, z: actor.z, yaw: actor.yaw, scale: 1, pose: { phase: actor.phase, walk: actor.walk, sit: actor.sit } }];
    if (opts.angle === 'ots' && !(opts.hideActor || sim.type === 'pov')) {
      const fx0 = (cam._tgt ? cam._tgt[0] - cam.pos[0] : 0), fz0 = (cam._tgt ? cam._tgt[2] - cam.pos[2] : -1);
      const fl = Math.hypot(fx0, fz0) || 1;
      const fw = { x: fx0 / fl, z: fz0 / fl };
      actorDefs = actorDefs.slice();
      actorDefs.push({
        x: cam.pos[0] + fw.x * 0.62 + fw.z * 0.34,
        z: cam.pos[2] + fw.z * 0.62 - fw.x * 0.34,
        yaw: cam.yaw + Math.PI, scale: 1.06,
        pose: { phase: 0, walk: 0, sit: false },
        ots: true,
      });
    }
    const parts = (opts.hideActor || sim.type === 'pov') ? [] : actorDefs.map(d => ({ d, parts: buildActor(d.pose) }));
    let propObjs = (opts.hideActor ? [] : objs.filter(o => o.type === 'prop'));
    if (opts.scene && opts.scene.cutaway) {
      // 剖开前方外墙：剔除面向相机的墙
      const azR = ((opts.scene.cam && opts.scene.cam.az) || 0) * DEG;
      const camX = Math.sin(azR) * (opts.scene.cam?.dist || 7), camZ = Math.cos(azR) * (opts.scene.cam?.dist || 7);
      propObjs = propObjs.filter(o => {
        if (o.shape !== 'wall') return true;
        const rr = (o.rot || 0) * DEG;
        const nx = Math.sin(rr), nz = Math.cos(rr);
        return (nx * (camX - o.x) + nz * (camZ - o.z)) <= 0;
      });
    }
    const propParts = propObjs.map(o => propPart(o));

    /* ---- 收集多边形（场景 + 关节化演员） ---- */
    const polys = [];
    const collectPart = (part, ax, ay, az, ayaw, ascale = 1) => {
      for (const poly of part.polys) {
        const pts3 = [];
        let ok = true;
        for (const pt of poly.pts) {
          let w = ascale !== 1 ? [pt[0] * ascale, pt[1] * ascale, pt[2] * ascale] : pt;
          for (let i = part.joints.length - 1; i >= 0; i--) {
            const j = part.joints[i];
            w = rotXpt(w, [j.pivot[0] * ascale, j.pivot[1] * ascale, j.pivot[2] * ascale], j.angle);
          }
          if (ayaw) w = rotYpt(w, [0, 0, 0], ayaw);
          w = [w[0] + ax, w[1] + ay, w[2] + az];
          pts3.push(w);
        }
        let n = poly.n;
        for (let i = part.joints.length - 1; i >= 0; i--) {
          const j = part.joints[i];
          n = rotXpt(n, [j.pivot[0] * ascale, j.pivot[1] * ascale, j.pivot[2] * ascale], j.angle);
        }
        if (ayaw) n = rotYpt(n, [0, 0, 0], ayaw);
        const pts2 = [];
        for (const w of pts3) {
          const pr = this.project(w, cam, focal, cx, cyv);
          if (!pr) { ok = false; break; }
          pts2.push(pr);
        }
        if (!ok) continue;
        if (pts2.some(p2 => !isFinite(p2.x) || !isFinite(p2.y) || !isFinite(p2.d))) continue;
        let wcx = 0, wcy = 0, wcz = 0;
        for (const w of pts3) { wcx += w[0]; wcy += w[1]; wcz += w[2]; }
        polys.push({ pts: pts2, n, shade: poly.shade, d: pts2.reduce((a, p2) => a + p2.d, 0) / pts2.length, wc: [wcx / pts3.length, wcy / pts3.length, wcz / pts3.length] });
      }
    };
    for (const part of buildScene((opts.scene && opts.scene.base) || this.scene)) collectPart(part, 0, 0, 0, 0, 1);
    for (const pp of propParts) collectPart(pp, 0, 0, 0, 0, 1);
    for (const ap of parts) for (const part of ap.parts) collectPart(part, ap.d.x, 0, ap.d.z, ap.d.yaw, ap.d.scale);

    if (cam.roll) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(cam.roll); ctx.translate(-W / 2, -H / 2); }

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
      for (const ap of parts) {
        const sp1 = this.project([ap.d.x - 0.42 * ap.d.scale, 0.012, ap.d.z - 0.32 * ap.d.scale], cam, focal, cx, cyv);
        const sp2 = this.project([ap.d.x + 0.42 * ap.d.scale, 0.012, ap.d.z + 0.32 * ap.d.scale], cam, focal, cx, cyv);
        if (sp1 && sp2) {
          ctx.fillStyle = isLight ? 'rgba(50,58,80,0.28)' : 'rgba(8,10,20,0.35)';
          ctx.beginPath();
          ctx.ellipse((sp1.x + sp2.x) / 2, (sp1.y + sp2.y) / 2, Math.abs(sp2.x - sp1.x) / 2, Math.abs(sp2.y - sp1.y) / 2 + 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    /* ---- 画家算法绘制 ---- */
    polys.sort((a, b) => b.d - a.d);
    let L = [0.45, 0.8, 0.4], lightInt = 1; // 光方向
    const lamps = objs.filter(o => o.type === 'prop' && o.shape === 'lamp').slice(0, 3);
    if (opts.scene && opts.scene.light) {
      const lt = opts.scene.light;
      const azR = (lt.az || 0) * DEG, elR = (lt.el ?? 35) * DEG;
      L = [Math.sin(azR) * Math.cos(elR), Math.sin(elR), Math.cos(azR) * Math.cos(elR)];
      lightInt = lt.int ?? 1;
    }
    for (const poly of polys) {
      const n = poly.n;
      const lit = clamp(n[0] * L[0] + n[1] * L[1] + n[2] * L[2], 0, 1);
      let litL = lit;
      for (const lp of lamps) {
        const lx = lp.x - poly.wc[0], ly = (1.85 * (lp.scale || 1)) - poly.wc[1], lz = lp.z - poly.wc[2];
        const dist = Math.hypot(lx, ly, lz) || 1;
        if (dist < 9) {
          const dot = Math.max(0, -(lx * n[0] + ly * n[1] + lz * n[2]) / dist);
          litL += dot * (lp.lint ?? 0.55) * Math.max(0, 1 - dist / 9);
        }
      }
      const litAdj = Math.max(0, Math.min(1, lightInt * litL + (1 - lightInt) * 0.5));
      const v = this._shadeLo + (this._shadeHi - this._shadeLo) * litAdj * (poly.shade || 0.9);
      const fog = clamp(1 - poly.d / 30, 0.25, 1);
      const c = mixColor(th.fog, v, fog);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
      for (let i = 1; i < poly.pts.length; i++) ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
      ctx.closePath(); ctx.fill();
      if (poly.d < 14) { // 近处描边
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.stroke();
      }
    }

    if (cam.roll) ctx.restore();

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
  play(sim, { duration = 4, action = 'stand', scene = 'plain', loop = false, fromT = 0, angle, moveSpeed, size } = {}) {
    this.extra = { angle, moveSpeed, size };
    this.sim = sim; this.duration = duration;
    this.action = action; this.loop = loop;
    this.renderer.scene = scene;
    this.playing = true;
    this._start = performance.now() - fromT * duration * 1000 / this.speed;
    if (!this._raf) this._raf = requestAnimationFrame(this._frame.bind(this));
  }
  seek(sim, t, opts) {
    this.sim = sim; this.action = opts?.action || this.action || 'stand';
    if (opts?.angle !== undefined) this.extra = { angle: opts.angle, moveSpeed: opts.moveSpeed, size: opts.size };
    this.renderer.scene = opts?.scene || this.renderer.scene;
    this.duration = opts?.duration || this.duration;
    this.renderer.render(this.sim, clamp(t, 0, 1), this.action, { duration: this.duration, hud: this.hud, letterbox: true, angle: this.extra?.angle, moveSpeed: this.extra?.moveSpeed, size: this.extra?.size });
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
      this.renderer.render(this.sim, t, this.action, { duration: this.duration, hud: this.hud, letterbox: true, angle: this.extra?.angle, moveSpeed: this.extra?.moveSpeed, size: this.extra?.size });
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

export { WhiteModelRenderer, MovePlayer, imageTransformFor, solveCamera, solveActor, clamp, lerp, easeInOut, easeOut, propPart, rotXpt, rotYpt };
