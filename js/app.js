/* ============================================================
 * 白日梦导演台 · 主控制器
 * 路由 / 外壳 / 通知 / XP 动效 / 新手教程 / 主题
 * ============================================================ */
import { Store } from './store.js';
import { TUTORIAL } from './data.js';
import { el, modal, toast } from './ui.js';
import { initViewsCore, renderHome, renderScript, renderStoryboard, openProjectRename } from './views-core.js';
import { initViewsStage, renderDict, renderPreview, renderScenes, renderContinuity } from './views-stage.js';
import { initViewsPlayer, renderAnimatic, renderEditor } from './views-player.js';
import { initViewsTools, renderPrompts, renderReview, renderAchievements, renderSettings, openProjectExport } from './views-tools.js';

/* ---------- 初始化 ---------- */
const store = new Store();
window.__bdm = store; // 调试/高级用法钩子
initViewsCore(store);
initViewsStage(store);
initViewsPlayer(store);
initViewsTools(store);

const VIEWS = {
  home:        { title: '项目台',   icon: '🏠', render: renderHome,        group: '创作' },
  script:      { title: '剧本',     icon: '📜', render: renderScript,      group: '创作', needProject: true },
  storyboard:  { title: '分镜板',   icon: '🎞️', render: renderStoryboard,  group: '创作', needProject: true },
  scenes:      { title: '场景库',   icon: '🏗', render: renderScenes,      group: '创作', needProject: true },
  continuity:  { title: '连戏检查', icon: '🔗', render: renderContinuity,  group: '创作', needProject: true },
  dict:        { title: '运镜词典', icon: '🧭', render: renderDict,        group: '创作' },
  preview:     { title: '运镜预演', icon: '👁️', render: renderPreview,     group: '创作' },
  animatic:    { title: '动态分镜', icon: '🌟', render: renderAnimatic,    group: '创作', needProject: true },
  editor:      { title: '剪辑台',   icon: '🎚️', render: renderEditor,      group: '创作', needProject: true },
  prompts:     { title: '提示词工坊', icon: '🪄', render: renderPrompts,   group: '出片', needProject: true },
  review:      { title: '审核台',   icon: '🔍', render: renderReview,      group: '出片', needProject: true },
  achievements:{ title: '成就图鉴', icon: '🏆', render: renderAchievements,group: '我的' },
  settings:    { title: '设置',     icon: '⚙️', render: renderSettings,    group: '我的' },
};

/* ---------- 外壳 ---------- */
const appEl = el(`<div class="app">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true">
          <defs><clipPath id="brandBar"><rect x="24" y="30" width="52" height="13" rx="6.5"/></clipPath></defs>
          <g transform="rotate(-6 50 55)">
            <rect x="24" y="30" width="52" height="13" rx="6.5" fill="#ffffff"/>
            <g clip-path="url(#brandBar)" fill="#c93346">
              <rect x="29" y="26" width="7" height="22" transform="rotate(24 32.5 37)"/>
              <rect x="44" y="26" width="7" height="22" transform="rotate(24 47.5 37)"/>
              <rect x="59" y="26" width="7" height="22" transform="rotate(24 62.5 37)"/>
            </g>
            <rect x="24" y="47" width="52" height="33" rx="7" fill="#ffffff"/>
            <path d="M45 55.5 L61.5 63.5 L45 71.5 Z" fill="#c93346"/>
          </g>
          <path d="M81 11 L83.4 16.6 L89 19 L83.4 21.4 L81 27 L78.6 21.4 L73 19 L78.6 16.6 Z" fill="#ffffff" opacity=".95"/>
        </svg>
      </div>
      <div class="brand-text"><b>白日梦导演台</b><span>Daydream Director</span></div>
    </div>
    <nav class="nav" id="nav"></nav>
    <div class="sidebar-foot">
      <div class="xp-mini" id="xpMini"></div>
      <button class="btn btn-ghost btn-sm tutorial-btn" id="btnTutorial">❓ 新手教程</button>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div class="topbar-project" id="topProject"></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="btnRename" title="重命名当前项目">✏️ 重命名</button>
      <button class="btn btn-ghost btn-sm" id="btnExport">📦 导出项目</button>
      <button class="btn btn-ghost btn-sm" id="btnCheckin">📅 签到</button>
    </header>
    <div class="content" id="viewRoot"></div>
    <footer class="foot dim">白日梦导演台 v1.12.5 · 场景搭建可右键操作 · 数据仅存于本机浏览器 · 纯前端，可离线使用</footer>
  </main>
</div>`);
document.body.appendChild(appEl);
document.body.appendChild(el(`<div class="toast-box" id="toastBox"></div>`));
document.body.appendChild(el(`<div class="xp-float-layer" id="xpFloatLayer"></div>`));

const navEl = appEl.querySelector('#nav');
const viewRoot = appEl.querySelector('#viewRoot');
let cleanup = null;
let currentView = null;

/* ---------- 导航 ---------- */
function buildNav() {
  const groups = [...new Set(Object.entries(VIEWS).map(([, v]) => v.group))];
  navEl.innerHTML = groups.map(g => `
    <div class="nav-group">${g}</div>
    ${Object.entries(VIEWS).filter(([, v]) => v.group === g).map(([key, v]) => `
      <button class="nav-item ${key === currentView ? 'on' : ''}" data-view="${key}">
        <span class="nav-icon">${v.icon}</span><span>${v.title}</span>
      </button>`).join('')}
  `).join('');
  navEl.querySelectorAll('.nav-item').forEach(b => b.onclick = () => navigate(b.dataset.view));
}

function navigate(view, payload = {}) {
  const def = VIEWS[view] || VIEWS.home;
  if (def.needProject && !store.active) {
    toast('先到「项目台」新建或打开一个项目', 'warn');
    view = 'home';
  }
  currentView = view;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  viewRoot.innerHTML = '';
  viewRoot.scrollTop = 0;
  buildNav();
  renderTopbar();
  const def2 = VIEWS[view];
  try {
    cleanup = def2.render(viewRoot, payload) || null;
  } catch (e) {
    console.error(e);
    viewRoot.innerHTML = `<div class="empty-tip">页面出错了：${e.message}</div>`;
  }
  location.hash = '#/' + view;
  // 标记预演过（用于成就 dreamBig）
  if (store.active && (view === 'animatic' || view === 'preview')) {
    store.active.meta.previewPlayed = true;
    store.persistProjects();
  }
}

function renderTopbar() {
  const tp = appEl.querySelector('#topProject');
  const p = store.active;
  if (!p) {
    tp.innerHTML = `<span class="dim">未打开项目</span>`;
  } else {
    tp.innerHTML = `
      <select class="input input-sm proj-select" id="projSelect">
        ${store.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.name}</option>`).join('')}
      </select>
      <span class="tag">${p.aspect}</span>
      <span class="dim">${p.shots.length} 镜 · ${store.totalDuration(p).toFixed(0)}s</span>`;
    tp.querySelector('#projSelect').onchange = e => {
      store.openProject(e.target.value);
      navigate(currentView);
    };
  }
}

/* ---------- XP 迷你条 ---------- */
function renderXPMini() {
  const info = store.levelInfo();
  const box = appEl.querySelector('#xpMini');
  box.innerHTML = `
    <div class="xp-mini-row"><span>Lv.${info.lv} ${info.title}</span><span>${info.xp} XP</span></div>
    <div class="xp-mini-bar"><div class="xp-mini-fill" style="width:${info.prog * 100}%"></div></div>`;
}

/* ---------- 通知 ---------- */
window.addEventListener('bdm-toast', e => {
  const { msg, type } = e.detail;
  const t = el(`<div class="toast ${type || ''}">${msg}</div>`);
  document.getElementById('toastBox').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3400);
});

/* ---------- XP 飘字 ---------- */
store.onXP((n, reason) => {
  renderXPMini();
  const f = el(`<div class="xp-float">+${n} XP${reason ? `<i>${reason}</i>` : ''}</div>`);
  document.getElementById('xpFloatLayer').appendChild(f);
  setTimeout(() => f.classList.add('fly'), 20);
  setTimeout(() => f.remove(), 1600);
});

/* ---------- 升级横幅 ---------- */
window.addEventListener('bdm-levelup', e => {
  const info = e.detail;
  const b = el(`<div class="levelup-banner">🎉 升级到 Lv.${info.lv}「${info.title}」！</div>`);
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('show'), 10);
  setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 600); }, 2600);
});

/* ---------- 导航事件 ---------- */
window.addEventListener('bdm-nav', e => navigate(e.detail.view, e.detail.payload || {}));
window.addEventListener('bdm-tutorial', () => openTutorial());

/* ---------- 顶部按钮 ---------- */
appEl.querySelector('#btnRename').onclick = () => openProjectRename(store.activeId, () => {
  renderTopbar();
  if (currentView === 'home') navigate('home');
});
appEl.querySelector('#btnExport').onclick = () => openProjectExport();
appEl.querySelector('#btnCheckin').onclick = () => { store.checkIn(); renderXPMini(); };
appEl.querySelector('#btnTutorial').onclick = () => openTutorial();

/* ---------- 设置应用 ---------- */
function applySettings() {
  const st = store.settings;
  document.body.className = [
    `theme-${st.theme}`,
    `bgm-${st.background}`,
    st.effects ? '' : 'fx-off',
    st.noise ? 'noise-on' : '',
  ].join(' ');
}

/* ============================================================
 * 新手教程（卡片翻页）
 * ============================================================ */
function openTutorial() {
  let page = 0;
  const m = modal({
    title: '❓ 新手教程',
    body: '<div id="tuBox"></div>',
    onClose: () => localStorage.setItem('bdm_tutorial_v1', '1'),
  });
  const box = m.body.querySelector('#tuBox');
  const render = () => {
    const t = TUTORIAL[page];
    box.innerHTML = `
      <div class="tu-card" style="--tu-color:${t.color}">
        <div class="tu-icon">${t.icon}</div>
        <div class="tu-title">${t.title}</div>
        <div class="tu-body">${t.body}</div>
        <div class="tu-tip">💡 ${t.tip}</div>
      </div>
      <div class="tu-controls">
        <div class="tu-dots">${TUTORIAL.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</div>
        <div class="spacer"></div>
        ${page > 0 ? '<button class="btn btn-ghost btn-sm" id="tuPrev">上一页</button>' : ''}
        ${page < TUTORIAL.length - 1
          ? '<button class="btn btn-primary btn-sm" id="tuNext">下一页 →</button>'
          : '<button class="btn btn-primary btn-sm" id="tuDone">开工！🎬</button>'}
      </div>`;
    box.querySelector('#tuPrev')?.addEventListener('click', () => { page--; render(); });
    box.querySelector('#tuNext')?.addEventListener('click', () => { page++; render(); });
    box.querySelector('#tuDone')?.addEventListener('click', () => m.close());
  };
  render();
}

/* ============================================================
 * 启动
 * ============================================================ */
applySettings();
window.addEventListener('bdm-settings', applySettings);
store.subscribe(renderXPMini);
renderXPMini();

/* 首次访问自动弹教程 */
if (!localStorage.getItem('bdm_tutorial_v1')) {
  setTimeout(openTutorial, 600);
}

/* 打开自动签到（每天首次） */
setTimeout(() => { store.checkIn(true); renderXPMini(); }, 1200);

/* 路由启动：支持 #/view 直达 */
const initial = (location.hash.match(/^#\/(\w+)/) || [])[1];
navigate(VIEWS[initial] ? initial : 'home');

/* Service Worker（离线可用） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('bdm_sw_r') === '1') return;
      sessionStorage.setItem('bdm_sw_r', '1');
      location.reload();
    });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

window.addEventListener('hashchange', () => {
  const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (v && v !== currentView && VIEWS[v]) navigate(v);
});
