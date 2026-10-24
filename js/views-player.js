/* ============================================================
 * 白日梦导演台 · 动态分镜（文生动画预演） + 剪辑台
 * ============================================================ */
import { TRANSITIONS, SHOT_SIZES, CAMERA_MOVES } from './data.js';
import { WhiteModelRenderer, imageTransformFor } from './cameraSim.js';
import { moveByKey, buildPrompt } from './breakdown.js';
import { esc, el, toast, confirmDlg, fmtDur, opts } from './ui.js';

let store;
export function initViewsPlayer(s) { store = s; }

/* ============================================================
 * 动态分镜播放器
 * 逐镜连播：有参考图 → Ken Burns 运镜；无图 → 白模实时渲染
 * 带 台词字幕 / 转场 / 镜头信息 HUD / 播放控制
 * ============================================================ */
export function renderAnimatic(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }
  if (!p.shots.length) { container.innerHTML = `<div class="empty-tip">分镜板是空的，先去拆分镜</div>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <h2>🌟 动态分镜 <span class="dim">· 整片连播预演 · ${p.shots.length} 镜 · ${fmtDur(store.totalDuration(p))}</span></h2>
    </div>
    <div class="animatic-layout">
      <div class="animatic-stage-wrap card">
        <div class="animatic-stage aspect-${p.aspect.replace(':', 'x')}" id="anStage">
          <canvas id="anCanvas"></canvas>
          <img id="anImg" style="display:none">
          <div class="an-hud" id="anHud"></div>
          <div class="an-subtitle" id="anSubtitle"></div>
          <div class="an-progress" id="anProgress"></div>
          <div class="an-endcard" id="anEndcard" style="display:none">
            <div class="an-endcard-title">🎬 全片完</div>
            <div class="an-endcard-sub" id="anEndSub"></div>
          </div>
        </div>
        <div class="animatic-controls">
          <button class="btn btn-ghost btn-sm" id="anPrev" title="上一镜">⏮</button>
          <button class="btn btn-primary" id="anPlay">▶ 播放</button>
          <button class="btn btn-ghost btn-sm" id="anNext" title="下一镜">⏭</button>
          <div class="an-time dim" id="anTime">0.0s / 0.0s</div>
          <div class="spacer"></div>
          <label class="dim">倍速</label>
          <select id="anSpeed" class="input input-sm">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option>
          </select>
          <button class="btn btn-ghost btn-sm" id="anLoop">🔁 循环: 关</button>
          <button class="btn btn-ghost btn-sm" id="anSkipImg" title="忽略参考图，全部用白模播放">🧊 白模模式: 关</button>
        </div>
      </div>
      <div class="animatic-side card">
        <div class="card-title">镜头队列</div>
        <div class="an-shotlist" id="anShotList"></div>
      </div>
    </div>`;

  const canvas = container.querySelector('#anCanvas');
  const imgEl = container.querySelector('#anImg');
  const hud = container.querySelector('#anHud');
  const subtitle = container.querySelector('#anSubtitle');
  const progressEl = container.querySelector('#anProgress');
  const endcard = container.querySelector('#anEndcard');
  const playBtn = container.querySelector('#anPlay');
  const timeEl = container.querySelector('#anTime');
  const shotList = container.querySelector('#anShotList');

  const renderer = new WhiteModelRenderer(canvas);
  let shotIdx = 0, shotT = 0, playing = false, loopOn = false, whiteOnly = false;
  let lastTs = 0, rafId = null, curImg = null, curImgKey = null;
  let transitionAlpha = 0; // 转场叠加
  const images = new Map(); // key → HTMLImageElement

  const totalDur = store.totalDuration(p);

  /* 进度条分段 */
  progressEl.innerHTML = p.shots.map((s, i) =>
    `<div class="an-seg" data-i="${i}" style="flex:${s.duration}"></div>`).join('');
  progressEl.querySelectorAll('.an-seg').forEach(seg => seg.onclick = () => {
    seekTo(+seg.dataset.i, 0);
    if (!playing) renderFrame();
  });

  /* 侧边镜头列表 */
  const renderShotList = () => {
    shotList.innerHTML = p.shots.map((s, i) => `
      <div class="an-shot-item ${i === shotIdx ? 'on' : ''}" data-i="${i}">
        <span class="an-shot-idx">${i + 1}</span>
        <div class="an-shot-info">
          <div class="an-shot-desc">${esc((s.desc || '（未描述）').slice(0, 40))}</div>
          <div class="an-shot-meta">${esc(moveByKey[s.cameraMove]?.name || '')} · ${esc(SHOT_SIZES.find(x => x.key === s.shotSize)?.name)} · ${s.duration}s</div>
        </div>
      </div>`).join('');
    shotList.querySelectorAll('.an-shot-item').forEach(it => it.onclick = () => { seekTo(+it.dataset.i, 0); if (!playing) renderFrame(); });
    shotList.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };

  const ensureImage = async (key) => {
    if (!key || whiteOnly) return null;
    if (images.has(key)) return images.get(key);
    const blob = await store.getImage(key);
    if (!blob) return null;
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { images.set(key, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });
  };

  function seekTo(idx, t) {
    shotIdx = Math.max(0, Math.min(p.shots.length - 1, idx));
    shotT = t;
    transitionAlpha = idx > 0 ? 1 : 0;
    const s = p.shots[shotIdx];
    const key = s.image || s.sketch; ensureImage(key).then(img => { curImg = img; curImgKey = key; });
    renderShotList();
    updateHUD();
  }

  function updateHUD() {
    const s = p.shots[shotIdx];
    const mv = moveByKey[s.cameraMove];
    hud.innerHTML = `<span class="an-hud-chip">镜 ${shotIdx + 1}/${p.shots.length}</span>
      <span class="an-hud-chip">${esc(SHOT_SIZES.find(x => x.key === s.shotSize)?.name || '')}</span>
      <span class="an-hud-chip">${esc(mv?.name || '')}</span>`;
    subtitle.textContent = s.dialogue || '';
    subtitle.style.display = s.dialogue ? '' : 'none';
  }

  function renderFrame() {
    const s = p.shots[shotIdx];
    const mv = moveByKey[s.cameraMove] || moveByKey.static;
    const t = shotT;
    const wantKey = s.image || s.sketch;
    const useImg = curImg && curImgKey === wantKey && !whiteOnly;
    if (useImg) {
      canvas.style.display = 'none';
      imgEl.style.display = '';
      imgEl.src = curImg.src;
      const tf = imageTransformFor(mv.sim, t);
      imgEl.style.transform = `translate(${tf.dx * 100}%, ${tf.dy * 100}%) rotate(${tf.rot}rad) scale(${tf.scale})`;
    } else {
      canvas.style.display = '';
      imgEl.style.display = 'none';
      if (s.scene?.floor) renderer.setTheme({ ground: s.scene.floor });
      renderer.render(mv.sim, t, 'stand', { duration: s.duration, hud: false, letterbox: true, angle: s.angle, moveSpeed: s.moveSpeed, size: s.shotSize, scene: s.scene });
    }
    /* 转场淡入 */
    if (transitionAlpha > 0.001) {
      const kind = p.shots[Math.max(0, shotIdx - 1)]?.transition || 'cut';
      const overlay = container.querySelector('#anStage');
      let color = 'rgba(5,7,13,', a = transitionAlpha;
      if (kind === 'white') color = 'rgba(245,246,250,';
      if (kind === 'cut') a = 0;
      overlay.style.boxShadow = 'none';
      overlay.style.setProperty('--tfade', color + (a * 0.9).toFixed(3) + ')');
      overlay.classList.toggle('fading', a > 0.001 && kind !== 'cut');
      if (kind === 'dissolve') overlay.style.setProperty('--tfade', color + (a * 0.55).toFixed(3) + ')');
    } else {
      container.querySelector('#anStage').classList.remove('fading');
    }
    /* 进度高亮 */
    progressEl.querySelectorAll('.an-seg').forEach((seg, i) => {
      const on = i < shotIdx || (i === shotIdx);
      seg.classList.toggle('done', i < shotIdx);
      seg.classList.toggle('cur', i === shotIdx);
    });
    const elapsed = p.shots.slice(0, shotIdx).reduce((a, x) => a + +x.duration, 0) + shotT * s.duration;
    timeEl.textContent = `${elapsed.toFixed(1)}s / ${totalDur.toFixed(1)}s`;
  }

  function tick(ts) {
    rafId = null;
    if (!playing) return;
    const speed = +container.querySelector('#anSpeed').value;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) * speed : 0;
    lastTs = ts;
    const s = p.shots[shotIdx];
    shotT += dt / s.duration;
    transitionAlpha = Math.max(0, transitionAlpha - dt * 2.2);
    if (shotT >= 1) {
      shotT = 0;
      if (shotIdx >= p.shots.length - 1) {
        if (loopOn) { seekTo(0, 0); }
        else {
          playing = false;
          endcard.style.display = '';
          container.querySelector('#anEndSub').textContent = `${p.shots.length} 镜 · ${fmtDur(totalDur)} · ${esc(p.name)}`;
          playBtn.textContent = '▶ 播放';
          store.unlock('animatic');
          store.addXP(4, '看完动态分镜');
          renderFrame();
          return;
        }
      } else {
        seekTo(shotIdx + 1, 0);
      }
    }
    renderFrame();
    rafId = requestAnimationFrame(tick);
  }

  const start = () => {
    if (endcard.style.display === '') { seekTo(0, 0); endcard.style.display = 'none'; }
    endcard.style.display = 'none';
    playing = true; lastTs = 0;
    playBtn.textContent = '⏸ 暂停';
    store.achv.counts.previews++;
    store.persistAchv();
    store.unlock('animatic');
    if (!rafId) rafId = requestAnimationFrame(tick);
  };
  const pause = () => { playing = false; playBtn.textContent = '▶ 播放'; };
  playBtn.onclick = () => playing ? pause() : start();
  container.querySelector('#anPrev').onclick = () => { seekTo(shotIdx - 1, 0); if (playing) lastTs = 0; renderFrame(); };
  container.querySelector('#anNext').onclick = () => { seekTo(shotIdx + 1, 0); if (playing) lastTs = 0; renderFrame(); };
  container.querySelector('#anLoop').onclick = e => { loopOn = !loopOn; e.currentTarget.textContent = `🔁 循环: ${loopOn ? '开' : '关'}`; };
  container.querySelector('#anSkipImg').onclick = e => {
    whiteOnly = !whiteOnly;
    e.currentTarget.textContent = `🧊 白模模式: ${whiteOnly ? '开' : '关'}`;
    renderFrame();
  };
  container.querySelector('#anSpeed').onchange = () => { lastTs = 0; };

  seekTo(0, 0);
  renderFrame();
  start();

  return () => { playing = false; if (rafId) cancelAnimationFrame(rafId); };
}

/* ============================================================
 * 剪辑台（时间线）
 * ============================================================ */
export function renderEditor(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }

  const sizeColor = { ELS: '#8fb7f5', LS: '#7ec8f5', MS: '#7ef5d7', MCU: '#f5d76e', CU: '#f5a6c8', ECU: '#f58f7e' };

  container.innerHTML = `
    <div class="page-head">
      <h2>🎚️ 剪辑台 <span class="dim">· 拖拽排序 · 调时长 · 设转场</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="edPlay">▶ 从头播放</button>
      </div>
    </div>
    <div class="card editor-stats">
      <div><b id="esShots">${p.shots.length}</b><span>镜头</span></div>
      <div><b id="esDur">${store.totalDuration(p).toFixed(1)}s</b><span>总时长</span></div>
      <div><b id="esAvg">${p.shots.length ? (store.totalDuration(p) / p.shots.length).toFixed(1) : 0}s</b><span>平均镜长</span></div>
      <div><b id="esDialogues">${p.shots.filter(s => s.dialogue).length}</b><span>台词镜</span></div>
      <div class="editor-pace-tip dim" id="esPace"></div>
    </div>
    <div class="timeline-wrap card" id="tlWrap">
      <div class="timeline-ruler" id="tlRuler"></div>
      <div class="timeline" id="tlBody"></div>
    </div>
    <div class="card editor-hint dim">
      💡 拖动色块换顺序 · 点色块改时长/运镜/转场 · 短剧单集 60~90 秒最稳，单个镜头别超过 8 秒
    </div>`;

  const tlBody = container.querySelector('#tlBody');
  const ruler = container.querySelector('#tlRuler');

  const renderRuler = () => {
    const total = store.totalDuration(p);
    const step = total > 60 ? 10 : 5;
    let html = '';
    for (let s = 0; s <= total; s += step) {
      html += `<div class="ruler-tick" style="left:${(s / Math.max(total, 1)) * 100}%">${s}s</div>`;
    }
    ruler.innerHTML = html;
  };

  let dragIdx = null;
  const renderTimeline = () => {
    tlBody.innerHTML = '';
    p.shots.forEach((s, i) => {
      const mv = moveByKey[s.cameraMove] || moveByKey.static;
      const block = el(`<div class="tl-block" draggable="true" data-idx="${i}" style="flex:${Math.max(s.duration, 0.4)}">
        <div class="tl-color" style="background:${sizeColor[s.shotSize] || '#7ec8f5'}"></div>
        <div class="tl-idx">${i + 1}</div>
        <div class="tl-name">${esc(mv.name)}</div>
        <div class="tl-dur">${s.duration}s</div>
        ${s.dialogue ? '<div class="tl-dlg">💬</div>' : ''}
        ${i < p.shots.length - 1 ? `<div class="tl-trans" title="转场">${TRANSITIONS.find(t => t.key === s.transition)?.icon || '✂'}</div>` : ''}
      </div>`);
      block.addEventListener('dragstart', e => { dragIdx = i; block.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      block.addEventListener('dragend', () => { block.classList.remove('dragging'); tlBody.querySelectorAll('.tl-block').forEach(b => b.classList.remove('drag-over')); });
      block.addEventListener('dragover', e => {
        e.preventDefault();
        tlBody.querySelectorAll('.tl-block').forEach(b => b.classList.remove('drag-over'));
        if (dragIdx !== null && +block.dataset.idx !== dragIdx) block.classList.add('drag-over');
      });
      block.addEventListener('drop', e => {
        e.preventDefault();
        if (dragIdx === null) return;
        const to = +block.dataset.idx;
        if (to !== dragIdx) { store.moveShot(dragIdx, to); store.addXP(1); }
        dragIdx = null;
      });
      block.addEventListener('click', () => openBlockEditor(s, i));
      tlBody.appendChild(block);
    });
    if (!p.shots.length) tlBody.innerHTML = '<div class="empty-tip">没有镜头</div>';
    renderRuler();
    updateStats();
  };

  const updateStats = () => {
    container.querySelector('#esShots').textContent = p.shots.length;
    const total = store.totalDuration(p);
    container.querySelector('#esDur').textContent = total.toFixed(1) + 's';
    container.querySelector('#esAvg').textContent = (p.shots.length ? total / p.shots.length : 0).toFixed(1) + 's';
    container.querySelector('#esDialogues').textContent = p.shots.filter(s => s.dialogue).length;
    const pace = container.querySelector('#esPace');
    if (!p.shots.length) pace.textContent = '';
    else if (total > 120) pace.textContent = '⏳ 超过 2 分钟，短视频平台建议压缩到 90 秒内';
    else if (total < 20) pace.textContent = '⚡ 不到 20 秒，看看是否缺镜头';
    else pace.textContent = '✅ 时长节奏健康';
  };

  /* 时间线块编辑（内联小弹窗） */
  function openBlockEditor(s, i) {
    import('./ui.js').then(({ modal }) => {
      const m = modal({
        title: `第 ${i + 1} 镜 · 剪辑属性`,
        body: `
          <div class="form-row"><label>时长（秒）</label><input id="beDur" class="input" type="number" min="1" max="20" step="0.5" value="${s.duration}"></div>
          <div class="form-row"><label>运镜</label><select id="beMove" class="input">${opts(CAMERA_MOVES, s.cameraMove, mv => mv.name, mv => mv.cat)}</select></div>
          <div class="form-row"><label>转场（到下一镜）</label><select id="beTrans" class="input">${opts(TRANSITIONS, s.transition, t => t.icon + ' ' + t.name)}</select></div>
          <div class="modal-actions">
            <button class="btn btn-danger btn-sm" id="beDel">🗑 删除</button>
            <div class="spacer"></div>
            <button class="btn btn-ghost" id="beCancel">取消</button>
            <button class="btn btn-primary" id="beOk">保存</button>
          </div>`,
      });
      m.body.querySelector('#beCancel').onclick = () => m.close();
      m.body.querySelector('#beDel').onclick = async () => {
        if (await confirmDlg(`删除第 ${i + 1} 镜？`, { danger: true, okText: '删除' })) { store.deleteShot(s.id); m.close(); }
      };
      m.body.querySelector('#beOk').onclick = () => {
        const dur = Math.max(1, Math.min(20, +m.body.querySelector('#beDur').value || 3));
        store.updateShot(s.id, {
          duration: dur,
          cameraMove: m.body.querySelector('#beMove').value,
          transition: m.body.querySelector('#beTrans').value,
        });
        store.unlock('editor');
        store.addXP(1, '剪辑台调整');
        m.close();
        renderTimeline();
      };
    });
  }

  container.querySelector('#edPlay').onclick = () => {
    if (!p.shots.length) { toast('没有镜头可播', 'warn'); return; }
    window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'animatic' } }));
  };

  renderTimeline();
  // 项目变化时刷新
  const unsub = () => store.listeners.includes(refreshFn) && (store.listeners = store.listeners.filter(f => f !== refreshFn));
  const refreshFn = () => { if (document.body.contains(tlBody)) renderTimeline(); };
  store.subscribe(refreshFn);

  return unsub;
}
