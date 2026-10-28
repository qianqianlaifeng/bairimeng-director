/* ============================================================
 * 白日梦导演台 · 核心视图
 * 项目台 / 剧本 / 分镜板（含傻瓜模式）/ 镜头编辑器
 * ============================================================ */
import { CAMERA_MOVES, MOVE_CATS, SHOT_SIZES, ANGLES, TRANSITIONS, PROMPT_TEMPLATES, STYLE_BANK, ACTOR_ACTIONS, STAGE_SCENES } from './data.js';
import { localBreakdown, aiBreakdown, aiEnhancePrompt, buildPrompt, moveByKey } from './breakdown.js';
import { WhiteModelRenderer, solveCamera, focusPointOf } from './cameraSim.js';
import { openSceneBuilder } from './builder.js';
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
        <button class="btn btn-ghost btn-sm" id="btnImportShots">📥 导入分镜</button>
        <button class="btn btn-ghost btn-sm" id="btnExportShots">📤 导出</button>
        <button class="btn btn-ghost btn-sm" id="btnBatch">☑ 批量</button>
        <button class="btn btn-ghost btn-sm" id="btnClearShots">🧹 清空</button>
        <button class="btn btn-ghost" id="btnSimpleMode">🧠 傻瓜模式</button>
        <button class="btn btn-ghost" id="btnPlayAll">▶ 动态预演</button>
        <button class="btn btn-primary" id="btnAddShot">＋ 加镜头</button>
      </div>
    </div>
    <div id="simplePanel"></div>
    <div id="batchBar"></div>
    <div class="storyboard-grid" id="sbGrid"></div>
    <div class="sb-footer">
      <span class="dim">拖动卡片调顺序 · 点卡片编辑 · 「傻瓜模式」回答四个问题自动生成分镜</span>
    </div>`;

  const grid = container.querySelector('#sbGrid');
  const simplePanel = container.querySelector('#simplePanel');
  const batchBar = container.querySelector('#batchBar');
  let simpleOn = false;
  let batchOn = false;
  const selShots = new Set();

  /* ---------- 导入分镜（同学写好的表格/文档） ---------- */
  container.querySelector('#btnImportShots').onclick = () => openImportShots();

  function openImportShots() {
    const SH = window.SHOT_IMPORT;
    if (!SH) { toast('导入模块没加载上，刷新页面重试', 'warn'); return; }
    let parsed = { shots: [], stats: { rows: 0, used: 0, skipped: 0 }, warnings: [] };
    const m = modal({
      title: '📥 导入分镜',
      wide: true,
      body: `
        <p class="dim" style="margin-top:0">同学写好的分镜直接粘进来或选文件：Excel / 飞书 / 石墨导出的 <b>CSV</b>、<b>TSV</b>、<b>Markdown 表格</b>、每行一条的纯文本、JSON 都认。表头写「镜号 / 画面 / 台词 / 时长 / 景别 / 运镜 / 角度 / 场次 / 备注」，没有表头也没关系，会按顺序猜。</p>
        <div class="form-row"><textarea id="impText" class="input" rows="7" placeholder="镜号,画面描述,台词,时长,景别,运镜,角度&#10;1,傍晚客厅全景，女主站在沙发前, ,4,远景,固定,平视&#10;2,中景缓推，女主坐下,茶凉了,3.5,中景,缓推,平视"></textarea></div>
        <div class="form-row" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">📄 选文件
            <input type="file" id="impFile" accept=".csv,.tsv,.txt,.md,.json,text/plain,text/csv" style="display:none">
          </label>
          <button class="btn btn-ghost btn-sm" id="impTpl">⬇ 下载模板 CSV（发同学）</button>
          <button class="btn btn-ghost btn-sm" id="impDemo">用示例试一下</button>
          <span class="dim" id="impInfo">还没解析</span>
        </div>
        <div id="impWarn" class="dim" style="color:var(--warning,#b98900)"></div>
        <div id="impPreview" style="max-height:160px;overflow:auto;font:12px/1.7 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:var(--muted)"></div>
        <div class="form-row" style="display:flex;gap:16px;align-items:center;margin-top:6px">
          <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="impMode" value="append" checked> 追加到现有分镜</label>
          <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="impMode" value="replace"> 替换现有分镜</label>
        </div>
        <div id="impModeHint" class="dim" style="margin:2px 0 0"></div>
        <div class="modal-actions">
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="impCancel">取消</button>
          <button class="btn btn-primary" id="impOk" disabled>导入</button>
        </div>`,
    });
    const ta = m.body.querySelector('#impText');
    const info = m.body.querySelector('#impInfo');
    const prev = m.body.querySelector('#impPreview');
    const warnEl = m.body.querySelector('#impWarn');
    const okBtn = m.body.querySelector('#impOk');
    const modeHint = m.body.querySelector('#impModeHint');

    /* 追加/替换 的实时说明：让用户在模态框里就把后果看明白，不再弹浏览器原生 confirm */
    const isReplace = () => m.body.querySelector('input[name="impMode"]:checked').value === 'replace';
    const refreshMode = () => {
      const rep = isReplace();
      const cur = p.shots.length;
      const add = parsed.shots.length;
      if (rep) {
        modeHint.innerHTML = cur
          ? `⚠️ 替换会清空现有 <b>${cur}</b> 个镜头，只留下新导入的 ${add} 个。`
          : `替换模式：当前没有分镜，等于直接导入 ${add} 个。`;
        modeHint.style.color = 'var(--danger,#d9534f)';
        okBtn.textContent = cur ? '清空并导入' : '导入';
        okBtn.classList.toggle('btn-danger', cur > 0);
      } else {
        modeHint.textContent = cur
          ? `追加模式：保留现有 ${cur} 个，导入后共 ${cur + add} 个。`
          : `追加模式：当前没有分镜。`;
        modeHint.style.color = '';
        okBtn.textContent = '导入';
        okBtn.classList.remove('btn-danger');
      }
    };
    m.body.querySelectorAll('input[name="impMode"]').forEach(r => r.addEventListener('change', refreshMode));

    const refresh = () => {
      parsed = SH.parse(ta.value);
      const n = parsed.shots.length;
      okBtn.disabled = n === 0;
      info.textContent = n ? `解析到 ${n} 镜` + (parsed.stats.skipped ? ` · 跳过 ${parsed.stats.skipped} 行` : '') : '还没解析';
      warnEl.textContent = parsed.warnings.length ? '⚠ ' + parsed.warnings.join('；') : '';
      prev.innerHTML = parsed.shots.slice(0, 8).map((s, i) =>
        `${i + 1}. ${esc(s.desc.slice(0, 46))}${s.dialogue ? ' ｜💬 ' + esc(s.dialogue.slice(0, 18)) : ''} · ${s.duration}s · ${esc(nameOfSize(s.shotSize))} · ${esc(nameOfMove(s.cameraMove))}`
      ).join('\n') + (n > 8 ? `\n… 还有 ${n - 8} 镜` : '');
      refreshMode();
    };
    ta.addEventListener('input', refresh);
    refreshMode();

    m.body.querySelector('#impFile').onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        ta.value = SH.decodeBuffer(buf);       // Excel 存的 CSV 常是 GBK，这里自动兜底
        refresh();
        toast('已读取 ' + f.name, 'ok');
      } catch (err) { toast('读文件失败：' + err.message, 'warn'); }
    };
    m.body.querySelector('#impTpl').onclick = () => {
      const blob = new Blob([SH.templateCSV()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '分镜模板.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    };
    m.body.querySelector('#impDemo').onclick = () => {
      ta.value = `镜号,画面描述,台词,时长,景别,运镜,角度,场次,备注
1,傍晚客厅全景，女主站在沙发前，男主从书架边走过来,,4,远景,固定,平视,第1场,建立空间
2,中景缓推：女主坐下拿起茶几上的杯子,茶凉了,3.5,中景,缓推,平视,第1场,
3,特写：杯口的热气慢慢散开,,2,特写,固定,低角度,第1场,插入镜`;
      refresh();
    };
    m.body.querySelector('#impCancel').onclick = () => m.close();
    okBtn.onclick = () => {
      const replace = isReplace();
      const n = store.importShots(parsed.shots, { replace });
      m.close();
      toast(`已导入 ${n} 个镜头` + (replace ? '（已替换原有分镜）' : ''), 'ok');
      renderStoryboard(container);
    };
    setTimeout(() => ta.focus(), 60);
  }

  const nameOfSize = k => (SHOT_SIZES.find(x => x.key === k) || {}).name || k;
  const nameOfMove = k => (moveByKey[k] || {}).name || k;

  /* ---------- 批量管理条 ---------- */
  const renderBatchBar = () => {
    selShots.forEach(id => { if (!p.shots.find(s => s.id === id)) selShots.delete(id); });
    if (!batchOn) { batchBar.innerHTML = ''; return; }
    const ids = Array.from(selShots);
    batchBar.innerHTML = `
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;margin:10px 0">
        <b>☑ 已选 ${ids.length} / ${p.shots.length} 镜</b>
        <button class="btn btn-ghost btn-sm" id="bcAll">全选</button>
        <button class="btn btn-ghost btn-sm" id="bcNone">清空选择</button>
        <span style="width:1px;height:20px;background:var(--border)"></span>
        <label class="dim" style="display:flex;gap:4px;align-items:center">时长 <input id="bcDur" class="input" type="number" min="1" max="20" step="0.5" value="3" style="width:64px"> 秒</label>
        <button class="btn btn-ghost btn-sm" id="bcDurOk">应用到所选</button>
        <label class="dim" style="display:flex;gap:4px;align-items:center">运镜 <select id="bcMove" class="input" style="width:auto">${opts(CAMERA_MOVES, 'static', m => m.name, m => m.cat)}</select></label>
        <button class="btn btn-ghost btn-sm" id="bcMoveOk">应用到所选</button>
        <div class="spacer"></div>
        <button class="btn btn-danger btn-sm" id="bcDel">🗑 删除所选</button>
        <button class="btn btn-primary btn-sm" id="bcDone">完成</button>
      </div>`;
    batchBar.querySelector('#bcAll').onclick = () => { p.shots.forEach(s => selShots.add(s.id)); renderCards(); };
    batchBar.querySelector('#bcNone').onclick = () => { selShots.clear(); renderCards(); };
    batchBar.querySelector('#bcDurOk').onclick = () => {
      if (!ids.length) { toast('先勾选镜头', 'warn'); return; }
      const v = parseFloat(batchBar.querySelector('#bcDur').value);
      if (!(v >= 1 && v <= 20)) { toast('时长要在 1~20 秒之间', 'warn'); return; }
      const n = store.patchShots(ids, { duration: v });
      toast(`已把 ${n} 镜时长改成 ${v}s`, 'ok');
    };
    batchBar.querySelector('#bcMoveOk').onclick = () => {
      if (!ids.length) { toast('先勾选镜头', 'warn'); return; }
      const k = batchBar.querySelector('#bcMove').value;
      const n = store.patchShots(ids, { cameraMove: k });
      toast(`已把 ${n} 镜运镜设为「${nameOfMove(k)}」`, 'ok');
    };
    batchBar.querySelector('#bcDel').onclick = () => {
      if (!ids.length) { toast('先勾选镜头', 'warn'); return; }
      confirmDlg(`删除所选的 ${ids.length} 个镜头？连同参考图一起删，不可恢复。`, { danger: true, okText: '删除' }).then(ok => {
        if (!ok) return;
        store.deleteShots(ids);
        selShots.clear();
        toast(`已删除 ${ids.length} 个镜头`, 'ok');
      });
    };
    batchBar.querySelector('#bcDone').onclick = () => { batchOn = false; selShots.clear(); renderCards(); container.querySelector('#btnBatch').classList.remove('btn-primary'); };
  };

  const renderCards = () => {
    grid.innerHTML = '';
    grid.classList.toggle('batching', batchOn);
    if (!p.shots.length) {
      grid.innerHTML = `<div class="empty-tip" style="grid-column:1/-1">分镜板还是空的。<br>去「剧本」页一键拆分镜，或点右上角「＋ 加镜头」手动添加。</div>`;
      renderBatchBar();
      return;
    }
    p.shots.forEach((s, i) => {
      const mv = moveByKey[s.cameraMove] || moveByKey.static;
      /* 台词配速体检：中文 ≈5 字/秒，台词在镜头时长里念不完就亮黄灯 */
      const speakLen = String(s.dialogue || '').replace(/[，。！？、…；：,.!?~\s"'「」『』（）()]/g, '').length;
      const speakNeed = speakLen / 5;
      const talkTag = (s.dialogue && speakNeed > s.duration * 1.15)
        ? `<span class="tag" style="color:var(--warn,#b98900);font-weight:700" title="台词约 ${speakNeed.toFixed(1)} 秒才能念完，镜头只有 ${s.duration} 秒——要么加时长，要么删台词">⏱ 台词 ${speakNeed.toFixed(1)}s &gt; 镜头 ${s.duration}s</span>` : '';
      const card = el(`<div class="shot-card${batchOn && selShots.has(s.id) ? ' sel' : ''}" draggable="true" data-idx="${i}">
        <div class="shot-frame aspect-${p.aspect.replace(':', 'x')}">
          <canvas class="shot-thumb"></canvas>
          <img class="shot-img" style="display:none">
          <div class="shot-check">✓</div>
          <div class="shot-frame-tags">
            <span class="tag">${esc(SHOT_SIZES.find(x => x.key === s.shotSize)?.name || '')}</span>
            <span class="tag tag-move">${esc(mv.name)}</span>
            ${talkTag}
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
          <button class="icon-btn" data-op="ins" title="在此镜后加一镜（沿用这个场景）">＋</button>
          <button class="icon-btn" data-op="dup" title="复制镜头">⧉</button>
          <button class="icon-btn" data-op="del" title="删除">🗑</button>
        </div>
      </div>`);
      card.addEventListener('click', e => {
        const op = e.target.closest('[data-op]')?.dataset.op;
        if (batchOn && !op) {
          e.stopPropagation();
          selShots.has(s.id) ? selShots.delete(s.id) : selShots.add(s.id);
          card.classList.toggle('sel', selShots.has(s.id));
          renderBatchBar();
          return;
        }
        if (op === 'del') { e.stopPropagation(); confirmDlg(`删除第 ${i + 1} 镜？`, { danger: true, okText: '删除' }).then(ok => { if (ok) { store.deleteShot(s.id); } }); return; }
        if (op === 'dup') { e.stopPropagation(); store.duplicateShot(s.id); toast('已复制镜头'); return; }
        if (op === 'ins') {
          e.stopPropagation();
          const ns = store.addShot({}, i + 1);   // 自动沿用上一镜场景（连戏默认）
          openShotEditor(ns, i + 1);
          return;
        }
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
    renderBatchBar();
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

  /* ---------- 批量模式开关 ---------- */
  container.querySelector('#btnBatch').onclick = () => {
    batchOn = !batchOn;
    if (!batchOn) selShots.clear();
    container.querySelector('#btnBatch').classList.toggle('btn-primary', batchOn);
    renderCards();
    if (batchOn && p.shots.length) toast('批量模式：点卡片勾选，可以批量删除 / 改时长 / 设运镜');
  };

  /* ---------- 导出分镜 CSV（和导入同一套表头，导出→同学改→再导回来） ---------- */
  container.querySelector('#btnExportShots').onclick = () => {
    if (!p.shots.length) { toast('分镜板是空的，没东西可导', 'warn'); return; }
    const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['镜号', '画面描述', '台词', '时长', '景别', '运镜', '角度', '场次', '备注']];
    p.shots.forEach((s, i) => rows.push([
      String(i + 1),
      s.desc || '',
      s.dialogue || '',
      String(s.duration ?? ''),
      (SHOT_SIZES.find(x => x.key === s.shotSize) || {}).name || '',
      (CAMERA_MOVES.find(x => x.key === s.cameraMove) || {}).name || '',
      (ANGLES.find(x => x.key === s.angle) || {}).name || '',
      s.sceneKey || '',
      s.note || '',
    ]));
    const csv = '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = (p.name || '分镜') + '-分镜表.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    store.unlock('exporter');
    toast(`已导出 ${p.shots.length} 镜的 CSV（可直接再导入）`, 'ok');
  };

  /* ---------- 清空分镜 ---------- */
  container.querySelector('#btnClearShots').onclick = () => {
    if (!p.shots.length) { toast('分镜板本来就是空的', 'warn'); return; }
    confirmDlg(`清空「${esc(p.name)}」的全部 ${p.shots.length} 个镜头？参考图也会一起删，不可恢复。\n想留底可以先「📤 导出」成 CSV。`, { danger: true, okText: '清空' }).then(ok => {
      if (!ok) return;
      const n = store.clearShots();
      toast(`已清空 ${n} 个镜头`, 'ok');
    });
  };

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
  if (window.__edOpen) { try { window.__edOpen.close(); } catch {} window.__edOpen = null; }
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
          <label class="dim">布景预设</label>
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
        <div class="form-row"><label>焦点（摇 / 俯仰落点）</label><select id="edFocus" class="input">
          ${focusOpts(shot)}
        </select></div>
        <div class="editor-3col">
          <div class="form-row"><label>看向高度</label><select id="edAim" class="input">
            <option value="auto" ${!shot.aimY ? 'selected' : ''}>自动（跟景别）</option>
            <option value="1.66" ${shot.aimY == 1.66 ? 'selected' : ''}>脸 · 1.66m</option>
            <option value="1.45" ${shot.aimY == 1.45 ? 'selected' : ''}>眼 · 1.45m</option>
            <option value="1.30" ${shot.aimY == 1.3 ? 'selected' : ''}>胸 · 1.30m</option>
            <option value="1.00" ${shot.aimY == 1.0 ? 'selected' : ''}>腰 · 1.00m</option>
            <option value="0.75" ${shot.aimY == 0.75 ? 'selected' : ''}>膝 · 0.75m</option>
            <option value="0.15" ${shot.aimY == 0.15 ? 'selected' : ''}>地面 · 0.15m</option>
          </select></div>
          <div class="form-row"><label>机位高度</label><select id="edCamH" class="input">
            <option value="auto" ${!shot.camH ? 'selected' : ''}>自动（跟运镜）</option>
            <option value="0.5" ${shot.camH == 0.5 ? 'selected' : ''}>低机位 · 0.5m</option>
            <option value="1.2" ${shot.camH == 1.2 ? 'selected' : ''}>腰平 · 1.2m</option>
            <option value="1.7" ${shot.camH == 1.7 ? 'selected' : ''}>眼平 · 1.7m</option>
            <option value="2.6" ${shot.camH == 2.6 ? 'selected' : ''}>高机位 · 2.6m</option>
            <option value="4.5" ${shot.camH == 4.5 ? 'selected' : ''}>俯视 · 4.5m</option>
          </select></div>
          <div></div>
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
        <div class="form-row"><label>场景（场景库 · 一套景可多镜复用）</label>
          <div style="display:flex;gap:6px">
            <select id="edSceneLib" class="input">
              <option value="">不用场景库（本镜独立）</option>
              ${(store.scenes || []).map(it => `<option value="${it.id}" ${shot.sceneId === it.id ? 'selected' : ''}>${esc(it.name)}${shot.sceneId === it.id ? ' · 使用中' : ''}</option>`).join('')}
            </select>
            <button class="btn btn-ghost btn-sm" id="edSceneBuild" title="打开场景搭建">🏗 搭建</button>
          </div>
        </div>
        <div class="form-row">
          <button class="btn btn-ghost btn-sm" id="edInherit" style="width:100%">⤵ 沿用上一镜镜头（运镜 / 景别 / 角度 / 看向 / 速度）</button>
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
      const aimV = m.body.querySelector('#edAim')?.value ?? 'auto', camHV = m.body.querySelector('#edCamH')?.value ?? 'auto';
      renderer.render(mv.sim, t, action, { duration: dur / 1000, hud: true, letterbox: true, angle: m.body.querySelector('#edAngle').value, moveSpeed: m.body.querySelector('#edSpeed').value, size: m.body.querySelector('#edSize').value, scene: shot.scene, aimY: aimV === 'auto' ? undefined : +aimV, camH: camHV === 'auto' ? undefined : +camHV, focus: focusPointOf(shot.scene, focusOf().focusKind, focusOf().focusId, aimV === 'auto' ? undefined : +aimV), focusKind: focusOf().focusKind });
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

  /* 场景库：一键套用 / 直达搭建 */
  const sceneSel = m.body.querySelector('#edSceneLib');
  if (sceneSel) sceneSel.onchange = () => {
    const id = sceneSel.value;
    if (!id) { store.updateShot(shot.id, { sceneId: null }); shot.sceneId = null; return; }
    const n = store.applySceneToShots(id, [shot.id]);
    const s2 = store.active.shots.find(x => x.id === shot.id);
    if (s2) { shot.scene = s2.scene; shot.sceneId = s2.sceneId; shot.cameraMove = s2.cameraMove; }
    toast(n ? '已套用场景库里的景' : '套用失败', n ? 'ok' : 'warn');
    playMove();
  };
  const sceneBuildBtn = m.body.querySelector('#edSceneBuild');
  if (sceneBuildBtn) sceneBuildBtn.onclick = async () => {
    const { openSceneBuilder } = await import('./builder.js');
    const s2 = store.active.shots.find(x => x.id === shot.id) || shot;
    openSceneBuilder(s2, () => {
      const s3 = store.active.shots.find(x => x.id === shot.id);
      if (s3) { shot.scene = s3.scene; shot.sceneId = s3.sceneId; shot.cameraMove = s3.cameraMove; }
      playMove();
    });
  };

  const inheritBtn = m.body.querySelector('#edInherit');
  if (inheritBtn) inheritBtn.onclick = () => {
    const prev = store.inheritShotSetup(shot.id);
    if (!prev) { toast('这是第一镜，没有上一镜可沿用', 'warn'); return; }
    const s2 = store.active.shots.find(x => x.id === shot.id);
    ['cameraMove', 'shotSize', 'angle', 'aimY', 'camH', 'moveSpeed', 'scene'].forEach(k => { shot[k] = s2[k]; });
    m.body.querySelector('#edMove').value = shot.cameraMove;
    m.body.querySelector('#edSize').value = shot.shotSize;
    m.body.querySelector('#edAngle').value = shot.angle;
    m.body.querySelector('#edSpeed').value = shot.moveSpeed || 'std';
    const setNum = (sel, v) => {
      const el2 = m.body.querySelector(sel); if (!el2) return;
      const match = Array.from(el2.options).find(o => o.value !== 'auto' && Math.abs(+o.value - (+v)) < 0.001);
      el2.value = (v == null || !match) ? 'auto' : match.value;
    };
    setNum('#edAim', shot.aimY);
    setNum('#edCamH', shot.camH);
    toast('已沿用上一镜的镜头设置 ⤵', 'ok');
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
  m.body.querySelector('#edFocus').onchange = () => playMove();

  /* 焦点选项：自动（主体）/ 场景里的人物 / 道具 / 画面中心 */
  function focusOpts(sh) {
    const cur = (sh.focusKind && sh.focusKind !== 'auto') ? sh.focusKind + ':' + (sh.focusId || '') : 'auto';
    const objs = (sh.scene && sh.scene.objects) || [];
    const L = [`<option value="auto" ${cur === 'auto' ? 'selected' : ''}>自动 · 主体人物</option>`];
    objs.filter(o => o.type === 'actor').forEach(o => {
      const v = 'person:' + (o.id || '');
      L.push(`<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>人物 · ${esc(o.name || '未命名')}</option>`);
    });
    objs.filter(o => o.type === 'prop' && !o.light && o.kind).forEach(o => {
      const v = 'prop:' + (o.id || '');
      L.push(`<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>道具 · ${esc(o.name || o.kind)}</option>`);
    });
    L.push(`<option value="center" ${cur === 'center' ? 'selected' : ''}>画面中心（场景中轴）</option>`);
    return L.join('');
  }
  const focusOf = () => {
    const v = m.body.querySelector('#edFocus')?.value || 'auto';
    const parts = v.split(':');
    return { focusKind: parts[0] === 'auto' ? 'auto' : parts[0], focusId: parts[1] || '' };
  };

  function readForm() {
    const aimV = m.body.querySelector('#edAim')?.value ?? 'auto';
    const camHV = m.body.querySelector('#edCamH')?.value ?? 'auto';
    return {
      desc: m.body.querySelector('#edDesc').value.trim(),
      dialogue: m.body.querySelector('#edDlg').value.trim(),
      cameraMove: m.body.querySelector('#edMove').value,
      shotSize: m.body.querySelector('#edSize').value,
      angle: m.body.querySelector('#edAngle').value,
      aimY: aimV === 'auto' ? null : +aimV,
      camH: camHV === 'auto' ? null : +camHV,
      ...focusOf(),
      duration: clampNum(+m.body.querySelector('#edDur').value || 3, 1, 20),
      transition: m.body.querySelector('#edTrans').value,
      moveSpeed: m.body.querySelector('#edSpeed').value,
      prompt: m.body.querySelector('#edPrompt').value,
      note: m.body.querySelector('#edNote').value.trim(),
    };
  }
  const __edClose = (r2) => { window.__edOpen = null; m.close(r2); };
  m.body.querySelector('#edSave').onclick = () => {
    store.updateShot(shot.id, readForm());
    store.addXP(1);
    __edClose();
    toast('镜头已保存 ✅', 'ok');
  };
  m.body.querySelector('#edCancel').onclick = () => __edClose();
  m.body.querySelector('#edDelete').onclick = async () => {
    if (await confirmDlg('删除这个镜头？', { danger: true, okText: '删除' })) {
      store.deleteShot(shot.id);
      __edClose();
    }
  };
  window.__edOpen = m;
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
