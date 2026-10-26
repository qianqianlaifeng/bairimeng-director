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
  function pushBox(g, hw, hh, hd, a, tx, ty, tz, col) {
    const C = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]];
    const faces = [
      { n: [0, 0, 1], c: [4, 5, 6, 7] }, { n: [0, 0, -1], c: [1, 0, 3, 2] },
      { n: [1, 0, 0], c: [5, 1, 2, 6] }, { n: [-1, 0, 0], c: [0, 4, 7, 3] },
      { n: [0, 1, 0], c: [3, 2, 6, 7] }, { n: [0, -1, 0], c: [4, 5, 1, 0] }];
    for (const f of faces) {
      const wn = tfDir(a, f.n);
      const wp = f.c.map(i => tfPoint(a, tx, ty, tz, [C[i][0] * hw, C[i][1] * hh, C[i][2] * hd]));
      for (const k of [0, 1, 2, 0, 2, 3]) { const p = wp[k]; g.pos.push(p[0], p[1], p[2]); g.nrm.push(wn[0], wn[1], wn[2]); g.col.push(col[0], col[1], col[2]); }
    }
  }
  function pushFloor(g, x0, z0, x1, z1, col, y) {
    y = (y == null ? 0.02 : y);
    const p = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], n = [0, 1, 0];
    for (const k of [0, 1, 2, 0, 2, 3]) { const q = p[k]; g.pos.push(q[0], q[1], q[2]); g.nrm.push(n[0], n[1], n[2]); g.col.push(col[0], col[1], col[2]); }
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
      const th = w.th || 0.2, h = w.h || 2.6, cx = (w.x1 + w.x2) / 2, cz = (w.y1 + w.y2) / 2;
      const col = material === 'random' ? hashColor(vi++) : wallCol;
      pushBox(g, L / 2, h / 2, th / 2, a, cx, h / 2, cz, col);
    }
    for (const p of sc.props) {
      if (p.hidden) continue;
      const col = material === 'random' ? hashColor(vi++) : hex2rgb(p.color || '#d9b382');
      pushBox(g, (p.w || 1) / 2, (p.h || 1) / 2, (p.d || 1) / 2, 0, p.x + (p.w || 1) / 2, (p.h || 1) / 2, p.y + (p.d || 1) / 2, col);
    }
    for (const p of sc.persons) {
      if (p.hidden) continue;
      const col = material === 'random' ? hashColor(vi++) : hex2rgb(p.color || '#2e7cf6');
      const a = ((p.rot || 0) * Math.PI) / 180, cx = p.x, cz = p.y;
      pushBox(g, 0.22, 0.55, 0.15, a, cx, 0.55, cz, col);
      pushBox(g, 0.16, 0.16, 0.16, a, cx, 1.18, cz, col);
    }
    for (const l of sc.lights) {
      if (l.hidden) continue;
      pushBox(g, 0.18, 0.18, 0.18, 0, l.x, (l.h || 2.5), l.y, hex2rgb(l.color || '#ffe9b0'));
    }
    return g;
  }
  function buildLines() {
    const lp = [], y = 0.06;
    const x0 = Math.floor(bounds.minX) - 2, x1 = Math.ceil(bounds.maxX) + 2, z0 = Math.floor(bounds.minZ) - 2, z1 = Math.ceil(bounds.maxZ) + 2;
    for (let x = x0; x <= x1; x++) lp.push(x, y, z0, x, y, z1);
    for (let z = z0; z <= z1; z++) lp.push(x0, y, z, x1, y, z);
    return lp;
  }

  /* ---------- 相机 ---------- */
  function eyeOf() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi), st = Math.sin(cam.theta), ct = Math.cos(cam.theta), r = cam.r;
    return [cam.tx + r * sp * ct, cam.ty + r * cp, cam.tz + r * sp * st];
  }
  function computeBounds(state) {
    const sc = state.scene; let minX = 0, maxX = 14, minZ = 0, maxZ = 14;
    const acc = (x0, z0, x1, z1) => { minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z0); maxZ = Math.max(maxZ, z1); };
    sc.rooms.forEach(r => acc(r.x, r.y, r.x + r.w, r.y + r.d));
    sc.walls.forEach(w => acc(Math.min(w.x1, w.x2), Math.min(w.y1, w.y2), Math.max(w.x1, w.x2), Math.max(w.y1, w.y2)));
    sc.props.forEach(p => acc(p.x, p.y, p.x + (p.w || 1), p.y + (p.d || 1)));
    sc.persons.forEach(p => acc(p.x - 0.3, p.y - 0.3, p.x + 0.3, p.y + 0.3));
    if (maxX - minX < 2) maxX = minX + 2; if (maxZ - minZ < 2) maxZ = minZ + 2;
    bounds = { minX, maxX, minZ, maxZ };
  }
  function fitR() { return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.9 + 8; }
  function frame() { cam.tx = (bounds.minX + bounds.maxX) / 2; cam.tz = (bounds.minZ + bounds.maxZ) / 2; cam.ty = 1.5; cam.r = fitR(); }

  /* ---------- 绘制 ---------- */
  function draw(state) {
    if (!gl) return;
    const g = buildGeo(state), lp = buildLines();
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
  }

  /* ---------- 交互 ---------- */
  function bindControls(cv) {
    let drag = null;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, btn: e.button }; });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.btn === 2 || e.shiftKey) {
        const eye = eyeOf(), view = lookAt(eye, [cam.tx, cam.ty, cam.tz], [0, 1, 0]);
        const right = [view[0], view[4], view[8]], upv = [view[1], view[5], view[9]], k = cam.r * 0.0016;
        cam.tx -= (right[0] * dx - upv[0] * dy) * k; cam.ty -= (right[1] * dx - upv[1] * dy) * k; cam.tz -= (right[2] * dx - upv[2] * dy) * k;
      } else if (drag.btn === 0) { cam.theta -= dx * 0.01; cam.phi = Math.max(0.02, Math.min(1.52, cam.phi - dy * 0.01)); }
      if (M._last) draw(M._last);
    });
    const end = e => { if (drag) { try { cv.releasePointerCapture(e.pointerId); } catch (_) { } drag = null; } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', e => { e.preventDefault(); cam.r = Math.max(4, Math.min(120, cam.r * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); if (M._last) draw(M._last); }, { passive: false });
    cv.addEventListener('dblclick', () => { frame(); if (M._last) draw(M._last); });
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
  M._reset = function () { cam.inited = false; };
})();
