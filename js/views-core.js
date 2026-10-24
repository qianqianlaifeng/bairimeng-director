/* ============================================================
 * 白日梦导演台 · 核心视图
 * 项目台 / 剧本 / 分镜板（含傻瓜模式）/ 镜头编辑器
 * ============================================================ */
import { CAMERA_MOVES, MOVE_CATS, SHOT_SIZES, ANGLES, TRANSITIONS, PROMPT_TEMPLATES, STYLE_BANK, ACTOR_ACTIONS, STAGE_SCENES } from './data.js';
import { localBreakdown, aiBreakdown, aiEnhancePrompt, buildPrompt, moveByKey } from './breakdown.js';
import { WhiteModelRenderer } from './cameraSim.js';
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
  const loop = (now) => {
    if (!document.body.contains(canvas)) return;
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
        <div class="editor-2col">
          <div class="form-row"><label>时长（秒）</label><input id="edDur" class="input" type="number" min="1" max="20" step="0.5" value="${shot.duration}"></div>
          <div class="form-row"><label>转场（到下一镜）</label><select id="edTrans" class="input">${opts(TRANSITIONS, shot.transition, t => t.icon + ' ' + t.name)}</select></div>
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
      renderer.render(mv.sim, t, action, { duration: dur / 1000, hud: true, letterbox: true });
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

export { DEMO_SCRIPT };
