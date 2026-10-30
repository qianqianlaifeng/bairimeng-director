/* ============================================================
 * 🎞 拉片台：导入参考视频 → 自动拆镜 → 逐镜标注 → 进导演台 3D 复刻
 *   视频不上传、不落库（太大）；只把镜头切点 + 缩略图 + 标注存进项目。
 *   缩略图走 IndexedDB（localStorage 存不下几十张图）。
 * ============================================================ */
import { esc, toast, confirmDlg } from './ui.js';

let store;
export function initViewsTeardown(s) { store = s; }

const SZ = [['ECU', '大特写'], ['CU', '特写'], ['MCU', '近景'], ['MS', '中景'], ['MWS', '中远景'], ['WS', '全景'], ['EWS', '大远景']];
const MV = [['static', '固定'], ['pushIn', '缓推'], ['pullOut', '缓拉'], ['panLeft', '左摇'], ['panRight', '右摇'], ['tiltUp', '上摇'], ['tiltDown', '下摇'], ['trackSide', '跟拍'], ['handheld', '手持'], ['crane', '升降'], ['zoomIn', '变焦推近'], ['orbit', '环绕']];
const AN = [['eye', '平视'], ['low', '仰拍'], ['high', '俯拍'], ['ots', '过肩'], ['dutch', '斜角'], ['top', '正俯']];

/* 缩略图 dataURL → IndexedDB key；渲染时再取回 objectURL（带缓存，别每次重新造） */
const urlCache = new Map();
async function keyOf(dataURL) {
  if (!dataURL) return null;
  if (!/^data:/.test(dataURL)) return dataURL;
  try {
    const blob = await (await fetch(dataURL)).blob();
    return await store.putImage(blob);
  } catch (e) { return null; }
}
async function urlOf(key) {
  if (!key) return '';
  if (!/^[a-z0-9]+$/i.test(String(key))) return key;      /* 老数据里可能直接是 dataURL */
  if (urlCache.has(key)) return urlCache.get(key);
  const blob = await store.getImage(key);
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  urlCache.set(key, u);
  return u;
}
const fmt = (t) => (window.TEAR_DOWN ? TEAR_DOWN.fmt(t) : String(t));
/* 焦段 → 垂直视场角：16:9 全画幅片高 20.25mm */
const lensToFov = (mm) => +(2 * Math.atan(10.125 / Math.max(4, +mm || 35)) * 180 / Math.PI).toFixed(1);

export async function renderTeardown(container) {
  const p = store.active;
  if (!p) return;
  if (!p.td) p.td = { name: '', dur: 0, shots: [] };
  const td = p.td;
  let videoURL = null, videoEl = null, busy = false;

  container.innerHTML = `
    <div class="page-head">
      <h2>🎞 拉片台 <span class="dim">· 丢一段参考视频进来，自动拆镜，逐镜标机位/景别/时长，再一键进 3D 复刻</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="tdCsv" ${td.shots.length ? '' : 'disabled'}>📊 导出拉片表</button>
        <button class="btn btn-ghost" id="tdClear" ${td.shots.length ? '' : 'disabled'}>清空拆镜</button>
        <button class="btn btn-primary" id="tdPick">📼 选视频</button>
      </div>
    </div>
    <div class="card td-source">
      <div id="tdDrop" class="td-drop">
        <div><b>把参考视频拖到这里</b>，或点右上「选视频」</div>
        <small>mp4 / mov / webm · 只在本机分析，不上传 · 换台机器要重新选同一个文件（视频本身不存库）</small>
      </div>
      <div id="tdPlayerWrap" class="td-player" style="display:none">
        <video id="tdVideo" playsinline preload="auto"></video>
        <div class="td-meta"><b id="tdName"></b><span id="tdInfo" class="dim"></span></div>
        <div class="td-ctrl">
          <button class="btn btn-primary btn-sm" id="tdRun">✂️ 开始拆镜</button>
          <label class="dim td-mini">灵敏度 <input type="range" id="tdK" min="0.8" max="3" step="0.1" value="1.6" style="width:90px" /></label>
          <span id="tdStatus" class="dim"></span>
          <div class="td-bar"><i id="tdBar"></i></div>
        </div>
      </div>
      <input type="file" id="tdFile" accept="video/*" hidden />
    </div>
    <div id="tdShots" class="td-shots"></div>
    <div id="tdFoot" class="td-foot"></div>`;

  const $ = (s) => container.querySelector(s);
  const video = $('#tdVideo');

  const drawShots = async () => {
    const box = $('#tdShots');
    if (!td.shots.length) {
      box.innerHTML = `<div class="card td-empty">还没拆。选一段视频点「开始拆镜」，就会按镜头切点列出每一镜。</div>`;
      $('#tdFoot').innerHTML = '';
      return;
    }
    const cards = [];
    for (const s of td.shots) cards.push(`
      <div class="td-card" data-i="${s.i}">
        <div class="td-thumb"><img data-thumb="${s.i}" alt=""><b>${s.i}</b><span>${s.dur.toFixed(1)}s</span></div>
        <div class="td-card-body">
          <div class="td-tc">${fmt(s.t0)} → ${fmt(s.t1)}</div>
          <div class="td-sel">
            <select data-f="shotSize" data-i="${s.i}">${SZ.map(([k, n]) => `<option value="${k}" ${s.shotSize === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <select data-f="cameraMove" data-i="${s.i}">${MV.map(([k, n]) => `<option value="${k}" ${s.cameraMove === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <select data-f="angle" data-i="${s.i}">${AN.map(([k, n]) => `<option value="${k}" ${s.angle === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </div>
          <input class="input td-note" data-f="note" data-i="${s.i}" value="${esc(s.note || '')}" placeholder="这一镜在讲什么 / 光怎么打" />
          <div class="td-cam">
            <label title="焦段决定景深和视野宽窄"><span>焦段</span><input type="range" data-f="lens" data-i="${s.i}" min="16" max="200" step="1" value="${s.lens == null ? 35 : s.lens}" /><b>${s.lens == null ? 35 : s.lens}mm</b></label>
            <label title="摄影机离地高度"><span>机高</span><input type="range" data-f="camH" data-i="${s.i}" min="0.2" max="3" step="0.05" value="${s.camH == null ? 1.5 : s.camH}" /><b>${(s.camH == null ? 1.5 : s.camH)}m</b></label>
            <label title="摄影机到主体的水平距离"><span>距离</span><input type="range" data-f="dist" data-i="${s.i}" min="1" max="30" step="0.5" value="${s.dist == null ? 8 : s.dist}" /><b>${(s.dist == null ? 8 : s.dist)}m</b></label>
            <label title="绕主体转多少度"><span>方位</span><input type="range" data-f="az" data-i="${s.i}" min="-180" max="180" step="5" value="${s.az || 0}" /><b>${s.az || 0}°</b></label>
          </div>
          <div class="td-card-act">
            <button class="btn btn-ghost btn-xs" data-act="seek" data-i="${s.i}">▶ 跳到这里</button>
            <button class="btn btn-ghost btn-xs" data-act="copy" data-i="${s.i}">进 3D 复刻</button>
            <button class="btn btn-ghost btn-xs" data-act="del" data-i="${s.i}">删</button>
          </div>
        </div>
      </div>`);
    box.innerHTML = `<div class="td-grid">${cards.join('')}</div>`;
    for (const s of td.shots) {
      const img = box.querySelector(`[data-thumb="${s.i}"]`);
      if (img) { const u = await urlOf(s.thumbKey || s.thumb); if (u) img.src = u; }
    }
    $('#tdFoot').innerHTML = `
      <div class="card td-foot-inner">
        <div>共 <b>${td.shots.length}</b> 镜 · 总时长 <b>${td.shots.reduce((a, s) => a + s.dur, 0).toFixed(1)}</b> 秒
          ${td.name ? ` · 源：${esc(td.name)}` : ''}</div>
        <div class="spacer"></div>
        <button class="btn btn-magic" id="tdToBoard">⤵️ 全部导入分镜板</button>
      </div>`;
    const tb = $('#tdToBoard');
    if (tb) tb.onclick = () => importToBoard();
  };

  const importToBoard = async () => {
    if (!td.shots.length) return;
    const p2 = store.active;
    let made = 0;
    for (const s of td.shots) {
      const shot = store.addShot ? store.addShot({
        desc: s.note || ('拉片 · 第 ' + s.i + ' 镜'),
        duration: Math.max(0.5, Math.round(s.dur * 10) / 10),
        shotSize: s.shotSize || 'MS',
        cameraMove: s.cameraMove || 'static',
        angle: s.angle || 'eye',
      }) : null;
      if (!shot) break;
      if (s.thumbKey) store.updateShot(shot.id, { image: s.thumbKey });
      made++;
    }
    toast(made ? `已把 ${made} 镜导入分镜板` : '导入失败：这个版本没有 addShot', made ? 'ok' : 'warn');
    if (made) store.emit();
  };

  const runAnalyze = async () => {
    if (!videoEl || busy) return;
    busy = true;
    $('#tdRun').disabled = true;
    $('#tdStatus').textContent = '准备中…';
    try {
      const k = +$('#tdK').value;
      const res = await window.TEAR_DOWN.analyze(videoEl, {
        fps: 4, k,
        onProgress: (r, msg) => {
          $('#tdBar').style.width = Math.round(r * 100) + '%';
          if (msg) $('#tdStatus').textContent = msg;
        },
      });
      td.name = videoEl.dataset.name || td.name;
      td.dur = res.dur;
      td.shots = [];
      for (const s of res.shots) {
        const key = await keyOf(s.thumb);
        td.shots.push({ i: s.i, t0: s.t0, t1: s.t1, dur: s.dur, thumbKey: key, shotSize: '', cameraMove: '', angle: '', note: '',
          lens: 35, camH: 1.5, dist: 8, az: 0 });
      }
      store.persistProjects();
      await drawShots();
      $('#tdStatus').textContent = `拆出 ${td.shots.length} 镜（阈值 ${res.thr}，采样 ${res.sampled} 帧）`;
      toast(`拆出 ${td.shots.length} 镜 ✂️`, 'ok');
    } catch (e) {
      $('#tdStatus').textContent = '拆镜失败：' + e.message;
      toast('拆镜失败：' + e.message, 'warn');
    } finally {
      busy = false;
      $('#tdRun').disabled = false;
    }
  };

  const loadFile = async (file) => {
    if (!file) return;
    if (!/^video\//.test(file.type || '')) { toast('请选视频文件', 'warn'); return; }
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    video.src = videoURL;
    video.dataset.name = file.name;
    $('#tdPlayerWrap').style.display = '';
    $('#tdName').textContent = file.name;
    $('#tdInfo').textContent = `${(file.size / 1048576).toFixed(1)} MB · 正在读时长…`;
    td.name = file.name;
    videoEl = video;
    video.onloadedmetadata = () => {
      $('#tdInfo').textContent = `${(file.size / 1048576).toFixed(1)} MB · ${video.duration.toFixed(1)} 秒 · ${video.videoWidth}×${video.videoHeight}`;
      td.dur = video.duration;
      store.persistProjects();
    };
  };

  /* ---------- 事件 ---------- */
  $('#tdPick').onclick = () => $('#tdFile').click();
  $('#tdFile').onchange = (e) => loadFile(e.target.files && e.target.files[0]);
  const drop = $('#tdDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('on'); }));
  drop.addEventListener('drop', (e) => loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
  $('#tdRun').onclick = runAnalyze;

  $('#tdCsv').onclick = () => {
    if (!td.shots.length) return;
    const head = '镜号,入点,出点,时长,景别,运镜,角度,备注\n';
    const body = td.shots.map(s => [s.i, fmt(s.t0), fmt(s.t1), s.dur.toFixed(1),
      (SZ.find(x => x[0] === s.shotSize) || ['', ''])[1], (MV.find(x => x[0] === s.cameraMove) || ['', ''])[1],
      (AN.find(x => x[0] === s.angle) || ['', ''])[1], '"' + String(s.note || '').replace(/"/g, '""') + '"'].join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + head + body], { type: 'text/csv;charset=utf-8' }));
    a.download = (td.name || '拉片') + '-拉片表.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('#tdClear').onclick = async () => {
    if (!await confirmDlg('清空这次拆镜结果？（视频不受影响，可以重新拆）', { danger: true, okText: '清空' })) return;
    td.shots = [];
    store.persistProjects();
    await drawShots();
    toast('已清空');
  };

  const UNIT = { lens: 'mm', camH: 'm', dist: 'm', az: '°' };
  $('#tdShots').addEventListener('input', (e) => {
    const el = e.target;
    if (el.type !== 'range') return;
    const i = +el.dataset.i, f2 = el.dataset.f;
    const s2 = td.shots.find(x => x.i === i);
    if (!s2) return;
    s2[f2] = +el.value;
    const b = el.parentElement.querySelector('b');
    if (b) b.textContent = el.value + (UNIT[f2] || '');
    store.persistProjects();
  });
  $('#tdShots').addEventListener('change', (e) => {
    const el = e.target;
    const i = +el.dataset.i, f = el.dataset.f;
    if (!i || !f) return;
    const s = td.shots.find(x => x.i === i);
    if (!s) return;
    s[f] = el.value;
    store.persistProjects();
  });
  $('#tdShots').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i, act = b.dataset.act;
    const s = td.shots.find(x => x.i === i);
    if (!s) return;
    if (act === 'seek') {
      if (!videoEl) return toast('先把视频选回来', 'warn');
      await window.TEAR_DOWN.seek(videoEl, s.t0 + 0.02);
      videoEl.play().catch(() => { });
      return;
    }
    if (act === 'del') {
      td.shots = td.shots.filter(x => x.i !== i);
      td.shots.forEach((x, k) => { x.i = k + 1; });
      store.persistProjects();
      await drawShots();
      return;
    }
    if (act === 'copy') await replicateIn3D(s);
  });

  /* 进导演台 3D 复刻：把这一镜的参考帧铺成背景板，站进去对机位 */
  /* 这一镜对应的分镜条目（没有就建一条），复刻完直接「保存到镜头」写回去 */
  const boardShotFor = (s) => {
    const p2 = store.active;
    if (s.boardId) {
      const ex = (p2.shots || []).find(x => x.id === s.boardId);
      if (ex) return ex;
    }
    const sh = store.addShot ? store.addShot({
      desc: s.note || ('拉片 · 第 ' + s.i + ' 镜'),
      duration: Math.max(0.5, Math.round(s.dur * 10) / 10),
      shotSize: s.shotSize || 'MS',
      cameraMove: s.cameraMove || 'static',
      angle: s.angle || 'eye',
    }) : null;
    if (!sh) return null;
    if (s.thumbKey) store.updateShot(sh.id, { image: s.thumbKey });
    s.boardId = sh.id;
    store.persistProjects();
    return sh;
  };

  /* 把卡片上那四个数字变成 3D 机位：焦段 → 垂直 FOV，机高+距离 → 极角/半径 */
  const applyShotCam = (s) => {
    if (!window.MN3D || !window.MN3D.getCamera) return;
    const c = window.MN3D.getCamera();
    const dist = Math.max(0.6, +(s.dist == null ? 8 : s.dist));
    const camH = Math.max(0.15, +(s.camH == null ? 1.5 : s.camH));
    const az = (+(s.az) || 0) * Math.PI / 180;
    const dy = camH - (c.ty || 1.2);
    const r = Math.max(0.8, Math.hypot(dist, dy));
    const phi = Math.max(0.08, Math.min(1.54, Math.atan2(dist, Math.abs(dy) < 0.05 ? 0.05 : dy)));
    if (window.MN && window.MN.state && window.MN.state.camera) {
      window.MN.state.camera.fov = lensToFov(s.lens == null ? 35 : s.lens);
    }
    window.MN3D.setCamera({ theta: az, phi, r, tx: c.tx, ty: c.ty, tz: c.tz });
  };

  const replicateIn3D = async (s) => {
    const url = await urlOf(s.thumbKey || s.thumb);
    if (!url) return toast('这一镜没有缩略图', 'warn');
    const { openSceneBuilder } = await import('./builder.js');
    const sh = boardShotFor(s);
    /* 传真实分镜条目进去 → 导演台里「保存到镜头」就是"写回分镜"那一步 */
    openSceneBuilder(sh || null, () => { }, sh ? {} : { library: true });
    /* 等导演台起来，再把参考帧塞成背景板 */
    const t0 = Date.now();
    const wait = () => new Promise(r => setTimeout(r, 150));
    while (Date.now() - t0 < 12000) {
      if (window.MN && window.MN.built && window.MN.state) break;
      await wait();
    }
    if (!window.MN || !window.MN.state) return toast('导演台没起来，刷新再试', 'warn');
    const dataURL = await fetch(url).then(r => r.blob()).then(b => new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(b);
    }));
    const sc = window.MN.state.scene;
    sc.env = Object.assign({}, window.ENV_IMPORT ? window.ENV_IMPORT.envFromResult({ obj: { scene: sc }, imgW: 16, imgH: 9, dataURL }) : {}, {
      on: true, mode: 'board', src: dataURL, yaw: 0, bright: 1,
    });
    if (window.MN.state.view.mode !== '3d' && window.setMode) window.setMode('3d');
    window.renderAll && window.renderAll();
    await new Promise(r => setTimeout(r, 260));
    applyShotCam(s);
    toast(sh ? '机位已按卡片上的数字摆好 · 调完点「💾 保存到镜头」就写回分镜' : '机位已摆好（独立建景，存进场景库）', 'ok');
  };

  await drawShots();
}
