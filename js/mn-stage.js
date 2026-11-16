/* === 导演台 · 舞台工具（MN_STAGE）===
   ① 走位动画：人物沿 path 按 speed 行走，九关节按步频摆动（单位：度，写 p.joints）
   ② 时间轴机位剪辑（Camera Cut）：镜头册机位排成时间轴，硬切/平滑两种播放，可导出视频
   ③ 白模 / 深度导出：临时切材质抓干净 PNG（不带监看器小窗）
   依赖全局桥：MN / MN3D / toast / saveSoon / pushUndo / paint / paint3D / renderAll / icon / setMode */
(function () {
  'use strict';
  const M = (window.MN_STAGE = {});
  M.ok = true;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => 'st' + Math.random().toString(36).slice(2, 9);
  const icon = (n, c) => window.icon ? window.icon(n, c) : '';
  const toast = (m, k) => { if (window.toast) window.toast(m, k); else console.log('[MN_STAGE]', m); };
  const saveSoon = () => { if (window.saveSoon) window.saveSoon(); };
  const paintAll = () => { if (window.paint) window.paint(); if (window.paint3D) window.paint3D(); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function personById(id) {
    const st = window.MN && MN.state;
    if (!st || !st.scene) return null;
    return (st.scene.persons || []).find(p => p.id === id) || null;
  }

  /* ===================================================================
     一、走位动画播放器
     =================================================================== */
  const walks = new Map();   // pid -> 运行态

  function pathGeom(pts) {
    const cum = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      cum.push(total);
    }
    return { cum, total };
  }
  function posAt(pts, cum, d) {
    const n = pts.length;
    if (d <= 0) return { x: pts[0].x, y: pts[0].y, dx: pts[1].x - pts[0].x, dy: pts[1].y - pts[0].y };
    for (let i = 1; i < n; i++) {
      if (d <= cum[i] || i === n - 1) {
        const seg = (cum[i] - cum[i - 1]) || 1;
        const f = clamp((d - cum[i - 1]) / seg, 0, 1);
        const a = pts[i - 1], b = pts[i];
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: b.x - a.x, dy: b.y - a.y };
      }
    }
    const l = pts[n - 1];
    return { x: l.x, y: l.y, dx: 0, dy: 0 };
  }
  /* 步态：髋前后摆 ±34°，膝盖只在回摆时弯，手臂反相 ±26°，肘微曲。
     p.joints 单位是「度」（3D poseOf 里 ×DEG），别写弧度。 */
  function gaitJoints(phase) {
    const s = Math.sin(phase), c = Math.sin(phase + Math.PI);
    return {
      hipL: Math.round(s * 34), hipR: Math.round(c * 34),
      kneeL: Math.round(-Math.max(0, -s) * 42 - 6), kneeR: Math.round(-Math.max(0, -c) * 42 - 6),
      shL: Math.round(c * 26), shR: Math.round(s * 26),
      elL: -18, elR: -18, lean: 4,
    };
  }

  M.playWalk = function (pid) {
    const p = personById(pid);
    if (!p || !Array.isArray(p.path) || p.path.length < 2) return false;
    M.stopWalk(pid, true);
    const pts = p.path.map(q => ({ x: +q.x || 0, y: +q.y || 0 }));
    const g = pathGeom(pts);
    if (g.total < 0.05) return false;
    const speed = clamp(+p.speed || 1.2, 0.2, 6);
    const w = {
      raf: 0, t0: performance.now(), dur: g.total / speed, speed,
      pts, cum: g.cum, total: g.total,
      prevPose: p.pose || '站立',
      prevJoints: p.joints ? Object.assign({}, p.joints) : null,
    };
    walks.set(pid, w);
    p.pose = '走路';
    if (p.sitOn && window.mnStandUp) { try { window.mnStandUp(p); } catch (e) { } }
    const step = (now) => {
      const cur = personById(pid);           // undo/换画布会把 state 整个换掉，每帧重新找
      if (!cur || !walks.has(pid)) { walks.delete(pid); return; }
      const t = (now - w.t0) / 1000;
      if (t >= w.dur) { finishWalk(pid, cur, w); return; }
      const q = posAt(w.pts, w.cum, t * w.speed);
      cur.x = Math.round(q.x * 100) / 100;
      cur.y = Math.round(q.y * 100) / 100;
      if (Math.hypot(q.dx, q.dy) > 1e-4) {
        /* rot 俯视顺时针、0° 朝 +x：atan2(dy,dx) 即朝向（与 2D/3D 同一口径） */
        cur.rot = Math.round(Math.atan2(q.dy, q.dx) * 180 / Math.PI);
      }
      cur.joints = gaitJoints(t * w.speed * 4.4);
      paintAll();
      w.raf = requestAnimationFrame(step);
    };
    w.raf = requestAnimationFrame(step);
    return true;
  };

  function finishWalk(pid, p, w) {
    const last = w.pts[w.pts.length - 1];
    p.x = last.x; p.y = last.y;
    p.pose = (w.prevPose && w.prevPose !== '走路') ? w.prevPose : '站立';
    if (w.prevJoints) p.joints = w.prevJoints; else delete p.joints;
    walks.delete(pid);
    if (window.renderAll) window.renderAll(); else paintAll();
    saveSoon();
    if (tl && tl.panel) updateStat();
  }
  M.stopWalk = function (pid, silent) {
    const w = walks.get(pid);
    if (!w) return false;
    cancelAnimationFrame(w.raf);
    walks.delete(pid);
    const p = personById(pid);
    if (p) {
      p.pose = (w.prevPose && w.prevPose !== '走路') ? w.prevPose : '站立';
      if (w.prevJoints) p.joints = w.prevJoints; else delete p.joints;
      if (!silent) { paintAll(); saveSoon(); }
    }
    return true;
  };
  M.stopAllWalks = function () { Array.from(walks.keys()).forEach(id => M.stopWalk(id, true)); paintAll(); };
  M.playAllWalks = function () {
    const st = window.MN && MN.state;
    if (!st || !st.scene) return 0;
    let n = 0;
    (st.scene.persons || []).forEach(p => {
      if (Array.isArray(p.path) && p.path.length >= 2 && M.playWalk(p.id)) n++;
    });
    return n;
  };
  M.isWalking = (pid) => walks.has(pid);  /* ===================================================================
     二、时间轴机位剪辑（Camera Cut）
     段落 = { id, shot: 镜头册下标, dur: 秒, mode: 'cut'|'smooth' }
     cut：段内钉死机位，段间硬切；smooth：从上一机位缓动到本段机位。
     存 MN.state.stageTimeline，随画布一起保存 / 撤销。
     =================================================================== */
  let tl = null;

  function tlData() {
    const st = window.MN && MN.state;
    if (!st) return null;
    if (!st.stageTimeline || !Array.isArray(st.stageTimeline.segs)) st.stageTimeline = { segs: [] };
    return st.stageTimeline;
  }
  const shots = () => (window.MN && MN.state && MN.state.directorShots) || [];
  const totalDur = () => tlData() ? tlData().segs.reduce((s, x) => s + (+x.dur || 0), 0) : 0;
  function updateStat() {
    if (!tl || !tl.panel) return;
    const d = tlData(); if (!d) return;
    const elx = $('#mnTlStat', tl.panel);
    if (elx) elx.textContent = '段落：' + d.segs.length + ' · 总时长：' + totalDur().toFixed(1) + 's · 镜头册：' + shots().length;
  }

  /* 六键 + roll 线性插值（roll 用度，setCamera 里已 clamp） */
  function mixCam(a, b, f) {
    const c = {};
    ['theta', 'phi', 'r', 'tx', 'ty', 'tz', 'roll'].forEach(k => {
      const av = +a[k] || 0, bv = +b[k] || 0;
      c[k] = av + (bv - av) * f;
    });
    return c;
  }
  const ease = (f) => f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  /* t 秒 → 当前机位：找到所在段，cut 钉死 / smooth 从上段末机位缓动过来 */
  function camAt(t) {
    const d = tlData(); const ss = shots();
    if (!d || !d.segs.length) return null;
    let acc = 0, prev = null;
    for (let i = 0; i < d.segs.length; i++) {
      const sg = d.segs[i], dur = Math.max(0.1, +sg.dur || 2);
      const cur = (ss[sg.shot] && ss[sg.shot].cam) || null;
      if (!cur) { acc += dur; continue; }
      if (t < acc + dur || i === d.segs.length - 1) {
        if (sg.mode === 'smooth' && prev) {
          const f = ease(clamp((t - acc) / dur, 0, 1));
          return mixCam(prev, cur, f);
        }
        return cur;
      }
      acc += dur; prev = cur;
    }
    return prev;
  }

  function segRows() {
    const d = tlData(); const ss = shots();
    if (!d.segs.length) return '<div class="mn-tl-empty">还没有段落：先在下方镜头册「立起来，再找镜头」存机位，再点「加入时间轴」。</div>';
    return d.segs.map((sg, i) => {
      const name = (ss[sg.shot] && ss[sg.shot].name) || ('机位 ' + (sg.shot + 1) + '（已删）');
      return `<div class="mn-tl-row" data-seg="${i}">
        <b class="mn-tl-idx">${i + 1}</b>
        <select class="mn-tl-shot" data-tlshot="${i}">${ss.map((s, j) => `<option value="${j}" ${j === sg.shot ? 'selected' : ''}>${esc(s.name || '机位 ' + (j + 1))}</option>`).join('')}</select>
        <input class="mn-tl-dur" type="number" min="0.2" max="60" step="0.1" value="${(+sg.dur || 2).toFixed(1)}" data-tldur="${i}" title="时长（秒）" />
        <select class="mn-tl-mode" data-tlmode="${i}" title="切法"><option value="cut" ${sg.mode !== 'smooth' ? 'selected' : ''}>硬切</option><option value="smooth" ${sg.mode === 'smooth' ? 'selected' : ''}>平滑</option></select>
        <button class="mn-tl-mini" data-tlup="${i}" title="上移">↑</button>
        <button class="mn-tl-mini" data-tldown="${i}" title="下移">↓</button>
        <button class="mn-tl-mini danger" data-tldel="${i}" title="删除">✕</button>
        <small class="mn-tl-name">${esc(name)}</small>
      </div>`;
    }).join('');
  }
  function rerenderRows() {
    if (!tl || !tl.panel) return;
    $('#mnTlRows', tl.panel).innerHTML = segRows();
    bindRows(); updateStat();
  }
  function bindRows() {
    const p = tl.panel, d = tlData();
    $$('[data-tlshot]', p).forEach(s => s.onchange = () => { window.pushUndo && pushUndo(); d.segs[+s.dataset.tlshot].shot = +s.value; saveSoon(); updateStat(); });
    $$('[data-tldur]', p).forEach(s => s.onchange = () => { window.pushUndo && pushUndo(); d.segs[+s.dataset.tldur].dur = clamp(+s.value || 2, 0.2, 60); s.value = d.segs[+s.dataset.tldur].dur.toFixed(1); saveSoon(); updateStat(); });
    $$('[data-tlmode]', p).forEach(s => s.onchange = () => { window.pushUndo && pushUndo(); d.segs[+s.dataset.tlmode].mode = s.value; saveSoon(); });
    $$('[data-tlup]', p).forEach(b => b.onclick = () => { const i = +b.dataset.tlup; if (i < 1) return; window.pushUndo && pushUndo(); const t = d.segs[i - 1]; d.segs[i - 1] = d.segs[i]; d.segs[i] = t; saveSoon(); rerenderRows(); });
    $$('[data-tldown]', p).forEach(b => b.onclick = () => { const i = +b.dataset.tldown; if (i >= d.segs.length - 1) return; window.pushUndo && pushUndo(); const t = d.segs[i + 1]; d.segs[i + 1] = d.segs[i]; d.segs[i] = t; saveSoon(); rerenderRows(); });
    $$('[data-tldel]', p).forEach(b => b.onclick = () => { window.pushUndo && pushUndo(); d.segs.splice(+b.dataset.tldel, 1); saveSoon(); rerenderRows(); });
  }  M.openTimeline = function () {
    if (!window.MN3D || !MN3D.ok) { toast('当前环境不支持 WebGL，先去 3D 视图'); return; }
    if (!window.MN || !MN.state) { toast('先画个空间'); return; }
    if (MN.state.view.mode !== '3d') window.setMode && setMode('3d');
    M.closeTimeline();
    if (window.MN3 && MN3.closeAll) { try { MN3.closeAll(); } catch (e) { } }
    tlData();
    tl = { panel: null, playing: false, raf: 0, t0: 0, exportBlob: 0 };
    const p = document.createElement('div');
    p.className = 'mn-motion-panel mn-tl-panel';
    p.innerHTML = `
      <div class="mn-motion-head">${icon('clapperboard')} 时间轴 · 机位剪辑 <button class="mn-modal-x" id="mnTlX">${icon('x')}</button></div>
      <p class="mn-help-para">把镜头册里的机位排成段落：每段选机位、定时长，「硬切」直接跳、「平滑」缓动运镜。播放时人物走位动画同时进行。</p>
      <div class="mn-motion-btns">
        <button class="mn-btn primary" id="mnTlAdd">${icon('plus')}加入时间轴</button>
        <button class="mn-btn" id="mnTlPlay">${icon('play')}播放</button>
        <button class="mn-btn" id="mnTlExport">${icon('download')}导出成片</button>
        <button class="mn-ghost" id="mnTlWhite">${icon('cuboid')}白模图</button>
        <button class="mn-ghost" id="mnTlDepth">${icon('layers')}深度图</button>
        <button class="mn-ghost danger" id="mnTlClear">${icon('trash-2')}清空</button>
      </div>
      <div class="mn-tl-rows" id="mnTlRows">${segRows()}</div>
      <div class="mn-motion-stat" id="mnTlStat"></div>`;
    $('#mnRoot').appendChild(p); tl.panel = p;
    $('#mnTlX', p).onclick = () => M.closeTimeline();
    $('#mnTlAdd', p).onclick = () => {
      const ss = shots();
      if (!ss.length) { toast('镜头册是空的：先点下方「立起来，再找镜头」存机位'); return; }
      window.pushUndo && pushUndo();
      tlData().segs.push({ id: uid(), shot: ss.length - 1, dur: 2, mode: 'cut' });
      saveSoon(); rerenderRows(); toast('已把「' + (ss[ss.length - 1].name || '最新机位') + '」加入时间轴');
    };
    $('#mnTlPlay', p).onclick = () => togglePlay();
    $('#mnTlExport', p).onclick = () => exportTimeline();
    $('#mnTlWhite', p).onclick = () => M.exportMaterial('white');
    $('#mnTlDepth', p).onclick = () => M.exportMaterial('depth');
    $('#mnTlClear', p).onclick = () => { window.pushUndo && pushUndo(); tlData().segs = []; saveSoon(); rerenderRows(); toast('已清空时间轴'); };
    bindRows(); updateStat();
  };

  function stopPlay(silent) {
    if (!tl) return;
    tl.playing = false;
    if (tl.raf) cancelAnimationFrame(tl.raf);
    if (tl.panel) { const b = $('#mnTlPlay', tl.panel); if (b) b.innerHTML = icon('play') + '播放'; }
    if (!silent) M.stopAllWalks();
  }
  function runPlayhead(onDone) {
    const dur = totalDur();
    tl.playing = true; tl.t0 = performance.now();
    const step = () => {
      if (!tl || !tl.playing) return;
      const t = (performance.now() - tl.t0) / 1000;
      if (t >= dur) {
        const c = camAt(Math.max(0, dur - 0.001));
        if (c) { MN3D.setCamera(c); MN3D.render(MN.state); }
        stopPlay(true);
        if (onDone) onDone();
        return;
      }
      const c = camAt(t);
      if (c) { MN3D.setCamera(c); MN3D.render(MN.state); }
      tl.raf = requestAnimationFrame(step);
    };
    step();
  }
  function togglePlay() {
    if (!tl) return;
    if (tl.playing) { stopPlay(); toast('已停止播放'); return; }
    if (!tlData().segs.length) { toast('时间轴是空的：先加入机位段落'); return; }
    const b = $('#mnTlPlay', tl.panel); if (b) b.innerHTML = icon('pause') + '停止';
    const n = M.playAllWalks();
    runPlayhead(() => { M.stopAllWalks(); toast('播放完毕'); });
    if (n) toast('播放中：' + n + ' 个人物沿走位线运动');
  }

  function pickMime() {
    const c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  }
  function dataURLtoBlob(u) {
    const pr = u.split(','), t = (pr[0].match(/:(.*?);/) || [, 'image/png'])[1];
    const bin = atob(pr[1]), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: t });
  }
  M._downloadBlob = downloadBlob;

  function exportTimeline() {
    if (!tl) return;
    const dur = totalDur();
    if (!dur) { toast('时间轴是空的：先加入机位段落'); return; }
    const cv = $('#mn3d');
    if (!cv || !cv.captureStream || !window.MediaRecorder) {
      const url = MN3D.capture();
      if (url) { downloadBlob(dataURLtoBlob(url), '时间轴-当前帧.png'); toast('浏览器不支持录视频，已导出当前帧 PNG'); }
      else toast('导出失败：画布不可用');
      return;
    }
    try {
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: pickMime() });
      const chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        tl.exportBlob = blob.size;
        downloadBlob(blob, '机位剪辑.webm');
        toast('已导出成片（' + Math.round(blob.size / 1024) + ' KB）');
      };
      rec.start();
      M.playAllWalks();
      runPlayhead(() => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); M.stopAllWalks(); }, 150));
      toast('正在导出成片（实时录制 ' + dur.toFixed(1) + 's）…');
    } catch (e) { toast('导出失败：' + e.message); }
  }

  /* ===================================================================
     三、白模 / 深度导出：临时切材质 → 抓干净 PNG → 还原
     =================================================================== */
  M.exportMaterial = function (kind) {
    if (!window.MN3D || !MN3D.ok || !window.MN || !MN.state) { toast('先去 3D 视图'); return null; }
    if (MN.state.view.mode !== '3d') window.setMode && setMode('3d');
    const keep = MN.state.view.material || 'original';
    MN.state.view.material = kind;
    let url = null;
    try { MN3D.render(MN.state); url = MN3D.capture(); }
    finally { MN.state.view.material = keep; MN3D.render(MN.state); }
    if (!url) { toast('导出失败：3D 还没渲染好'); return null; }
    downloadBlob(dataURLtoBlob(url), kind === 'white' ? '白模.png' : '深度.png');
    toast(kind === 'white' ? '已导出白模图（无光照纯白模）' : '已导出深度图');
    return url;
  };

  M.closeTimeline = function () {
    if (!tl) return;
    stopPlay(true);
    if (tl.panel) tl.panel.remove();
    tl = null;
  };
  M._tlDebug = () => ({
    segs: tlData() ? tlData().segs.length : 0,
    dur: totalDur(), playing: !!(tl && tl.playing),
    walks: walks.size, exportSize: tl ? tl.exportBlob : 0,
  });
})();