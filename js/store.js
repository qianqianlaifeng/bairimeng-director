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
  catch (e) { console.warn('存储失败', e); return false; }
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

/* ============================================================
 * Store 单例
 * ============================================================ */
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
    this._initIDB();
  }

  /* ---------- 订阅 ---------- */
  subscribe(fn) { this.listeners.push(fn); }
  emit() { this.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
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
    // 清理该项目的参考图
    for (const s of this.projects[idx].shots) if (s.image) this.deleteImage(s.image);
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
    if (s?.image) this.deleteImage(s.image);
    p.shots = p.shots.filter(x => x.id !== shotId);
    p.updatedAt = Date.now();
    this.persistProjects(); this.emit();
  }
  duplicateShot(shotId) {
    const p = this.active; if (!p) return;
    const i = p.shots.findIndex(x => x.id === shotId);
    if (i < 0) return;
    const copy = newShot({ ...p.shots[i], id: undefined, title: '', image: p.shots[i].image });
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
    this.achv.lastCheckin = today;
    this.achv.streak = (this.achv.lastCheckin === yestStr() || this.achv.checkinHistory.includes(yestStr())) ? this.achv.streak + 1 : 1;
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
    if (data.app !== 'bairimeng-director') throw new Error('不是白日梦导演台的备份文件');
    if (data.projects) { this.projects = data.projects; this.persistProjects(); }
    if (data.settings) { this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings); this.persistSettings(); }
    if (data.achv) { this.achv = Object.assign(this.achv, data.achv); this.persistAchv(); }
    this.activeId = this.settings.lastProjectId;
    this.emit();
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

  /* ---------- 图片压缩入库 ---------- */
  async attachImage(shotId, file) {
    const blob = await compressImage(file, 1024);
    const key = await this.putImage(blob);
    if (!key) { this._notify('图片保存失败（浏览器不支持或空间不足）', 'warn'); return; }
    this.updateShot(shotId, { image: key });
    this._notify('参考图已挂到镜头上');
  }

  /* ---------- 手绘分镜稿 ---------- */
  async attachSketch(shotId, blob) {
    const key = await this.putImage(blob);
    if (!key) { this._notify('手绘稿保存失败（浏览器不支持或空间不足）', 'warn'); return; }
    this.updateShot(shotId, { sketch: key });
    this.addXP(2, '手绘分镜');
    this._notify('手绘分镜稿已保存 🎨');
  }
  /* ---------- 审核用成片截图 ---------- */
  async attachReviewImg(shotId, file) {
    const blob = await compressImage(file, 1280);
    const key = await this.putImage(blob);
    if (!key) { this._notify('截图保存失败（存储空间不足）', 'warn'); return null; }
    this.updateShot(shotId, { reviewImg: key });
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
