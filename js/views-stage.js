/* ============================================================
 * 白日梦导演台 · 运镜词典 + 运镜预演
 * ============================================================ */
import { CAMERA_MOVES, MOVE_CATS, ACTOR_ACTIONS, STAGE_SCENES } from './data.js';
import { MovePlayer } from './cameraSim.js';
import { moveByKey } from './breakdown.js';
import { esc, el, modal, toast, copyText, opts } from './ui.js';

let store;
export function initViewsStage(s) { store = s; }

/* ============================================================
 * 运镜词典
 * ============================================================ */
export function renderDict(container) {
  let filterCat = '全部';
  container.innerHTML = `
    <div class="page-head">
      <h2>🧭 运镜词典 <span class="dim">· ${CAMERA_MOVES.length} 种电影运镜 · 白模演示 + 核心提示词</span></h2>
    </div>
    <div class="dict-filter" id="dictFilter"></div>
    <div class="dict-grid" id="dictGrid"></div>`;

  const filterBox = container.querySelector('#dictFilter');
  const grid = container.querySelector('#dictGrid');
  const running = new Set();   // 正在播放的卡片
  let rafId = null;

  const renderFilter = () => {
    filterBox.innerHTML = ['全部', ...MOVE_CATS].map(c =>
      `<button class="chip ${c === filterCat ? 'chip-on' : ''}" data-cat="${c}">${c}</button>`).join('');
    filterBox.querySelectorAll('.chip').forEach(b => b.onclick = () => { filterCat = b.dataset.cat; renderFilter(); renderGrid(); });
  };

  const renderGrid = () => {
    running.clear();
    grid.innerHTML = '';
    const list = CAMERA_MOVES.filter(m => filterCat === '全部' || m.cat === filterCat);
    for (const mv of list) {
      const card = el(`<div class="dict-card" data-key="${mv.key}">
        <div class="dict-demo"><canvas></canvas>
          <div class="dict-cat">${esc(mv.cat)}</div>
        </div>
        <div class="dict-name">${esc(mv.name)} <span class="dict-en">${esc(mv.en)}</span></div>
        <div class="dict-desc">${esc(mv.desc)}</div>
        <div class="dict-ops">
          <button class="btn btn-ghost btn-sm" data-op="detail">详解</button>
          <button class="btn btn-ghost btn-sm" data-op="copy">📋 提示词</button>
          ${store.active ? `<button class="btn btn-ghost btn-sm" data-op="use">用到镜头</button>` : ''}
        </div>
      </div>`);
      card.addEventListener('click', e => {
        const op = e.target.closest('[data-op]')?.dataset.op;
        if (op === 'copy') { e.stopPropagation(); copyText(mv.prompt); return; }
        if (op === 'use') { e.stopPropagation(); assignMove(mv.key); return; }
        openDictDetail(mv);
      });
      grid.appendChild(card);
    }
    observeDemos();
  };

  /* 可视区域内循环播放演示 */
  const observeDemos = () => {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const card = en.target.closest('.dict-card');
        if (en.isIntersecting) running.add(card);
        else running.delete(card);
      }
    }, { root: container, rootMargin: '80px' });
    grid.querySelectorAll('.dict-demo').forEach(d => io.observe(d));

    const t0 = performance.now();
    const loop = (now) => {
      if (!document.body.contains(grid)) { cancelAnimationFrame(rafId); return; }
      const t = ((now - t0) / 3600) % 1;
      for (const card of running) {
        const cv = card.querySelector('canvas');
        if (!cv._player) {
          cv._player = new MovePlayer(cv);
          cv._player.hud = false;
        }
        const key = card.dataset.key;
        const mv = moveByKey[key];
        cv._player.renderer.setTheme({ bg1: '#12151d', bg2: '#1c212e', fog: '#141824', line: 'rgba(150,162,190,.24)' });
        const scenes = ['plain', 'street', 'room'];
        const scene = scenes[(mv.name.length + CAMERA_MOVES.indexOf(mv)) % 3];
        cv._player.renderer.scene = scene;
        cv._player.renderer.render(mv.sim, t, mv.cat === '跟随' ? 'walk' : 'stand', { duration: 3.6, letterbox: true });
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  };

  renderFilter();
  renderGrid();

  return () => { if (rafId) cancelAnimationFrame(rafId); };
}

/* 词典详解弹窗 */
function openDictDetail(mv) {
  store.markDictViewed(mv.key);
  store.addXP(1, '学习运镜');
  const m = modal({
    title: `${mv.name} · ${mv.en}`, wide: true,
    body: `
      <div class="dict-detail">
        <div class="dict-detail-stage">
          <canvas id="ddCanvas"></canvas>
          <div class="dict-detail-controls">
            <select id="ddAction" class="input">${opts(ACTOR_ACTIONS, mv.cat === '跟随' ? 'walk' : 'stand')}</select>
            <select id="ddScene" class="input">${opts(STAGE_SCENES, 'plain')}</select>
            <button class="btn btn-ghost btn-sm" id="ddReplay">↻ 重播</button>
          </div>
        </div>
        <div class="dict-detail-info">
          <div class="dict-detail-cat">分类：${mv.cat}运镜</div>
          <p>${esc(mv.desc)}</p>
          <div class="form-row">
            <label>核心提示词 <span class="dim">（复制后直接用于 AI 视频/图片工具）</span></label>
            <div class="prompt-box mono">${esc(mv.prompt)}</div>
          </div>
          <div class="dict-detail-ops">
            <button class="btn btn-primary" id="ddCopy">📋 复制提示词</button>
            ${store.active ? `<button class="btn btn-magic" id="ddUse">🎬 用到某个镜头</button>` : ''}
          </div>
        </div>
      </div>`,
  });
  const cv = m.body.querySelector('#ddCanvas');
  const player = new MovePlayer(cv);
  player.hud = true;
  let action = mv.cat === '跟随' ? 'walk' : 'stand', scene = 'plain';
  const play = () => player.play(mv.sim, { duration: 4, action, scene, loop: true });
  play();
  m.body.querySelector('#ddReplay').onclick = play;
  m.body.querySelector('#ddAction').onchange = e => { action = e.target.value; play(); };
  m.body.querySelector('#ddScene').onchange = e => { scene = e.target.value; play(); };
  m.body.querySelector('#ddCopy').onclick = () => copyText(mv.prompt);
  const useBtn = m.body.querySelector('#ddUse');
  if (useBtn) useBtn.onclick = () => { m.close(); assignMove(mv.key); };
  const origClose = m.close;
  m.close = (r) => { player.destroy(); origClose(r); };
  m.body.querySelector('.modal-x').onclick = () => m.close(null);
}

/* 把运镜指派给当前项目某个镜头 */
function assignMove(moveKey) {
  const p = store.active;
  if (!p) { toast('先打开一个项目', 'warn'); return; }
  if (!p.shots.length) { toast('当前项目还没有镜头，先去拆分镜或加镜头', 'warn'); return; }
  const m = modal({
    title: `把「${moveByKey[moveKey].name}」用到哪个镜头？`,
    body: `
      <div class="assign-list">${p.shots.map((s, i) => `
        <button class="assign-item" data-i="${i}">
          <span class="assign-idx">${i + 1}</span>
          <span class="assign-desc">${esc(s.desc || '（未描述）')}</span>
          <span class="tag">${esc(moveByKey[s.cameraMove]?.name || '')}</span>
        </button>`).join('')}</div>`,
  });
  m.body.querySelectorAll('.assign-item').forEach(b => b.onclick = () => {
    const s = p.shots[+b.dataset.i];
    store.updateShot(s.id, { cameraMove: moveKey });
    m.close();
    toast(`第 ${+b.dataset.i + 1} 镜已改为「${moveByKey[moveKey].name}」`, 'ok');
  });
}

/* ============================================================
 * 运镜预演（大舞台）
 * ============================================================ */
export function renderPreview(container, payload = {}) {
  const p = store.active;
  const initShot = payload?.shotId ? p?.shots.find(s => s.id === payload.shotId) : null;
  let curMove = initShot?.cameraMove || 'slowPush';

  container.innerHTML = `
    <div class="page-head">
      <h2>👁️ 运镜预演 <span class="dim">· 白模舞台，像操控一台真摄影机</span></h2>
    </div>
    <div class="preview-layout">
      <div class="preview-main card">
        <div class="preview-stage-wrap">
          <div class="preview-stage aspect-${(p?.aspect || '16:9').replace(':', 'x')}" id="pvStage">
            <canvas id="pvCanvas"></canvas>
            <div class="preview-hud-label" id="pvLabel"></div>
          </div>
        </div>
        <div class="preview-controls">
          <button class="btn btn-primary" id="pvPlay">▶ 播放</button>
          <div class="pv-scrub-wrap"><input type="range" id="pvScrub" class="scrub" min="0" max="1000" value="0"></div>
          <span class="dim" id="pvTime">0.0s / 4.0s</span>
          <button class="btn btn-ghost btn-sm" id="pvLoop">🔁 循环: 开</button>
          <div class="spacer"></div>
          <select id="pvSpeed" class="input input-sm">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option>
          </select>
        </div>
      </div>
      <div class="preview-side">
        <div class="card">
          <div class="card-title">运镜</div>
          <div class="pv-move-list" id="pvMoves"></div>
        </div>
        <div class="card">
          <div class="card-title">舞台设置</div>
          <div class="form-row"><label>人物动作</label><select id="pvAction" class="input">${opts(ACTOR_ACTIONS, 'stand')}</select></div>
          <div class="form-row"><label>布景</label><select id="pvScene" class="input">${opts(STAGE_SCENES, 'plain')}</select></div>
          <div class="form-row"><label>镜头时长</label><input id="pvDur" type="range" min="1" max="12" step="0.5" value="4" class="scrub"><span class="dim" id="pvDurLabel">4s</span></div>
          ${p?.shots?.length ? `<button class="btn btn-magic" id="pvAssign">🎬 把当前运镜写回镜头</button>` : ''}
        </div>
      </div>
    </div>`;

  const canvas = container.querySelector('#pvCanvas');
  const player = new MovePlayer(canvas);
  const label = container.querySelector('#pvLabel');
  const scrub = container.querySelector('#pvScrub');
  const timeEl = container.querySelector('#pvTime');
  const playBtn = container.querySelector('#pvPlay');
  let loopOn = true, scrubbing = false;

  const moveList = container.querySelector('#pvMoves');
  const renderMoves = () => {
    moveList.innerHTML = '';
    for (const cat of MOVE_CATS) {
      const moves = CAMERA_MOVES.filter(m => m.cat === cat);
      if (!moves.length) continue;
      moveList.appendChild(el(`<div class="pv-cat">${cat}</div>`));
      for (const mv of moves) {
        const chip = el(`<button class="pv-move ${mv.key === curMove ? 'on' : ''}" data-key="${mv.key}">
          ${esc(mv.name)}<span>${esc(mv.en)}</span></button>`);
        chip.onclick = () => {
          curMove = mv.key;
          renderMoves();
          store.markDictViewed(mv.key);
          startPlay();
        };
        moveList.appendChild(chip);
      }
    }
    moveList.querySelector('.pv-move.on')?.scrollIntoView({ block: 'center' });
  };

  const setLabel = () => {
    const mv = moveByKey[curMove];
    label.textContent = `${mv.name} · ${mv.en} · ${mv.cat}运镜`;
  };
  const startTime = () => performance.now();
  void startTime;

  const startPlay = (fromT = 0) => {
    const mv = moveByKey[curMove];
    setLabel();
    player.speed = +container.querySelector('#pvSpeed').value;
    const action = container.querySelector('#pvAction').value;
    const scene = container.querySelector('#pvScene').value;
    const dur = +container.querySelector('#pvDur').value;
    player.play(mv.sim, { duration: dur, action, scene, loop: loopOn, fromT });
    playBtn.textContent = '⏸ 暂停';
    player.onEnd = () => { playBtn.textContent = '▶ 播放'; };
  };

  playBtn.onclick = () => {
    if (player.playing) { player.stop(); playBtn.textContent = '▶ 播放'; }
    else startPlay(player.t || 0);
  };
  container.querySelector('#pvLoop').onclick = e => {
    loopOn = !loopOn;
    e.currentTarget.textContent = `🔁 循环: ${loopOn ? '开' : '关'}`;
    player.loop = loopOn;
  };
  container.querySelector('#pvSpeed').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvAction').onchange = () => startPlay(0);
  container.querySelector('#pvScene').onchange = () => startPlay(0);
  const durInput = container.querySelector('#pvDur');
  durInput.oninput = () => { container.querySelector('#pvDurLabel').textContent = durInput.value + 's'; };
  durInput.onchange = () => startPlay(0);

  scrub.addEventListener('pointerdown', () => { scrubbing = true; player.stop(); });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    const t = +scrub.value / 1000;
    const mv = moveByKey[curMove];
    player.seek(mv.sim, t, {
      action: container.querySelector('#pvAction').value,
      scene: container.querySelector('#pvScene').value,
      duration: +durInput.value,
    });
    timeEl.textContent = `${(t * +durInput.value).toFixed(1)}s / ${durInput.value}s`;
  });

  player.onTick = (t) => {
    if (!scrubbing) scrub.value = Math.round(t * 1000);
    const dur = +durInput.value;
    timeEl.textContent = `${(t * dur).toFixed(1)}s / ${dur.toFixed(1)}s`;
  };

  const assignBtn = container.querySelector('#pvAssign');
  if (assignBtn) assignBtn.onclick = () => assignMove(curMove);

  renderMoves();
  startPlay();
  store.achv.counts.previews++;
  store.persistAchv();
  store.unlock('firstPreview');
  store.addXP(2, '运镜预演');

  return () => player.destroy();
}
