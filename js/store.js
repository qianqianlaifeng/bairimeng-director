/* ============================================================
 * 白日梦导演台 · 状态仓库
 * localStorage：设置 / 项目 / 成就
 * IndexedDB  ：镜头参考图（避免撑爆 localStorage）
 * ============================================================ */
import { LEVELS, BADGES, CAMERA_MOVES } from './data.js';

const LS = {
  settings: 'bdm_settings_v1',
  projects: 'bdm_projects_v1',
  achv: 'bdm_achv_v1',
  tutorial: 'bdm_tutorial_v1',
};

/* ---------------- 工具 ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayStr = () => new Date().toISOString().slice(0, 10);
const yestStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) {
    console.warn('存储失败', e);
    /* 撑爆 5MB 时以前只在控制台叫一声，用户以为存住了 → 刷新才发现丢活儿。
       广播出去让 app.js 弹真人能看见的提示。 */
    try { window.dispatchEvent(new CustomEvent('bdm-save-failed', { detail: { key, name: e && e.name } })); } catch (_) { }
    return false;
  }
}

/* ---------------- 默认值 ---------------- */
const DEFAULT_SETTINGS = {
  theme: 'porcelain',  // 晴空浅色（年轻化蓝调）
  background: 'aurora',
  bgMask: 40,
  effects: true,       // 动效全开
  noise: false,        // 噪点质感（默认关闭）
  api: null,           // {name,url,model,key}
  lastProjectId: null,
  uiRev: 2,            // 2 = 浅色红点缀视觉
};

/* ---------------- 项目模型 ---------------- */
function newShot(partial = {}) {
  return {
    id: uid(),
    title: '',
    desc: '',
    dialogue: '',
    duration: 3,
    cameraMove: 'static',
    shotSize: 'MS',
    angle: 'eye',
    prompt: '',
    transition: 'cut',
    image: null,        // IndexedDB key（参考图）
    sketch: null,       // IndexedDB key（手绘分镜稿）
    moveSpeed: 'std',   // 运镜速度 slow/std/fast
    aimY: null,         // 看向高度（m，null=自动跟景别）：1.66 脸 / 1.45 眼 / 1.3 胸 …
    showPath: false,    // 预演时是否把人物走位线画在地上
    focusKind: 'auto',  // 焦点类型：auto=主体人物 / person / prop / center
    focusId: '',        // 焦点对象 id（person/prop 时有效）
    camH: null,         // 机位高度（m，null=自动跟运镜）：0.5 低机位 / 1.7 眼平 / 4.5 俯视
    scene: null,        // 场景搭建 {objects:[], cam:}
    mnState: null,      // 导演台原生场景快照（房间/墙/道具，重开时无损还原）
    sceneId: null,      // 引用的场景库条目 id（同一场景多镜复用）
    sceneKey: '',       // 场次标识（剧本拆分自动带上，用于按场次归组）
    note: '',
    review: null,       // {score, checks:{...}, note}
    ...partial,
  };
}
function newProject(name, aspect = '16:9') {
  return {
    id: uid(),
    name: name || '未命名项目',
    aspect,
    script: '',
    shots: [],
    scenes: [],        // 场景库：[{id,name,scene,mnState,thumb,updatedAt}]，任意镜头可复用
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { breakdownCount: 0, previewPlayed: false, exported: false, reviewed: false },
  };
}

/* 老存档 / 外部导入的项目可能缺后来加的字段 → 读进来先补齐。
   newShot 把 partial 放在最后展开，原有字段和 id 一个都不会动。 */
function normalizeProject(p) {
  if (!p || typeof p !== 'object') return p;
  p.shots = Array.isArray(p.shots) ? p.shots.map(s => newShot(s)) : [];
  if (!Array.isArray(p.scenes)) p.scenes = [];
  if (!p.meta || typeof p.meta !== 'object') p.meta = {};
  if (!p.aspect) p.aspect = '16:9';
  if (!p.name) p.name = '未命名项目';
  return p;
}

class Store {
  constructor() {
    const stored = load(LS.settings, {});
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    // 视觉 v3 迁移：老存档没有 uiRev 标记 → 一次性切到浅色主题
    if (!stored.uiRev || stored.uiRev < 2) {
      this.settings.theme = 'porcelain';
      this.settings.uiRev = 2;
      this.persistSettings();
    }
    this.projects = load(LS.projects, []);
    if (Array.isArray(this.projects)) this.projects = this.projects.map(normalizeProject);
    this.achv = Object.assign({
      xp: 0, unlocked: {}, lastCheckin: null, streak: 0, maxStreak: 0,
      counts: { shots: 0, prompts: 0, dictViews: {}, breakdowns: 0, previews: 0 },
      checkinHistory: [],
    }, load(LS.achv, {}));
    this.refs = load('bdm_refs_v1', []);
    this.activeId = this.settings.lastProjectId;
    if (!this.projects.find(p => p.id === this.activeId)) this.activeId = null;
    this.listeners = [];
    this.xpListeners = [];
    /* 上次会话里删掉但还没过撤销窗口的图片，启动时补清一次（只清没有任何项目引用的） */
    this._pendingImgs = load('bdm_img_pending_v1', []) || [];
    this._initIDB();
    if (this._pendingImgs.length) this._idbReady.then(() => this.purgeOrphanImages()).catch(() => { });
  }

  /* ---------- 订阅 ---------- */
  /* ownerEl：视图容器。切页后容器脱离 DOM，对应监听器会在下一次 emit 时自动摘掉，
     避免旧视图的刷新函数一直堆积、并操作已经不在页面上的 DOM。 */
  subscribe(fn, ownerEl) {
    const rec = { fn, ownerEl: ownerEl || null };
    this.listeners.push(rec);
    return () => { this.listeners = this.listeners.filter(l => l !== rec); };
  }
  emit() {
    this.listeners = this.listeners.filter(l => !l.ownerEl || document.body.contains(l.ownerEl));
    this.listeners.forEach(l => { try { l.fn(); } catch (e) { console.error(e); } });
  }
  onXP(fn) { this.xpListeners.push(fn); }

  /* ---------- 持久化 ---------- */
  persistSettings() { save(LS.settings, this.settings); }
  persistProjects() {
    const ok = save(LS.projects, this.projects);
    if (!ok) this._notify('⚠️ 浏览器存储空间不足：建议删掉部分项目的参考图，或先导出备份', 'warn');
  }
  persistAchv() { save(LS.achv, this.achv); }

  _notify(msg, type) { window.dispatchEvent(new CustomEvent('bdm-toast', { detail: { msg, type } })); }

  /* ---------- 项目 CRUD ---------- */
  get active() { return this.projects.find(p => p.id === this.activeId) || null; }

  createProject(name, aspect) {
    const p = newProject(name, aspect);
    this.projects.unshift(p);
    this.activeId = p.id;
    this.settings.lastProjectId = p.id;
    this.persistSettings(); this.persistProjects(); this.emit();
    this.addXP(10, '新建项目');
    this.unlock('firstProject');
    return p;
  }
  openProject(id) {
    this.activeId = id;
    this.settings.lastProjectId = id;
    this.persistSettings(); this.emit();
  }
  updateProject(id, patch) {
    const p = this.projects.find(x => x.id === id);
    if (!p) return;
    Object.assign(p, patch, { updatedAt: Date.now() });
    this.persistProjects(); this.emit();
  }
  deleteProject(id) {
    const idx = this.projects.findIndex(p => p.id === id);
    if (idx < 0) return;
    // 清理该项目的参考图 / 手绘稿 / 审核截图
    this._imgKeys(this.projects[idx].shots).forEach(k => this.deleteImage(k));
    this.projects.splice(idx, 1);
    if (this.activeId === id) this.activeId = this.projects[0]?.id || null;
    this.persistProjects(); this.emit();
  }
  duplicateProject(id) {
    const p = this.projects.find(x => x.id === id);
    if (!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = uid(); copy.name = p.name + ' 副本'; copy.createdAt = Date.now(); copy.updatedAt = Date.now();
    // 参考图引用共用（内容寻址：同 key 不重复占空间）
    this.projects.splice(this.projects.indexOf(p) + 1, 0, copy);
    this.persistProjects(); this.emit();
    this._notify('项目已复制');
  }
  importProject(data) {
    const p = Object.assign(newProject(data.name || '导入项目', data.aspect || '16:9'), data, {
      id: uid(), createdAt: Date.now(), updatedAt: Date.now(),
    });
    p.shots = (data.shots || []).map(s => newShot(s));
    this.projects.unshift(p);
    this.persistProjects(); this.emit();
    this._notify(`已导入项目「${p.name}」（${p.shots.length} 个镜头）`);
    return p;
  }

  /* ---------- 镜头操作 ---------- */
  /* 批量导入分镜（同学写好的表格）：一次落库、一次重绘 */
  /* ---------- 删镜头可撤销 + 参考图延迟清理 ----------
     清空 / 批量删 / 替换导入都是「一键毁掉一堆」的操作，误触代价高。
     这里删之前先整板快照，留 60 秒撤销窗口；参考图和手绘稿不立刻删，
     等窗口过了再统一清「任何项目都不再引用」的孤儿，既不误删也能兜住中途关页面的情况。 */
  static UNDO_WINDOW = 60000;
  _shotUndo = null;           // {projectId, label, shots:[深拷贝], at}
  _purgeTimer = null;
  _pendingImgs = [];          // 待清理的图片 key（跨刷新保存在 localStorage）

  _imgKeys(shots) {
    const ks = [];
    (shots || []).forEach(s => {
      if (!s) return;
      if (s.image) ks.push(s.image);
      if (s.sketch) ks.push(s.sketch);
      if (s.reviewImg) ks.push(s.reviewImg);
    });
    return ks;
  }
  _findShot(shotId) {
    const p = this.active;
    return p ? (p.shots || []).find(s => s.id === shotId) || null : null;
  }
  _takeShotUndo(label) {
    const p = this.active; if (!p) return;
    this._shotUndo = { projectId: p.id, label, shots: JSON.parse(JSON.stringify(p.shots || [])), at: Date.now() };
    this._queueImgPurge();
  }
  canUndoShots() {
    const u = this._shotUndo;
    return !!(u && this.active && u.projectId === this.active.id && Date.now() - u.at < Store.UNDO_WINDOW);
  }
  undoInfo() { return this.canUndoShots() ? this._shotUndo : null; }
  undoRemoveShots() {
    const p = this.active, u = this._shotUndo;
    if (!p || !u || u.projectId !== p.id) return 0;
    p.shots = u.shots.map(s => newShot(s));
    p.updatedAt = Date.now();
    this._shotUndo = null;
    clearTimeout(this._purgeTimer); this._purgeTimer = null;
    this.persistProjects(); this.emit();
    return p.shots.length;
  }
  _queueImgPurge() {
    try { save('bdm_img_pending_v1', this._pendingImgs); } catch (e) { }
    clearTimeout(this._purgeTimer);
    this._purgeTimer = setTimeout(() => this.purgeOrphanImages(), Store.UNDO_WINDOW);
  }
  async purgeOrphanImages() {
    if (!this._pendingImgs || !this._pendingImgs.length) return 0;
    const live = new Set();
    for (const p of this.projects) this._imgKeys(p.shots).forEach(k => live.add(k));
    const doomed = Array.from(new Set(this._pendingImgs)).filter(k => !live.has(k));
    this._pendingImgs = this._pendingImgs.filter(k => live.has(k));
    try { save('bdm_img_pending_v1', this._pendingImgs); } catch (e) { }
    for (const k of doomed) { try { await this.deleteImage(k); } catch (e) { } }
    return doomed.length;
  }

  importShots(list, opts = {}) {
    const p = this.active; if (!p) return 0;
    const arr = (list || []).filter(x => x && String(x.desc || '').trim());
    if (!arr.length) return 0;
    if (opts.replace) {
      if (p.shots.length) { this._pendingImgs = this._pendingImgs.concat(this._imgKeys(p.shots)); this._takeShotUndo('替换导入'); }
      p.shots = [];
    }
    arr.forEach(x => p.shots.push(newShot(x)));
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    this.achv.counts.shots += arr.length;
    if (this._checkShotBadges) this._checkShotBadges();
    return arr.length;
  }

  addShot(partial = {}, at = -1) {
    const p = this.active; if (!p) return null;
    /* 连戏默认：新镜头自动沿用上一镜的场景（同一个景里继续拍，不用重搭） */
    const prev = at >= 0 ? p.shots[at - 1] : p.shots[p.shots.length - 1];
    const inherit = (prev && prev.scene) ? {
      scene: JSON.parse(JSON.stringify(prev.scene)),
      mnState: prev.mnState ? JSON.parse(JSON.stringify(prev.mnState)) : null,
      sceneId: prev.sceneId || null,
      cameraMove: prev.cameraMove === 'free' ? 'free' : undefined,
    } : {};
    const s = newShot({ ...inherit, ...partial });
    if (at >= 0) p.shots.splice(at, 0, s); else p.shots.push(s);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    this.achv.counts.shots++;
    this._checkShotBadges();
    return s;
  }
  updateShot(shotId, patch) {
    const p = this.active; if (!p) return;
    const s = p.shots.find(x => x.id === shotId);
    if (!s) return;
    Object.assign(s, patch);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  deleteShot(shotId) {
    const p = this.active; if (!p) return;
    const s = p.shots.find(x => x.id === shotId);
    if (!s) return;
    this._pendingImgs = this._pendingImgs.concat(this._imgKeys([s]));
    this._takeShotUndo('删除 1 个镜头');
    p.shots = p.shots.filter(x => x.id !== shotId);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  duplicateShot(shotId) {
    const p = this.active; if (!p) return;
    const i = p.shots.findIndex(x => x.id === shotId);
    if (i < 0) return;
    /* 去掉 id 再交给 newShot 生成新 id —— 写成 id: undefined 会把 newShot 里生成的 id 覆盖掉，
       两条复制出来的镜头就都是 undefined，删除/编辑会命中错的镜头 */
    const { id, ...rest } = p.shots[i];
    const copy = newShot({ ...rest, title: '' });
    p.shots.splice(i + 1, 0, copy);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  moveShot(fromIdx, toIdx) {
    const p = this.active; if (!p) return;
    const [s] = p.shots.splice(fromIdx, 1);
    p.shots.splice(toIdx, 0, s);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  setShots(shots) {
    const p = this.active; if (!p) return;
    p.shots = shots.map(s => newShot(s));
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  /* 批量：清空 / 删多镜 / 批量改字段 */
  clearShots() {
    const p = this.active; if (!p || !p.shots.length) return 0;
    const n = p.shots.length;
    this._pendingImgs = this._pendingImgs.concat(this._imgKeys(p.shots));
    this._takeShotUndo('清空 ' + n + ' 个镜头');
    p.shots = [];
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return n;
  }
  deleteShots(ids) {
    const p = this.active; if (!p || !ids || !ids.length) return 0;
    const set = new Set(ids);
    this._pendingImgs = this._pendingImgs.concat(this._imgKeys(p.shots.filter(s => set.has(s.id))));
    this._takeShotUndo('删除 ' + set.size + ' 个镜头');
    p.shots = p.shots.filter(s => !set.has(s.id));
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return set.size;
  }
  patchShots(ids, patch) {
    const p = this.active; if (!p || !ids || !ids.length || !patch) return 0;
    const set = new Set(ids);
    let n = 0;
    p.shots.forEach(s => { if (set.has(s.id)) { Object.assign(s, patch); n++; } });
    if (n) { p.updatedAt = Date.now(); this.persistProjects(); this.emit(); }
    return n;
  }

  /* ---------- 场景库（项目级，任意镜头可复用） ---------- */
  get scenes() { const p = this.active; return (p && p.scenes) || []; }
  findScene(sceneId) { return this.scenes.find(s => s.id === sceneId) || null; }

  /** 存入场景库；同 id 则更新。返回条目 */
  saveScene({ id, name, scene, mnState, thumb }) {
    const p = this.active; if (!p) return null;
    if (!Array.isArray(p.scenes)) p.scenes = [];
    const clone = o => (o ? JSON.parse(JSON.stringify(o)) : null);
    const slim = (st) => {
      if (!st) return null;
      const c = clone(st);
      c.directorShots = (c.directorShots || []).map(s => ({ name: s && s.name, cam: s && s.cam }));
      delete c.project; delete c.cuttingDesk; delete c.cameraPath;
      return c;
    };
    let item = id ? p.scenes.find(s => s.id === id) : null;
    if (!item) { item = { id: uid(), name: name || '场景 ' + (p.scenes.length + 1), createdAt: Date.now() }; p.scenes.push(item); }
    if (name) item.name = name;
    item.scene = clone(scene);
    item.mnState = slim(mnState);
    if (thumb) item.thumb = thumb;
    item.updatedAt = Date.now();
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return item;
  }
  renameScene(sceneId, name) {
    const it = this.findScene(sceneId); if (!it) return;
    it.name = name; it.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  deleteScene(sceneId) {
    const p = this.active; if (!p) return;
    p.scenes = (p.scenes || []).filter(s => s.id !== sceneId);
    p.shots.forEach(s => { if (s.sceneId === sceneId) s.sceneId = null; });
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  /** 把场景库条目套用到指定镜头（深拷贝，后续各镜可独立微调） */
  applySceneToShots(sceneId, shotIds = []) {
    const p = this.active; if (!p) return 0;
    const it = this.findScene(sceneId); if (!it) return 0;
    let n = 0;
    p.shots.forEach(s => {
      if (!shotIds.includes(s.id)) return;
      s.scene = it.scene ? JSON.parse(JSON.stringify(it.scene)) : null;
      s.mnState = it.mnState ? JSON.parse(JSON.stringify(it.mnState)) : null;
      s.sceneId = sceneId;
      if (s.scene) s.cameraMove = 'free';
      n++;
    });
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return n;
  }
  /** 镜头用到的场景库条目统计 */
  sceneUsage(sceneId) { const p = this.active; return p ? p.shots.filter(s => s.sceneId === sceneId).length : 0; }

  /* ---------- 连戏：一键对齐上一镜 ---------- */
  alignContinuity(shotId, prevId, kind = 'all') {
    const p = this.active; if (!p) return false;
    const cur = p.shots.find(s => s.id === shotId);
    const prev = p.shots.find(s => s.id === prevId);
    if (!cur || !prev) return false;
    const cp = o => (o ? JSON.parse(JSON.stringify(o)) : null);
    if (kind === 'all') {
      cur.scene = cp(prev.scene);
      cur.mnState = cp(prev.mnState);
      cur.sceneId = prev.sceneId || null;
      cur.cameraMove = prev.cameraMove;
    } else if (kind === 'cam') {
      ['shotSize', 'angle', 'aimY', 'camH', 'cameraMove', 'moveSpeed'].forEach(k => { cur[k] = prev[k]; });
      if (prev.scene && prev.scene.cam) { cur.scene = cp(cur.scene) || {}; cur.scene.cam = cp(prev.scene.cam); }
      if (prev.mnState && prev.mnState.directorShots && cur.mnState) {
        cur.mnState = cp(cur.mnState);
        cur.mnState.directorShots = cp(prev.mnState.directorShots);
      }
    } else if (kind === 'light') {
      if (prev.mnState && prev.mnState.sun && cur.mnState) { cur.mnState = cp(cur.mnState); cur.mnState.sun = cp(prev.mnState.sun); }
      if (prev.scene && prev.scene.light) { cur.scene = cp(cur.scene) || {}; cur.scene.light = cp(prev.scene.light); }
    } else if (kind === 'persons') {
      if (prev.mnState && prev.mnState.scene && cur.mnState && cur.mnState.scene) {
        cur.mnState = cp(cur.mnState);
        cur.mnState.scene.persons = cp(prev.mnState.scene.persons || []);
      }
      if (prev.scene && cur.scene) {
        cur.scene = cp(cur.scene);
        const props = (cur.scene.objects || []).filter(o => o.type !== 'actor');
        const actors = (prev.scene.objects || []).filter(o => o.type === 'actor').map(o => cp(o));
        cur.scene.objects = props.concat(actors);
      }
    }
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return true;
  }

  /** 沿用上一镜的镜头语言（运镜/景别/角度/看向高度/机位高度/速度），不动内容 */
  inheritShotSetup(shotId) {
    const p = this.active; if (!p) return null;
    const i = p.shots.findIndex(s => s.id === shotId);
    if (i <= 0) return null;
    const cur = p.shots[i], prev = p.shots[i - 1];
    const keys = ['cameraMove', 'shotSize', 'angle', 'aimY', 'camH', 'moveSpeed'];
    keys.forEach(k => { cur[k] = prev[k]; });
    if (prev.scene && prev.scene.cam) { cur.scene = cur.scene ? JSON.parse(JSON.stringify(cur.scene)) : {}; cur.scene.cam = JSON.parse(JSON.stringify(prev.scene.cam)); }
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return prev;
  }

  /* ---------- 场次智能归组 ---------- */
  shotSceneKey(s) {
    if (s.sceneKey) return s.sceneKey;
    const t = String(s.title || '');
    const m = t.match(/^([^·]{1,12})·/);
    return m ? m[1] : '';
  }
  groupShotsByScene() {
    const p = this.active; if (!p) return [];
    const map = new Map();
    p.shots.forEach((s, i) => {
      const k = this.shotSceneKey(s) || '未分场';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ shot: s, idx: i });
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }
  /** 按场次自动建景 + 绑定：每场一套景，已有则复用 */
  autoBindScenesByGroup() {
    const p = this.active; if (!p) return { groups: 0, created: 0, bound: 0 };
    const groups = this.groupShotsByScene().filter(g => g.key !== '未分场');
    let created = 0, bound = 0;
    groups.forEach(g => {
      let it = (p.scenes || []).find(s => s.name === g.key);
      if (!it) {
        it = this.saveScene({ name: g.key, scene: { base: 'plain', objects: [], cam: { az: 25, dist: 7.5, h: 1.8, fov: 55 } }, mnState: null });
        created++;
      }
      g.items.forEach(({ shot }) => { if (shot.sceneId !== it.id) { shot.sceneId = it.id; bound++; } });
    });
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
    return { groups: groups.length, created, bound };
  }
  totalDuration(p = this.active) {
    if (!p) return 0;
    return p.shots.reduce((a, s) => a + (+s.duration || 0), 0);
  }

  /* ---------- XP / 成就 ---------- */
  levelInfo() {
    const xp = this.achv.xp;
    let lv = 1;
    for (const l of LEVELS) if (xp >= l.xp) lv = l.lv;
    const cur = LEVELS[lv - 1], next = LEVELS[lv] || null;
    const prog = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
    return { lv, title: cur.title, xp, next: next ? next.xp : null, prog: clampN(prog, 0, 1), nextTitle: next ? next.title : null };
  }
  addXP(n, reason) {
    const before = this.levelInfo().lv;
    this.achv.xp += n;
    this.persistAchv();
    this.xpListeners.forEach(f => { try { f(n, reason); } catch (e) { console.error(e); } });
    const after = this.levelInfo().lv;
    if (after > before) {
      const info = this.levelInfo();
      this._notify(`🎉 升级！Lv.${after}「${info.title}」`, 'ok');
      window.dispatchEvent(new CustomEvent('bdm-levelup', { detail: info }));
    }
  }
  unlock(key) {
    if (this.achv.unlocked[key]) return;
    const badge = BADGES.find(b => b.key === key);
    if (!badge) return;
    this.achv.unlocked[key] = Date.now();
    this.persistAchv();
    this._notify(`🏅 解锁徽章「${badge.name}」— ${badge.desc}`, 'ok');
    window.dispatchEvent(new CustomEvent('bdm-badge', { detail: badge }));
  }
  _checkShotBadges() {
    const p = this.active;
    if (p && p.shots.length >= 20) this.unlock('shots20');
    if (this.achv.counts.shots >= 50) this.unlock('shots50');
    this.persistAchv();
  }
  checkIn(silent = false) {
    const today = todayStr();
    if (this.achv.lastCheckin === today) {
      if (!silent) this._notify('今天已经签到过啦，明天再来～');
      return false;
    }
    const yest = this.achv.lastCheckin;          // 先留一份“上一次签到是哪天”，下面就被覆盖了
    this.achv.lastCheckin = today;
    this.achv.streak = (yest === yestStr() || this.achv.checkinHistory.includes(yestStr())) ? this.achv.streak + 1 : 1;
    this.achv.maxStreak = Math.max(this.achv.maxStreak || 0, this.achv.streak);
    this.achv.checkinHistory.push(today);
    if (this.achv.checkinHistory.length > 60) this.achv.checkinHistory.shift();
    this.persistAchv();
    this.addXP(20, '每日签到');
    if (this.achv.streak >= 7) this.unlock('streak7');
    this._notify(`📅 签到成功！连续 ${this.achv.streak} 天，+20 XP`, 'ok');
    return true;
  }
  markDictViewed(moveKey) {
    this.achv.counts.dictViews[moveKey] = (this.achv.counts.dictViews[moveKey] || 0) + 1;
    this.persistAchv();
    const n = Object.keys(this.achv.counts.dictViews).length;
    if (n >= 10) this.unlock('dictLearner');
    if (n >= CAMERA_MOVES.length) this.unlock('dictMaster');
  }

  /* ---------- 资料文档库（审核标准 / 风格模板等，仅存本地） ---------- */
  addRef(name, text) {
    this.refs.push({ id: uid(), name: (name || '未命名文档').slice(0, 40), text: String(text).slice(0, 20000) });
    if (this.refs.length > 12) this.refs.shift();
    this.saveRefs();
    this._notify('文档已加入资料库 📚');
  }
  delRef(id) { this.refs = this.refs.filter(r => r.id !== id); this.saveRefs(); }
  saveRefs() { save('bdm_refs_v1', this.refs); }
  selectedRefText() {
    const sel = this.settings.refSel || [];
    const NL = String.fromCharCode(10);
    return this.refs.filter(r => sel.includes(r.id)).map(r => '【' + r.name + '】' + NL + r.text).join(NL + NL);
  }

  /* ---------- 设置 ---------- */
  setSettings(patch) {
    Object.assign(this.settings, patch);
    this.persistSettings();
    window.dispatchEvent(new CustomEvent('bdm-settings', { detail: this.settings }));
    this.emit();
  }

  /* ---------- 全量备份 ---------- */
  exportAll() {
    return {
      app: 'bairimeng-director',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      projects: this.projects,
      achv: this.achv,
    };
  }
  importAll(data) {
    if (!data || data.app !== 'bairimeng-director') throw new Error('不是白日梦导演台的备份文件');
    /* 两种导出格式都要认：
       ① 整站备份 {projects:[…]}（设置→导出备份）
       ② 「📦 导出项目 → 项目 JSON」的单个项目对象 {name, shots:[…]}
       以前只认 ①，导②这种文件会提示“导入成功”却什么都没做。 */
    if (Array.isArray(data.projects)) {
      this._queueAllImages();                       // 被替换掉的旧项目的图，之后统一清孤儿
      this.projects = data.projects.map(normalizeProject);
      this.persistProjects();
    } else if (Array.isArray(data.shots)) {
      this.importProject(data);
    } else {
      throw new Error('备份文件里没有项目数据');
    }
    if (data.settings) { this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings); this.persistSettings(); }
    if (data.achv) { this.achv = Object.assign(this.achv, data.achv); this.persistAchv(); }
    this.activeId = this.settings.lastProjectId;
    if (!this.projects.find(p => p.id === this.activeId)) this.activeId = this.projects[0]?.id || null;
    this.emit();
  }
  /* 把当前所有项目引用过的图片 key 记入待清理队列（删不掉就变孤儿） */
  _queueAllImages() {
    const ks = [];
    for (const p of this.projects) ks.push(...this._imgKeys(p.shots));
    this._pendingImgs = this._pendingImgs.concat(ks);
    try { save('bdm_img_pending_v1', this._pendingImgs); } catch (e) { }
  }

  /* ---------- IndexedDB（参考图） ---------- */
  _initIDB() {
    this._idbReady = new Promise((resolve) => {
      const req = indexedDB.open('bdm_images', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve();
      };
      req.onerror = () => resolve(); // 降级：无图模式
    });
  }
  async putImage(blob) {
    await this._idbReady;
    if (!this._db) return null;
    const key = uid();
    return new Promise((resolve) => {
      const tx = this._db.transaction('images', 'readwrite');
      tx.objectStore('images').put(blob, key);
      tx.oncomplete = () => resolve(key);
      tx.onerror = () => resolve(null);
    });
  }
  async getImage(key) {
    await this._idbReady;
    if (!this._db || !key) return null;
    return new Promise((resolve) => {
      const tx = this._db.transaction('images', 'readonly');
      const rq = tx.objectStore('images').get(key);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => resolve(null);
    });
  }
  async deleteImage(key) {
    await this._idbReady;
    if (!this._db || !key) return;
    return new Promise((resolve) => {
      const tx = this._db.transaction('images', 'readwrite');
      tx.objectStore('images').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  /* ---------- 图片压缩入库 ----------
     重新上传要先把上一张从 IndexedDB 删掉，否则每换一次图就多一个没人引用的 blob。 */
  async attachImage(shotId, file) {
    const blob = await compressImage(file, 1024);
    const key = await this.putImage(blob);
    if (!key) { this._notify('图片保存失败（浏览器不支持或空间不足）', 'warn'); return; }
    const old = this._findShot(shotId)?.image;
    this.updateShot(shotId, { image: key });
    if (old && old !== key) this.deleteImage(old);
    this._notify('参考图已挂到镜头上');
  }

  /* ---------- 手绘分镜稿 ---------- */
  async attachSketch(shotId, blob) {
    const key = await this.putImage(blob);
    if (!key) { this._notify('手绘稿保存失败（浏览器不支持或空间不足）', 'warn'); return; }
    const old = this._findShot(shotId)?.sketch;
    this.updateShot(shotId, { sketch: key });
    if (old && old !== key) this.deleteImage(old);
    this.addXP(2, '手绘分镜');
    this._notify('手绘分镜稿已保存 🎨');
  }
  /* ---------- 审核用成片截图 ---------- */
  async attachReviewImg(shotId, file) {
    const blob = await compressImage(file, 1280);
    const key = await this.putImage(blob);
    if (!key) { this._notify('截图保存失败（存储空间不足）', 'warn'); return null; }
    const old = this._findShot(shotId)?.reviewImg;
    this.updateShot(shotId, { reviewImg: key });
    if (old && old !== key) this.deleteImage(old);
    return key;
  }
  async getReviewImgData(shotId) {
    const p = this.active; if (!p) return null;
    const s = p.shots.find(x => x.id === shotId);
    if (!s?.reviewImg) return null;
    const blob = await this.getImage(s.reviewImg);
    if (!blob) return null;
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  }
  async deleteSketch(shotId) {
    const p = this.active; if (!p) return;
    const s = p.shots.find(x => x.id === shotId);
    if (s?.sketch) await this.deleteImage(s.sketch);
    this.updateShot(shotId, { sketch: null });
  }
}

/* ---------- 图片压缩（控制体积） ---------- */
function compressImage(file, maxSide) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => {
        URL.revokeObjectURL(url);
        resolve(b || file);
      }, 'image/jpeg', 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
export { Store, newShot, newProject, uid, clampN as clamp, todayStr };
