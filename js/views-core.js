/* ============================================================
 * 白日梦导演台 · 核心视图
 * 项目台 / 剧本 / 分镜板（含傻瓜模式）/ 镜头编辑器
 * ============================================================ */
import { CAMERA_MOVES, MOVE_CATS, SHOT_SIZES, ANGLES, TRANSITIONS, PROMPT_TEMPLATES, STYLE_BANK, ACTOR_ACTIONS, STAGE_SCENES } from './data.js';
import { localBreakdown, aiBreakdown, aiEnhancePrompt, buildPrompt, moveByKey } from './breakdown.js';
import { WhiteModelRenderer, solveCamera } from './cameraSim.js';
import { esc, el, modal, confirmDlg, toast, copyText, pickFile, fmtDur, opts } from './ui.js';

let store;   // 由 init 注入
export function initViewsCore(s) { store = s; }

/* ============================================================
 * 项目台（首页）
 * ============================================================ */
export function renderHome(container) {
  const projects = store.projects;
  const totalShots = projects.reduce((a, p) => a + p.shots.length, 0);
  const totalDur = projects.reduce((a, p) => a + store.totalDuration(p), 0);
  const achv = store.achv;

  container.innerHTML = `
  <div class="home-hero">
    <div class="hero-text">
      <div class="hero-badge">🎬 AI 影片导演工作台</div>
      <h1>把脑中的<em>白日梦</em>，<br>拍成一部真片子。</h1>
      <p>贴上剧本 → 一键拆分镜 → 挑运镜看白模预演 → 产出提示词交给 AI 出片。<br>全流程都在浏览器里完成，数据只存在你自己的设备上。</p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" id="heroNew">＋ 新建项目</button>
        <button class="btn btn-ghost btn-lg" id="heroTour">📖 三分钟上手</button>
      </div>
    </div>
    <div class="hero-card">
      <div class="hero-stage">
        <canvas id="heroCanvas"></canvas>
        <div class="hero-stage-label">📷 运镜预演 · 白模舞台</div>
      </div>
      <div class="hero-stats">
        <div><b>${projects.length}</b><span>项目</span></div>
        <div><b>${totalShots}</b><span>镜头</span></div>
        <div><b>${Math.round(totalDur)}s</b><span>总时长</span></div>
        <div><b>${achv.streak || 0}</b><span>连签天数</span></div>
      </div>
    </div>
  </div>

  <div class="section-head">
    <h2>我的项目</h2>
    <button class="btn btn-primary" id="btnNewProject">＋ 新建项目</button>
  </div>
  <div class="proj-grid" id="projGrid">
    ${projects.length === '' ? '' : ''}
  </div>`;

  const grid = container.querySelector('#projGrid');
  if (!projects.length) {
    grid.innerHTML = `<div class="empty-tip">还没有项目。点「新建项目」，从一句话故事开始你的第一部片子 🌙</div>`;
  } else {
    for (const p of projects) {
      const dur = store.totalDuration(p);
      const card = el(`<div class="proj-card" data-id="${p.id}">
        <div class="proj-aspect aspect-${p.aspect.replace(':', 'x')}">
          ${p.shots.length ? `<span class="proj-shotcount">${p.shots.length} 镜</span>` : '<span class="proj-shotcount proj-shotcount-empty">待拆分镜</span>'}
        </div>
        <div class="proj-info">
          <div class="proj-name">${esc(p.name)}</div>
          <div class="proj-meta">${p.aspect} · ${p.shots.length} 镜 · ${fmtDur(dur)} · ${new Date(p.updatedAt).toLocaleDateString()}</div>
        </div>
        <div class="proj-ops">
          <button class="icon-btn" data-op="open" title="打开">打开</button>
          <button class="icon-btn" data-op="rename" title="重命名">✏️</button>
          <button class="icon-btn" data-op="dup" title="复制">⧉</button>
          <button class="icon-btn" data-op="del" title="删除">🗑</button>
        </div>
      </div>`);
      card.addEventListener('click', e => {
        const op = e.target.closest('[data-op]')?.dataset.op;
        if (op === 'rename') { e.stopPropagation(); openProjectRename(p.id, () => renderHome(container)); return; }
        if (op === 'dup') { e.stopPropagation(); store.duplicateProject(p.id); renderHome(container); return; }
        if (op === 'del') {
          e.stopPropagation();
          confirmDlg(`删除项目「${p.name}」？连同步镜头的参考图一起删，不可恢复。`, { danger: true, okText: '删除' })
            .then(ok => { if (ok) { store.deleteProject(p.id); renderHome(container); } });
          return;
        }
        store.openProject(p.id);
        window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'storyboard' } }));
      });
      grid.appendChild(card);
    }
  }

  /* 首页舞台小动画 */
  const canvas = container.querySelector('#heroCanvas');
  const renderer = new WhiteModelRenderer(canvas);
  renderer.setTheme({ bg1: '#eef1f6', bg2: '#e2e6ee', fog: '#e9ecf2', line: 'rgba(96,106,134,.30)', ink: '#2a3040', hud: 'rgba(35,42,60,.38)' });
  const demoMoves = CAMERA_MOVES.filter(m => ['slowPush', 'orbitRight', 'craneUp', 'truckRight', 'spiralUp', 'dollyZoom'].includes(m.key));
  let mi = 0, raf = null, t0 = performance.now();
  let heroFrame = 0, heroVisible = true;
  new IntersectionObserver(es => { heroVisible = es[0].isIntersecting; }).observe(canvas);
  const loop = (now) => {
    if (!document.body.contains(canvas)) return;
    if (!heroVisible || (heroFrame++ % 3)) { raf = requestAnimationFrame(loop); return; }
    const t = ((now - t0) / 5200) % 1;
    renderer.scene = ['plain', 'street', 'room'][Math.floor(((now - t0) / 5200) % 3)];
    renderer.render(demoMoves[mi].sim, t, ['stand', 'walk', 'turn'][Math.floor(((now - t0) / 5200) % 3)], { hud: false });
    if (t < 0.02) mi = (mi + 1) % demoMoves.length;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const newProject = () => {
    const m = modal({
      title: '新建项目',
      body: `
        <div class="form-row"><label>项目名称</label><input id="npName" class="input" placeholder="比如：午夜便利店（第一集）" maxlength="40"></div>
        <div class="form-row"><label>画幅</label>
          <div class="aspect-picker" id="npAspect">
            <button class="aspect-opt selected" data-v="16:9"><span class="ar ar-169"></span>横屏 16:9<div class="aspect-sub">长视频 / B 站</div></button>
            <button class="aspect-opt" data-v="9:16"><span class="ar ar-916"></span>竖屏 9:16<div class="aspect-sub">短剧 / 抖音</div></button>
            <button class="aspect-opt" data-v="1:1"><span class="ar ar-11"></span>方形 1:1<div class="aspect-sub">社交 / 贴图</div></button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="ok">创建</button>
        </div>`,
    });
    let aspect = '16:9';
    m.body.querySelectorAll('.aspect-opt').forEach(b => b.onclick = () => {
      m.body.querySelectorAll('.aspect-opt').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected'); aspect = b.dataset.v;
    });
    m.body.querySelector('[data-act="cancel"]').onclick = () => m.close();
    m.body.querySelector('[data-act="ok"]').onclick = () => {
      const name = m.body.querySelector('#npName').value.trim() || '未命名项目';
      store.createProject(name, aspect);
      m.close();
      toast('项目创建成功，先去贴剧本吧 📜', 'ok');
      window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'script' } }));
    };
    setTimeout(() => m.body.querySelector('#npName').focus(), 50);
  };
  container.querySelector('#heroNew').onclick = newProject;
  container.querySelector('#btnNewProject').onclick = newProject;
  container.querySelector('#heroTour').onclick = () => window.dispatchEvent(new Event('bdm-tutorial'));

  return () => { if (raf) cancelAnimationFrame(raf); renderer.destroy?.(); };
}

/* ============================================================
 * 剧本页
 * ============================================================ */
export function renderScript(container) {
  const p = store.active;
  if (!p) { container.innerHTML = emptyProjectTip(); return; }

  container.innerHTML = `
    <div class="page-head">
      <h2>📜 剧本 · <span class="dim">${esc(p.name)}</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btnLoadDemo">载入示例剧本</button>
      </div>
    </div>
    <div class="script-layout">
      <div class="card script-editor-card">
        <div class="card-title">把你的剧本或故事大纲贴进来</div>
        <textarea id="scriptArea" class="script-area" placeholder="支持自由格式：&#10;&#10;第1场 便利店 夜 内&#10;深夜的便利店，灯光惨白。店员小林趴在柜台上打瞌睡。&#10;自动门「叮」地开了，一个浑身湿透的女孩走进来。&#10;小林：「欢迎光临……诶？外面下雨了吗？」&#10;女孩没有回答，径直走向冰柜，拿出一罐冰可乐。&#10;&#10;—— 台词用「」引住会被识别；第X场 / 场景： 开头的行会被当作场次标题 ——">${esc(p.script)}</textarea>
        <div class="script-tools">
          <span class="dim" id="scriptStat">0 字</span>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="btnLocalBreak">⚡ 一键拆分镜</button>
          <button class="btn btn-magic" id="btnAIBreak" ${store.settings.api ? '' : 'disabled title="先到 设置→AI接口 配置接口"'}>🤖 AI 拆分镜</button>
        </div>
        <div class="script-hint dim">⚡ 本地拆分：识别场次与台词，自动分配运镜与景别建议 · 🤖 AI 拆分：更懂剧情节奏（需配置接口）</div>
      </div>
      <div class="card script-preview-card">
        <div class="card-title">拆分结果预览 <span class="dim" id="previewCount"></span></div>
        <div id="breakPreview" class="break-preview"><div class="empty-tip">拆分结果会出现在这里，确认后写入分镜板</div></div>
      </div>
    </div>`;

  const area = container.querySelector('#scriptArea');
  const statEl = container.querySelector('#scriptStat');
  const updateStat = () => statEl.textContent = `${area.value.replace(/\s/g, '').length} 字`;
  area.addEventListener('input', () => { updateStat(); store.updateProject(p.id, { script: area.value }); });
  updateStat();

  container.querySelector('#btnLoadDemo').onclick = () => {
    area.value = DEMO_SCRIPT;
    store.updateProject(p.id, { script: area.value });
    updateStat();
    toast('示例剧本已载入，试试「一键拆分镜」');
  };

  const previewBox = container.querySelector('#breakPreview');
  const countEl = container.querySelector('#previewCount');
  const showPreview = (shots, via) => {
    countEl.textContent = `· ${shots.length} 个镜头 · ${via}`;
    previewBox.innerHTML = `
      <div class="break-list">${shots.map((s, i) => `
        <div class="break-item">
          <div class="break-idx">${i + 1}</div>
          <div class="break-main">
            <div class="break-desc">${esc(s.desc)}</div>
            ${s.dialogue ? `<div class="break-dlg">💬 ${esc(s.dialogue)}</div>` : ''}
            <div class="break-tags">
              <span class="tag">${esc(moveByKey[s.cameraMove]?.name || s.cameraMove)}</span>
              <span class="tag tag-size">${esc(SHOT_SIZES.find(x => x.key === s.shotSize)?.name || '')}</span>
              <span class="tag tag-dur">${s.duration}s</span>
            </div>
          </div>
        </div>`).join('')}</div>
      <div class="break-actions">
        <button class="btn btn-primary" id="btnApplyBreak">✔ 确认导入分镜板（${shots.length} 镜）</button>
      </div>`;
    previewBox.querySelector('#btnApplyBreak').onclick = () => {
      const merged = [...p.shots, ...shots.map(s => ({ ...s, title: s.title || '' }))];
      store.setShots(merged);
      p.meta.breakdownCount = (p.meta.breakdownCount || 0) + 1;
      store.achv.counts.breakdowns++;
      store.persistAchv();
      store.unlock('firstBreak');
      store._checkShotBadges();
      store.addXP(4 + shots.length, `拆分镜 ${shots.length} 镜`);
      toast(`已导入 ${shots.length} 个镜头到分镜板 🎞️`, 'ok');
      window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'storyboard' } }));
    };
  };

  container.querySelector('#btnLocalBreak').onclick = () => {
    if (!area.value.trim()) { toast('先贴点剧本内容吧', 'warn'); return; }
    const shots = localBreakdown(area.value);
    if (!shots.length) { toast('没拆出镜头，检查一下剧本格式', 'warn'); return; }
    showPreview(shots, '本地规则');
  };
  container.querySelector('#btnAIBreak').onclick = async (e) => {
    if (!area.value.trim()) { toast('先贴点剧本内容吧', 'warn'); return; }
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '🤖 AI 拆分中…';
    try {
      const shots = await aiBreakdown(area.value, store.settings);
      if (!shots.length) throw new Error('AI 返回了空结果');
      showPreview(shots, 'AI');
      store.unlock('aiUser');
      store.addXP(6, 'AI 拆分镜');
    } catch (err) {
      toast('AI 拆分失败：' + err.message, 'warn');
    } finally {
      btn.disabled = false; btn.textContent = '🤖 AI 拆分镜';
    }
  };
}

/* ============================================================
 * 分镜板
 * ============================================================ */
export function renderStoryboard(container) {
  const p = store.active;
  if (!p) { container.innerHTML = emptyProjectTip(); return; }

  container.innerHTML = `
    <div class="page-head">
      <h2>🎞️ 分镜板 <span class="dim">· ${esc(p.name)} · ${p.shots.length} 镜 · ${fmtDur(store.totalDuration(p))}</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="btnSimpleMode">🧠 傻瓜模式</button>
        <button class="btn btn-ghost" id="btnPlayAll">▶ 动态预演</button>
        <button class="btn btn-primary" id="btnAddShot">＋ 加镜头</button>
      </div>
    </div>
    <div id="simplePanel"></div>
    <div class="storyboard-grid" id="sbGrid"></div>
    <div class="sb-footer">
      <span class="dim">拖动卡片调顺序 · 点卡片编辑 · 「傻瓜模式」回答四个问题自动生成分镜</span>
    </div>`;

  const grid = container.querySelector('#sbGrid');
  const simplePanel = container.querySelector('#simplePanel');
  let simpleOn = false;

  const renderCards = () => {
    grid.innerHTML = '';
    if (!p.shots.length) {
      grid.innerHTML = `<div class="empty-tip" style="grid-column:1/-1">分镜板还是空的。<br>去「剧本」页一键拆分镜，或点右上角「＋ 加镜头」手动添加。</div>`;
      return;
    }
    p.shots.forEach((s, i) => {
      const mv = moveByKey[s.cameraMove] || moveByKey.static;
      const card = el(`<div class="shot-card" draggable="true" data-idx="${i}">
        <div class="shot-frame aspect-${p.aspect.replace(':', 'x')}">
          <canvas class="shot-thumb"></canvas>
          <img class="shot-img" style="display:none">
          <div class="shot-frame-tags">
            <span class="tag">${esc(SHOT_SIZES.find(x => x.key === s.shotSize)?.name || '')}</span>
            <span class="tag tag-move">${esc(mv.name)}</span>
          </div>
          <div class="shot-dur">${s.duration}s</div>
          <div class="shot-idx">${i + 1}</div>
          ${s.review ? `<div class="shot-review-flag ${s.review.score >= 4 ? 'good' : s.review.score <= 2 ? 'bad' : ''}">${'★'.repeat(s.review.score)}</div>` : ''}
        </div>
        <div class="shot-body">
          <div class="shot-desc">${esc(s.desc || '（未描述）')}</div>
          ${s.dialogue ? `<div class="shot-dlg">💬 ${esc(s.dialogue)}</div>` : ''}
        </div>
        <div class="shot-ops">
          <button class="icon-btn" data-op="preview" title="预演此镜">▶</button>
          <button class="icon-btn" data-op="dup" title="复制镜头">⧉</button>
          <button class="icon-btn" data-op="del" title="删除">🗑</button>
        </div>
      </div>`);
      card.addEventListener('click', e => {
        const op = e.target.closest('[data-op]')?.dataset.op;
        if (op === 'del') { e.stopPropagation(); confirmDlg(`删除第 ${i + 1} 镜？`, { danger: true, okText: '删除' }).then(ok => { if (ok) { store.deleteShot(s.id); } }); return; }
        if (op === 'dup') { e.stopPropagation(); store.duplicateShot(s.id); toast('已复制镜头'); return; }
        if (op === 'preview') {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'preview', payload: { shotId: s.id } } }));
          return;
        }
        openShotEditor(s, i);
      });
      grid.appendChild(card);
      // 缩略图：参考图 > 手绘稿 > 白模静帧
      const cv = card.querySelector('.shot-thumb');
      const img = card.querySelector('.shot-img');
      const thumbKey = s.image || s.sketch;
      if (thumbKey) {
        store.getImage(thumbKey).then(blob => {
          if (!blob || !document.body.contains(card)) return;
          const url = URL.createObjectURL(blob);
          img.src = url; img.style.display = '';
          cv.style.display = 'none';
          img.onload = () => URL.revokeObjectURL(url);
        });
      } else {
        const r = new WhiteModelRenderer(cv);
        r.setTheme({ bg1: '#eceff4', bg2: '#e1e5ed', fog: '#e8ebf1', line: 'rgba(96,106,134,.26)', ink: '#2a3040', hud: 'rgba(35,42,60,.38)' });
        r.render(mv.sim, 0.55, 'stand', { duration: s.duration });
      }
    });
  };
  renderCards();

  /* 拖拽排序 */
  let dragIdx = null;
  grid.addEventListener('dragstart', e => {
    const card = e.target.closest('.shot-card');
    if (!card) return;
    dragIdx = +card.dataset.idx;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  grid.addEventListener('dragend', e => {
    e.target.closest('.shot-card')?.classList.remove('dragging');
    grid.querySelectorAll('.shot-card').forEach(c => c.classList.remove('drag-over'));
  });
  grid.addEventListener('dragover', e => {
    e.preventDefault();
    const over = e.target.closest('.shot-card');
    grid.querySelectorAll('.shot-card').forEach(c => c.classList.remove('drag-over'));
    if (over && +over.dataset.idx !== dragIdx) over.classList.add('drag-over');
  });
  grid.addEventListener('drop', e => {
    e.preventDefault();
    const over = e.target.closest('.shot-card');
    if (!over || dragIdx === null) return;
    const to = +over.dataset.idx;
    if (to !== dragIdx) { store.moveShot(dragIdx, to); store.addXP(1); }
    dragIdx = null;
  });

  container.querySelector('#btnAddShot').onclick = () => { const s = store.addShot({ desc: '' }); openShotEditor(s, p.shots.length - 1); };
  container.querySelector('#btnPlayAll').onclick = () => {
    if (!p.shots.length) { toast('分镜板是空的，先拆个分镜', 'warn'); return; }
    window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'animatic' } }));
  };

  /* 数据变化时刷新卡片（加/删/改镜头立即反映） */
  const refreshFn = () => { if (document.body.contains(grid)) renderCards(); };
  store.subscribe(refreshFn);

  /* 傻瓜模式 */
  container.querySelector('#btnSimpleMode').onclick = () => {
    simpleOn = !simpleOn;
    container.querySelector('#btnSimpleMode').classList.toggle('btn-primary', simpleOn);
    container.querySelector('#btnSimpleMode').classList.toggle('btn-ghost', !simpleOn);
    if (simpleOn) renderSimplePanel();
    else simplePanel.innerHTML = '';
  };
  function renderSimplePanel() {
    simplePanel.innerHTML = `
      <div class="card simple-card">
        <div class="card-title">🧠 傻瓜模式 · 回答四个问题，一个镜头就出来了</div>
        <div class="simple-grid">
          <div class="form-row"><label>① 谁？</label><input id="smWho" class="input" placeholder="例：穿雨衣的少女"></div>
          <div class="form-row"><label>② 在哪？</label><input id="smWhere" class="input" placeholder="例：深夜便利店里"></div>
          <div class="form-row"><label>③ 在干什么？</label><input id="smWhat" class="input" placeholder="例：把冰可乐贴在脸上降温"></div>
          <div class="form-row"><label>④ 说了什么？（可空）</label><input id="smSay" class="input" placeholder="例：「好凉……」"></div>
        </div>
        <div class="simple-opts">
          <div class="form-row"><label>景别</label><select id="smSize" class="input">${opts(SHOT_SIZES, 'MCU')}</select></div>
          <div class="form-row"><label>运镜</label><select id="smMove" class="input">${opts(CAMERA_MOVES, 'slowPush', m => m.name, m => m.cat)}</select></div>
          <div class="form-row"><label>时长</label><input id="smDur" class="input" type="number" min="1" max="15" step="0.5" value="3"></div>
        </div>
        <div class="modal-actions">
          <span class="dim simple-preview" id="smPreview"></span>
          <div class="spacer"></div>
          <button class="btn btn-primary" id="smAdd">＋ 生成并加入分镜板</button>
        </div>
      </div>`;
    const upd = () => {
      const who = simplePanel.querySelector('#smWho').value.trim() || '人物';
      const where = simplePanel.querySelector('#smWhere').value.trim() || '场景中';
      const what = simplePanel.querySelector('#smWhat').value.trim() || '做着什么';
      simplePanel.querySelector('#smPreview').textContent = `→ 「${where}，${who}${what}」`;
    };
    simplePanel.querySelectorAll('input').forEach(i => i.addEventListener('input', upd));
    simplePanel.querySelector('#smAdd').onclick = () => {
      const who = simplePanel.querySelector('#smWho').value.trim();
      const where = simplePanel.querySelector('#smWhere').value.trim();
      const what = simplePanel.querySelector('#smWhat').value.trim();
      const say = simplePanel.querySelector('#smSay').value.trim();
      if (!who && !what) { toast('至少填「谁」或「干什么」其中一个', 'warn'); return; }
      const size = simplePanel.querySelector('#smSize').value;
      const move = simplePanel.querySelector('#smMove').value;
      const dur = +simplePanel.querySelector('#smDur').value || 3;
      const desc = `${where ? where + '，' : ''}${who || '人物'}${what || '做着什么'}${say ? `，说：「${say}」` : ''}`;
      const tpl = PROMPT_TEMPLATES.find(t => t.key === 'cine').tpl;
      const shot = store.addShot({
        desc, dialogue: say, duration: dur, cameraMove: move, shotSize: size, angle: 'eye',
        prompt: buildPrompt({ desc, cameraMove: move, shotSize: size, angle: 'eye' }, tpl),
      });
      store.achv.counts.prompts++;
      store.persistAchv();
      store.addXP(3, '傻瓜模式加镜头');
      toast('镜头已加入分镜板 ✅', 'ok');
      // 清空输入，方便连续加
      ['smWho', 'smWhere', 'smWhat', 'smSay'].forEach(id => simplePanel.querySelector('#' + id).value = '');
      upd();
      void shot;
    };
    upd();
  }
}

/* ============================================================
 * 镜头编辑器（弹窗）
 * ============================================================ */
export function openShotEditor(shot, idx) {
  const p = store.active;
  const m = modal({
    title: `✏️ 第 ${idx + 1} 镜`, wide: true,
    body: `
    <div class="editor-grid">
      <div class="editor-left">
        <div class="editor-stage aspect-${p.aspect.replace(':', 'x')}">
          <canvas id="edCanvas"></canvas>
          <img id="edImg" style="display:none">
          <button class="btn btn-ghost editor-replay" id="edReplay">↻ 重播运镜</button>
        </div>
        <div class="editor-stage-opts">
          <label class="dim">人物动作</label>
          <select id="edAction" class="input">${opts(ACTOR_ACTIONS, 'stand')}</select>
          <label class="dim">布景</label>
          <select id="edScene" class="input">${opts(STAGE_SCENES, 'plain')}</select>
          <button class="btn btn-magic btn-sm" id="edSceneBtn">🏗 场景搭建</button>
        </div>
        <div class="form-row">
          <label>参考图（可选，预演时替换白模）</label>
          <div class="img-ops">
            <button class="btn btn-ghost" id="edImgUp">📤 上传图片</button>
            <button class="btn btn-ghost" id="edImgDel" style="display:none">移除图片</button>
          </div>
        </div>
        <div class="form-row">
          <label>手绘分镜稿（可选 · 动态分镜会播放手绘稿）</label>
          <canvas id="edSketch" class="sketch-pad" width="640" height="360"></canvas>
          <div class="img-ops" style="margin-top:6px">
            <button class="btn btn-ghost btn-sm" id="edSketchClear">🗑 清空重画</button>
            <button class="btn btn-ghost btn-sm" id="edSketchSave">💾 保存手绘稿</button>
            <span class="dim sketch-hint">按住鼠标在画板上画</span>
          </div>
        </div>
      </div>
      <div class="editor-right">
        <div class="form-row"><label>画面描述</label><textarea id="edDesc" class="input" rows="3" placeholder="谁、在哪、做什么，越具体越好">${esc(shot.desc)}</textarea></div>
        <div class="form-row"><label>台词 / 字幕</label><input id="edDlg" class="input" value="${esc(shot.dialogue)}" placeholder="无台词可留空"></div>
        <div class="editor-3col">
          <div class="form-row"><label>运镜</label><select id="edMove" class="input">${opts(CAMERA_MOVES, shot.cameraMove, m2 => m2.name, m2 => m2.cat)}</select></div>
          <div class="form-row"><label>景别</label><select id="edSize" class="input">${opts(SHOT_SIZES, shot.shotSize)}</select></div>
          <div class="form-row"><label>角度</label><select id="edAngle" class="input">${opts(ANGLES, shot.angle)}</select></div>
        </div>
        <div class="editor-3col">
          <div class="form-row"><label>时长（秒）</label><input id="edDur" class="input" type="number" min="1" max="20" step="0.5" value="${shot.duration}"></div>
          <div class="form-row"><label>转场（到下一镜）</label><select id="edTrans" class="input">${opts(TRANSITIONS, shot.transition, t => t.icon + ' ' + t.name)}</select></div>
          <div class="form-row"><label>运镜速度</label><select id="edSpeed" class="input">
            <option value="slow" ${shot.moveSpeed === 'slow' ? 'selected' : ''}>慢 · 细腻</option>
            <option value="std" ${(!shot.moveSpeed || shot.moveSpeed === 'std') ? 'selected' : ''}>标准</option>
            <option value="fast" ${shot.moveSpeed === 'fast' ? 'selected' : ''}>快 · 有力</option>
          </select></div>
        </div>
        <div class="form-row">
          <label>提示词 <span class="dim">（喂给 AI 视频/图片工具的成品句）</span></label>
          <div class="prompt-ops">
            <button class="btn btn-ghost btn-sm" id="edGenPrompt">🪄 按模板生成</button>
            <button class="btn btn-ghost btn-sm" id="edAI" ${store.settings.api ? '' : 'disabled title="未配置 AI 接口"'}>✨ AI 增强</button>
            <button class="btn btn-ghost btn-sm" id="edCopy">📋 复制</button>
          </div>
          <textarea id="edPrompt" class="input mono" rows="3">${esc(shot.prompt)}</textarea>
        </div>
        <div class="form-row"><label>备注</label><input id="edNote" class="input" value="${esc(shot.note)}" placeholder="拍摄提醒、镜头意图等"></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" id="edDelete">🗑 删除镜头</button>
      <div class="spacer"></div>
      <button class="btn btn-ghost" id="edCancel">取消</button>
      <button class="btn btn-primary" id="edSave">💾 保存</button>
    </div>`,
  });

  const cv = m.body.querySelector('#edCanvas');
  const imgEl = m.body.querySelector('#edImg');
  const renderer = new WhiteModelRenderer(cv);
  const player = { raf: null, t0: performance.now() };
  let action = 'stand', scene = 'plain';

  const playMove = () => {
    const mv = moveByKey[m.body.querySelector('#edMove').value] || moveByKey.static;
    if (imgEl.style.display !== 'none') {
      // 参考图模式：CSS 动画演示
      imgEl.classList.remove('kb-play');
      void imgEl.offsetWidth;
      imgEl.classList.add('kb-play');
      return;
    }
    renderer.scene = scene;
    if (player.raf) cancelAnimationFrame(player.raf);
    const dur = (+m.body.querySelector('#edDur').value || 3) * 1000;
    const t0 = performance.now();
    const loopFn = (now) => {
      if (!document.body.contains(cv)) return;
      const t = Math.min(1, (now - t0) / dur);
      renderer.render(mv.sim, t, action, { duration: dur / 1000, hud: true, letterbox: true, angle: m.body.querySelector('#edAngle').value, moveSpeed: m.body.querySelector('#edSpeed').value, size: m.body.querySelector('#edSize').value, scene: shot.scene });
      if (t < 1) player.raf = requestAnimationFrame(loopFn);
      else setTimeout(() => { if (document.body.contains(cv)) playMove(); }, 600);
    };
    player.raf = requestAnimationFrame(loopFn);
  };

  /* 参考图处理 */
  const imgDel = m.body.querySelector('#edImgDel');
  const showImg = (blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    imgEl.src = url; imgEl.style.display = '';
    cv.style.display = 'none';
    imgDel.style.display = '';
    imgEl.onload = () => { imgEl.classList.add('kb-play'); };
  };
  const overlayKey = shot.image || shot.sketch;
  if (overlayKey) store.getImage(overlayKey).then(showImg);
  m.body.querySelector('#edImgUp').onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    await store.attachImage(shot.id, f);
    store.getImage(shot.image).then(showImg);
    toast('参考图已保存');
  };
  imgDel.onclick = () => {
    store.deleteImage(shot.image);
    store.updateShot(shot.id, { image: null });
    imgEl.style.display = 'none'; imgDel.style.display = '';
    cv.style.display = '';
    playMove();
  };

  /* 手绘分镜稿画板 */
  const skCanvas = m.body.querySelector('#edSketch');
  const skCtx = skCanvas.getContext('2d');
  const paperFill = () => { skCtx.fillStyle = '#faf9f4'; skCtx.fillRect(0, 0, skCanvas.width, skCanvas.height); };
  let skDirty = false;
  paperFill();
  if (shot.sketch) {
    store.getImage(shot.sketch).then(blob => {
      if (!blob) return;
      const img = new Image();
      img.onload = () => skCtx.drawImage(img, 0, 0, skCanvas.width, skCanvas.height);
      img.src = URL.createObjectURL(blob);
    });
  }
  let drawing = false, lastPt = null;
  const ptOf = (e) => {
    const r = skCanvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * skCanvas.width / r.width, y: (e.clientY - r.top) * skCanvas.height / r.height };
  };
  skCanvas.addEventListener('pointerdown', e => { drawing = true; lastPt = ptOf(e); try { skCanvas.setPointerCapture(e.pointerId); } catch {} });
  skCanvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const pt = ptOf(e);
    skCtx.strokeStyle = '#2a2f3a'; skCtx.lineWidth = 3; skCtx.lineCap = 'round'; skCtx.lineJoin = 'round';
    skCtx.beginPath(); skCtx.moveTo(lastPt.x, lastPt.y); skCtx.lineTo(pt.x, pt.y); skCtx.stroke();
    lastPt = pt; skDirty = true;
  });
  skCanvas.addEventListener('pointerup', () => { drawing = false; });
  m.body.querySelector('#edSketchClear').onclick = async () => {
    paperFill(); skDirty = false;
    await store.deleteSketch(shot.id);
    toast('手绘稿已清空');
  };
  m.body.querySelector('#edSketchSave').onclick = () => {
    if (!skDirty) { toast('画板上还没有新画的内容'); return; }
    skCanvas.toBlob(async b => { if (b) await store.attachSketch(shot.id, b); }, 'image/png');
  };

  m.body.querySelector('#edMove').onchange = playMove;
  m.body.querySelector('#edAction').onchange = e => { action = e.target.value; playMove(); };
  m.body.querySelector('#edScene').onchange = e => { scene = e.target.value; playMove(); };
  m.body.querySelector('#edReplay').onclick = playMove;
  m.body.querySelector('#edSceneBtn').onclick = () => openSceneBuilder(shot, playMove);

  m.body.querySelector('#edGenPrompt').onclick = () => {
    const tpl = PROMPT_TEMPLATES[0].tpl;
    const prompt = buildPrompt(readForm(), tpl);
    m.body.querySelector('#edPrompt').value = prompt;
    store.achv.counts.prompts++;
    store.persistAchv();
    if (store.achv.counts.prompts >= 10) store.unlock('prompter');
    store.addXP(1, '生成提示词');
  };
  m.body.querySelector('#edAI').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '✨ 增强中…';
    try {
      const out = await aiEnhancePrompt(m.body.querySelector('#edDesc').value, store.settings);
      if (out) {
        m.body.querySelector('#edPrompt').value = out;
        store.unlock('aiUser');
        store.addXP(2, 'AI 增强提示词');
      }
    } catch (err) { toast('AI 增强失败：' + err.message, 'warn'); }
    finally { btn.disabled = false; btn.textContent = '✨ AI 增强'; }
  };
  m.body.querySelector('#edCopy').onclick = () => copyText(m.body.querySelector('#edPrompt').value);

  function readForm() {
    return {
      desc: m.body.querySelector('#edDesc').value.trim(),
      dialogue: m.body.querySelector('#edDlg').value.trim(),
      cameraMove: m.body.querySelector('#edMove').value,
      shotSize: m.body.querySelector('#edSize').value,
      angle: m.body.querySelector('#edAngle').value,
      duration: clampNum(+m.body.querySelector('#edDur').value || 3, 1, 20),
      transition: m.body.querySelector('#edTrans').value,
      moveSpeed: m.body.querySelector('#edSpeed').value,
      prompt: m.body.querySelector('#edPrompt').value,
      note: m.body.querySelector('#edNote').value.trim(),
    };
  }
  m.body.querySelector('#edSave').onclick = () => {
    store.updateShot(shot.id, readForm());
    store.addXP(1);
    m.close();
    toast('镜头已保存 ✅', 'ok');
  };
  m.body.querySelector('#edCancel').onclick = () => m.close();
  m.body.querySelector('#edDelete').onclick = async () => {
    if (await confirmDlg('删除这个镜头？', { danger: true, okText: '删除' })) {
      store.deleteShot(shot.id);
      m.close();
    }
  };
  playMove();
}

const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- 重命名项目（项目卡 ✏️ / 顶栏 ✏️ 共用） ---------- */
export function openProjectRename(id, onDone) {
  const p = store.projects.find(x => x.id === id) || store.active;
  if (!p) { toast('先打开一个项目', 'warn'); return; }
  const m = modal({
    title: '✏️ 重命名项目',
    body: `
      <div class="form-row"><label>项目名称</label><input id="rnName" class="input" maxlength="40" value="${esc(p.name)}"></div>
      <div class="form-row"><label>画幅</label>
        <div class="aspect-picker" id="rnAspect">
          ${['16:9', '9:16', '1:1'].map(v => `
            <button class="aspect-opt ${v === p.aspect ? 'selected' : ''}" data-v="${v}">
              <span class="ar ${v === '16:9' ? 'ar-169' : v === '9:16' ? 'ar-916' : 'ar-11'}"></span>
              ${v === '16:9' ? '横屏 16:9' : v === '9:16' ? '竖屏 9:16' : '方形 1:1'}
            </button>`).join('')}
        </div>
      </div>
      <div class="dim" style="font-size:12px">内容（剧本 / 分镜）不受影响，改完即时生效。</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">取消</button>
        <button class="btn btn-primary" data-act="ok">保存</button>
      </div>`,
  });
  let aspect = p.aspect;
  m.body.querySelectorAll('#rnAspect .aspect-opt').forEach(b => b.onclick = () => {
    m.body.querySelectorAll('#rnAspect .aspect-opt').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    aspect = b.dataset.v;
  });
  m.body.querySelector('[data-act="cancel"]').onclick = () => m.close();
  m.body.querySelector('[data-act="ok"]').onclick = () => {
    const name = m.body.querySelector('#rnName').value.trim();
    store.updateProject(p.id, { name: name || p.name, aspect });
    m.close();
    toast('项目已更新 ✅', 'ok');
    if (onDone) onDone();
  };
  setTimeout(() => { const i = m.body.querySelector('#rnName'); i.focus(); i.select(); }, 60);
}

/* ---------- 空项目提示 ---------- */
function emptyProjectTip() {
  return `<div class="empty-tip">还没有打开的项目。<br><button class="btn btn-primary" onclick="window.dispatchEvent(new CustomEvent('bdm-nav',{detail:{view:'home'}}))">← 回项目台新建一个</button></div>`;
}

/* ============================================================
 * 场景搭建器：点地面摆放人物/道具，自由机位滑块
 * ============================================================ */
const DEG2 = Math.PI / 180;
function unprojectGround(sx, sy, cam, focal, W, H) {
  const A = (sx - W / 2) / focal, B = (H / 2 - sy) / focal;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const denom = B * cp + sp;
  if (Math.abs(denom) < 0.02) return null;
  const d = -cam.pos[1] / denom;
  if (d <= 0.15 || d > 60) return null;
  const x2 = A * d, z2 = B * d * sp - d * cp;
  const cy_ = Math.cos(cam.yaw), sy_ = Math.sin(cam.yaw);
  return [cam.pos[0] + x2 * cy_ - z2 * sy_, cam.pos[2] + x2 * sy_ + z2 * cy_];
}

function openSceneBuilder(shot, onSaved) {
  const scene = shot.scene ? JSON.parse(JSON.stringify(shot.scene)) : { objects: [], cam: { az: 25, dist: 7, h: 1.8, fov: 55 } };
  if (!scene.cam) scene.cam = { az: 25, dist: 7, h: 1.8, fov: 55 };
  if (!scene.light) scene.light = { az: 0, el: 35, int: 1 };
  scene.cam = { az: +scene.cam.az || 0, dist: Math.min(12, Math.max(3, +scene.cam.dist || 7)), h: Math.min(9, Math.max(0.4, +scene.cam.h || 1.8)), fov: Math.min(90, Math.max(25, +scene.cam.fov || 55)) };
  scene.light = { az: +scene.light.az || 0, el: Math.min(85, Math.max(5, +scene.light.el ?? 35)), int: Math.min(1.3, Math.max(0.3, +scene.light.int ?? 1)) };
  scene.base = ['plain', 'street', 'room', 'stage'].includes(scene.base) ? scene.base : 'plain';
  scene.objects = (Array.isArray(scene.objects) ? scene.objects : []).filter(o => o && typeof o === 'object')
    .map(o => ({ ...o, x: +o.x || 0, z: +o.z || 0, rot: +o.rot || 0, scale: Math.min(3, Math.max(0.3, +o.scale || 1)) }))
    .filter(o => isFinite(o.x) && isFinite(o.z));
  let placeType = 'actor', selIdx = -1, pathDraw = false, pathTarget = null;
  const TYPE_NAME = { actor: '人物', box: '木箱', pillar: '立柱', table: '桌子', wall: '围墙' };
  const m = modal({
    title: '🏗 场景搭建 · ' + (shot.desc || '未命名镜头').slice(0, 14), wide: true,
    onClose: () => { if (typeof raf !== 'undefined' && raf) cancelAnimationFrame(raf); },
    body: `
      <div class="sb-layout">
        <div class="sb-stage"><canvas id="sbCanvas"></canvas>
          <div class="sb-tip" id="sbTip">点击地面放置「人物」 · 点击已有对象可选中挪动</div>
        </div>
        <div class="sb-side">
          <div class="card-title">视图</div>
          <div class="sb-palette">
            <button class="chip chip-on" data-v="3d">🎮 3D 预览</button>
            <button class="chip" data-v="2d">📐 2D 画空间</button>
          </div>
          <div class="card-title">底景</div>
          <div class="sb-palette" id="sbBase">
            <button class="chip ${(scene.base || 'plain') === 'plain' ? 'chip-on' : ''}" data-b="plain">空舞台</button>
            <button class="chip ${scene.base === 'street' ? 'chip-on' : ''}" data-b="street">街道</button>
            <button class="chip ${scene.base === 'room' ? 'chip-on' : ''}" data-b="room">房间</button>
            <button class="chip ${scene.base === 'stage' ? 'chip-on' : ''}" data-b="stage">舞台</button>
          </div>
          <div class="card-title" style="margin-top:10px">放置对象</div>
          <div class="sb-palette">
            <button class="chip chip-on" data-t="actor">👤 人物</button>
            <button class="chip" data-t="box">📦 木箱</button>
            <button class="chip" data-t="pillar">🏛 立柱</button>
            <button class="chip" data-t="table">🪑 桌子</button>
            <button class="chip" data-t="wall">🧱 围墙</button>
            <button class="chip" data-t="door">🚪 门框</button>
            <button class="chip" data-t="window">🪟 窗墙</button>
            <button class="chip" data-t="sofa">🛋️ 沙发</button>
            <button class="chip" data-t="tree">🌳 树</button>
            <button class="chip" data-t="wallline">📐 墙线</button>
            <button class="chip" data-t="lamp">💡 灯</button>
          </div>
          <div id="sbProps" class="sb-props"><div class="dim">选中对象后在这里调整动作 / 朝向 / 大小</div></div>
          <div class="sb-list-head" id="sbListHead">📋 场景清单</div>
          <div id="sbList" class="sb-list"></div>
          <div class="card-title" style="margin-top:14px">自由机位</div>
          <div class="sb-palette" style="margin-bottom:8px">
            <button class="chip" id="sbVTop">📍 俯视</button>
            <button class="chip" id="sbVOblique">📍 斜视</button>
            <button class="chip" id="sbVFront">📍 正视</button>
            <button class="chip ${scene.vf ? 'chip-on' : ''}" id="sbVF">🖼 取景框</button>
            <button class="chip" id="sbCut">🔪 剖开前方墙</button>
          </div>
          <div>
            <div class="form-row"><label>方位角 <span id="sbAzV">${scene.cam.az}°</span></label><input type="range" id="sbAz" class="scrub" min="0" max="360" value="${scene.cam.az}"></div>
            <div class="form-row"><label>距离 <span id="sbDistV">${scene.cam.dist}</span></label><input type="range" id="sbDist" class="scrub" min="3" max="12" step="0.5" value="${scene.cam.dist}"></div>
            <div class="form-row"><label>高度 <span id="sbHV">${scene.cam.h}</span></label><input type="range" id="sbH" class="scrub" min="0.4" max="9" step="0.1" value="${scene.cam.h}"></div>
            <div class="form-row"><label>视野 <span id="sbFovV">${scene.cam.fov}°</span></label><input type="range" id="sbFov" class="scrub" min="25" max="90" value="${scene.cam.fov}"></div>
          </div>
          <div class="card-title" style="margin-top:14px">光影光位 <span class="dim">（相对机位）</span></div>
          <div class="sb-palette" id="sbLightPresets">
            <button class="chip" data-l="key">☀️ 顺光</button>
            <button class="chip" data-l="side">🧭 侧光</button>
            <button class="chip" data-l="rim">🌅 侧逆光</button>
            <button class="chip" data-l="back">🌇 逆光</button>
            <button class="chip" data-l="top">🔆 顶光</button>
            <button class="chip" data-l="flat">☁️ 高调平光</button>
          </div>
          <div class="form-row"><label>光方位 <span id="sbLAzV">${scene.light?.az ?? 0}°</span><span class="dim">（0°=机位后顺光 / 180°=逆光）</span></label><input type="range" id="sbLAz" class="scrub" min="0" max="360" value="${scene.light?.az ?? 0}"></div>
          <div class="form-row"><label>光高度 <span id="sbLElV">${scene.light?.el ?? 35}°</span></label><input type="range" id="sbLEl" class="scrub" min="5" max="85" value="${scene.light?.el ?? 35}"></div>
          <div class="form-row"><label>光强度 <span id="sbLIntV">${scene.light?.int ?? 1}</span></label><input type="range" id="sbLInt" class="scrub" min="0.3" max="1.3" step="0.05" value="${scene.light?.int ?? 1}"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-magic btn-sm" id="sbAI">🤖 AI 搭建</button>
        <button class="btn btn-ghost btn-sm" id="sbTpl">🏘 模板</button>
        <button class="btn btn-ghost btn-sm" id="sbClear">🗑 清空场景</button>
        <div class="spacer"></div>
        <button class="btn btn-magic btn-sm" id="sbRec">🎬 录制运镜</button>
        <button class="btn btn-ghost" id="sbMax">⛶ 放大搭建</button>
        <button class="btn btn-ghost" id="sbCancel">取消</button>
        <button class="btn btn-primary" id="sbSave">💾 保存场景</button>
      </div>`,
  });
  const cv = m.body.querySelector('#sbCanvas');
  const renderer = new WhiteModelRenderer(cv);
  const sim = { type: 'free' };
  let raf = null;
  const t0 = performance.now();
  let frame = 0, lastFloor = null;
  const loop = (now) => {
    if (!document.body.contains(cv)) return;
    frame++;
    if (frame % 2) { raf = requestAnimationFrame(loop); return; } // 30fps 足够预览
    if (lastFloor !== (scene.floor || '')) { renderer.setTheme({ ground: scene.floor || '#d9dde5' }); lastFloor = scene.floor || ''; }
    if (sbView === '2d') { try { draw2D(); } catch (e) { console.warn('draw2D', e); } raf = requestAnimationFrame(loop); return; }
    try { renderer.render(sim, ((now - t0) / 4000) % 1, 'stand', { duration: 4, hud: false, letterbox: true, scene }); } catch (e) { console.warn('sb render', e); }
    if (scene.vf) {
      const vc = cv.getContext('2d');
      const cw = cv.clientWidth, ch = cv.clientHeight;
      const fh = cw * 9 / 16;
      if (fh <= ch) {
        const y0 = (ch - fh) / 2;
        vc.strokeStyle = 'rgba(255,255,255,0.55)'; vc.lineWidth = 1.5;
        vc.setLineDash([6, 5]);
        vc.strokeRect(cw * 0.06, y0, cw * 0.88, fh);
        vc.setLineDash([]);
      }
    }
    renderer.render(sim, ((now - t0) / 4000) % 1, 'stand', { duration: 4, hud: false, letterbox: true, scene });
    // 轨迹叠加层
    const tctx = cv.getContext('2d');
    const tgtObj = (selIdx >= 0 && scene.objects[selIdx]) || pathTarget;
    if (tgtObj && tgtObj.path && tgtObj.path.length) {
      const camNow = solveCamera(sim, 0.35, { x: 0, y: 0, z: 0 }, { angle: 'eye', scene });
      const fcal = (cv.getBoundingClientRect().height / 2) / Math.tan(((scene.cam?.fov || 55) * DEG2) / 2);
      tctx.strokeStyle = '#ff5470'; tctx.lineWidth = 2;
      tctx.beginPath();
      let started = false;
      for (const wp of tgtObj.path) {
        const pr = renderer.project([wp.x, 0.06, wp.z], camNow, fcal, cv.clientWidth / 2, cv.clientHeight / 2);
        if (!pr) { started = false; continue; }
        started ? tctx.lineTo(pr.x, pr.y) : tctx.moveTo(pr.x, pr.y);
        started = true;
      }
      tctx.stroke();
      for (const wp of tgtObj.path) {
        const pr = renderer.project([wp.x, 0.06, wp.z], camNow, fcal, cv.clientWidth / 2, cv.clientHeight / 2);
        if (!pr) continue;
        tctx.fillStyle = '#ff5470';
        tctx.beginPath(); tctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); tctx.fill();
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const ICON = { actor: '👤', box: '📦', pillar: '🏛', table: '🪑', wall: '🧱', door: '🚪', window: '🪟', sofa: '🛋️', tree: '🌳', lamp: '💡' };
  const renderList = () => {
    const lb = m.body.querySelector('#sbList');
    if (!lb) return;
    const groups = { actor: [], prop: [] };
    scene.objects.forEach((o, i) => groups[o.type === 'actor' ? 'actor' : 'prop'].push([o, i]));
    const row = (o, i) => '<div class="sb-list-row' + (i === selIdx ? ' on' : '') + '" data-i="' + i + '"><span>' + (ICON[o.shape || o.type] || '▪') + '</span><span class="sb-list-name">' + (o.type === 'actor' ? '人物' : o.shape === 'wall' ? '墙 ' + (o.w || 3).toFixed(1) + 'm' : { box: '木箱', pillar: '立柱', table: '桌子', door: '门框', window: '窗墙', sofa: '沙发', tree: '树', lamp: '灯' }[o.shape] || '物件') + '</span><span class="dim">' + (+o.x).toFixed(1) + ',' + (+o.z).toFixed(1) + '</span><button class="icon-btn" data-del="' + i + '">✕</button></div>';
    lb.innerHTML = (groups.actor.length ? '<div class="sb-list-group">人物 ' + groups.actor.length + '</div>' + groups.actor.map(([o, i]) => row(o, i)).join('') : '') +
      (groups.prop.length ? '<div class="sb-list-group">道具 ' + groups.prop.length + '</div>' + groups.prop.map(([o, i]) => row(o, i)).join('') : '') +
      (scene.objects.length ? '' : '<div class="dim" style="padding:6px 2px">还没有对象</div>');
    lb.querySelectorAll('.sb-list-row').forEach(r2 => r2.onclick = e => {
      if (e.target.dataset.del !== undefined) { scene.objects.splice(+e.target.dataset.del, 1); if (selIdx === +e.target.dataset.del) selIdx = -1; renderProps(); return; }
      selIdx = +r2.dataset.i; renderProps();
    });
    const hd = m.body.querySelector('#sbListHead');
    if (hd) hd.textContent = '📋 场景清单 ' + scene.objects.length;
  };

  const renderProps = () => {
    const box = m.body.querySelector('#sbProps');
    renderList();
    if (selIdx < 0) { box.innerHTML = '<div class="dim">未选中对象。点击画面中的对象进行选中，再点地面可挪动它。</div>'; return; }
    const o = scene.objects[selIdx];
    box.innerHTML = `
      <div class="sb-obj-title">${TYPE_NAME[o.shape || o.type] || '对象'} · 已选中</div>
      ${o.type === 'actor' ? `<div class="form-row"><label>动作</label><select id="sbAct" class="input">
        ${['stand', 'walk', 'run', 'sit'].map(a => `<option value="${a}" ${o.action === a ? 'selected' : ''}>${a === 'stand' ? '站立' : a === 'walk' ? '行走' : a === 'run' ? '奔跑' : '坐下'}</option>`).join('')}
      </select></div>` : ''}
      ${o.type === 'actor' ? `<div class="form-row"><label>朝向快捷</label><div class="sb-palette">
        <button class="chip" data-f="0">正对镜头</button>
        <button class="chip" data-f="180">背对镜头</button>
        <button class="chip" data-f="90">左侧身</button>
        <button class="chip" data-f="-90">右侧身</button>
      </div></div>` : ''}
      <div class="form-row"><label>朝向 <span id="sbRotV">${Math.round(o.rot || 0)}°</span></label><input type="range" id="sbRot" class="scrub" min="0" max="360" value="${o.rot || 0}"></div>
      <div class="form-row"><label>大小 <span id="sbScaleV">${(o.scale || 1).toFixed(1)}×</span></label><input type="range" id="sbScale" class="scrub" min="0.6" max="1.8" step="0.1" value="${o.scale || 1}"></div>
      ${o.shape === 'lamp' ? `<div class="form-row"><label>灯强度 <span id="sbLintV">${(o.lint ?? 0.55).toFixed(2)}</span></label><input type="range" id="sbLint" class="scrub" min="0.1" max="1" step="0.05" value="${o.lint ?? 0.55}"></div>` : ''}
      <button class="btn btn-danger btn-sm" id="sbDel">🗑 删除此对象</button>`;
    const act = box.querySelector('#sbAct');
    if (act) act.onchange = () => { o.action = act.value; };
    box.querySelector('#sbRot').oninput = e => { o.rot = +e.target.value; box.querySelector('#sbRotV').textContent = e.target.value + '°'; };
    const lintS = box.querySelector('#sbLint');
    if (lintS) lintS.oninput = e => { o.lint = +e.target.value; box.querySelector('#sbLintV').textContent = (+e.target.value).toFixed(2); };
    box.querySelectorAll('[data-f]').forEach(fb => fb.onclick = () => {
      o.rot = Math.round(((scene.cam.az || 0) + (+fb.dataset.f) + 360) % 360);
      box.querySelector('#sbRot').value = o.rot;
      box.querySelector('#sbRotV').textContent = o.rot + '°';
    });
    if (o.type === 'actor') {
      const pathDiv = document.createElement('div');
      pathDiv.innerHTML = `
        <div class="form-row"><label>运动轨迹 <span class="dim">（${o.path?.length >= 2 ? '已设 ' + o.path.length + ' 个点，自动面向行进方向' : '未设置 · 绘制后沿路线来回行走'}）</span></label>
        <div class="sb-palette">
          <button class="btn btn-ghost btn-sm" id="sbPathDraw">${pathDraw && pathTarget === o ? '✅ 完成绘制' : '🎯 绘制轨迹'}</button>
          ${o.path?.length ? '<button class="btn btn-ghost btn-sm" id="sbPathClear">🗑 清除</button>' : ''}
        </div>
        ${o.path?.length >= 2 ? `<div class="form-row"><label>行走速度 <span id="sbSpdV">${(o.speed || 1.2).toFixed(1)}</span></label><input type="range" id="sbSpd" class="scrub" min="0.4" max="2.5" step="0.1" value="${o.speed || 1.2}"></div>` : ''}
      `;
      box.appendChild(pathDiv);
      pathDiv.querySelector('#sbPathDraw').onclick = () => {
        if (pathDraw && pathTarget === o) { pathDraw = false; pathTarget = null; }
        else { pathDraw = true; pathTarget = o; if (!o.path) o.path = []; }
        renderProps();
        m.body.querySelector('#sbTip').textContent = pathDraw ? '轨迹绘制中：依次点击地面添加途经点，完成后点「完成绘制」' : '点击地面放置「' + TYPE_NAME[placeType] + '」 · 点击已有对象可选中挪动';
      };
      pathDiv.querySelector('#sbPathClear')?.addEventListener('click', () => { o.path = null; pathDraw = false; pathTarget = null; renderProps(); });
      pathDiv.querySelector('#sbSpd')?.addEventListener('input', e => { o.speed = +e.target.value; pathDiv.querySelector('#sbSpdV').textContent = (+e.target.value).toFixed(1); });
    }
    box.querySelector('#sbScale').oninput = e => { o.scale = +e.target.value; box.querySelector('#sbScaleV').textContent = (+e.target.value).toFixed(1) + '×'; };
    box.querySelector('#sbDel').onclick = () => { scene.objects.splice(selIdx, 1); selIdx = -1; renderProps(); };
    renderList();
  };
  renderProps();

  m.body.querySelectorAll('.sb-palette .chip').forEach(b => b.onclick = () => {
    m.body.querySelectorAll('.sb-palette .chip').forEach(x => x.classList.remove('chip-on'));
    b.classList.add('chip-on');
    placeType = b.dataset.t;
    selIdx = -1;
    renderProps();
    m.body.querySelector('#sbTip').textContent = '点击地面放置「' + TYPE_NAME[placeType] + '」 · 点击已有对象可选中挪动';
  });
  [['sbAz', 'az', '°', 'sbAzV'], ['sbDist', 'dist', '', 'sbDistV'], ['sbH', 'h', '', 'sbHV'], ['sbFov', 'fov', '°', 'sbFovV']].forEach(([id, k, u, vid]) => {
    m.body.querySelector('#' + id).oninput = e => { scene.cam[k] = +e.target.value; m.body.querySelector('#' + vid).textContent = e.target.value + u; };
  });
  const VIEWS = { sbVTop: { az: 0, dist: 6, h: 9, fov: 45 }, sbVOblique: { az: 30, dist: 8, h: 4.5, fov: 50 }, sbVFront: { az: 0, dist: 8, h: 1.6, fov: 50 } };
  Object.entries(VIEWS).forEach(([id, v]) => {
    m.body.querySelector('#' + id).onclick = () => {
      Object.assign(scene.cam, v);
      m.body.querySelector('#sbAz').value = v.az; m.body.querySelector('#sbAzV').textContent = v.az + '°';
      m.body.querySelector('#sbDist').value = v.dist; m.body.querySelector('#sbDistV').textContent = v.dist;
      m.body.querySelector('#sbH').value = v.h; m.body.querySelector('#sbHV').textContent = v.h;
      m.body.querySelector('#sbFov').value = v.fov; m.body.querySelector('#sbFovV').textContent = v.fov + '°';
    };
  });
  const syncVF = () => m.body.querySelector('#sbVF').classList.toggle('chip-on', !!scene.vf);
  m.body.querySelector('#sbVF').onclick = () => { scene.vf = !scene.vf; syncVF(); };
  syncVF();
  const syncCut = () => m.body.querySelector('#sbCut').classList.toggle('chip-on', !!scene.cutaway);
  m.body.querySelector('#sbCut').onclick = () => { scene.cutaway = !scene.cutaway; syncCut(); };
  syncCut();
  const FLOORS = { default: '#d9dde5', wood: '#c9a877', cool: '#8fa3ad', warm: '#e8e2d5', dark: '#565d6b' };
  const floorRow = document.createElement('div');
  floorRow.className = 'form-row';
  floorRow.innerHTML = '<label>地面颜色</label><div class="sb-palette" id="sbFloor">' +
    Object.entries(FLOORS).map(([k, c]) => '<button class="chip' + (scene.floor === c || (!scene.floor && k === 'default') ? ' chip-on' : '') + '" data-c="' + c + '" style="display:inline-flex;align-items:center;gap:5px"><i style="width:10px;height:10px;border-radius:2px;background:' + c + ';display:inline-block"></i>' + (k === 'default' ? '默认' : k === 'wood' ? '木色' : k === 'cool' ? '青灰' : k === 'warm' ? '暖白' : '深灰') + '</button>').join('') + '</div>';
  m.body.querySelector('#sbLEl').closest('.form-row').after(floorRow);
  floorRow.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    scene.floor = b.dataset.c === FLOORS.default ? '' : b.dataset.c;
    floorRow.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('chip-on', x.dataset.c === (scene.floor || FLOORS.default)));
    if (sbView !== '2d') renderer.setTheme({ ground: scene.floor || '#d9dde5' });
  });
  const LIGHT_PRESETS = { key: [0, 35, 1], side: [90, 30, 1.05], rim: [140, 28, 1.1], back: [180, 30, 1.15], top: [0, 78, 1.05], flat: [0, 18, 0.45] };
  m.body.querySelectorAll('#sbLightPresets .chip').forEach(b => b.onclick = () => {
    const [az, el, int] = LIGHT_PRESETS[b.dataset.l];
    scene.light = { az, el, int };
    m.body.querySelector('#sbLAz').value = az; m.body.querySelector('#sbLAzV').textContent = az + '°';
    m.body.querySelector('#sbLEl').value = el; m.body.querySelector('#sbLElV').textContent = el + '°';
    m.body.querySelector('#sbLInt').value = int; m.body.querySelector('#sbLIntV').textContent = int;
  });
  [['sbLAz', 'az', '°', 'sbLAzV'], ['sbLEl', 'el', '°', 'sbLElV'], ['sbLInt', 'int', '', 'sbLIntV']].forEach(([id, k, u, vid]) => {
    m.body.querySelector('#' + id).oninput = e => { scene.light[k] = +e.target.value; m.body.querySelector('#' + vid).textContent = e.target.value + u; };
  });

  m.body.querySelectorAll('#sbBase .chip').forEach(b => b.onclick = () => {
    scene.base = b.dataset.b;
    m.body.querySelectorAll('#sbBase .chip').forEach(x => x.classList.toggle('chip-on', x === b));
  });
  m.body.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    sbView = b.dataset.v;
    m.body.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('chip-on', x === b));
    // 2D/3D 共用同一画布，只切换绘制方式，不隐藏画布
    m.body.querySelector('#sbTip').textContent = sbView === '2d'
      ? '2D 画空间：拖拽画房间（自动生成四面墙）· 点对象选中/挪动 · 右键删除 · 滚轮无效'
      : '点击地面放置「' + TYPE_NAME[placeType] + '」 · 拖拽旋转机位 · 右键删除 · 滚轮缩放';
  });

  let drag = null; // 指针交互状态
  let sbView = '3d', roomDrag = null, lineStart = null;
  const W2 = () => cv.clientWidth / 2;
  const S2 = 13;
  const w2p = (x, z) => [W2() + (x / S2) * (W2() - 14), cv.clientHeight / 2 + (z / S2) * (cv.clientHeight / 2 - 14)];
  const p2w = (sx, sy) => [((sx - W2()) / (W2() - 14)) * S2, ((sy - cv.clientHeight / 2) / (cv.clientHeight / 2 - 14)) * S2];
  const PROP_SIZE = { box: [0.8, 0.8], pillar: [0.4, 0.4], table: [1.3, 0.85], wall: [3, 0.24], door: [1.24, 0.14], window: [2.4, 0.2], sofa: [1.6, 0.85], tree: [1.2, 1.2] };
  const draw2D = () => { try {
    const ctx2 = cv.getContext('2d');
    const cw = cv.clientWidth, ch = cv.clientHeight;
    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.clearRect(0, 0, cw, ch);
    ctx2.fillStyle = '#f2f3f0'; ctx2.fillRect(0, 0, cw, ch);
    ctx2.strokeStyle = 'rgba(60,70,90,0.12)'; ctx2.lineWidth = 1;
    for (let gx = -12; gx <= 12; gx += 1) { const a = w2p(gx, -12), b = w2p(gx, 12); ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke(); }
    for (let gz = -12; gz <= 12; gz += 1) { const a = w2p(-12, gz), b = w2p(12, gz); ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke(); }
    for (let i = 0; i < scene.objects.length; i++) {
      const o = scene.objects[i];
      const sel = i === selIdx;
      if (o.type === 'prop' && o.shape === 'wall') {
        const half = (o.w || 3) / 2;
        const rr = (o.rot || 0) * Math.PI / 180;
        const ax = o.x - Math.cos(rr) * half, az2 = o.z - Math.sin(rr) * half;
        const bx = o.x + Math.cos(rr) * half, bz2 = o.z + Math.sin(rr) * half;
        const a = w2p(ax, az2), b = w2p(bx, bz2);
        ctx2.strokeStyle = sel ? '#e0485a' : '#2a2f3a'; ctx2.lineWidth = 5;
        ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
        continue;
      }
      const [px, py] = w2p(o.x, o.z);
      if (o.type === 'actor') {
        ctx2.fillStyle = sel ? '#e0485a' : '#4d8dff';
        ctx2.beginPath(); ctx2.arc(px, py, 9, 0, Math.PI * 2); ctx2.fill();
        const rr = ((o.rot || 0) - (scene.cam?.az || 0)) * Math.PI / 180;
        ctx2.strokeStyle = sel ? '#e0485a' : '#4d8dff'; ctx2.lineWidth = 2.5;
        ctx2.beginPath(); ctx2.moveTo(px, py); ctx2.lineTo(px + Math.sin(rr) * 15, py + Math.cos(rr) * 15); ctx2.stroke();
      } else {
        const sz = PROP_SIZE[o.shape] || [0.8, 0.8];
        const w = (sz[0] * (o.scale || 1)) / S2 * (W2() - 14), h2 = (sz[1] * (o.scale || 1)) / S2 * (cv.clientHeight / 2 - 14);
        ctx2.save(); ctx2.translate(px, py); ctx2.rotate((o.rot || 0) * Math.PI / 180);
        ctx2.fillStyle = sel ? 'rgba(224,72,90,0.35)' : 'rgba(58,64,82,0.30)';
        ctx2.strokeStyle = sel ? '#e0485a' : '#3a4052'; ctx2.lineWidth = 1.5;
        ctx2.fillRect(-w / 2, -h2 / 2, w, h2); ctx2.strokeRect(-w / 2, -h2 / 2, w, h2);
        ctx2.restore();
      }
    }
    const tgtObj = (selIdx >= 0 && scene.objects[selIdx]) || pathTarget;
    if (tgtObj && tgtObj.path && tgtObj.path.length) {
      ctx2.strokeStyle = '#ff5470'; ctx2.lineWidth = 2; ctx2.setLineDash([5, 4]);
      ctx2.beginPath();
      tgtObj.path.forEach((wp, i) => { const [x, y] = w2p(wp.x, wp.z); i ? ctx2.lineTo(x, y) : ctx2.moveTo(x, y); });
      ctx2.stroke(); ctx2.setLineDash([]);
      for (const wp of tgtObj.path) { const [x, y] = w2p(wp.x, wp.z); ctx2.fillStyle = '#ff5470'; ctx2.beginPath(); ctx2.arc(x, y, 4, 0, Math.PI * 2); ctx2.fill(); }
    }
    if (roomDrag && roomDrag.moved) {
      const [ax, ay] = w2p(roomDrag.x1, roomDrag.z1), [bx, by] = w2p(roomDrag.x2, roomDrag.z2);
      ctx2.strokeStyle = '#e0485a'; ctx2.lineWidth = 4;
      ctx2.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    }
    const [cxp, cyp] = w2p(Math.sin((scene.cam?.az || 0) * Math.PI / 180) * (scene.cam?.dist || 7), Math.cos((scene.cam?.az || 0) * Math.PI / 180) * (scene.cam?.dist || 7));
    ctx2.fillStyle = '#ffc857'; ctx2.beginPath(); ctx2.arc(cxp, cyp, 6, 0, Math.PI * 2); ctx2.fill();
    ctx2.fillStyle = 'rgba(255,255,255,0.75)'; ctx2.font = '10px sans-serif';
    ctx2.fillText('相机', cxp + 8, cyp - 6);
  } catch (e) { console.warn('draw2D', e); }
  };
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    let hit = -1;
    if (sbView === '2d') {
      const [wx, wz] = p2w(sx, sy);
      let bd = 0.6;
      scene.objects.forEach((o, i) => { const dd = Math.hypot(o.x - wx, o.z - wz); if (dd < bd) { bd = dd; hit = i; } });
    } else {
      const cam0 = solveCamera(sim, 0.35, { x: 0, y: 0, z: 0 }, { angle: 'eye', scene });
      const fc0 = (renderer.h / 2) / Math.tan(((scene.cam?.fov || 55) * DEG2) / 2);
      let bd = 30;
      scene.objects.forEach((o, i) => {
        const pr = renderer.project([o.x, 0.6 * (o.scale || 1), o.z], cam0, fc0, renderer.w / 2, renderer.h / 2);
        if (pr) { const dd = Math.hypot(pr.x - sx, pr.y - sy); if (dd < bd) { bd = dd; hit = i; } }
      });
    }
    if (hit >= 0) { scene.objects.splice(hit, 1); if (selIdx === hit) selIdx = -1; renderProps(); toast('已删除'); }
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    scene.cam.dist = Math.max(3, Math.min(12, (scene.cam.dist || 7) + (e.deltaY > 0 ? 0.5 : -0.5)));
    m.body.querySelector('#sbDist').value = scene.cam.dist;
    m.body.querySelector('#sbDistV').textContent = scene.cam.dist;
  }, { passive: false });
  cv.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    const rr0 = cv.getBoundingClientRect();
    if (sbView === '2d') {
      const [wx, wz] = p2w(e.clientX - rr0.left, e.clientY - rr0.top);
      drag = { sx: e.clientX, sy: e.clientY, az: scene.cam.az || 0, h: scene.cam.h || 1.8, moved: false, x1: Math.max(-11, Math.min(11, +wx.toFixed(2))), z1: Math.max(-11, Math.min(11, +wz.toFixed(2))) };
      return;
    }
    drag = { sx: e.clientX, sy: e.clientY, az: scene.cam.az || 0, h: scene.cam.h || 1.8, moved: false };
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    if (sbView === '2d') {
      const rect = cv.getBoundingClientRect();
      const [wx, wz] = p2w(e.clientX - rect.left, e.clientY - rect.top);
      roomDrag = { x1: drag.x1, z1: drag.z1, x2: Math.max(-11, Math.min(11, +wx.toFixed(2))), z2: Math.max(-11, Math.min(11, +wz.toFixed(2))), moved: true };
      draw2D();
      return;
    }
    scene.cam.az = ((drag.az - dx * 0.45) % 360 + 360) % 360;
    scene.cam.h = Math.max(0.4, Math.min(9, drag.h + dy * 0.02));
    m.body.querySelector('#sbAz').value = scene.cam.az;
    m.body.querySelector('#sbAzV').textContent = Math.round(scene.cam.az) + '°';
    m.body.querySelector('#sbH').value = scene.cam.h;
    m.body.querySelector('#sbHV').textContent = (+scene.cam.h).toFixed(1);
  });
  cv.addEventListener('pointerup', e => {
    try {
    const wasDrag = drag && drag.moved;
    const upInfo = drag ? { sx: drag.sx, sy: drag.sy } : null;
    setTimeout(() => { drag = null; }, 0);
    if (sbView === '2d' && wasDrag && roomDrag && roomDrag.moved) {
      const x1 = Math.min(roomDrag.x1, roomDrag.x2), x2 = Math.max(roomDrag.x1, roomDrag.x2);
      const z1 = Math.min(roomDrag.z1, roomDrag.z2), z2 = Math.max(roomDrag.z1, roomDrag.z2);
      if (x2 - x1 > 0.8 && z2 - z1 > 0.8) {
        scene.objects.push(
          { type: 'prop', shape: 'wall', x: +((x1 + x2) / 2).toFixed(2), z: z1, rot: 0, scale: 1, w: +(x2 - x1 + 0.24).toFixed(2), h: 2.4 },
          { type: 'prop', shape: 'wall', x: +((x1 + x2) / 2).toFixed(2), z: z2, rot: 0, scale: 1, w: +(x2 - x1 + 0.24).toFixed(2), h: 2.4 },
          { type: 'prop', shape: 'wall', x: x1, z: +((z1 + z2) / 2).toFixed(2), rot: 90, scale: 1, w: +(z2 - z1 + 0.24).toFixed(2), h: 2.4 },
          { type: 'prop', shape: 'wall', x: x2, z: +((z1 + z2) / 2).toFixed(2), rot: 90, scale: 1, w: +(z2 - z1 + 0.24).toFixed(2), h: 2.4 },
        );
        toast('房间已生成（四面墙）🏠 可用门框/窗墙开门开窗', 'ok');
        store.addXP(2, '画房间');
      }
      roomDrag = null;
      draw2D();
      renderProps();
      return;
    }
    if (sbView === '2d' && !wasDrag && upInfo) {
      const rect = cv.getBoundingClientRect();
      const sx = upInfo.sx - rect.left, sy = upInfo.sy - rect.top;
      const [wx, wz] = p2w(sx, sy);
      let hit2 = -1, bd2 = 0.55;
      scene.objects.forEach((o, i) => { const dd = Math.hypot(o.x - wx, o.z - wz); if (dd < bd2) { bd2 = dd; hit2 = i; } });
      if (hit2 >= 0) { selIdx = hit2; renderProps(); return; }
      if (placeType === 'wallline') {
        if (!lineStart) { lineStart = { x: wx, z: wz }; toast('起点已定，再点一下终点'); return; }
        const dxL = wx - lineStart.x, dzL = wz - lineStart.z;
        const len = Math.hypot(dxL, dzL);
        if (len > 0.3) scene.objects.push({ type: 'prop', shape: 'wall', x: +((lineStart.x + wx) / 2).toFixed(2), z: +((lineStart.z + wz) / 2).toFixed(2), rot: Math.round(Math.atan2(dzL, dxL) / (Math.PI / 180)), scale: 1, w: +(len + 0.24).toFixed(2), h: 2.4 });
        lineStart = null;
        draw2D();
        return;
      }
      if (pathDraw && pathTarget && selIdx >= 0 && scene.objects[selIdx] === pathTarget) { pathTarget.path.push({ x: +wx.toFixed(2), z: +wz.toFixed(2) }); renderProps(); return; }
      const base2 = { type: placeType === 'actor' ? 'actor' : 'prop', x: +wx.toFixed(2), z: +wz.toFixed(2), rot: 205, scale: 1 };
      if (placeType === 'actor') { base2.action = 'stand'; base2.seed = Math.round(Math.random() * 90); }
      else base2.shape = placeType;
      scene.objects.push(base2);
      selIdx = scene.objects.length - 1;
      renderProps();
      draw2D();
      return;
    }
    if (sbView !== '2d' && !wasDrag && upInfo) {
      const rect = cv.getBoundingClientRect();
      const sx = upInfo.sx - rect.left, sy = upInfo.sy - rect.top;
      const cam0 = solveCamera(sim, 0.35, { x: 0, y: 0, z: 0 }, { angle: 'eye', scene });
      const fc0 = (renderer.h / 2) / Math.tan(((scene.cam?.fov || 55) * DEG2) / 2);
      let best = -1, bd = 30;
      scene.objects.forEach((o, i) => {
        const pr = renderer.project([o.x, 0.6 * (o.scale || 1), o.z], cam0, fc0, renderer.w / 2, renderer.h / 2);
        if (pr) { const dd = Math.hypot(pr.x - sx, pr.y - sy); if (dd < bd) { bd = dd; best = i; } }
      });
      if (best >= 0) { selIdx = best; renderProps(); return; }
      if (pathDraw && pathTarget && selIdx >= 0 && scene.objects[selIdx] === pathTarget) {
        const g3 = unprojectGround(sx, sy, cam0, fc0, renderer.w, renderer.h);
        if (g3) { pathTarget.path = pathTarget.path || []; pathTarget.path.push({ x: +g3[0].toFixed(2), z: +g3[1].toFixed(2) }); }
        renderProps();
        return;
      }
      const g = unprojectGround(sx, sy, cam0, fc0, renderer.w, renderer.h);
      if (!g) return;
      const gx = Math.max(-11, Math.min(11, +g[0].toFixed(2))), gz = Math.max(-11, Math.min(11, +g[1].toFixed(2)));
      if (selIdx >= 0 && scene.objects[selIdx]) { scene.objects[selIdx].x = gx; scene.objects[selIdx].z = gz; renderProps(); return; }
      const base = { type: placeType === 'actor' ? 'actor' : 'prop', x: gx, z: gz, rot: 205, scale: 1 };
      if (placeType === 'actor') { base.action = 'stand'; base.seed = Math.round(Math.random() * 90); }
      else base.shape = placeType;
      scene.objects.push(base);
      selIdx = scene.objects.length - 1;
      renderProps();
      return;
    }
  });

  m.body.querySelector('#sbAI').onclick = () => {
    const am = modal({
      title: '🤖 AI 搭建 · 让 AI 搭，你来拍',
      body: '<div class="dim" style="font-size:12px;line-height:1.8;margin-bottom:10px">把场景描述交给 AI 生成搭建 JSON，或直接粘贴他人分享的 JSON 导入。</div>' +
        '<div class="form-row"><label>场景描述</label><input id="sbAiDesc" class="input" placeholder="例：两室一厅客厅，沙发朝电视，一个人从门口走到沙发坐下"></div>' +
        '<div class="modal-actions"><button class="btn btn-magic btn-sm" id="sbAiGen">🤖 生成 JSON</button><span class="dim" id="sbAiStatus"></span></div>' +
        '<div class="form-row"><label>搭建 JSON</label><textarea id="sbAiJson" class="input mono" rows="9" placeholder=\'{"base":"room","objects":[…],"light":{…},"cam":{…}}\'></textarea></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-act="c">取消</button><button class="btn btn-primary" data-act="imp">📥 导入并搭建</button></div>',
    });
    am.body.querySelector('[data-act="c"]').onclick = () => am.close();
    am.body.querySelector('#sbAiGen').onclick = async () => {
      const desc = am.body.querySelector('#sbAiDesc').value.trim();
      if (!desc) { toast('先描述一下场景', 'warn'); return; }
      if (!store.settings.api) { toast('先到 设置 → AI接口 配置接口', 'warn'); return; }
      const st = am.body.querySelector('#sbAiStatus');
      st.textContent = '🤖 AI 搭建中…';
      try {
        const sys = '你是三维场景搭建助手。只输出 JSON，不要解释。格式：' + NL +
          '{"base":"plain|street|room|stage","objects":[{"type":"actor","x":数,"z":数,"rot":0-360,"scale":1,"action":"stand|walk|run|sit","path":[{"x":数,"z":数}]},或{"type":"prop","shape":"box|pillar|table|wall|door|window|sofa|tree","x":数,"z":数,"rot":0-360,"scale":1,"w":数,"h":数}],"light":{"az":0-360,"el":5-85,"int":0.3-1.3},"cam":{"az":0-360,"dist":3-12,"h":0.4-9,"fov":25-90}}' + NL +
          '坐标 x,z 在 -11 到 11。按描述安排底景、墙体、道具、人物与走位轨迹；wall 用 w/h 定宽高。';
        const { callAI } = await import('./breakdown.js');
        const out = await callAI(store.settings, [{ role: 'user', content: sys + NL + NL + '用户描述：' + desc }], { temperature: 0.4, json: true });
        const mm = out.match(/\{[\s\S]*\}/);
        if (!mm) throw new Error('AI 未返回 JSON');
        am.body.querySelector('#sbAiJson').value = JSON.stringify(JSON.parse(mm[0]), null, 2);
        st.textContent = '✅ 已生成，点「导入并搭建」';
      } catch (e) { st.textContent = '❌ ' + e.message; }
    };
    am.body.querySelector('[data-act="imp"]').onclick = () => {
      try {
        const j = JSON.parse(am.body.querySelector('#sbAiJson').value);
        if (j.base) scene.base = j.base;
        if (Array.isArray(j.objects)) scene.objects = j.objects;
        if (j.light) scene.light = j.light;
        if (j.cam) scene.cam = j.cam;
        selIdx = -1; pathDraw = false; pathTarget = null;
        renderProps();
        m.body.querySelectorAll('#sbBase .chip').forEach(x => x.classList.toggle('chip-on', x.dataset.b === scene.base));
        am.close();
        toast('场景已导入 🏗', 'ok');
        store.addXP(3, 'AI 搭建');
      } catch (e) { toast('JSON 解析失败：' + e.message, 'warn'); }
    };
  };
  const SB_TEMPLATES = {
    living: { name: '客厅', data: { base: 'room', objects: [
      { type: 'prop', shape: 'wall', x: 0, z: -5, rot: 0, scale: 1, w: 10, h: 2.4 },
      { type: 'prop', shape: 'wall', x: -5, z: 0, rot: 90, scale: 1, w: 10, h: 2.4 },
      { type: 'prop', shape: 'wall', x: 5, z: 0, rot: 90, scale: 1, w: 10, h: 2.4 },
      { type: 'prop', shape: 'sofa', x: -1.5, z: 2.5, rot: 0, scale: 1.2 },
      { type: 'prop', shape: 'table', x: -1.5, z: 0.8, rot: 0, scale: 1 },
      { type: 'prop', shape: 'window', x: 0, z: -4.9, rot: 0, scale: 1 },
      { type: 'actor', x: 0.5, z: 1.5, rot: 190, scale: 1, action: 'stand' } ],
      light: { az: 140, el: 32, int: 1.05 }, cam: { az: 15, dist: 6.5, h: 1.7, fov: 50 } } },
    bedroom: { name: '卧室', data: { base: 'room', objects: [
      { type: 'prop', shape: 'wall', x: 0, z: -4.5, rot: 0, scale: 1, w: 8, h: 2.4 },
      { type: 'prop', shape: 'wall', x: -4, z: 0, rot: 90, scale: 1, w: 9, h: 2.4 },
      { type: 'prop', shape: 'wall', x: 4, z: 0, rot: 90, scale: 1, w: 9, h: 2.4 },
      { type: 'prop', shape: 'door', x: 3.4, z: -4.4, rot: 0, scale: 1 },
      { type: 'prop', shape: 'table', x: -2.5, z: -3.4, rot: 0, scale: 1 },
      { type: 'actor', x: 1, z: 1, rot: 200, scale: 1, action: 'sit' } ],
      light: { az: 60, el: 25, int: 0.9 }, cam: { az: 5, dist: 5.5, h: 1.5, fov: 46 } } },
    street: { name: '夜晚街道', data: { base: 'street', objects: [
      { type: 'actor', x: -1, z: 0.5, rot: 175, scale: 1, action: 'stand' },
      { type: 'actor', x: 2.5, z: -1.5, rot: 320, scale: 0.95, action: 'stand' },
      { type: 'prop', shape: 'pillar', x: -4, z: -2, rot: 0, scale: 1 },
      { type: 'prop', shape: 'pillar', x: 4, z: -2, rot: 0, scale: 1 } ],
      light: { az: 200, el: 22, int: 1.2 }, cam: { az: 190, dist: 5.5, h: 1.6, fov: 48 } } },
    lift: { name: '电梯间', data: { base: 'room', objects: [
      { type: 'prop', shape: 'wall', x: -1.6, z: 0, rot: 90, scale: 1, w: 3.6, h: 2.4 },
      { type: 'prop', shape: 'wall', x: 1.6, z: 0, rot: 90, scale: 1, w: 3.6, h: 2.4 },
      { type: 'prop', shape: 'wall', x: 0, z: -1.9, rot: 0, scale: 1, w: 3.44, h: 2.4 },
      { type: 'actor', x: 0, z: 0.8, rot: 180, scale: 1, action: 'stand' } ],
      light: { az: 0, el: 70, int: 1.15 }, cam: { az: 0, dist: 4.5, h: 1.6, fov: 44 } } },
  };
  m.body.querySelector('#sbTpl').onclick = () => {
    const tm = modal({
      title: '🏘 场景模板',
      body: '<div class="export-opts">' + Object.entries(SB_TEMPLATES).map(([k, t]) => '<button class="btn btn-ghost" data-k="' + k + '">' + t.name + '</button>').join('') + '</div>',
    });
    tm.body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const t = SB_TEMPLATES[b.dataset.k];
      scene.base = t.data.base; scene.objects = JSON.parse(JSON.stringify(t.data.objects));
      scene.light = { ...t.data.light }; scene.cam = { ...t.data.cam };
      selIdx = -1; renderProps();
      m.body.querySelectorAll('#sbBase .chip').forEach(x => x.classList.toggle('chip-on', x.dataset.b === scene.base));
      tm.close();
      toast('模板「' + t.name + '」已载入，可继续调整', 'ok');
      store.addXP(1, '场景模板');
    });
  };
  let rec = null, recTimer = null;
  m.body.querySelector('#sbRec').onclick = () => {
    const btn = m.body.querySelector('#sbRec');
    if (!rec) {
      rec = { samples: [{ t: 0, az: scene.cam.az, h: scene.cam.h, dist: scene.cam.dist, fov: scene.cam.fov }], t0: performance.now() };
      scene.camPath = null;
      btn.textContent = '⏹ 结束录制 (0.0s)';
      m.body.querySelector('#sbTip').textContent = '录制中：拖拽画面转机位 / 拉滑块，运镜路径实时采样，再点结束';
      recTimer = setInterval(() => {
        const t = (performance.now() - rec.t0) / 1000;
        const last = rec.samples[rec.samples.length - 1];
        if (Math.abs(scene.cam.az - last.az) + Math.abs(scene.cam.h - last.h) + Math.abs(scene.cam.dist - last.dist) + Math.abs(scene.cam.fov - last.fov) > 0.05) {
          rec.samples.push({ t: +t.toFixed(2), az: scene.cam.az, h: scene.cam.h, dist: scene.cam.dist, fov: scene.cam.fov });
          if (rec.samples.length > 40) rec.samples.shift();
        }
        btn.textContent = '⏹ 结束录制 (' + t.toFixed(1) + 's)';
        if (t > 30) m.body.querySelector('#sbRec').click();
      }, 200);
    } else {
      clearInterval(recTimer);
      const dur = (performance.now() - rec.t0) / 1000;
      rec.samples.push({ t: +Math.max(dur, 0.5).toFixed(2), az: scene.cam.az, h: scene.cam.h, dist: scene.cam.dist, fov: scene.cam.fov });
      scene.camPath = rec.samples;
      rec = null;
      btn.textContent = '🎬 录制运镜 ✓';
      m.body.querySelector('#sbTip').textContent = '运镜路径已录 ' + scene.camPath.length + ' 个关键帧，保存后动态分镜按它移动';
      toast('运镜已录制：' + scene.camPath.length + ' 帧', 'ok');
      store.addXP(3, '录制运镜');
    }
  };
  m.body.querySelector('#sbClear').onclick = () => { scene.objects = []; scene.camPath = null; selIdx = -1; m.body.querySelector('#sbRec').textContent = '🎬 录制运镜'; renderProps(); };
  m.body.querySelector('#sbCancel').onclick = () => m.close();
  m.body.querySelector('#sbMax').onclick = () => {
    const box = m.root.querySelector('.modal');
    box.classList.toggle('modal-super');
    const sup = box.classList.contains('modal-super');
    m.body.querySelector('#sbMax').textContent = sup ? '🗗 还原大小' : '⛶ 放大搭建';
    renderer.resize();
  };
  m.body.querySelector('#sbSave').onclick = () => {
    pathDraw = false; pathTarget = null;
    store.updateShot(shot.id, {
      scene: scene.objects.length ? scene : null,
      ...(scene.objects.length && scene.cam ? { cameraMove: 'free' } : {}),
    });
    store.addXP(3, '搭建场景');
    m.close();
    toast('场景已保存到镜头 🏗', 'ok');
    if (onSaved) onSaved();
  };
  m.cacheOnClose = () => { if (raf) cancelAnimationFrame(raf); };}

/* ---------- 示例剧本（原创短故事） ---------- */
const DEMO_SCRIPT = `第1场 便利店 夜 内
深夜的便利店，灯光惨白，货架间的过道一眼望不到头。
店员小林趴在柜台上打瞌睡，收音机里放着模糊的老歌。
自动门「叮」地一声开了，冷风灌进来。
一个浑身湿透的女孩走进来，长发贴在脸上，看不清表情。
小林猛地抬头：「欢迎光临……诶？外面下雨了吗？」
女孩没有回答，径直走向冰柜，拿出一罐冰可乐。
她把可乐贴在自己的脸颊上，闭上眼睛，像是终于活过来了。
小林盯着她看了很久，轻声说：「雨停之前，你可以坐在这里。」
女孩抬起头，第一次露出一点笑：「谢谢。」

第2场 便利店门口 夜 外
雨还在下，屋檐下的灯光把两个人的影子拉得很长。
女孩坐在台阶上，可乐罐在手里转了一圈又一圈。
小林搬了把椅子坐在旁边，两个人都没说话。
远处传来第一班地铁的声音，天快亮了。`;

export { DEMO_SCRIPT, openSceneBuilder };
