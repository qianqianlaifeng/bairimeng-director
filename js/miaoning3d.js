/* === 导演台 3D 引擎（M2）===
   自研精简 WebGL 渲染：把 MN.state.scene 的 2D 户型（房间/墙/造物/人物/光源/地面）
   立成 3D，支持轨道相机（左拖转、滚轮缩放、右键 / Shift+左拖 平移、双击聚焦、F 聚全）、
   俯视 / 斜视 / 正视预设、方向光随太阳、额外点光源、原图 / 随机 / 深度三种材质。
   暴露 window.MN3D。依赖：miaoning.js 已经把场景写进 MN.state。 */
(function () {
  'use strict';
  const M = (window.MN3D = {});
  M.ok = false;

  /* ---------- 数学（向量 / 矩阵，列主序供 WebGL） ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function perspective(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    const A = (f + n) / (n - f), C = (2 * f * n) / (n - f);
    // ⚠️ 列主序逐列填充：col2=(0,0,A,-1)，col3=(0,0,C,0)。
    // 2026-10-25 修复：原先 -1 和 C 的位置写反（col2=(0,0,A,C)、col3=(0,0,-1,0)），
    // 导致 w 行变成 -0.2·z_view → 所有顶点被远平面裁掉，3D 只剩清空色。
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, A, -1, 0, 0, C, 0];
  }
  function lookAt(eye, ctr, up) {
    const z = norm(sub(eye, ctr));
    let x = cross(up, z); if (Math.hypot(x[0], x[1], x[2]) < 1e-5) x = [1, 0, 0]; x = norm(x);
    const y = cross(z, x);
    /* ⚠️ 2026-10-26 真·修复：视图矩阵必须是 [R | t] 的「列」摆放 ——
       col0=(x0,y0,z0,0)、col1=(x1,y1,z1,0)、col2=(x2,y2,z2,0)。
       之前写成 col0=(x0,x1,x2,0)… 存的是 R 的转置，旋转对了但 z_view 全错，
       结果是：镜头永远歪在画面角落、墙看不见、只剩一块斜着的地板。
       验证方法：把相机目标点 (tx,ty,tz) 投进去，NDC 必须是 (0,0)。 */
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mMul(a, b) { // a,b 均为列主序
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  // 绕 Y 轴转 a 后再平移
  function tfPoint(a, tx, ty, tz, v) {
    const c = Math.cos(a), s = Math.sin(a), x = v[0], y = v[1], z = v[2];
    return [x * c + z * s + tx, y + ty, -x * s + z * c + tz];
  }
  function tfDir(a, n) {
    const c = Math.cos(a), s = Math.sin(a);
    return norm([n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c]);
  }
  function hex2rgb(h) {
    if (!h) return [0.8, 0.8, 0.8];
    h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const PAL_RND = ['#e1453e', '#3c6e9e', '#5b8c5a', '#d4a5a5', '#c9b8d4', '#d9b382', '#7d8ca3', '#c98d6b', '#8a9b8e', '#f5b301'];
  const hashColor = i => hex2rgb(PAL_RND[i % PAL_RND.length]);
  const isDark = () => { const r = document.querySelector('#mnRoot'); return !!(r && r.dataset.mnTheme === 'dark'); };

  /* ---------- WebGL ---------- */
  let gl = null, canvas = null, prog = null, lineProg = null;
  let bufPos, bufNrm, bufCol, bufLine;
  const cam = { theta: 0.6, phi: 1.0, r: 30, tx: 7, ty: 1.5, tz: 7, inited: false };
  let bounds = { minX: 0, maxX: 14, minZ: 0, maxZ: 14 };
  let aspect = 1;

  const VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;
    uniform mat4 uVP; uniform mat4 uView;
    varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vVZ;
    void main(){ vec4 w = vec4(aPos,1.0); vW = aPos; vN = aNrm; vC = aCol;
      vec4 vp = uView * w; vVZ = vp.z; gl_Position = uVP * w; }`;
  const FS = `
    precision mediump float;
    varying vec3 vN; varying vec3 vC; varying vec3 vW; varying float vVZ;
    uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uAmb;
    uniform vec3 uPtPos[4]; uniform vec3 uPtCol[4]; uniform float uPtInt[4]; uniform int uPtN;
    uniform int uMode;
    void main(){
      vec3 N = normalize(vN); vec3 base = vC;
      if(uMode==2){ float d = clamp((-vVZ)/26.0,0.0,1.0); base = vec3(1.0-d); }
      vec3 col = base * uAmb;
      float s = max(dot(N, normalize(uSunDir)), 0.0); col += base * uSunCol * s;
      for(int i=0;i<4;i++){ if(i>=uPtN) break;
        vec3 L = uPtPos[i] - vW; float dd = length(L); L/=dd;
        float diff = max(dot(N,L),0.0); float att = 1.0/(1.0+0.12*dd+0.06*dd*dd);
        col += base * uPtCol[i] * diff * att * uPtInt[i]; }
      gl_FragColor = vec4(col, 1.0); }`;
  const LVS = `attribute vec3 aP; uniform mat4 uVP; void main(){ gl_Position = uVP*vec4(aP,1.0); }`;
  const LFS = `precision mediump float; uniform vec3 uCol; void main(){ gl_FragColor=vec4(uCol,1.0); }`;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('MN3D shader', gl.getShaderInfoLog(s));
    return s;
  }
  function prog2(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error('MN3D link', gl.getProgramInfoLog(p));
    return p;
  }

  M.ensure = function (cv) {
    if (gl && canvas === cv) return M.ok;
    canvas = cv;
    try { gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: true }) ||
                 cv.getContext('experimental-webgl', { preserveDrawingBuffer: true, antialias: true }); }
    catch (e) { gl = null; }
    if (!gl) { M.ok = false; return false; }
    prog = prog2(VS, FS); lineProg = prog2(LVS, LFS);
    bufPos = gl.createBuffer(); bufNrm = gl.createBuffer(); bufCol = gl.createBuffer(); bufLine = gl.createBuffer();
    bindControls(cv); M.ok = true; return true;
  };

  /* ---------- 几何构建 ---------- */
  /* ⚠️ hw/hh/hd 是「半尺寸」（半宽/半高/半深）—— 2026-10-27 修正：
     原来单位立方体顶点取 ±0.5×hw，等于把 hw 当全尺寸，而所有调用方（墙/道具/人物）
     都按半尺寸传，导致墙只有设计高度的 3/4 且离地悬空、道具整体缩水。
     现在顶点取 ±1×hw，语义与调用方一致。 */
  function pushBox(g, hw, hh, hd, a, tx, ty, tz, col, loc) {
    const C = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const faces = [
      { n: [0, 0, 1], c: [4, 5, 6, 7] }, { n: [0, 0, -1], c: [1, 0, 3, 2] },
      { n: [1, 0, 0], c: [5, 1, 2, 6] }, { n: [-1, 0, 0], c: [0, 4, 7, 3] },
      { n: [0, 1, 0], c: [3, 2, 6, 7] }, { n: [0, -1, 0], c: [4, 5, 1, 0] }];
    /* loc = 部件在「物体本地空间」里的偏移（会随 yaw 一起转，所以桌腿跟着桌子转） */
    const lx = loc ? loc[0] : 0, ly = loc ? loc[1] : 0, lz = loc ? loc[2] : 0;
    for (const f of faces) {
      const wn = tfDir(a, f.n);
      const wp = f.c.map(i => tfPoint(a, tx, ty, tz, [C[i][0] * hw + lx, C[i][1] * hh + ly, C[i][2] * hd + lz]));
      for (const k of [0, 1, 2, 0, 2, 3]) { const p = wp[k]; g.pos.push(p[0], p[1], p[2]); g.nrm.push(wn[0], wn[1], wn[2]); g.col.push(col[0], col[1], col[2]); }
    }
  }
  function pushFloor(g, x0, z0, x1, z1, col, y) {
    y = (y == null ? 0.02 : y);
    const p = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], n = [0, 1, 0];
    for (const k of [0, 1, 2, 0, 2, 3]) { const q = p[k]; g.pos.push(q[0], q[1], q[2]); g.nrm.push(n[0], n[1], n[2]); g.col.push(col[0], col[1], col[2]); }
  }
  /* 绕局部 z 轴（侧向轴）旋转：四肢前后摆动都在这条轴上 */
  const rotZp = (pt, pv, ang) => {
    if (!ang) return pt;
    const dx = pt[0] - pv[0], dy = pt[1] - pv[1], c = Math.cos(ang), s = Math.sin(ang);
    return [pv[0] + dx * c - dy * s, pv[1] + dx * s + dy * c, pt[2]];
  };
  /* 带关节链的盒子：joints 从近端到远端，先算远端 → 再算近端（正向动力学）
     ctr = 部件在「人物局部空间」的中心（x=前, y=上, z=侧）；(tx,ty,tz) = 人物世界原点 */
  function pushBoxJ(g, hw, hh, hd, ctr, joints, yaw, tx, ty, tz, col, bodyRz, bodyDy) {
    const C = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const faces = [
      { n: [0, 0, 1], c: [4, 5, 6, 7] }, { n: [0, 0, -1], c: [1, 0, 3, 2] },
      { n: [1, 0, 0], c: [5, 1, 2, 6] }, { n: [-1, 0, 0], c: [0, 4, 7, 3] },
      { n: [0, 1, 0], c: [3, 2, 6, 7] }, { n: [0, -1, 0], c: [4, 5, 1, 0] }];
    const jt = joints || [];
    for (const f of faces) {
      let n = f.n.slice();
      for (let i = jt.length - 1; i >= 0; i--) n = rotZp(n, [0, 0, 0], jt[i].angle);
      if (bodyRz) n = rotZp(n, [0, 0, 0], bodyRz);
      n = tfDir(yaw, n);
      const wp = f.c.map(idx => {
        let v = [C[idx][0] * hw + ctr[0], C[idx][1] * hh + ctr[1], C[idx][2] * hd + ctr[2]];
        for (let i = jt.length - 1; i >= 0; i--) v = rotZp(v, jt[i].pivot, jt[i].angle);
        if (bodyRz) v = rotZp(v, [0, 0, 0], bodyRz);
        if (bodyDy) v = [v[0], v[1] + bodyDy, v[2]];
        return tfPoint(yaw, tx, ty, tz, v);
      });
      for (const k of [0, 1, 2, 0, 2, 3]) { const p = wp[k]; g.pos.push(p[0], p[1], p[2]); g.nrm.push(n[0], n[1], n[2]); g.col.push(col[0], col[1], col[2]); }
    }
  }
  /* 姿势表：hip/sh 正 = 向前摆；knee/el 负 = 向后弯（膝盖生理方向）
     dy = 整体升降（实测校准，保证脚底贴地不穿模） */
  function poseOf(name) {
    switch (name) {
      case '走路': return { hipL: 0.48, hipR: -0.48, kneeL: -0.30, kneeR: -0.05, shL: -0.34, shR: 0.34, elL: -0.28, elR: -0.28, dy: -0.04 };
      case '运动': return { hipL: 0.85, hipR: -0.85, kneeL: -0.95, kneeR: -0.25, shL: -0.75, shR: 0.75, elL: -0.85, elR: -0.85, lean: 0.14, dy: -0.10 };
      case '招手': return { shR: 2.05, elR: 0.75, shL: 0.12, elL: -0.2 };
      case '坐下': return { sit: true, hipL: 1.45, hipR: 1.45, kneeL: -1.42, kneeR: -1.42, shL: 0.55, shR: 0.55, elL: -0.5, elR: -0.5, dy: -0.28 };
      case '躺下': return { lie: true, hipL: 0.06, hipR: -0.06, dy: 0.18 };
      default: return { shL: 0.04, shR: 0.04, elL: -0.06, elR: -0.06 };
    }
  }
  function buildGeo(state) {
    const g = { pos: [], nrm: [], col: [] };
    const sc = state.scene, material = (state.view && state.view.material) || 'original', dark = isDark();
    let vi = 0;
    /* 三层高度错开，避免共面 z-fighting（原来地面和房间地板都在 y=0.02，会闪条纹） */
    pushFloor(g, bounds.minX - 2, bounds.minZ - 2, bounds.maxX + 2, bounds.maxZ + 2, hex2rgb(dark ? '#26241f' : '#e9e3d8'), 0.0);
    for (const r of sc.rooms) {
      if (r.hidden) continue;
      const col = material === 'random' ? hashColor(vi++) : (r.color ? hex2rgb(r.color) : (dark ? [0.16, 0.15, 0.13] : [0.93, 0.91, 0.86]));
      pushFloor(g, r.x, r.y, r.x + r.w, r.y + r.d, col, 0.03);
    }
    const wallCol = dark ? [0.40, 0.38, 0.34] : [0.78, 0.74, 0.66];
    for (const w of sc.walls) {
      if (w.hidden) continue;
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 0.01, a = Math.atan2(-dy, dx);
      const th = w.th || 0.2, h = w.h || 2.6;
      const col = material === 'random' ? hashColor(vi++) : wallCol;
      const ux = dx / L, uz = dy / L;
      /* 门洞：把墙切成「洞左段 / 洞右段 / 洞上方门楣」，真正镂空 */
      const holes = (w.holes || []).map(hp => {
        const half = Math.max(0.15, (hp.w || 1) / 2);
        return { ta: Math.max(0, hp.t - half / L), tb: Math.min(1, hp.t + half / L) };
      }).filter(hp => hp.tb - hp.ta > 0.002).sort((m, n) => m.ta - n.ta);
      const doorH = Math.min(h * 0.84, 2.05);
      const seg = (t0, t1, y0, y1) => {
        if (t1 - t0 < 0.001 || y1 - y0 < 0.02) return;
        const tm = (t0 + t1) / 2, len = (t1 - t0) * L;
        pushBox(g, len / 2, (y1 - y0) / 2, th / 2, a, w.x1 + ux * L * tm, (y0 + y1) / 2, w.y1 + uz * L * tm, col);
      };
      let cur = 0;
      for (const hp of holes) {
        if (hp.ta > cur) seg(cur, hp.ta, 0, h);
        if (doorH < h - 0.02) seg(hp.ta, hp.tb, doorH, h);   // 门楣
        cur = Math.max(cur, hp.tb);
      }
      if (cur < 1) seg(cur, 1, 0, h);
      if (!holes.length) seg(0, 1, 0, h);
    }
    for (const p of sc.props) {
      if (p.hidden) continue;
      /* ---------- 多部件建模：一张桌子 = 桌面 + 两条围板 + 四条腿 ---------- */
      const KINDS = window.MN_PROP_KINDS;
      const kind = (window.MN_kindOf ? window.MN_kindOf(p) : (p.kind || 'block'));
      const K = KINDS && KINDS[kind];
      const pw = Math.abs(+p.w || 1), pd = Math.abs(+p.d || 1), ph = Math.abs(+p.h || 1);
      const ct = (window.MN_propCenter ? window.MN_propCenter(p) : { x: p.x + pw / 2, y: p.y + pd / 2 });
      /* 3D 内部 yaw 是「俯视逆时针」，2D 平面图与白模预演是「俯视顺时针」；
         在调用处取负，三端朝向才一致（rot=90 → 面向地图下方）。 */
      const yaw = -((+p.rot || 0) * Math.PI) / 180;
      const base = material === 'random' ? hashColor(vi++) : hex2rgb(p.color || (K && K.color) || '#d9b382');
      const accent = material === 'random' ? base : hex2rgb((K && K.accent) || '#8d8f94');
      const roleCol = c => c === 'dark' ? base.map(v => v * 0.58)
        : c === 'light' ? base.map(v => Math.min(1, v + (1 - v) * 0.45))
          : c === 'accent' ? accent : base;
      if (K && K.parts) {
        const sx = K.w ? pw / K.w : 1, sy = K.h ? ph / K.h : 1, sz = K.d ? pd / K.d : 1;
        for (const pt of K.parts()) {
          const hw = Math.max(0.004, pt.w * sx / 2), hh = Math.max(0.004, pt.h * sy / 2), hd = Math.max(0.004, pt.d * sz / 2);
          pushBox(g, hw, hh, hd, yaw, ct.x, 0, ct.y, roleCol(pt.c),
            [pt.x * sx, (pt.y * sy) + hh, pt.z * sz]);
        }
      } else {
        pushBox(g, pw / 2, ph / 2, pd / 2, yaw, ct.x, 0, ct.y, base, [0, ph / 2, 0]);
      }
    }
    for (const p of sc.persons) {
      if (p.hidden) continue;
      const col = material === 'random' ? hashColor(vi++) : hex2rgb(p.color || '#2e7cf6');
      /* 与 2D 平面图 / 白模预演统一：rot 是「俯视顺时针」，本引擎内部 yaw 是逆时针 → 取负 */
      const a = -((p.rot || 0) * Math.PI) / 180, cx = p.x, cz = p.y;
      const fd = a - ((p.faceDir || 0) * Math.PI) / 180;      // 头部朝向（相对身体）
      const fs = Math.min(1.8, Math.max(0.6, p.face || 1));   // 人脸大小也影响 3D 头
      /* 肤色朝人物色靠 28%：远看整个人就是「这个角色是绿的/红的」，
         不然只有躯干和腿变、头和手还是肉色，在小画面里几乎看不出改过颜色。
         头发 = 主色压暗，鞋子 = 主色再压暗一点。 */
      const skin = [0.99, 0.93, 0.87].map((v, i) => v * 0.72 + col[i] * 0.28);
      const hair = col.map(v => v * 0.42), shoe = col.map(v => v * 0.7);
      const P0 = poseOf(p.pose);
      /* 全身变换：躺下 = 整体后仰 90°，其余按姿势校准的升降量；跳跃再抬高 */
      const bodyRz = P0.lie ? -Math.PI / 2 : 0;
      const bodyDy = (P0.dy || 0) + Math.max(0, Math.min(3, +p.jump || 0)) * 0.22;
      const leanJ = P0.lean ? [{ pivot: [0, 0.84, 0], angle: P0.lean }] : [];
      const hip = s => ({ pivot: [0, 0.84, s * 0.112], angle: (s > 0 ? P0.hipL : P0.hipR) || 0 });
      const knee = s => ({ pivot: [0, 0.52, s * 0.112], angle: (s > 0 ? P0.kneeL : P0.kneeR) || 0 });
      const sh = s => ({ pivot: [0, 1.32, s * 0.205], angle: (s > 0 ? P0.shL : P0.shR) || 0 });
      const el = s => ({ pivot: [0, 1.10, s * 0.205], angle: (s > 0 ? P0.elL : P0.elR) || 0 });
      const put = (c, ctr, half, jt, yaw) => pushBoxJ(g, half[0], half[1], half[2], ctr, jt, yaw == null ? a : yaw, cx, 0, cz, c, bodyRz, bodyDy);
      /* 腿：大腿 / 小腿 / 脚（s>0 = 左） */
      for (const s of [1, -1]) {
        const hj = hip(s), kj = knee(s), jtLeg = [hj, kj];
        put(col, [0, 0.72, s * 0.112], [0.07, 0.20, 0.07], [hj], null);        // 大腿
        put(col, [0, 0.33, s * 0.112], [0.058, 0.19, 0.058], jtLeg, null);     // 小腿
        put(shoe, [0.04, 0.045, s * 0.112], [0.09, 0.045, 0.055], jtLeg, null); // 脚
      }
      /* 躯干：髋 / 腹 / 胸（跟随前倾） */
      put(col, [0, 0.88, 0], [0.14, 0.085, 0.095], [], null);
      put(col, [0, 1.03, 0], [0.125, 0.085, 0.085], leanJ, null);
      put(col, [0, 1.22, 0], [0.17, 0.115, 0.10], leanJ, null);
      /* 肩 / 上臂 / 前臂 / 手 */
      for (const s of [1, -1]) {
        const sj = sh(s), ej = el(s);
        put(col, [0, 1.315, s * 0.205], [0.06, 0.055, 0.06], [...leanJ, sj], null);
        put(col, [0.01, 1.165, s * 0.252], [0.045, 0.105, 0.045], [...leanJ, sj], null);
        put(col, [0.035, 0.945, s * 0.252], [0.038, 0.10, 0.038], [...leanJ, sj, ej], null);
        put(skin, [0.045, 0.828, s * 0.252], [0.048, 0.042, 0.042], [...leanJ, sj, ej], null);
      }
      /* 颈 / 头 / 头发（跟人脸朝向） */
      put(skin, [0, 1.40, 0], [0.042, 0.032, 0.042], leanJ, null);
      put(skin, [0, 1.545, 0], [0.098 * fs, 0.112 * fs, 0.098 * fs], leanJ, fd);
      put(hair, [0, 1.638, 0], [0.104 * fs, 0.028, 0.104 * fs], leanJ, fd);
      /* 五官（贴在头的正面 local +x）：双眼 / 双眉 / 鼻 / 嘴 —— 之前只有一个深色块，像单眼怪 */
      const faceX = 0.099 * fs, eyeZ = 0.034 * fs;
      const eyeC = [0.10, 0.12, 0.14], browC = [0.28, 0.22, 0.20], mouthC = [0.62, 0.34, 0.34];
      for (const s of [1, -1]) {
        put(eyeC, [faceX, 1.564, s * eyeZ], [0.007, 0.014, 0.014], leanJ, fd);   // 眼睛
        put(browC, [faceX, 1.589, s * eyeZ], [0.007, 0.005, 0.020], leanJ, fd);  // 眉毛
      }
      put([0.93, 0.85, 0.79], [faceX + 0.008, 1.542, 0], [0.014, 0.020, 0.013], leanJ, fd); // 鼻
      put(mouthC, [faceX, 1.507, 0], [0.005, 0.006, 0.022], leanJ, fd);                      // 嘴
    }
    for (const l of sc.lights) {
      if (l.hidden) continue;
      pushBox(g, 0.09, 0.09, 0.09, 0, l.x, (l.h || 2.5), l.y, hex2rgb(l.color || '#ffe9b0'));
    }
    return g;
  }
  function buildLines(state) {
    const lp = [], paths = [], y = 0.06;
    const x0 = Math.floor(bounds.minX) - 2, x1 = Math.ceil(bounds.maxX) + 2, z0 = Math.floor(bounds.minZ) - 2, z1 = Math.ceil(bounds.maxZ) + 2;
    for (let x = x0; x <= x1; x++) lp.push(x, y, z0, x, y, z1);
    for (let z = z0; z <= z1; z++) lp.push(x0, y, z, x1, y, z);
    /* 人物运动轨迹：贴地画折线，让 3D 里也能看到走位线 */
    for (const pe of ((state && state.scene && state.scene.persons) || [])) {
      const pts = pe.path || [];
      if (pts.length < 2) continue;
      for (let i = 1; i < pts.length; i++) paths.push(pts[i - 1].x, y + 0.03, pts[i - 1].y, pts[i].x, y + 0.03, pts[i].y);
    }
    /* 选中物体：脚下画一圈高亮环 */
    if (M._sel && state) {
      const so = findObjById(state, M._sel.kind, M._sel.id);
      if (so) {
        let cx0 = so.x, cz0 = so.y, rad = 0.5;
        if (M._sel.kind === 'prop') {
          const b = (window.MN_propAABB ? window.MN_propAABB(so) : { x: so.x, y: so.y, w: +so.w || 1, d: +so.d || 1 });
          cx0 = b.x + b.w / 2; cz0 = b.y + b.d / 2; rad = Math.max(b.w, b.d) / 2 + 0.18;
        }
        else if (M._sel.kind === 'person') rad = 0.5;
        else if (M._sel.kind === 'light') { cx0 = so.x; cz0 = so.y; rad = 0.4; }
        else if (M._sel.kind === 'room') { cx0 = so.x + so.w / 2; cz0 = so.y + so.d / 2; rad = Math.min(so.w, so.d) / 2 + 0.1; }
        else if (M._sel.kind === 'wall') { cx0 = (so.x1 + so.x2) / 2; cz0 = (so.y1 + so.y2) / 2; rad = Math.hypot(so.x2 - so.x1, so.y2 - so.y1) / 2 + 0.2; }
        const N = 28, yy = y + 0.05;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
          paths.push(cx0 + Math.cos(a0) * rad, yy, cz0 + Math.sin(a0) * rad, cx0 + Math.cos(a1) * rad, yy, cz0 + Math.sin(a1) * rad);
        }
      }
    }
    return { grid: lp, paths };
  }

  /* ---------- 相机 ---------- */
  function eyeOf() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi), st = Math.sin(cam.theta), ct = Math.cos(cam.theta), r = cam.r;
    return [cam.tx + r * sp * ct, cam.ty + r * cp, cam.tz + r * sp * st];
  }
  function computeBounds(state) {
    const sc = state.scene;
    /* 从实际内容算包围盒：以前默认撑满 0..14 网格，只有一个角色时相机会退到 20m 外，
       人物在画面里只有一个小点（看起来就像「模型很简陋」） */
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const acc = (x0, z0, x1, z1) => { minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1); };
    sc.rooms.forEach(r => acc(r.x, r.y, r.x + r.w, r.y + r.d));
    sc.walls.forEach(w => acc(Math.min(w.x1, w.x2), Math.min(w.y1, w.y2), Math.max(w.x1, w.x2), Math.max(w.y1, w.y2)));
    sc.props.forEach(p => {
      const b = (window.MN_propAABB ? window.MN_propAABB(p) : { x: p.x, y: p.y, w: +p.w || 1, d: +p.d || 1 });
      acc(b.x, b.y, b.x + b.w, b.y + b.d);
    });
    sc.persons.forEach(p => acc(p.x - 0.6, p.y - 0.6, p.x + 0.6, p.y + 0.6));
    sc.lights.forEach(l => acc(l.x - 0.4, l.y - 0.4, l.x + 0.4, l.y + 0.4));
    if (!isFinite(minX)) { minX = 0; maxX = 14; minZ = 0; maxZ = 14; }
    if (maxX - minX < 2) { const c = (minX + maxX) / 2; minX = c - 1; maxX = c + 1; }
    if (maxZ - minZ < 2) { const c = (minZ + maxZ) / 2; minZ = c - 1; maxZ = c + 1; }
    bounds = { minX, maxX, minZ, maxZ };
  }
  function fitR() {
    /* 同时考虑高度：至少框住一个 1.8m 的人，别让单人场景被拉到天边 */
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 3);
    return span * 0.9 + 3;
  }
  function frame() { cam.tx = (bounds.minX + bounds.maxX) / 2; cam.tz = (bounds.minZ + bounds.maxZ) / 2; cam.ty = 1.5; cam.r = fitR(); }

  /* ---------- 人物头顶名牌（DOM 覆盖层，按 VP 矩阵实时投影） ---------- */
  let labelLayer = null;
  function ensureLabelLayer() {
    if (labelLayer && labelLayer.isConnected) return labelLayer;
    const host = canvas && canvas.parentElement;
    if (!host) return null;
    labelLayer = document.createElement('div');
    labelLayer.className = 'mn3d-labels';
    host.appendChild(labelLayer);
    return labelLayer;
  }
  function projToScreen(vp, x, y, z) {
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.02) return null;  // 在相机背后
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    return { x: (cx / cw * 0.5 + 0.5) * canvas.clientWidth, y: (1 - (cy / cw * 0.5 + 0.5)) * canvas.clientHeight };
  }
  function updateLabels(state, vp) {
    const layer = ensureLabelLayer();
    if (!layer) return;
    const on = state.view && state.view.mode === '3d';
    layer.style.display = on ? '' : 'none';
    if (!on) return;
    const persons = (state.scene.persons || []).filter(p => !p.hidden && (p.name || '').trim());
    while (layer.children.length > persons.length) layer.removeChild(layer.lastChild);
    persons.forEach((p, i) => {
      let el = layer.children[i];
      if (!el) { el = document.createElement('div'); el.className = 'mn3d-label'; layer.appendChild(el); }
      /* 名牌高度跟着姿势走：躺下贴地、坐着在头顶、站立在头顶上方 */
      const pose = p.pose || '站立';
      const topY = (pose === '躺下' ? 0.55 : pose === '坐下' ? 1.62 : 1.82) + Math.max(0, Math.min(3, +p.jump || 0)) * 0.22;
      const sp = projToScreen(vp, p.x, topY, p.y);
      if (!sp) { el.style.display = 'none'; return; }
      el.style.display = '';
      if (el.textContent !== p.name) el.textContent = p.name;
      el.style.left = sp.x.toFixed(1) + 'px';
      el.style.top = sp.y.toFixed(1) + 'px';
      el.style.setProperty('--lb', p.color || '#2e7cf6');
    });
  }

  /* ---------- 选中物体的旋转手柄 ----------
     3D 里选中东西后，旁边出现一个「↻」圆钮，拖它就转。
     只有 Q/E 快捷键的话等于「没法旋转」——没人知道要按键。 */
  let gizmoEl = null, gizmoDrag = null;
  function ensureGizmo() {
    if (gizmoEl && gizmoEl.isConnected) return gizmoEl;
    const host = canvas && canvas.parentElement;
    if (!host) return null;
    gizmoEl = document.createElement('div');
    gizmoEl.className = 'mn3d-gizmo';
    gizmoEl.title = '拖动旋转（按住 Alt 自由转）· 也可以按 Q / E 每次 15°';
    gizmoEl.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 3v6h-6"/></svg>';
    gizmoEl.addEventListener('pointerdown', onGizmoDown);
    host.appendChild(gizmoEl);
    return gizmoEl;
  }
  /* 选中物的旋转中心（世界坐标） */
  function selAnchor(state) {
    const s = M._sel; if (!s) return null;
    const o = findObjById(state, s.kind, s.id); if (!o) return null;
    if (s.kind === 'prop') {
      const b = (window.MN_propAABB ? window.MN_propAABB(o) : { x: o.x, y: o.y, w: +o.w || 1, d: +o.d || 1 });
      return { o, cx: b.x + b.w / 2, cy: Math.min(2.2, +o.h || 1) * 0.55, cz: b.y + b.d / 2 };
    }
    if (s.kind === 'person') return { o, cx: o.x, cy: 1.0, cz: o.y };
    if (s.kind === 'wall') return { o, cx: (o.x1 + o.x2) / 2, cy: Math.min(2, (o.h || 2.6) * 0.5), cz: (o.y1 + o.y2) / 2 };
    return null;
  }
  function updateGizmo(state, vp) {
    const el = ensureGizmo(); if (!el) return;
    const on = state.view && state.view.mode === '3d';
    const a = on ? selAnchor(state) : null;
    if (!a) { el.style.display = 'none'; M._gizmo = null; return; }
    const sp = projToScreen(vp, a.cx, a.cy, a.cz);
    if (!sp) { el.style.display = 'none'; M._gizmo = null; return; }
    el.style.display = '';
    el.style.left = (sp.x + 44).toFixed(1) + 'px';
    el.style.top = (sp.y - 8).toFixed(1) + 'px';
    M._gizmo = { sx: sp.x, sy: sp.y, hx: sp.x + 44, hy: sp.y - 8, kind: M._sel.kind, id: M._sel.id, anchor: a };
  }
  function onGizmoDown(e) {
    if (!M._gizmo) return;
    e.preventDefault(); e.stopPropagation();
    const s = M._sel; if (!s) return;
    const o = findObjById(M._last, s.kind, s.id); if (!o) return;
    const r = canvas.getBoundingClientRect();
    gizmoDrag = {
      kind: s.kind, id: s.id, sx: M._gizmo.sx, sy: M._gizmo.sy,
      rot0: +o.rot || 0, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
      a0: Math.atan2(e.clientY - r.top - M._gizmo.sy, e.clientX - r.left - M._gizmo.sx),
    };
    try { gizmoEl.setPointerCapture(e.pointerId); } catch (err) { }
    if (typeof M.onRotateStart === 'function') M.onRotateStart();
    gizmoEl.classList.add('on');
    gizmoEl.addEventListener('pointermove', onGizmoMove);
    gizmoEl.addEventListener('pointerup', onGizmoUp);
    gizmoEl.addEventListener('pointercancel', onGizmoUp);
  }
  function onGizmoMove(e) {
    if (!gizmoDrag || !M._last) return;
    const r = canvas.getBoundingClientRect();
    const a1 = Math.atan2(e.clientY - r.top - gizmoDrag.sy, e.clientX - r.left - gizmoDrag.sx);
    let deg = (a1 - gizmoDrag.a0) * 180 / Math.PI;
    if (!e.altKey) deg = Math.round(deg / 15) * 15;                 // 默认 15° 吸附
    const o = findObjById(M._last, gizmoDrag.kind, gizmoDrag.id);
    if (!o) return;
    if (gizmoDrag.kind === 'wall') {
      const cx = (gizmoDrag.x1 + gizmoDrag.x2) / 2, cz = (gizmoDrag.y1 + gizmoDrag.y2) / 2;
      const a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const rp = (x, z) => [cx + (x - cx) * ca - (z - cz) * sa, cz + (x - cx) * sa + (z - cz) * ca];
      const p1 = rp(gizmoDrag.x1, gizmoDrag.y1), p2 = rp(gizmoDrag.x2, gizmoDrag.y2);
      o.x1 = p1[0]; o.y1 = p1[1]; o.x2 = p2[0]; o.y2 = p2[1];
    } else {
      o.rot = ((gizmoDrag.rot0 + deg) % 360 + 360) % 360;
    }
    if (typeof M.onRotate === 'function') M.onRotate(Math.round(deg));
    requestDraw();
  }
  function onGizmoUp() {
    gizmoEl.removeEventListener('pointermove', onGizmoMove);
    gizmoEl.removeEventListener('pointerup', onGizmoUp);
    gizmoEl.removeEventListener('pointercancel', onGizmoUp);
    gizmoEl.classList.remove('on');
    const moved = !!gizmoDrag;
    gizmoDrag = null;
    if (moved && typeof M.onRotateEnd === 'function') M.onRotateEnd();
  }

  /* ---------- 绘制 ---------- */
  let drawRaf = 0;
  /* 拖动时指针事件的频率可能比屏幕刷新还高（120~240Hz），
     每来一次就重建整份几何体会白白丢掉一半以上的帧 —— 统一按帧合并。 */
  function requestDraw() {
    if (drawRaf) return;
    drawRaf = requestAnimationFrame(() => { drawRaf = 0; if (M._last) draw(M._last); });
  }
  function draw(state) {
    if (!gl) return;
    const t0 = performance.now();
    const g = buildGeo(state), L = buildLines(state), lp = L.grid;
    const geoMs = performance.now() - t0;
    const eye = eyeOf(), up = cam.phi < 0.05 ? [0, 0, -1] : [0, 1, 0];
    const view = lookAt(eye, [cam.tx, cam.ty, cam.tz], up);
    const proj = perspective(45 * Math.PI / 180, aspect || 1, 0.1, 1000);
    const vp = mMul(proj, view);
    const dark = isDark();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(dark ? 0.10 : 0.82, dark ? 0.10 : 0.86, dark ? 0.12 : 0.90, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.pos), gl.DYNAMIC_DRAW);
    let a = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.nrm), gl.DYNAMIC_DRAW);
    a = gl.getAttribLocation(prog, 'aNrm'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.col), gl.DYNAMIC_DRAW);
    a = gl.getAttribLocation(prog, 'aCol'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uVP'), false, new Float32Array(vp));
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uView'), false, new Float32Array(view));
    const sun = state.sun || { on: true, dir: 300, alt: 53 };
    const al = (sun.alt || 53) * Math.PI / 180, az = (sun.dir || 300) * Math.PI / 180;
    const sdir = [Math.cos(al) * Math.sin(az), Math.sin(al), Math.cos(al) * Math.cos(az)];
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSunDir'), new Float32Array(sdir));
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSunCol'), new Float32Array([0.95, 0.88, 0.72]));
    gl.uniform1f(gl.getUniformLocation(prog, 'uAmb'), 0.55);
    const lights = (state.scene.lights || []).filter(l => !l.hidden);
    const ptPos = new Float32Array(12), ptCol = new Float32Array(12), ptInt = new Float32Array(4);
    const n = Math.min(lights.length, 4);
    for (let i = 0; i < n; i++) { const l = lights[i]; ptPos[i * 3] = l.x; ptPos[i * 3 + 1] = (l.h || 2.5); ptPos[i * 3 + 2] = l.y; const c = hex2rgb(l.color || '#ffe9b0'); ptCol[i * 3] = c[0]; ptCol[i * 3 + 1] = c[1]; ptCol[i * 3 + 2] = c[2]; ptInt[i] = (l.intensity != null ? l.intensity : 1.0); }
    gl.uniform3fv(gl.getUniformLocation(prog, 'uPtPos'), ptPos);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uPtCol'), ptCol);
    gl.uniform1fv(gl.getUniformLocation(prog, 'uPtInt'), ptInt);
    gl.uniform1i(gl.getUniformLocation(prog, 'uPtN'), n);
    gl.uniform1i(gl.getUniformLocation(prog, 'uMode'), ((state.view && state.view.material) === 'depth') ? 2 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, g.pos.length / 3);

    gl.useProgram(lineProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLine); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lp), gl.DYNAMIC_DRAW);
    a = gl.getAttribLocation(lineProg, 'aP'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uVP'), false, new Float32Array(vp));
    gl.uniform3fv(gl.getUniformLocation(lineProg, 'uCol'), new Float32Array(dark ? [0.30, 0.28, 0.25] : [0.62, 0.58, 0.50]));
    gl.drawArrays(gl.LINES, 0, lp.length / 3);
    /* 人物运动轨迹单独用蓝色画一遍，和网格区分开 */
    if (L.paths && L.paths.length) {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(L.paths), gl.DYNAMIC_DRAW);
      gl.uniform3fv(gl.getUniformLocation(lineProg, 'uCol'), new Float32Array([0.18, 0.49, 0.96]));
      gl.drawArrays(gl.LINES, 0, L.paths.length / 3);
    }

    /* 人物名牌：DOM 覆盖层跟随相机（2D 模式自动隐藏） */
    updateLabels(state, vp);
    /* 选中物体的旋转手柄（DOM 覆盖层，拖动即转） */
    updateGizmo(state, vp);
    M._stat.draws++; M._stat.geoMs += geoMs; M._stat.ms += performance.now() - t0;
  }

  /* ---------- 交互 ---------- */
  /* 屏幕点 → 地面 y=0 的世界坐标（用于 3D 里直接放置物件） */
  function screenToFloor(cv, clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const eye = eyeOf();
    const ctr = [cam.tx, cam.ty, cam.tz];
    const zAxis = norm(sub(eye, ctr));                 // 相机朝 -z
    const upv = cam.phi < 0.05 ? [0, 0, -1] : [0, 1, 0];
    const xAxis = norm(cross(upv, zAxis));
    const yAxis = cross(zAxis, xAxis);
    const fwd = [-zAxis[0], -zAxis[1], -zAxis[2]];
    const tanH = Math.tan((45 * Math.PI / 180) / 2);
    const aspect = rect.width / rect.height;
    const dir = norm([
      fwd[0] + xAxis[0] * ndcX * tanH * aspect + yAxis[0] * ndcY * tanH,
      fwd[1] + xAxis[1] * ndcX * tanH * aspect + yAxis[1] * ndcY * tanH,
      fwd[2] + xAxis[2] * ndcX * tanH * aspect + yAxis[2] * ndcY * tanH,
    ]);
    if (Math.abs(dir[1]) < 1e-4) return null;          // 与地面平行，无交点
    const t = -eye[1] / dir[1];
    if (t <= 0) return null;                            // 交点在相机背后
    return [eye[0] + dir[0] * t, eye[2] + dir[2] * t];
  }

  /* 屏幕点 → 射线（原点到方向），供 3D 拾取使用 */
  function rayFromScreen(cv, clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    const eye = eyeOf();
    const zAxis = norm(sub(eye, [cam.tx, cam.ty, cam.tz]));
    const upv = cam.phi < 0.05 ? [0, 0, -1] : [0, 1, 0];
    const xAxis = norm(cross(upv, zAxis));
    const yAxis = cross(zAxis, xAxis);
    const fwd = [-zAxis[0], -zAxis[1], -zAxis[2]];
    const tanH = Math.tan((45 * Math.PI / 180) / 2);
    const aspect = rect.width / rect.height;
    return {
      o: eye,
      d: norm([
        fwd[0] + xAxis[0] * ndcX * tanH * aspect + yAxis[0] * ndcY * tanH,
        fwd[1] + xAxis[1] * ndcX * tanH * aspect + yAxis[1] * ndcY * tanH,
        fwd[2] + xAxis[2] * ndcX * tanH * aspect + yAxis[2] * ndcY * tanH,
      ]),
    };
  }
  /* 射线 vs AABB（slab），返回最近命中距离或 null */
  function rayAABB(o, d, b) {
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const inv = 1 / (Math.abs(d[i]) < 1e-9 ? 1e-9 : d[i]);
      let t1 = (b[i] - o[i]) * inv, t2 = (b[i + 3] - o[i]) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return tmin > 0 ? tmin : tmax;
  }
  /* 各类物体的包围盒 [x0,y0,z0,x1,y1,z1] */
  function objBox(kind, o) {
    if (kind === 'person') return [o.x - 0.32, 0, o.y - 0.32, o.x + 0.32, 1.78, o.y + 0.32];
    if (kind === 'prop') {
      /* 道具现在会真的转起来：拾取盒用旋转后的外接矩形，不然转 90° 后点不准 */
      const b = (window.MN_propAABB ? window.MN_propAABB(o)
        : { x: o.x, y: o.y, w: +o.w || 1, d: +o.d || 1 });
      return [b.x, 0, b.y, b.x + b.w, +o.h || 1, b.y + b.d];
    }
    if (kind === 'wall') {
      const th = (o.th || 0.2) / 2 + 0.08;
      return [Math.min(o.x1, o.x2) - th, 0, Math.min(o.y1, o.y2) - th, Math.max(o.x1, o.x2) + th, o.h || 2.6, Math.max(o.y1, o.y2) + th];
    }
    if (kind === 'light') { const h = o.h || 2.5; return [o.x - 0.22, h - 0.22, o.y - 0.22, o.x + 0.22, h + 0.22, o.y + 0.22]; }
    if (kind === 'room') return [o.x, 0, o.y, o.x + o.w, 0.07, o.y + o.d];
    return null;
  }
  /* 拾取最近的可操作物体 */
  function pick(state, cv, clientX, clientY) {
    const r = rayFromScreen(cv, clientX, clientY); if (!r) return null;
    const sc = state.scene, cands = [];
    const add = (kind, arr) => (arr || []).forEach(o => {
      if (o.hidden) return;
      const b = objBox(kind, o); if (!b) return;
      const t = rayAABB(r.o, r.d, b);
      if (t != null) cands.push({ kind, id: o.id, t });
    });
    add('person', sc.persons); add('prop', sc.props); add('wall', sc.walls); add('light', sc.lights); add('room', sc.rooms);
    if (!cands.length) return null;
    cands.sort((a, b) => a.t - b.t);
    return cands[0];
  }

  function bindControls(cv) {
    let drag = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const st = M._last;
      const spaceHeld = !!(window.MN && window.MN.spaceDown);
      const hit = (e.button === 0 && !spaceHeld && st && typeof M.onSelect === 'function') ? pick(st, cv, e.clientX, e.clientY) : null;
      if (e.button === 0 && hit) {
        /* 命中物体 → 拖动移动（记住抓取偏移，避免瞬移） */
        const o = findObjById(st, hit.kind, hit.id);
        const f = screenToFloor(cv, e.clientX, e.clientY);
        if (typeof M.onMoveStart === 'function') M.onMoveStart(hit.kind, hit.id);
        drag = { mode: 'move', kind: hit.kind, id: hit.id, btn: 0, moved: 0, x: e.clientX, y: e.clientY,
          offX: f ? (o.x != null ? o.x : 0) - f[0] : 0, offZ: f ? (o.y != null ? o.y : 0) - f[1] : 0, sx: e.clientX, sy: e.clientY };
      } else {
        drag = { mode: (e.button === 2 || spaceHeld) ? 'pan' : 'orbit', btn: e.button, moved: 0, x: e.clientX, y: e.clientY };
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.mode === 'move') {
        const st = M._last; if (!st) return;
        const f = screenToFloor(cv, e.clientX, e.clientY); if (!f) return;
        const o = findObjById(st, drag.kind, drag.id); if (!o) return;
        const nx = f[0] + drag.offX, nz = f[1] + drag.offZ;
        if (drag.kind === 'wall') {
          const cx0 = (o.x1 + o.x2) / 2, cz0 = (o.y1 + o.y2) / 2;
          const ddx = nx - cx0, ddz = nz - cz0;
          o.x1 += ddx; o.x2 += ddx; o.y1 += ddz; o.y2 += ddz;
          drag.offX = (o.x1 + o.x2) / 2 - f[0]; drag.offZ = (o.y1 + o.y2) / 2 - f[1];
        } else {
          o.x = nx; o.y = nz;
        }
        if (typeof M.onMove === 'function') M.onMove();
        else requestDraw();
      } else if (drag.mode === 'pan' || e.shiftKey) {
        cv.style.cursor = 'grabbing';
        const eye = eyeOf(), view = lookAt(eye, [cam.tx, cam.ty, cam.tz], [0, 1, 0]);
        const right = [view[0], view[4], view[8]], upv = [view[1], view[5], view[9]], k = cam.r * 0.0016;
        cam.tx -= (right[0] * dx - upv[0] * dy) * k; cam.ty -= (right[1] * dx - upv[1] * dy) * k; cam.tz -= (right[2] * dx - upv[2] * dy) * k;
        requestDraw();
      } else {
        cam.theta -= dx * 0.01; cam.phi = Math.max(0.02, Math.min(1.52, cam.phi - dy * 0.01));
        requestDraw();
      }
    });
    const end = e => {
      if (!drag) return;
      const d0 = drag; drag = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) { }
      cv.style.cursor = '';
      const wasClick = d0.moved < 5;
      const st = M._last;
      if (d0.mode === 'move') {
        if (typeof M.onMoveEnd === 'function') M.onMoveEnd();
        if (wasClick && typeof M.onSelect === 'function') M.onSelect(d0.kind, d0.id);
        return;
      }
      if (d0.btn === 2 && wasClick) {
        /* 右键单击：命中物体 → 弹菜单；空白 → 空白菜单 */
        const hit = st ? pick(st, cv, e.clientX, e.clientY) : null;
        if (typeof M.onContext === 'function') M.onContext(hit ? hit.kind : null, hit ? hit.id : null, e.clientX, e.clientY);
        return;
      }
      if (d0.btn === 0 && wasClick) {
        const hit = st ? pick(st, cv, e.clientX, e.clientY) : null;
        if (hit) { if (typeof M.onSelect === 'function') M.onSelect(hit.kind, hit.id); return; }
        /* 空白处单击：放置模式优先，否则取消选中 */
        if (typeof M.onPlace === 'function') {
          const f = screenToFloor(cv, e.clientX, e.clientY);
          if (f && typeof M.isPlacing === 'function' && M.isPlacing()) { M.onPlace(f[0], f[1]); return; }
        }
        if (typeof M.onSelect === 'function') M.onSelect(null, null);
      }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', e => { e.preventDefault(); cam.r = Math.max(4, Math.min(120, cam.r * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); if (M._last) draw(M._last); }, { passive: false });
    cv.addEventListener('dblclick', () => { frame(); if (M._last) draw(M._last); });
  }
  /* 按 kind/id 找对象 */
  function findObjById(state, kind, id) {
    const sc = state && state.scene; if (!sc) return null;
    const arr = kind === 'person' ? sc.persons : kind === 'prop' ? sc.props : kind === 'wall' ? sc.walls : kind === 'light' ? sc.lights : kind === 'room' ? sc.rooms : null;
    return (arr || []).find(o => o.id === id) || null;
  }

  /* ---------- 公共 API ---------- */
  M.render = function (state) {
    if (!gl) return; M._last = state; computeBounds(state);
    if (!cam.inited) { frame(); cam.inited = true; }
    aspect = (canvas.width / (canvas.height || 1)) || 1; draw(state);
  };
  M.resize = function () { if (!gl || !canvas) return; aspect = (canvas.width / (canvas.height || 1)) || 1; if (M._last) draw(M._last); };
  M.setView = function (name) {
    if (name === 'top') cam.phi = 0.03; else if (name === 'oblique') { cam.phi = 1.0; cam.theta = 0.6; } else if (name === 'front') { cam.phi = 1.45; cam.theta = 1.57; }
    cam.r = fitR() * (name === 'top' ? 1.1 : 1.0); if (M._last) draw(M._last);
  };
  M.frame = function () { frame(); if (M._last) draw(M._last); };
  M.getCamera = function () { return { theta: cam.theta, phi: cam.phi, r: cam.r, tx: cam.tx, ty: cam.ty, tz: cam.tz }; };
  M.setCamera = function (c) { if (!c) return; cam.theta = c.theta; cam.phi = c.phi; cam.r = c.r; cam.tx = c.tx; cam.ty = (c.ty != null ? c.ty : 1.5); cam.tz = c.tz; cam.inited = true; if (M._last) draw(M._last); };
  M.capture = function () { if (!gl) return null; if (M._last) draw(M._last); try { return canvas.toDataURL('image/png'); } catch (e) { return null; } };
  M._debugGeo = function (state) { return buildGeo(state); };
  M.setSel = function (s) { M._sel = s; if (M._last) draw(M._last); };
  /* 性能计数（测试/自查用）：一次 draw 的重建几何耗时与总耗时 */
  M._stat = { draws: 0, geoMs: 0, ms: 0 };
  M._resetStat = function () { M._stat.draws = 0; M._stat.geoMs = 0; M._stat.ms = 0; };
  M._debugGizmo = function () { return M._gizmo; };
  M._reset = function () { cam.inited = false; };
})();
