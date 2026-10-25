/* === 导演台 M3：剪辑台 / 运镜录制 / 仙人模式 ===
   依赖 miaoning.js 的全局 MN（state/scene）、MN3D（3D 引擎）、toast/saveSoon/openModal/closeModal/esc/uid/$/$$。
   全部挂在 window.MN3，miaoning.js 里把 cut/motion/genie 三个工具路由到这里。 */
(function () {
  'use strict';
  const M = (window.MN3 = {});
  M.ok = true;

  /* ---------- 本地安全助手（复用全局，找不到就兜底） ---------- */
  const G = window;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (m) => { if (G.toast) G.toast(m); else console.log('[MN3]', m); };
  const saveSoon = () => { if (G.saveSoon) G.saveSoon(); };
  const setMode = (m) => { if (G.setMode) G.setMode(m); else if (MN) MN.state.view.mode = m; };

  /* 剪辑台数据：MN.state.cuttingDesk = { sources:[], timeline:[] }
     source: {id, kind:'image'|'video'|'audio', name, url, dur}
     clip:   {id, sourceId, start, dur, effect:'none'|'fade'|'rotate'}  */
  function desk() {
    if (!MN || !MN.state) return null;
    if (!MN.state.cuttingDesk) MN.state.cuttingDesk = { sources: [], timeline: [] };
    return MN.state.cuttingDesk;
  }

  /* ===================================================================
     一、剪辑台（cut）—— 全屏覆盖：素材区 + 成片轨 + 预览 + 导出
     =================================================================== */
  let cut = null; // 运行时状态
  M.openCut = function () {
    if (!MN || !MN.state) { toast('先画个空间再说'); return; }
    closeAll();
    const d = desk();
    // 默认把镜头册截图灌进素材区（去重：以 url 为键）
    (MN.state.directorShots || []).forEach(s => {
      if (s.image && !d.sources.some(x => x.url === s.image)) d.sources.push({ id: uid(), kind: 'image', name: s.name || '镜头', url: s.image, dur: 3 });
    });
    cut = {
      playing: false, t0: 0, base: 0, t: 0, raf: 0,
      pxPerSec: 90, sel: null, videoEls: {}, audioEls: {}, rec: null, exportBlob: null,
    };
    const body = `
      <div class="mn-cut">
        <div class="mn-cut-main">
          <div class="mn-cut-preview"><canvas id="mnCutCv" width="640" height="360"></canvas>
            <div class="mn-cut-time"><span id="mnCutT">0.0s</span> / <span id="mnCutTot">0.0s</span></div>
            <div class="mn-cut-trans"><button class="mn-ghost" id="mnCutPlay">${icon('play')}播放</button>
              <button class="mn-ghost" id="mnCutSplit">${icon('scissors')}分割 (Ctrl+C)</button>
              <button class="mn-ghost danger" id="mnCutDel">${icon('trash-2')}删除</button></div>
          </div>
          <div class="mn-cut-audio-row"><span class="mn-cut-track-label">成片轨</span><div class="mn-cut-track" id="mnCutTrack"></div></div>
          <div class="mn-cut-audio-row"><span class="mn-cut-track-label">配音轨</span><div class="mn-cut-track audio" id="mnCutAudio"></div></div>
        </div>
        <aside class="mn-cut-side">
          <div class="mn-cut-side-sec">
            <div class="mn-sec-head"><span>素材</span></div>
            <div class="mn-cut-srcs" id="mnCutSrcs"></div>
            <div class="mn-cut-src-acts">
              <button class="mn-ghost" id="mnCutRec">${icon('video')}补录</button>
              <button class="mn-ghost" id="mnCutImp">${icon('upload')}导入</button>
              <button class="mn-ghost" id="mnCutShots">${icon('images')}用镜头册</button>
            </div>
            <input type="file" id="mnCutFile" accept="video/*,audio/*,image/*" multiple hidden />
          </div>
          <div class="mn-cut-side-sec">
            <div class="mn-sec-head"><span>选中片段</span></div>
            <div id="mnCutInspect"><p class="mn-help-para">点时间轴上的片段来选中。</p></div>
          </div>
          <div class="mn-cut-side-sec">
            <div class="mn-sec-head"><span>成片</span></div>
            <button class="mn-btn primary" id="mnCutExport" style="width:100%">${icon('download')}导出成片</button>
            <button class="mn-ghost" id="mnCutSave" style="width:100%;margin-top:6px">${icon('save')}保存到项目</button>
            <p class="mn-help-para" style="margin-top:8px">空格 播放/暂停 · Ctrl+C 在播放头处分割 · 拖片段右缘改长短 · Delete 删除。</p>
          </div>
        </aside>
      </div>`;
    const m = openModal('剪辑台', '导演台', body, [{ label: '完成', primary: true, fn: () => { stopPlay(); saveDesk(); } }], 'wide');
    buildCut(m);
  };

  function buildCut(m) {
    cut.m = m;
    const cv = $('#mnCutCv', m); cut.cv = cv; cut.ctx = cv.getContext('2d');
    renderSrcs(m); renderTrack(m);
    $('#mnCutPlay', m).onclick = () => cut.playing ? pausePlay() : startPlay();
    $('#mnCutSplit', m).onclick = () => splitAtPlayhead();
    $('#mnCutDel', m).onclick = () => delSel();
    $('#mnCutRec', m).onclick = () => recordScreen(m);
    $('#mnCutImp', m).onclick = () => $('#mnCutFile', m).click();
    $('#mnCutShots', m).onclick = () => { const d = desk(); (MN.state.directorShots || []).forEach(s => { if (s.image && !d.sources.some(x => x.url === s.image)) d.sources.push({ id: uid(), kind: 'image', name: s.name || '镜头', url: s.image, dur: 3 }); }); renderSrcs(m); toast('已把镜头册 ' + d.sources.length + ' 个素材加进素材区'); };
    $('#mnCutFile', m).onchange = (e) => importFiles(e.target.files, m);
    $('#mnCutExport', m).onclick = () => exportCut(m);
    $('#mnCutSave', m).onclick = () => { saveDesk(); toast('已存进当前项目（导出/刷新不丢）'); };
    // 点击时间轴空白处移动播放头
    [['#mnCutTrack', 'v'], ['#mnCutAudio', 'a']].forEach(([sel, kind]) => {
      const tr = $(sel, m);
      tr.onclick = (ev) => { if (ev.target === tr) { const r = tr.getBoundingClientRect(); cut.t = clamp((ev.clientX - r.left) / cut.pxPerSec, 0, totalDur()); cut.base = cut.t; cut.t0 = performance.now(); drawPreview(); drawPlayhead(); } };
    });
    window.addEventListener('keydown', cutKey);
    drawPreview(); drawPlayhead();
  }
  function cutKey(e) {
    if (!cut || !cut.m || !$('.mn-modal-back')) return;
    const d = cut.m.ownerDocument || document;
    if (d.querySelector('.mn-modal-back') && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === ' ' && !e.ctrlKey) { e.preventDefault(); cut.playing ? pausePlay() : startPlay(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); splitAtPlayhead(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (cut.sel) { e.preventDefault(); delSel(); } }
  }

  function renderSrcs(m) {
    const box = $('#mnCutSrcs', m); if (!box) return;
    const d = desk();
    box.innerHTML = d.sources.map(s => `<div class="mn-cut-src" data-sid="${s.id}" title="${esc(s.name)}">
        ${s.kind === 'image' ? `<img src="${esc(s.url)}" />` : `<div class="mn-cut-src-ico">${icon(s.kind === 'audio' ? 'music' : 'film')}<small>${esc(s.kind)}</small></div>`}
        <span class="mn-cut-src-name">${esc(s.name)}</span></div>`).join('') || '<p class="mn-help-para">还没有素材。点「补录 / 导入 / 用镜头册」加素材。</p>';
    $$('.mn-cut-src', box).forEach(el => {
      el.onclick = () => addClip(el.dataset.sid);
      el.draggable = false;
      el.onpointerdown = (ev) => { // 拖到时间轴放置
        ev.preventDefault();
        const sid = el.dataset.sid;
        const move = (ex) => { const tr = $('#mnCutTrack', m); const r = tr.getBoundingClientRect(); const st = clamp((ex - r.left) / cut.pxPerSec, 0, totalDur()); return st; };
        const startX = ev.clientX;
        const ghost = document.createElement('div'); ghost.className = 'mn-cut-src'; ghost.innerHTML = el.innerHTML;
        ghost.style.cssText = 'position:fixed;opacity:.7;pointer-events:none;z-index:9999;width:80px';
        document.body.appendChild(ghost);
        const mm = (e2) => { ghost.style.left = (e2.clientX - 40) + 'px'; ghost.style.top = (e2.clientY - 24) + 'px'; };
        const mu = (e2) => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); ghost.remove(); const tr = $('#mnCutTrack', m); const r = tr.getBoundingClientRect(); if (e2.clientY > r.top - 40 && e2.clientY < r.bottom + 40) { const st = clamp((e2.clientX - r.left) / cut.pxPerSec, 0, Math.max(totalDur(), 0.1)); addClip(sid, st); } };
        mm(ev); window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
      };
    });
  }
  function addClip(sourceId, start) {
    const d = desk(); const s = d.sources.find(x => x.id === sourceId); if (!s) return;
    const dur = s.dur || 3;
    if (start == null) { start = totalDur(); } // 默认接到尾巴
    start = clamp(start, 0, Math.max(totalDur() - 0.01, 0));
    const clip = { id: uid(), sourceId, start, dur, effect: 'none' };
    if (s.kind === 'audio') d.timeline.push(clip); else d.timeline.push(clip);
    cut.sel = clip.id; renderTrack(cut.m); renderInspect(cut.m); saveSoon();
    toast('已加片段：' + s.name);
  }
  function renderTrack(m) {
    const d = desk(); const vt = $('#mnCutTrack', m), at = $('#mnCutAudio', m);
    if (!vt) return;
    const tot = Math.max(totalDur(), 4);
    vt.style.width = at.style.width = (tot * cut.pxPerSec) + 'px';
    const vClips = d.timeline.filter(c => (d.sources.find(s => s.id === c.sourceId) || {}).kind !== 'audio');
    const aClips = d.timeline.filter(c => (d.sources.find(s => s.id === c.sourceId) || {}).kind === 'audio');
    vt.innerHTML = vClips.map(c => clipHtml(c, d)).join('') + rulerHtml(tot);
    at.innerHTML = aClips.map(c => clipHtml(c, d, true)).join('') + rulerHtml(tot);
    $$('.mn-cut-clip', vt).concat($$('.mn-cut-clip', at)).forEach(el => bindClip(el, m));
    drawPlayhead();
  }
  function rulerHtml(tot) { let r = '<div class="mn-cut-ruler">'; for (let i = 0; i <= tot; i++) r += `<span style="left:${i * cut.pxPerSec}px">${i}s</span>`; return r + '</div>'; }
  function clipHtml(c, d, isAudio) {
    const s = d.sources.find(x => x.id === c.sourceId) || {};
    const left = c.start * cut.pxPerSec, w = Math.max(c.dur * cut.pxPerSec, 8);
    return `<div class="mn-cut-clip${cut.sel === c.id ? ' sel' : ''}${isAudio ? ' audio' : ''}" data-cid="${c.id}" style="left:${left}px;width:${w}px">
      ${isAudio ? icon('music') : (s.kind === 'image' ? `<img src="${esc(s.url)}" />` : icon('film'))}
      <span class="mn-cut-clip-name">${esc(s.name || '')}</span>
      <span class="mn-cut-clip-eff">${c.effect === 'none' ? '' : (c.effect === 'fade' ? '淡' : '转')}</span>
      <span class="mn-cut-clip-rsz"></span></div>`;
  }
  function bindClip(el, m) {
    const cid = el.dataset.cid; const d = desk(); const c = d.timeline.find(x => x.id === cid); if (!c) return;
    el.onclick = (e) => { e.stopPropagation(); cut.sel = cid; renderTrack(m); renderInspect(m); };
    // 拖动整体移位
    el.onpointerdown = (e) => {
      if (e.target.classList.contains('mn-cut-clip-rsz')) return; // 改长短另算
      e.stopPropagation(); cut.sel = cid; renderTrack(m); renderInspect(m);
      const tr = el.parentElement; const r = tr.getBoundingClientRect(); const ox = e.clientX; const oStart = c.start;
      const mm = (e2) => { const ns = clamp(oStart + (e2.clientX - ox) / cut.pxPerSec, 0, Math.max(totalDur() - c.dur, 0)); c.start = ns; el.style.left = (ns * cut.pxPerSec) + 'px'; };
      const mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); saveSoon(); };
      window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
    };
    const rsz = el.querySelector('.mn-cut-clip-rsz');
    if (rsz) rsz.onpointerdown = (e) => {
      e.stopPropagation(); cut.sel = cid; const ox = e.clientX; const oDur = c.dur;
      const mm = (e2) => { c.dur = clamp(oDur + (e2.clientX - ox) / cut.pxPerSec, 0.3, 600); el.style.width = Math.max(c.dur * cut.pxPerSec, 8) + 'px'; drawPlayhead(); };
      const mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); renderTrack(m); renderInspect(m); saveSoon(); };
      window.addEventListener('pointermove', mm); window.addEventListener('pointerup', mu);
    };
  }
  function renderInspect(m) {
    const box = $('#mnCutInspect', m); if (!box) return; const d = desk(); const c = d.timeline.find(x => x.id === cut.sel);
    if (!c) { box.innerHTML = '<p class="mn-help-para">点时间轴上的片段来选中。</p>'; return; }
    const s = d.sources.find(x => x.id === c.sourceId) || {};
    box.innerHTML = `<p class="mn-help-para"><strong>${esc(s.name || '')}</strong> · ${esc(s.kind)}</p>
      <label class="mn-field"><span>起始 ${c.start.toFixed(1)}s</span><input type="range" id="mnCutCs" min="0" max="${Math.max(totalDur(), 0.1)}" step="0.1" value="${c.start}" /></label>
      <label class="mn-field"><span>长度 ${c.dur.toFixed(1)}s</span><input type="range" id="mnCutCd" min="0.3" max="60" step="0.1" value="${c.dur}" /></label>
      <label class="mn-field"><span>效果</span><select id="mnCutCe"><option value="none"${c.effect === 'none' ? ' selected' : ''}>无</option><option value="fade"${c.effect === 'fade' ? ' selected' : ''}>淡入淡出</option><option value="rotate"${c.effect === 'rotate' ? ' selected' : ''}>手转（晃动）</option></select></label>`;
    $('#mnCutCs', m).oninput = e => { c.start = +e.target.value; renderTrack(m); };
    $('#mnCutCd', m).oninput = e => { c.dur = +e.target.value; renderTrack(m); };
    $('#mnCutCe', m).onchange = e => { c.effect = e.target.value; renderTrack(m); saveSoon(); };
  }
  function totalDur() { const d = desk(); if (!d) return 0; let t = 0; d.timeline.forEach(c => t = Math.max(t, c.start + c.dur)); return t; }
  function drawPlayhead() {
    if (!cut || !cut.m) return; const t = cut.t || 0; const x = t * cut.pxPerSec;
    [['#mnCutTrack', '#mnCutPh'], ['#mnCutAudio', '#mnCutPhA']].forEach(([tr, ph]) => {
      const track = $(tr, cut.m); if (!track) return; let line = $(ph, track); if (!line) { line = document.createElement('div'); line.id = ph.slice(1); line.className = 'mn-cut-ph'; track.appendChild(line); }
      line.style.left = x + 'px';
    });
  }

  function activeVideoClip(t) {
    const d = desk(); let best = null;
    d.timeline.forEach(c => { const s = d.sources.find(x => x.id === c.sourceId) || {}; if (s.kind === 'audio') return; if (t >= c.start && t < c.start + c.dur) best = c; });
    return best;
  }
  function getVideoEl(s) {
    if (cut.videoEls[s.id]) return cut.videoEls[s.id];
    const v = document.createElement('video'); v.src = s.url; v.muted = true; v.playsInline = true; v.preload = 'auto'; cut.videoEls[s.id] = v; return v;
  }
  function drawPreview() {
    if (!cut || !cut.ctx) return; const ctx = cut.ctx, cv = cut.cv; const t = cut.t || 0;
    ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, cv.width, cv.height);
    const d = desk(); const c = activeVideoClip(t);
    if (!c) { ctx.fillStyle = '#5b6472'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('（这里会显示成片预览）', cv.width / 2, cv.height / 2); ctx.textAlign = 'left'; return; }
    const s = d.sources.find(x => x.id === c.sourceId) || {};
    const local = t - c.start;
    ctx.save();
    if (c.effect === 'rotate') { ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(Math.sin(local * 3) * 0.025); ctx.translate(-cv.width / 2, -cv.height / 2); }
    if (s.kind === 'image') {
      const img = new Image(); img.src = s.url; if (img.complete && img.naturalWidth) drawCover(ctx, img, cv.width, cv.height);
      else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, cv.width, cv.height); }
    } else if (s.kind === 'video') {
      const v = getVideoEl(s); if (v.readyState >= 2) drawCover(ctx, v, cv.width, cv.height); else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, cv.width, cv.height); }
    }
    if (c.effect === 'fade') {
      const fin = Math.min(local / 0.3, 1), fout = Math.min((c.dur - local) / 0.3, 1); const a = Math.min(fin, fout, 1);
      ctx.globalAlpha = 1 - a; ctx.fillStyle = '#0c0e13'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1;
    }
    ctx.restore();
    $('#mnCutT') && ($('#mnCutT').textContent = t.toFixed(1) + 's');
  }
  function drawCover(ctx, img, W, H) {
    const ir = img.naturalWidth / img.naturalHeight || img.width / img.height || 1; const tr = W / H;
    let sw, sh, sx, sy;
    if (ir > tr) { sh = img.naturalHeight; sw = sh * tr; sx = (img.naturalWidth - sw) / 2; sy = 0; } else { sw = img.naturalWidth; sh = sw / tr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }

  function startPlay() {
    if (cut.playing) return; const tot = totalDur(); if (tot <= 0) { toast('时间轴还是空的，先加点素材'); return; }
    cut.playing = true; cut.t0 = performance.now(); cut.base = (cut.t || 0); if (cut.base >= tot) { cut.base = 0; cut.t = 0; }
    $('#mnCutPlay') && ($('#mnCutPlay').innerHTML = icon('pause') + '暂停');
    loop();
  }
  function pausePlay() {
    cut.playing = false; if (cut.raf) cancelAnimationFrame(cut.raf); cut.raf = 0;
    Object.values(cut.videoEls).forEach(v => { try { v.pause(); } catch (e) { } });
    Object.values(cut.audioEls).forEach(v => { try { v.pause(); } catch (e) { } });
    $('#mnCutPlay') && ($('#mnCutPlay').innerHTML = icon('play') + '播放');
  }
  function stopPlay() { pausePlay(); if (cut) cut.t = cut.base || 0; drawPreview(); drawPlayhead(); }
  function loop() {
    if (!cut.playing) return;
    const tot = totalDur(); const now = performance.now(); cut.t = cut.base + (now - cut.t0) / 1000;
    if (cut.t >= tot) { cut.t = tot; drawPreview(); drawPlayhead(); pausePlay(); return; }
    // 视频片段播放 / 暂停
    const d = desk(); const active = activeVideoClip(cut.t);
    d.timeline.forEach(c => { const s = d.sources.find(x => x.id === c.sourceId) || {}; if (s.kind === 'video') { const v = getVideoEl(s); if (c === active) { if (v.paused) { try { v.currentTime = cut.t - c.start; v.play().catch(() => { }); } catch (e) { } } } else if (!v.paused) v.pause(); } });
    // 音频片段
    d.timeline.forEach(c => { const s = d.sources.find(x => x.id === c.sourceId) || {}; if (s.kind !== 'audio') return; let a = cut.audioEls[s.id]; if (!a) { a = new Audio(s.url); a.preload = 'auto'; cut.audioEls[s.id] = a; } const on = (cut.t >= c.start && cut.t < c.start + c.dur); if (on && a.paused) { try { a.currentTime = cut.t - c.start; a.play().catch(() => { }); } catch (e) { } } else if (!on && !a.paused) a.pause(); });
    drawPreview(); drawPlayhead(); cut.raf = requestAnimationFrame(loop);
  }
  function splitAtPlayhead() {
    if (!cut.sel) { toast('先选中要分割的片段'); return; } const d = desk(); const c = d.timeline.find(x => x.id === cut.sel); if (!c) return;
    const t = cut.t || 0; if (t <= c.start + 0.2 || t >= c.start + c.dur - 0.2) { toast('播放头要落在片段中间'); return; }
    const second = { id: uid(), sourceId: c.sourceId, start: t, dur: (c.start + c.dur) - t, effect: c.effect };
    c.dur = t - c.start; d.timeline.push(second); cut.sel = second.id; renderTrack(cut.m); renderInspect(cut.m); saveSoon(); toast('已分割');
  }
  function delSel() {
    if (!cut.sel) { toast('先选中要删的片段'); return; } const d = desk(); const i = d.timeline.findIndex(x => x.id === cut.sel); if (i < 0) return;
    d.timeline.splice(i, 1); cut.sel = null; renderTrack(cut.m); renderInspect(cut.m); saveSoon(); toast('已删除片段');
  }
  function saveDesk() { if (MN && MN.state) { MN.state.cuttingDesk = desk(); saveSoon(); } }

  function recordScreen(m) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { toast('当前环境不支持录屏（需在真实浏览器点「补录」）'); return; }
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }).then(stream => {
      const rec = new MediaRecorder(stream); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); const blob = new Blob(chunks, { type: 'video/webm' }); const url = URL.createObjectURL(blob); const d = desk(); const sid = uid(); d.sources.push({ id: sid, kind: 'video', name: '录屏 ' + (d.sources.length + 1), url, dur: Math.max(1, (blob.size > 0 ? (chunks.length ? 0 : 0) : 3)) }); const v = document.createElement('video'); v.src = url; v.onloadedmetadata = () => { const c = d.sources.find(x => x.id === sid); if (c) c.dur = isFinite(v.duration) ? v.duration : 3; renderSrcs(m); }; renderSrcs(m); toast('录屏已加入素材区'); };
      rec.start(); const stopBtn = $('#mnCutRec', m); stopBtn.textContent = '停止录制'; stopBtn.onclick = () => { if (rec.state !== 'inactive') rec.stop(); stopBtn.textContent = '补录'; stopBtn.onclick = () => recordScreen(m); stream.getVideoTracks()[0].addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop(); }); };
    }).catch(() => toast('没选到共享窗口，录屏取消'));
  }
  function importFiles(files, m) {
    const d = desk(); Array.from(files).forEach(f => {
      const url = URL.createObjectURL(f); const kind = f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : 'image';
      const sid = uid(); const src = { id: sid, kind, name: f.name.replace(/\.[^.]+$/, ''), url, dur: kind === 'image' ? 3 : 4 }; d.sources.push(src);
      if (kind !== 'image') { const probe = kind === 'video' ? document.createElement('video') : new Audio(); probe.src = url; probe.onloadedmetadata = () => { src.dur = isFinite(probe.duration) ? probe.duration : 4; renderSrcs(m); }; }
    });
    renderSrcs(m); toast('已导入 ' + files.length + ' 个素材');
  }
  function exportCut(m) {
    const tot = totalDur(); if (tot <= 0) { toast('时间轴是空的，没东西可导'); return; }
    const cv = cut.cv; let done = false;
    const finish = (blob, type) => { done = true; cut.exportBlob = { type, size: blob.size, url: URL.createObjectURL(blob) }; downloadBlob(blob, (MN.state.scene.title || '成片') + '.webm'); toast('已导出成片（' + (blob.size / 1024 | 0) + ' KB）'); };
    try {
      if (typeof MediaRecorder === 'undefined' || !cv.captureStream) throw new Error('no-rec');
      const stream = cv.captureStream(30);
      // 混入音频
      let audioCtx = null, dest = null; const aEls = [];
      desk().timeline.forEach(c => { const s = desk().sources.find(x => x.id === c.sourceId) || {}; if (s.kind === 'audio') { const a = new Audio(s.url); a.crossOrigin = 'anonymous'; aEls.push(a); } });
      if (aEls.length && window.AudioContext) { audioCtx = new AudioContext(); dest = audioCtx.createMediaStreamDestination(); aEls.forEach(a => { try { audioCtx.createMediaElementSource(a).connect(dest); } catch (e) { } }); const at = dest.stream.getAudioTracks(); at.forEach(t => stream.addTrack(t)); }
      const rec = new MediaRecorder(stream, { mimeType: pickMime() });
      const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { aEls.forEach(a => { try { a.pause(); } catch (e) { } }); finish(new Blob(chunks, { type: rec.mimeType || 'video/webm' }), 'video/webm'); };
      rec.start();
      // 实时跑一遍预览（独立帧循环，不调用 loop 以免重复排程）
      pausePlay(); cut.playing = true; cut.t0 = performance.now(); cut.base = 0; cut.t = 0; const exportDur = Math.max(tot, 1);
      const expLoop = () => {
        if (!cut.playing) return; const now = performance.now(); cut.t = (now - cut.t0) / 1000;
        if (cut.t >= exportDur) { cut.t = exportDur; drawPreview(); drawPlayhead(); cut.playing = false; setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 120); return; }
        drawPreview(); drawPlayhead(); requestAnimationFrame(expLoop);
      };
      requestAnimationFrame(expLoop);
      toast('正在导出成片（实时录制 ' + exportDur.toFixed(1) + 's）…');
    } catch (e) {
      // 兜底：导出当前帧海报图
      const url = cv.toDataURL('image/png'); const blob = dataURLtoBlob(url); finish(blob, 'image/png');
    }
  }
  function pickMime() { const c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']; for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ''; }
  function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); }
  function dataURLtoBlob(u) { const p = u.split(','), t = p[0].match(/:(.*?);/)[1], bin = atob(p[1]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: t }); }
  M._cutDebug = () => ({ sources: desk() ? desk().sources.length : 0, timeline: desk() ? desk().timeline.length : 0, dur: totalDur(), playing: !!(cut && cut.playing), exportSize: cut && cut.exportBlob ? cut.exportBlob.size : 0 });

  /* ===================================================================
     二、运镜录制（motion）—— 记录 3D 相机路径，回放成运镜，导出视频
     =================================================================== */
  let mot = null;
  M.openMotion = function () {
    if (!window.MN3D) { toast('3D 引擎没加载'); return; }
    if (!MN3D.ok) { toast('当前环境不支持 WebGL，先去 3D 视图'); return; }
    if (MN.state.view.mode !== '3d') setMode('3d');
    closeAll();
    if (!MN.state.cameraPath) MN.state.cameraPath = { keyframes: [], duration: 0 };
    mot = { rec: false, t0: 0, playing: false, raf: 0, panel: null };
    const p = document.createElement('div'); p.className = 'mn-motion-panel'; p.innerHTML = `
      <div class="mn-motion-head">${icon('clapperboard')} 运镜录制 <button class="mn-modal-x" id="mnMotX">${icon('x')}</button></div>
      <p class="mn-help-para">在左边 3D 视图里拖动转视角、滚轮缩放。点「开始录制」记录镜头路径，松手停。</p>
      <div class="mn-motion-btns">
        <button class="mn-btn primary" id="mnMotRec">${icon('circle')}开始录制</button>
        <button class="mn-btn" id="mnMotPlay">${icon('play')}回放</button>
        <button class="mn-btn" id="mnMotExport">${icon('download')}导出视频</button>
        <button class="mn-ghost danger" id="mnMotClear">${icon('trash-2')}清空</button>
      </div>
      <div class="mn-motion-stat" id="mnMotStat">关键帧：0 · 时长：0.0s</div>`;
    $('#mnRoot').appendChild(p); mot.panel = p;
    $('#mnMotX', p).onclick = () => closeMotion();
    $('#mnMotRec', p).onclick = () => toggleMotRec(p);
    $('#mnMotPlay', p).onclick = () => playMotion(p);
    $('#mnMotExport', p).onclick = () => exportMotion(p);
    $('#mnMotClear', p).onclick = () => { MN.state.cameraPath = { keyframes: [], duration: 0 }; saveSoon(); updateMotStat(p); toast('已清空运镜'); };
    updateMotStat(p);
  };
  function updateMotStat(p) { const cp = MN.state.cameraPath || { keyframes: [] }; $('#mnMotStat', p).textContent = '关键帧：' + cp.keyframes.length + ' · 时长：' + (cp.duration || 0).toFixed(1) + 's'; }
  function toggleMotRec(p) {
    const cp = MN.state.cameraPath; if (mot.rec) { mot.rec = false; const c = MN3D.getCamera(); cp.keyframes.push({ cam: c, t: (performance.now() - mot.t0) / 1000 }); cp.duration = cp.keyframes[cp.keyframes.length - 1].t; saveSoon(); updateMotStat(p); $('#mnMotRec', p).innerHTML = icon('circle') + '开始录制'; toast('已停，记录了 ' + cp.keyframes.length + ' 个关键帧'); return; }
    if (!cp.keyframes.length) mot.t0 = performance.now(); else mot.t0 = performance.now() - cp.duration * 1000;
    mot.rec = true; $('#mnMotRec', p).innerHTML = icon('square') + '停止录制'; toast('录制中：拖动 3D 视图转镜头…');
    const tick = () => { if (!mot.rec) return; const c = MN3D.getCamera(); const t = (performance.now() - mot.t0) / 1000; // 只在相机变化时落关键帧
      const last = cp.keyframes[cp.keyframes.length - 1]; if (!last || camDist(last.cam, c) > 0.02) { cp.keyframes.push({ cam: c, t }); cp.duration = t; updateMotStat(p); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function camDist(a, b) { if (!a || !b) return 9; const k = ['theta', 'phi', 'r', 'tx', 'ty', 'tz']; let s = 0; k.forEach(x => { s += (a[x] - b[x]) * (a[x] - b[x]); }); return Math.sqrt(s); }
  function playMotion(p) {
    const cp = MN.state.cameraPath; if (!cp.keyframes.length) { toast('还没有运镜，先录制'); return; }
    if (mot.playing) { mot.playing = false; if (mot.raf) cancelAnimationFrame(mot.raf); return; }
    mot.playing = true; mot.t0 = performance.now(); $('#mnMotPlay', p).innerHTML = icon('pause') + '停止';
    const step = () => { if (!mot.playing) return; const t = ((performance.now() - mot.t0) / 1000) % (cp.duration || 1); const cam = interpCam(cp, t); MN3D.setCamera(cam); MN3D.render(MN.state); mot.raf = requestAnimationFrame(step); };
    step();
  }
  function interpCam(cp, t) {
    const ks = cp.keyframes; if (ks.length === 1) return ks[0].cam;
    let a = ks[0], b = ks[ks.length - 1]; for (let i = 0; i < ks.length - 1; i++) { if (t >= ks[i].t && t <= ks[i + 1].t) { a = ks[i]; b = ks[i + 1]; break; } }
    const span = (b.t - a.t) || 1; const f = (t - a.t) / span; const c = {}; ['theta', 'phi', 'r', 'tx', 'ty', 'tz'].forEach(x => c[x] = (a.cam[x] || 0) + ((b.cam[x] || 0) - (a.cam[x] || 0)) * f); return c;
  }
  function exportMotion(p) {
    const cp = MN.state.cameraPath; if (!cp.keyframes.length) { toast('还没有运镜，先录制'); return; }
    const cv = $('#mn3d'); if (!cv || !cv.captureStream) { toast('当前画布不支持导出视频'); return; }
    try {
      const stream = cv.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: pickMime() }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' }); downloadBlob(blob, '运镜.webm'); mot.exportBlob = blob.size; toast('已导出运镜视频（' + (blob.size / 1024 | 0) + ' KB）'); };
      rec.start(); mot.playing = true; mot.t0 = performance.now();
      const step = () => { if (!mot.playing) return; const t = ((performance.now() - mot.t0) / 1000) % (cp.duration || 1); const cam = interpCam(cp, t); MN3D.setCamera(cam); MN3D.render(MN.state); if ((performance.now() - mot.t0) / 1000 >= cp.duration) { setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 120); mot.playing = false; } else mot.raf = requestAnimationFrame(step); };
      step(); toast('正在导出运镜（实时录制 ' + (cp.duration || 0).toFixed(1) + 's）…');
    } catch (e) { toast('导出失败：' + e.message); }
  }
  function closeMotion() { if (mot && mot.playing) { mot.playing = false; if (mot.raf) cancelAnimationFrame(mot.raf); } if (mot && mot.panel) mot.panel.remove(); mot = null; }
  M._motDebug = () => ({ kf: MN.state.cameraPath ? MN.state.cameraPath.keyframes.length : 0, dur: MN.state.cameraPath ? (MN.state.cameraPath.duration || 0) : 0, exportSize: mot && mot.exportBlob ? mot.exportBlob : 0 });

  /* ===================================================================
     三、仙人模式（genie）—— 超威！一键搞怪操作
     =================================================================== */
  M.openGenie = function () {
    if (!MN || !MN.state) { toast('先画个空间'); return; }
    closeAll();
    const body = `<p class="mn-help-para">仙人模式：我超威！几个按钮，把场景玩出花。</p>
      <div class="mn-genie-grid">
        <button class="mn-genie-btn" id="mnGJump">${icon('person-standing')}<span>全员蹦迪</span></button>
        <button class="mn-genie-btn" id="mnGColor">${icon('palette')}<span>一键换色</span></button>
        <button class="mn-genie-btn" id="mnGReveal">${icon('eye')}<span>显示全部</span></button>
        <button class="mn-genie-btn" id="mnGConfetti">${icon('sparkles')}<span>撒花</span></button>
        <button class="mn-genie-btn" id="mnGBig">${icon('maximize')}<span>全员放大</span></button>
        <button class="mn-genie-btn" id="mnGReset">${icon('rotate-ccw')}<span>收工复位</span></button>
      </div>
      <p class="mn-help-para" style="margin-top:10px">所有改动直接写进当前画布，可撤销（Ctrl+Z）。</p>`;
    const m = openModal('仙人模式', '导演台', body, [{ label: '收工', primary: true }], 'wide');
    $('#mnGJump', m).onclick = () => genieJump();
    $('#mnGColor', m).onclick = () => genieColor();
    $('#mnGReveal', m).onclick = () => genieReveal();
    $('#mnGConfetti', m).onclick = () => genieConfetti();
    $('#mnGBig', m).onclick = () => genieBig();
    $('#mnGReset', m).onclick = () => genieReset();
  };
  function snap() { if (G.pushUndo) G.pushUndo(); }
  function genieJump() {
    snap(); MN.state.scene.persons.forEach(p => { p.jump = 1; }); saveSoon(); renderAll(); toast('全员蹦迪！（跳一下）');
    setTimeout(() => { MN.state.scene.persons.forEach(p => p.jump = 0); renderAll(); }, 600);
  }
  function genieColor() {
    snap(); const P = ['#e1453e', '#3c6e9e', '#5b8c5a', '#d4a5a5', '#c9b8d4', '#d9b382', '#7d8ca3', '#c98d6b', '#8a9b8e', '#f5b301'];
    let i = 0; MN.state.scene.rooms.forEach(o => { o.color = P[(i++) % P.length]; }); MN.state.scene.props.forEach(o => { o.color = P[(i++) % P.length]; }); MN.state.scene.persons.forEach(o => { o.color = P[(i++) % P.length]; });
    saveSoon(); renderAll(); render3D(); toast('一键换色，整间屋子活了');
  }
  function genieReveal() { snap(); MN.state.scene.rooms.forEach(o => o.hidden = false); MN.state.scene.walls.forEach(o => o.hidden = false); MN.state.scene.props.forEach(o => o.hidden = false); MN.state.scene.persons.forEach(o => o.hidden = false); saveSoon(); renderAll(); render3D(); toast('藏起来的都给你翻出来了'); }
  function genieBig() { snap(); MN.state.scene.persons.forEach(p => { p.h = (p.h || 1.8) * 1.6; }); MN.state.scene.props.forEach(p => { p.h = (p.h || 1) * 1.4; }); saveSoon(); renderAll(); render3D(); toast('全员放大，压迫感拉满'); }
  function genieReset() { snap(); MN.state.scene.persons.forEach(p => { p.jump = 0; p.h = 1.8; }); MN.state.scene.rooms.forEach(o => o.color = ''); MN.state.scene.props.forEach(o => o.color = ''); saveSoon(); renderAll(); render3D(); toast('收工，复位'); }
  function genieConfetti() {
    const root = $('#mnRoot'); if (!root) return; const cv = document.createElement('canvas'); cv.className = 'mn-confetti'; const r = root.getBoundingClientRect(); cv.width = r.width; cv.height = r.height; cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:50'; root.appendChild(cv);
    const ctx = cv.getContext('2d'); const cols = ['#e1453e', '#3c6e9e', '#5b8c5a', '#f5b301', '#c98d6b', '#c9b8d4']; const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, v: 2 + Math.random() * 4, s: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6 }));
    let n = 0; const tick = () => { ctx.clearRect(0, 0, cv.width, cv.height); ps.forEach(p => { p.y += p.v; p.x += Math.sin(p.y / 30) * 1.2; if (p.y > cv.height + 20) { p.y = -20; p.x = Math.random() * cv.width; } ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s * 0.6); }); n++; if (n < 150) requestAnimationFrame(tick); else cv.remove(); };
    tick(); toast('撒花！🎉');
  }

  /* ---------- 通用 ---------- */
  function closeAll() { closeModal(); if (cut) { stopPlay(); window.removeEventListener('keydown', cutKey); cut = null; } if (mot) closeMotion(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function icon(name, cls) { return G.icon ? G.icon(name, cls) : ''; }
  function openModal(t, e, b, f, w) { return G.openModal ? G.openModal(t, e, b, f, w) : (function () { const m = document.createElement('div'); m.className = 'mn-modal'; m.innerHTML = '<div class="mn-modal-body">' + b + '</div>'; $('#mnRoot').appendChild(m); return m; })(); }
  function closeModal() { if (G.closeModal) G.closeModal(); }
  function renderAll() { if (G.renderAll) G.renderAll(); }
})();
