/* ============================================================
 * 白日梦导演台 · 运镜词典 + 运镜预演
 * ============================================================ */
import { CAMERA_MOVES, MOVE_CATS, ACTOR_ACTIONS, STAGE_SCENES, ANGLES, SHOT_SIZES } from './data.js';
import { MovePlayer, solveCamera, solveActor, clamp, focusPointOf } from './cameraSim.js';
import { moveByKey } from './breakdown.js';
import { esc, el, modal, toast, copyText, opts, askText, confirmDlg } from './ui.js';

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

  /* 可视区域内循环播放演示
     ⚠ 原来每次点分类都会 renderGrid() → observeDemos()，于是每点一次就新建一个
     IntersectionObserver，并再起一条 rAF 循环（旧的还在跑，rafId 还被覆盖）——
     点 5 次筛选就是 5 条循环同时刷，词典动画越来越快、CPU 白烧。
     现在观察器和循环都只建一次，重画时只换要观察的元素。 */
  let dictIO = null, dictLoopOn = false, dictT0 = 0, dictFrame = 0;
  const observeDemos = () => {
    if (!dictIO) {
      dictIO = new IntersectionObserver(entries => {
        for (const en of entries) {
          const card = en.target.closest('.dict-card');
          if (en.isIntersecting) running.add(card);
          else running.delete(card);
        }
      }, { root: container, rootMargin: '80px' });
    } else {
      running.clear();
      dictIO.disconnect();          // 旧卡片已从 DOM 摘掉，别再让它们留在 running 里
    }
    grid.querySelectorAll('.dict-demo').forEach(d => dictIO.observe(d));

    if (dictLoopOn) return;         // 循环只起一次
    dictLoopOn = true;
    dictT0 = performance.now();
    const loop = (now) => {
      if (!document.body.contains(grid)) { dictLoopOn = false; rafId = null; return; }
      dictFrame++; if (dictFrame % 3) { rafId = requestAnimationFrame(loop); return; }
      const t = ((now - dictT0) / 3600) % 1;
      for (const card of running) {
        const cv = card.querySelector('canvas');
        if (!cv._player) {
          cv._player = new MovePlayer(cv);
          cv._player.hud = false;
        }
        const key = card.dataset.key;
        const mv = moveByKey[key];
        cv._player.renderer.setTheme({ bg1: '#edf0f5', bg2: '#e2e6ee', fog: '#e9ecf2', line: 'rgba(96,106,134,.26)', ink: '#2a3040', hud: 'rgba(35,42,60,.38)' });
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

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (dictIO) { dictIO.disconnect(); dictIO = null; }
    dictLoopOn = false;
    running.clear();
  };
}

/* 词典详解弹窗 */
function openDictDetail(mv) {
  store.markDictViewed(mv.key);
  store.addXP(1, '学习运镜');
  const m = modal({
    title: `${mv.name} · ${mv.en}`, wide: true,
    onClose: () => player.destroy(),
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
}

/* 把运镜指派给当前项目某个镜头 */
function assignMove(moveKey, extra = null) {
  const p = store.active;
  if (!p) { toast('先打开一个项目', 'warn'); return; }
  if (!p.shots.length) { toast('当前项目还没有镜头，先去拆分镜或加镜头', 'warn'); return; }
  /* 从预演面板点「写回镜头」时，把面板上的景别/角度/时长/速度/看向高度一起带走，
     不然调好的一整套机位只存了运镜，回分镜板又变回默认值。 */
  const tags = extra ? Object.entries(extra).map(([, v]) => v).filter(Boolean).length : 0;
  const m = modal({
    title: `把「${moveByKey[moveKey].name}」用到哪个镜头？`,
    body: `
      ${extra ? `<p class="dim" style="margin-top:0">会一并写回：${esc(extra.moveName || '')}${extra.sizeName ? ' · ' + esc(extra.sizeName) : ''}${extra.angleName ? ' · ' + esc(extra.angleName) : ''}${extra.durText ? ' · ' + esc(extra.durText) : ''}${extra.aimText ? ' · ' + esc(extra.aimText) : ''}</p>` : ''}
      <div class="assign-list">${p.shots.map((s, i) => `
        <button class="assign-item" data-i="${i}">
          <span class="assign-idx">${i + 1}</span>
          <span class="assign-desc">${esc(s.desc || '（未描述）')}</span>
          <span class="tag">${esc(moveByKey[s.cameraMove]?.name || '')}</span>
        </button>`).join('')}</div>`,
  });
  m.body.querySelectorAll('.assign-item').forEach(b => b.onclick = () => {
    const s = p.shots[+b.dataset.i];
    const patch = { cameraMove: moveKey };
    if (extra) {
      if (extra.shotSize) patch.shotSize = extra.shotSize;
      if (extra.angle) patch.angle = extra.angle;
      if (extra.duration) patch.duration = extra.duration;
      if (extra.moveSpeed) patch.moveSpeed = extra.moveSpeed;
      if ('aimY' in extra) patch.aimY = extra.aimY;
      if ('camH' in extra) patch.camH = extra.camH;
    }
    store.updateShot(s.id, patch);
    m.close();
    toast(`第 ${+b.dataset.i + 1} 镜已改为「${moveByKey[moveKey].name}」` + (extra ? '（含景别/角度/时长等面板设置）' : ''), 'ok');
  });
}

/* ============================================================
 * 运镜预演（大舞台）
 * ============================================================ */
/* 焦点下拉的选项：自动（主体）/ 每个人物 / 每个道具 / 画面中心 */
function focusOptions(scene) {
  const list = ['<option value="auto">自动 · 主体人物</option>'];
  const objs = (scene && scene.objects) || [];
  objs.filter(o => o.type === 'actor').forEach(o => list.push(`<option value="person:${esc(o.id || '')}">人物 · ${esc(o.name || '未命名')}</option>`));
  objs.filter(o => o.type === 'prop' && !o.light && o.kind).forEach(o => list.push(`<option value="prop:${esc(o.id || '')}">道具 · ${esc(o.name || o.kind)}</option>`));
  list.push('<option value="center">画面中心（场景中轴）</option>');
  return list.join('');
}
function focusValue(v, scene, aimY) {
  const parts = String(v || 'auto').split(':');
  return focusPointOf(scene, parts[0] === 'auto' ? 'auto' : parts[0], parts[1] || '', aimY);
}

export function renderPreview(container, payload = {}) {
  const p = store.active;
  const initShot = payload?.shotId ? p?.shots.find(s => s.id === payload.shotId) : null;
  let curMove = initShot?.cameraMove || 'slowPush';
  /* 本镜如果在场景搭建里搭过，预演默认直接用搭好的场景（而不是通用白模舞台） */
  const builtScene = (initShot && initShot.scene && typeof initShot.scene === 'object' && Array.isArray(initShot.scene.objects)) ? initShot.scene : null;

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
        <div class="card pv-map-card">
          <div class="card-title">📷 机位俯视示意 <span class="dim">· 主体在中心，看镜头从哪来</span></div>
          <canvas id="pvMap" width="252" height="252"></canvas>
        </div>
        <div class="card">
          <div class="card-title">运镜</div>
          <div class="pv-move-list" id="pvMoves"></div>
        </div>
        <div class="card">
          <div class="card-title">舞台设置</div>
          <div class="form-row"><label>人物动作</label><select id="pvAction" class="input">${opts(ACTOR_ACTIONS, 'stand')}</select></div>
          <div class="form-row"><label>布景</label><select id="pvScene" class="input">
            ${builtScene ? '<option value="__shot__" selected>🏗 本镜场景（搭建）</option>' : ''}
            ${opts(STAGE_SCENES, builtScene ? '' : 'plain')}
          </select></div>
          <div class="form-row"><label>焦点（摇 / 俯仰落点）</label><select id="pvFocus" class="input">
            ${focusOptions(builtScene)}
          </select></div>
          <label class="form-row" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="pvPaths" ${initShot && initShot.showPath ? 'checked' : ''}><span>显示人物走位线</span></label>
          <div class="form-row"><label>景别（真实距离）</label><select id="pvSize" class="input">${opts(SHOT_SIZES, initShot?.shotSize || 'MS')}</select></div>
          <div class="form-row"><label>拍摄角度（直观可见）</label><select id="pvAngle" class="input">${opts(ANGLES, initShot?.angle || 'eye')}</select></div>
          <div class="form-row"><label>看向高度（拍哪里）</label><select id="pvAim" class="input">
            <option value="auto" selected>自动（跟景别走）</option>
            <option value="1.66">脸 · 特写 1.66m</option>
            <option value="1.45">眼 · 平视 1.45m</option>
            <option value="1.30">胸 1.30m</option>
            <option value="1.00">腰 1.00m</option>
            <option value="0.75">膝 0.75m</option>
            <option value="0.15">地面 0.15m</option>
          </select></div>
          <div class="form-row"><label>机位高度</label><select id="pvCamH" class="input">
            <option value="auto" selected>自动（跟运镜走）</option>
            <option value="0.5">低机位 0.5m</option>
            <option value="1.2">腰平 1.2m</option>
            <option value="1.7">眼平 1.7m</option>
            <option value="2.6">高机位 2.6m</option>
            <option value="4.5">俯视 4.5m</option>
          </select></div>
          <div class="form-row"><label>运镜速度</label><select id="pvMoveSpeed" class="input">
            <option value="std" selected>标准</option><option value="slow">慢 · 细腻</option><option value="fast">快 · 有力</option>
          </select></div>
          <div class="form-row"><label>镜头时长</label><input id="pvDur" type="range" min="1" max="20" step="0.5" value="${Math.min(20, Math.max(1, +(initShot?.duration) || 4))}" class="scrub"><span class="dim" id="pvDurLabel">${Math.min(20, Math.max(1, +(initShot?.duration) || 4))}s</span></div>
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
    const sceneV = container.querySelector('#pvScene').value;
    const scene = sceneV === '__shot__' ? builtScene : sceneV;
    const dur = +container.querySelector('#pvDur').value;
    const aimV = container.querySelector('#pvAim').value, camHV = container.querySelector('#pvCamH').value;
    const focusScene = sceneV === '__shot__' ? builtScene : scene;
    const fRaw = container.querySelector('#pvFocus').value;
    const focus = focusValue(fRaw, focusScene, aimV === 'auto' ? undefined : +aimV);
    player.play(mv.sim, { duration: dur, action, scene, loop: loopOn, fromT, showPaths: container.querySelector('#pvPaths').checked, angle: container.querySelector('#pvAngle').value, moveSpeed: container.querySelector('#pvMoveSpeed').value, size: container.querySelector('#pvSize').value, aimY: aimV === 'auto' ? undefined : +aimV, camH: camHV === 'auto' ? undefined : +camHV, focus, focusKind: fRaw.split(':')[0] });
    drawMap();
    playBtn.textContent = '⏸ 暂停';
    player.onEnd = () => { playBtn.textContent = '▶ 播放'; };
  };

  playBtn.onclick = () => {
    if (player.playing) { player.stop(); playBtn.textContent = '▶ 播放'; }
    else {
      /* 「预演次数」只在用户真按了播放时计——原来写在页面进入处，反复切页就能刷等级 */
      store.achv.counts.previews++;
      store.persistAchv();
      store.unlock('firstPreview');
      store.addXP(2, '运镜预演');
      startPlay(player.t || 0);
    }
  };
  container.querySelector('#pvLoop').onclick = e => {
    loopOn = !loopOn;
    e.currentTarget.textContent = `🔁 循环: ${loopOn ? '开' : '关'}`;
    player.loop = loopOn;
  };
  container.querySelector('#pvSpeed').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvAction').onchange = () => startPlay(0);
  container.querySelector('#pvAngle').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvSize').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvAim').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvCamH').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvFocus').onchange = () => startPlay(0);
  container.querySelector('#pvPaths').onchange = (e) => { if (initShot) store.updateShot(initShot.id, { showPath: e.target.checked }); startPlay(player.t || 0); };
  container.querySelector('#pvMoveSpeed').onchange = () => startPlay(player.t || 0);
  container.querySelector('#pvScene').onchange = () => startPlay(0);
  const durInput = container.querySelector('#pvDur');
  durInput.oninput = () => { container.querySelector('#pvDurLabel').textContent = durInput.value + 's'; };
  durInput.onchange = () => startPlay(0);

  scrub.addEventListener('pointerdown', () => { scrubbing = true; player.stop(); });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => {
    const t = +scrub.value / 1000;
    const mv = moveByKey[curMove];
    const aimV = container.querySelector('#pvAim').value, camHV = container.querySelector('#pvCamH').value;
    player.seek(mv.sim, t, {
      action: container.querySelector('#pvAction').value,
      scene: (() => { const v = container.querySelector('#pvScene').value; return v === '__shot__' ? builtScene : v; })(),
      duration: +durInput.value,
      angle: container.querySelector('#pvAngle').value,
      moveSpeed: container.querySelector('#pvMoveSpeed').value,
      size: container.querySelector('#pvSize').value,
      aimY: aimV === 'auto' ? undefined : +aimV,
      camH: camHV === 'auto' ? undefined : +camHV,
      showPaths: container.querySelector('#pvPaths').checked,
      focus: focusValue(container.querySelector('#pvFocus').value, (() => { const v2 = container.querySelector('#pvScene').value; return v2 === '__shot__' ? builtScene : v2; })(), aimV === 'auto' ? undefined : +aimV),
      focusKind: container.querySelector('#pvFocus').value.split(':')[0],
    });
    drawMap();
    timeEl.textContent = `${(t * +durInput.value).toFixed(1)}s / ${durInput.value}s`;
  });

  player.onTick = (t) => {
    if (!scrubbing) scrub.value = Math.round(t * 1000);
    const dur = +durInput.value;
    timeEl.textContent = `${(t * dur).toFixed(1)}s / ${dur.toFixed(1)}s`;
  };

  /* ---- 机位俯视示意图 ---- */
  const mapCv = container.querySelector('#pvMap');
  const mapCtx = mapCv.getContext('2d');
  const drawMap = () => {
    const mv = moveByKey[curMove];
    const angle = container.querySelector('#pvAngle').value;
    const size = container.querySelector('#pvSize').value;
    const aimV = container.querySelector('#pvAim').value, camHV = container.querySelector('#pvCamH').value;
    const fine = { aimY: aimV === 'auto' ? undefined : +aimV, camH: camHV === 'auto' ? undefined : +camHV };
    const action = container.querySelector('#pvAction').value;
    const dur = +container.querySelector('#pvDur').value || 4;
    const N = 48;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const tt = i / N;
      const actor = solveActor(action, tt, mv.sim, dur);
      const c = solveCamera(mv.sim, tt, actor, { angle, size, ...fine });
      pts.push({ x: c.pos[0], z: c.pos[2], yaw: c.yaw, fov: c.fov });
    }
    const t = clamp(player.t || 0, 0, 1);
    const actorCur = solveActor(action, t, mv.sim, dur);
    const cur = solveCamera(mv.sim, t, actorCur, { angle, size, ...fine });
    const W2 = mapCv.width / 2, S = 13;
    const m2p = (x, z) => [W2 + (x / S) * (W2 - 12), W2 + (z / S) * (W2 - 12)];
    mapCtx.clearRect(0, 0, mapCv.width, mapCv.height);
    mapCtx.fillStyle = '#0e1118';
    mapCtx.fillRect(0, 0, mapCv.width, mapCv.height);
    // 距离圈
    mapCtx.strokeStyle = 'rgba(255,255,255,0.10)';
    for (const r of [4, 8, 12]) {
      mapCtx.beginPath();
      mapCtx.arc(W2, W2, (r / S) * (W2 - 12), 0, Math.PI * 2);
      mapCtx.stroke();
    }
    // 主体
    const [sx, sz] = m2p(0, 0);
    mapCtx.fillStyle = '#fb7299';
    mapCtx.beginPath(); mapCtx.arc(sx, sz, 5, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.fillStyle = 'rgba(255,255,255,0.6)'; mapCtx.font = '10px sans-serif';
    mapCtx.fillText('主体', sx + 8, sz + 4);
    // 运动轨迹
    mapCtx.strokeStyle = 'rgba(77,141,255,0.75)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    pts.forEach((p, i) => { const [x, y] = m2p(p.x, p.z); i ? mapCtx.lineTo(x, y) : mapCtx.moveTo(x, y); });
    mapCtx.stroke();
    // 当前相机 + 视野扇形
    let fx = 0, fz = -1;
    if (cur._tgt) { fx = cur._tgt[0] - cur.pos[0]; fz = cur._tgt[2] - cur.pos[2]; }
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const half = ((cur.fov || 55) * Math.PI / 180) / 2;
    const base = Math.atan2(fz, fx);
    const [cx2, cy2] = m2p(cur.pos[0], cur.pos[2]);
    const len = 42;
    mapCtx.fillStyle = 'rgba(255,200,87,0.18)';
    mapCtx.beginPath();
    mapCtx.moveTo(cx2, cy2);
    mapCtx.arc(cx2, cy2, len, base - half, base + half);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.fillStyle = '#ffc857';
    mapCtx.beginPath(); mapCtx.arc(cx2, cy2, 6, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.fillStyle = 'rgba(255,255,255,0.75)';
    mapCtx.fillText('相机', cx2 + 8, cy2 - 6);
  };
  drawMap();

  const assignBtn = container.querySelector('#pvAssign');
  if (assignBtn) assignBtn.onclick = () => {
    const q = (id) => container.querySelector('#' + id).value;
    const aimV = q('pvAim'), camHV = q('pvCamH');
    assignMove(curMove, {
      moveName: (moveByKey[curMove] || {}).name,
      shotSize: q('pvSize'),
      angle: q('pvAngle'),
      duration: +q('pvDur'),
      moveSpeed: q('pvMoveSpeed'),
      aimY: aimV === 'auto' ? null : +aimV,
      camH: camHV === 'auto' ? null : +camHV,
      sizeName: (SHOT_SIZES.find(x => x.key === q('pvSize')) || {}).name,
      angleName: (ANGLES.find(x => x.key === q('pvAngle')) || {}).name,
      durText: `${+q('pvDur')}s`,
      aimText: aimV === 'auto' ? '' : '看向 ' + aimV + 'm',
    });
  };

  renderMoves();
  startPlay();          // 进入页面自动播一次，但不计「预演次数」（计数在播放按钮里）

  return () => player.destroy();
}

/* ============================================================
 * 场景库（项目级）—— 一套景，多镜复用
 * ============================================================ */
export function renderScenes(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }

  const draw = () => {
    const scenes = store.scenes;
    container.innerHTML = `
      <div class="page-head">
        <h2>🏗 场景库 <span class="dim">· ${scenes.length} 套景 · 一套景可以被任意镜头套用（连戏不用重搭）</span></h2>
        <div class="page-head-actions">
          <button class="btn btn-ghost" id="scAutoGroup">🧠 按场次智能归组</button>
          <button class="btn btn-primary" id="scNew">＋ 新建场景</button>
        </div>
      </div>
      <div class="card sc-hint dim">💡 在场景搭建里点「存入场景库」，这里就会出现；套用到多个镜头后，各镜仍可单独微调。</div>
      ${scenes.length ? `<div class="sc-grid" id="scGrid">${scenes.map(it => {
        const st = (it.mnState && it.mnState.scene) || {};
        const n = (a) => (a || []).length;
        const use = store.sceneUsage(it.id);
        return `<div class="sc-card" data-id="${it.id}">
          <div class="sc-thumb sc-thumb-btn" data-act="open" title="点开直接进导演台编辑这套景">
            ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<span class="sc-thumb-ph">🏗</span>`}
            <span class="sc-thumb-open">✏️ 打开编辑</span>
          </div>
          <div class="sc-body">
            <div class="sc-name">${esc(it.name)}</div>
            <div class="sc-meta dim">房 ${n(st.rooms)} · 墙 ${n(st.walls)} · 道具 ${n(st.props)} · 人物 ${n(st.persons)} · 用在 <b>${use}</b> 镜</div>
            <div class="sc-ops">
              <button class="btn btn-primary btn-sm" data-act="open2">✏️ 打开编辑</button>
              <button class="btn btn-ghost btn-sm" data-act="apply">套用到镜头…</button>
              <button class="btn btn-ghost btn-sm" data-act="rename">重命名</button>
              <button class="btn btn-ghost btn-sm" data-act="del">删除</button>
            </div>
          </div>
        </div>`;
      }).join('')}</div>` : `<div class="empty-tip">还没有场景。点右上角「＋ 新建场景」或去分镜板打开任意镜头的「场景搭建」，搭好后「存入场景库」。</div>`}
    `;

    const newBtn = container.querySelector('#scNew');
    if (newBtn) newBtn.onclick = async () => {
      const { openSceneBuilder } = await import('./builder.js');
      openSceneBuilder(null, draw, { library: true });
    };

    /* 智能归组：按剧本场次给镜头建景 + 绑定 */
    const grpBtn = container.querySelector('#scAutoGroup');
    if (grpBtn) grpBtn.onclick = () => {
      const groups = store.groupShotsByScene();
      const named = groups.filter(g => g.key !== '未分场');
      if (!named.length) {
        toast('这些镜头还没有场次信息（用「剧本 → 一键拆分镜」带场次标题拆出来的镜头才有）', 'warn');
        return;
      }
      const r = store.autoBindScenesByGroup();
      toast(`已按 ${r.groups} 个场次归组：新建 ${r.created} 套景、绑定 ${r.bound} 个镜头`, 'ok');
      draw();
    };

    container.querySelectorAll('.sc-card').forEach(card => {
      const id = card.dataset.id;
      const it = store.findScene(id);
      /* 「打开编辑」：把这套景装进导演台，改完点「保存到场景库」覆盖这一条 */
      const openEdit = async () => {
        const { openSceneBuilder } = await import('./builder.js');
        openSceneBuilder(null, draw, { library: true, editId: id });
      };
      card.querySelector('[data-act="open"]').onclick = openEdit;
      card.querySelector('[data-act="open2"]').onclick = openEdit;
      card.querySelector('[data-act="apply"]').onclick = () => openApply(id, draw);
      card.querySelector('[data-act="rename"]').onclick = async () => {
        const nm = await askText({ title: '重命名场景', label: '场景名称', value: it.name, okText: '保存' });
        if (nm) { store.renameScene(id, nm); draw(); }
      };
      card.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDlg(`删除场景「${it.name}」？已套用它的镜头会保留当前场景副本。`, { danger: true, okText: '删除' })) { store.deleteScene(id); draw(); }
      };
    });
  };

  /* 套用到哪些镜头 */
  const openApply = (sceneId, after) => {
    const it = store.findScene(sceneId);
    const m = modal({
      title: `套用场景「${it.name}」到镜头`,
      body: `
        <div class="dim" style="margin-bottom:10px">勾选要使用这套景的镜头（可多选）。套用后各镜独立，可再单独改。</div>
        <div class="sc-pick-tools">
          <button class="btn btn-ghost btn-sm" id="scAll">全选</button>
          <button class="btn btn-ghost btn-sm" id="scNone">清空</button>
          <span class="dim" id="scCount"></span>
        </div>
        <div class="sc-pick-list" id="scPick">
          ${p.shots.map((s, i) => `<label class="sc-pick-item"><input type="checkbox" value="${s.id}" ${s.sceneId === sceneId ? 'checked' : ''}>
            <span class="sc-pick-idx">${i + 1}</span>
            <span class="sc-pick-desc">${esc((s.desc || '（未描述）').slice(0, 26))}</span>
            ${s.sceneId === sceneId ? '<span class="tag tag-ok">已用</span>' : ''}
          </label>`).join('') || '<div class="empty-tip">还没有镜头</div>'}
        </div>
        <div class="modal-actions">
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="scCancel">取消</button>
          <button class="btn btn-primary" id="scOk">套用</button>
        </div>`,
    });
    const list = m.body.querySelector('#scPick');
    const boxes = () => Array.from(list.querySelectorAll('input[type=checkbox]'));
    const upd = () => { const n = boxes().filter(b => b.checked).length; m.body.querySelector('#scCount').textContent = `已选 ${n} 镜`; };
    boxes().forEach(b => b.onchange = upd); upd();
    m.body.querySelector('#scAll').onclick = () => { boxes().forEach(b => b.checked = true); upd(); };
    m.body.querySelector('#scNone').onclick = () => { boxes().forEach(b => b.checked = false); upd(); };
    m.body.querySelector('#scCancel').onclick = () => m.close();
    m.body.querySelector('#scOk').onclick = () => {
      const ids = boxes().filter(b => b.checked).map(b => b.value);
      if (!ids.length) { toast('先勾选镜头', 'warn'); return; }
      const n = store.applySceneToShots(sceneId, ids);
      toast(`已把「${it.name}」套用到 ${n} 个镜头`, 'ok');
      m.close(); after();
    };
  };

  draw();
  return null;
}

/* ============================================================
 * 连戏检查（相邻镜头一致性）
 * ============================================================ */
export function renderContinuity(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }

  const draw = async () => {
    const { analyzeContinuity } = await import('./continuity.js');
    const { issues, stats } = analyzeContinuity(p);
    const lv = { err: { t: '严重', c: 'lv-err' }, warn: { t: '注意', c: 'lv-warn' }, info: { t: '提示', c: 'lv-info' } };
    const fixLabel = { all: '整镜对齐上一镜', cam: '对齐机位/镜头', light: '对齐光线', persons: '对齐人物摆位' };
    container.innerHTML = `
      <div class="page-head">
        <h2>🔗 连戏检查 <span class="dim">· ${stats.shots} 镜 / ${stats.pairs} 组相邻关系 · ${stats.withScene} 镜有场景</span></h2>
        <div class="page-head-actions">
          <button class="btn btn-ghost" id="ctRescan">🔄 重新检查</button>
        </div>
      </div>
      <div class="card ct-sum">
        <div class="ct-sum-item"><b class="lv-err">${stats.err}</b><span>严重</span></div>
        <div class="ct-sum-item"><b class="lv-warn">${stats.warn}</b><span>注意</span></div>
        <div class="ct-sum-item"><b class="lv-info">${stats.info}</b><span>提示</span></div>
        <div class="ct-sum-tip dim">${stats.err === 0 && stats.warn === 0 ? '✅ 没有发现明显穿帮风险' : '逐条看下面的建议；「对齐」会把上一镜的对应设置复制到这一镜'}</div>
      </div>
      ${issues.length ? `<div class="ct-list">${issues.map((it, i) => `
        <div class="ct-item ${lv[it.level].c}">
          <span class="ct-badge">${lv[it.level].t}</span>
          <div class="ct-body">
            <div class="ct-title">${esc(it.title)}</div>
            <div class="ct-detail dim">${esc(it.detail)}</div>
          </div>
          ${it.fix ? `<button class="btn btn-ghost btn-sm" data-fix="${it.fix}" data-shot="${it.shotId}" data-prev="${it.prevId}">${fixLabel[it.fix] || '对齐'}</button>` : ''}
        </div>`).join('')}</div>` : `<div class="empty-tip">没有发现问题。镜头越多、场景越完整，检查越准。</div>`}
      <div class="card ct-hint dim">
        💡 检查项：越轴（机位方位角突变）· 人物瞬移 · 人物转向 · 光线突变 · 换景提醒。
        给镜头套用同一套场景库的景、并让相邻镜头沿用同一机位，穿帮会少一大半。
      </div>`;

    container.querySelector('#ctRescan').onclick = draw;
    container.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
      const ok = store.alignContinuity(b.dataset.shot, b.dataset.prev, b.dataset.fix);
      toast(ok ? '已对齐上一镜 ✅' : '对齐失败（缺少上一镜数据）', ok ? 'ok' : 'warn');
      if (ok) draw();
    });
  };

  draw();
  return null;
}
