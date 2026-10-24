/* ============================================================
 * 白日梦导演台 · 状态仓库
 * localStorage：设置 / 项目 / 成就
 * IndexedDB  ：镜头参考图（避免撑爆 localStorage）
 * ============================================================ */
import { LEVELS, BADGES } from './data.js';

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
  theme: 'porcelain',  // 白瓷浅色（对齐原版导演台观感）
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
    const s = newShot(partial);
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
    if (n >= 36) this.unlock('dictMaster');
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
