/* ============================================================
 * AI 智能导演台 · 逻辑层
 *   提示词/剧本 → 去噪 → 拆镜 → 配运镜景别 → 自动搭景 → 故事板
 *   资产图 → 视觉识别 → 带空间关系/角度/动作的故事板
 *   自定义生图接口 → 逐格出图回填
 * 纯前端，密钥只发给你自己填的接口。
 * ============================================================ */
import { callAI, localBreakdown, aiBreakdown, sizeByKey, moveByKey, angleByKey } from './breakdown.js';
import { planProject } from './auto-build.js';
import { mnToShotScene } from './builder.js';

/* 自己实现，别 import mn-grid.js —— mn-grid 的宫格弹窗会反向动态载入本模块，
   静态互相 import 会出现循环依赖导致 undefined。 */
function dataURLToBlob(u) {
  const [head, b64] = String(u).split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function blobToDataURL(blob) {
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });
}

/* ---------------- 一、去噪 ----------------
 * 视频提示词里塞了大量「不是画面」的东西：风格锁、负向词、音轨说明、
 * 平台水印要求、分辨率、导出参数……这些是全局设定，不该混进每一镜。
 * 剥出来只留一份，剩下的才是「AI 要拍的动作」。 */
const NOISE_RULES = [
  { key: 'negative', re: /(?:负向|不要|禁止|避免|negative\s*prompt|no\s+)[:：]?\s*([^\n；;]{2,120})/gi },
  { key: 'style', re: /(?:风格|画风|质感|色调|style|cinematic|电影感|胶片|赛博|写实|动漫|国风)[:：]?\s*([^\n；;]{2,80})/gi },
  { key: 'audio', re: /(?:音效|BGM|配乐|旁白音量|audio|sound\s*design|音乐)[:：]?\s*([^\n；;]{2,80})/gi },
  { key: 'technical', re: /(?:4K|8K|1080P|60fps|24fps|16:9|9:16|分辨率|无字幕|不要字幕|不要水印|水印|导出|码率|帧率)[^\n；;]{0,60}/gi },
];
const GLOBAL_HINTS = /(全局|整体|统一|全片|所有镜头|每一镜都|风格锁|设定集|人物设定|世界观|角色表|@图|资产表|Time\s*code|时间码分镜|⑩|⑪|⑫|镜头表|逐拍)/i;

export function denoise(text) {
  const raw = String(text || '');
  const out = { style: '', negative: '', audio: '', technical: [], removed: [], clean: raw };
  const lines = raw.split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { kept.push(line); continue; }
    /* 整行是全局设定段 → 只归档不进镜头 */
    if (GLOBAL_HINTS.test(t) && !/\[\d+(\.\d+)?\s*[-–~—]\s*\d+/.test(t)) {
      if (/负向|不要|禁止|避免/.test(t)) out.negative += (out.negative ? '；' : '') + t;
      else if (/风格|画风|质感|色调/.test(t)) out.style += (out.style ? '；' : '') + t;
      else if (/音效|BGM|配乐|音乐/.test(t)) out.audio += (out.audio ? '；' : '') + t;
      else out.style += (out.style ? '；' : '') + t;
      out.removed.push(t.length > 60 ? t.slice(0, 60) + '…' : t);
      continue;
    }
    kept.push(line);
  }
  let clean = kept.join('\n');
  NOISE_RULES.forEach(r => {
    clean = clean.replace(r.re, (m, g1) => {
      /* 没有捕获组的规则里，g1 会是「匹配位置」这个数字，不能当字符串用 */
      const v = (typeof g1 === 'string' ? g1 : m).trim();
      if (r.key === 'negative') out.negative += (out.negative ? '；' : '') + v;
      else if (r.key === 'style') out.style += (out.style ? '；' : '') + v;
      else if (r.key === 'audio') out.audio += (out.audio ? '；' : '') + v;
      else out.technical.push(v);
      out.removed.push(m.trim().length > 60 ? m.trim().slice(0, 60) + '…' : m.trim());
      return ' ';
    });
  });
  out.clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  out.removed = out.removed.slice(0, 30);
  return out;
}

/* ---------------- 二、规划（本地 / AI） ---------------- */
const SIZE_KEYS = ['ELS', 'LS', 'MS', 'MCU', 'CU', 'ECU'];
const MOVE_KEYS = Object.keys(moveByKey);
const ANGLE_KEYS = Object.keys(angleByKey);
const pick = (v, table, fallback) => (v && table[String(v)]) ? String(v) : fallback;

/* 按剧情节奏给镜头分「节拍 / 场次」，宫格按节拍数走，同节拍尽量排同一页 */
export function beatsOf(shots) {
  const beats = [];
  let cur = null;
  shots.forEach((s, i) => {
    const k = String(s.sceneKey || '').trim();
    if (!cur || (k && k !== cur.sceneKey)) {
      cur = { sceneKey: k || ('段落 ' + (beats.length + 1)), name: k || ('段落 ' + (beats.length + 1)), from: i, count: 0 };
      beats.push(cur);
    }
    cur.count++;
  });
  /* 完全没场次时，按叙事五拍切：开场 / 铺垫 / 推进 / 转折 / 收束 */
  if (beats.length <= 1 && shots.length >= 4) {
    const names = ['开场定场', '人物入画', '事情发生', '冲突转折', '收束'];
    const seg = Math.ceil(shots.length / 5);
    beats.length = 0;
    shots.forEach((s, i) => {
      const b = Math.min(4, Math.floor(i / seg));
      if (!beats[b]) beats[b] = { sceneKey: 'B' + (b + 1), name: names[b], from: i, count: 0 };
      beats[b].count++;
      s.sceneKey = 'B' + (b + 1);
    });
  }
  return beats;
}

const SIZE_HINTS = [
  [/特写|大特写|眼睛|手指|细节|ECU|close-?up/i, 'ECU'],
  [/近景|脸部|表情|肩以上|CU\b/i, 'CU'],
  [/中近景|胸以上|MCU/i, 'MCU'],
  [/中景|半身|膝以上|MS\b/i, 'MS'],
  [/全景|远景|定场|环境|空镜|建立镜头|wide|establish/i, 'LS'],
  [/大远景|航拍|鸟瞰全景|极远/i, 'ELS'],
];
const MOVE_HINTS = [
  [/急推|猛推|冲击|crash/i, 'crashIn'], [/环绕|绕拍|orbit/i, 'orbitLeft'],
  [/跟拍|跟随|跟着|follow|track/i, 'trackSide'], [/横移|平移|truck|横摇/i, 'truckLeft'],
  [/拉远|后退|pull\s*back/i, 'slowPull'], [/推近|缓推|推进|push\s*in/i, 'slowPush'],
  [/升降|升起|crane/i, 'craneUp'], [/俯冲|下降|dive/i, 'craneDown'],
  [/手持|晃动|handheld/i, 'handheld'], [/甩镜|快摇|whip/i, 'whip'],
];
const ANGLE_HINTS = [
  [/鸟瞰|俯视全|top\s*down/i, 'bird'], [/俯拍|俯视|高机位|high\s*angle/i, 'high'],
  [/仰拍|仰视|低机位|low\s*angle/i, 'low'], [/过肩|越肩|ots/i, 'ots'],
  [/斜角|倾斜|dutch/i, 'dutch'],
];
function hint(re, t, fallback) { for (const [r, v] of re) if (r.test(t)) return v; return fallback; }

/* 空间关系 / 动作 / 机位说明：故事板要「看得懂」，光有一句画面描述不够 */
function enrichShot(s, i, total, assets) {
  const text = [s.desc, s.dialogue, s.note].filter(Boolean).join(' ');
  const size = s.shotSize || hint(SIZE_HINTS, text, i === 0 ? 'LS' : i === total - 1 ? 'MCU' : 'MS');
  const move = s.cameraMove || hint(MOVE_HINTS, text, MOVE_KEYS[i % Math.max(1, Math.min(6, MOVE_KEYS.length))] || 'static');
  const angle = s.angle || hint(ANGLE_HINTS, text, 'eye');
  const sizeCn = (sizeByKey[size] || {}).name || size;
  const angleCn = (angleByKey[angle] || {}).name || '平视';
  const moveCn = (moveByKey[move] || {}).name || '固定镜头';

  const who = assets.length ? assets.filter(a => a.type === '人物' || a.type === '角色').map(a => a.name).slice(0, 3) : [];
  const leftRight = /左|左侧|画面左/.test(text) ? '主体偏画面左侧' : /右|右侧|画面右/.test(text) ? '主体偏画面右侧' : '主体居中';
  const depth = /前景|近处/.test(text) ? '前景有人物/物件压画面' : /背景|远处/.test(text) ? '后景留出纵深' : '人物与背景分层';
  const relation = /对话|对视|面对面|两人|三人/.test(text) ? '双人关系镜头，注意轴线不越轴' :
    /独自|一个人|独处/.test(text) ? '单人画面，留白表现孤独' : '主体与环境保持前后层次';
  return {
    ...s,
    shotSize: size, cameraMove: move, angle,
    sizeCn, angleCn, moveCn,
    duration: Math.max(1, Math.min(15, +s.duration || 3)),
    space: s.space || [leftRight, depth, relation].join(' · '),
    action: s.action || (s.desc || '').replace(/[，,。；;].*$/, '').slice(0, 28) || '静止，情绪沉淀',
    angleNote: s.angleNote || `${sizeCn} / ${angleCn} / ${moveCn}`,
    sceneKey: s.sceneKey || '',
    cast: s.cast || who,
  };
}

function parseJSON(raw) {
  let t = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch (e) {
    try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[\u201c\u201d]/g, '"')); }
    catch (e2) { throw new Error('AI 回的不是 JSON：' + t.slice(0, 80)); }
  }
}

const PLAN_SYS = `你是电影分镜导演。把用户给的剧本/视频提示词拆成可以直接开拍的镜头表。
只输出 JSON，不要解释，不要 markdown 代码块。格式：
{
 "title": "片名",
 "style": "全片统一视觉风格一句话",
 "negative": "全片统一负向词一句话",
 "beats": [{"name":"节拍名","sceneKey":"S1"}],
 "shots": [
  {"desc":"谁在哪里做什么（一句具体画面，20-45字）","dialogue":"台词，可空",
   "duration":3.5,"shotSize":"ELS|LS|MS|MCU|CU|ECU","angle":"eye|low|high|bird|ots|dutch",
   "cameraMove":"static|slowPush|slowPull|truckLeft|trackSide|orbitLeft|craneUp|handheld|whip",
   "sceneKey":"S1","space":"画面内空间关系：谁在左谁在右、前后层次、朝向、和背景的关系（30字内）",
   "action":"这一镜里人物具体动作与情绪（20字内）","angleNote":"景别/角度/机位方位/运镜，写给人看的（20字内）",
   "prompt":"给AI生图用的英文或中文画面提示词，含景别与光线（40字内）"}
 ],
 "grid": "1x2|2x2|3x2|3x3|4x4|auto"
}
规则：
1. 去掉全部「不是画面」的信息（风格锁、负向词、音轨、分辨率、水印要求、平台参数、设定集），只留能拍的动作。
2. 镜头数按剧情多少决定：一句话 2-4 镜，一段戏 5-9 镜，长剧本 10-16 镜；不要为了凑数灌水。
3. 每一镜都要有明确景别、角度、运镜；相邻镜不要连续同款运镜；开场用远景定场，冲突处给近景/特写。
4. 台词按时间归到对应镜，没台词就空字符串。时长 2-6 秒为主。
5. sceneKey 相同的镜属于同一节拍，宫格会尽量把它们排在同一页。
6. 只使用上面列出的合法枚举值，不要自造 key。`;

/** AI 规划；失败抛错，由 UI 决定是否回落本地 */
export async function planByAI(text, settings, opts = {}) {
  const d = denoise(text);
  const assetText = (opts.assets || []).length
    ? '\n【可用资产（画面里要保持长相/配色一致）】\n' + opts.assets.map(a => `- ${a.name}（${a.type}）：${a.look}`).join('\n')
    : '';
  const messages = [
    { role: 'system', content: PLAN_SYS },
    { role: 'user', content:
      `【已剥离的全局设定，不要重复塞进镜头】\n风格：${d.style || '无'}\n负向：${d.negative || '无'}\n音轨：${d.audio || '无'}` +
      assetText + `\n\n【要拍的内容】\n${d.clean || text}` +
      (opts.note ? `\n\n【导演额外要求】\n${opts.note}` : '') },
  ];
  const raw = await callAI(settings, messages, { temperature: 0.6, json: true });
  const o = parseJSON(raw);
  const shots = (Array.isArray(o.shots) ? o.shots : []).slice(0, 24).map((s, i, arr) => enrichShot({
    desc: String(s.desc || s.action || '').trim(),
    dialogue: String(s.dialogue || '').trim(),
    duration: +s.duration || 3,
    shotSize: pick(s.shotSize, sizeByKey, null),
    angle: pick(s.angle, angleByKey, null),
    cameraMove: pick(s.cameraMove, moveByKey, null),
    sceneKey: String(s.sceneKey || '').trim(),
    space: String(s.space || '').trim(),
    action: String(s.action || '').trim(),
    angleNote: String(s.angleNote || '').trim(),
    prompt: String(s.prompt || '').trim(),
    note: '',
  }, i, arr.length, opts.assets || []));
  if (!shots.length) throw new Error('AI 没拆出镜头，换段文字或改用本地拆镜');
  return {
    mode: 'ai', title: o.title || '未命名短片',
    style: d.style || o.style || '', negative: d.negative || o.negative || '',
    audio: d.audio || '', removed: d.removed, clean: d.clean,
    shots, beats: (Array.isArray(o.beats) && o.beats.length) ? o.beats : beatsOf(shots),
    grid: o.grid || null, assets: opts.assets || [],
  };
}

/** 不联网的本地规划：规则拆镜 + 关键词配运镜/景别 + 五拍分组 */
export function planByLocal(text, opts = {}) {
  const d = denoise(text);
  let shots = [];
  /* 有 H3 时间码提示词就走专用解析（本来就带去噪），否则用剧本规则拆 */
  try {
    if (window.SHOT_IMPORT && window.SHOT_IMPORT.parse) {
      const p = window.SHOT_IMPORT.parse(d.clean);
      if (p && p.shots && p.shots.length) shots = p.shots;
    }
  } catch (e) { /* 落到 localBreakdown */ }
  if (!shots.length) shots = localBreakdown(d.clean, {});
  shots = shots.slice(0, 24).map((s, i, arr) => enrichShot({
    desc: s.desc || s.action || '', dialogue: s.dialogue || '', duration: s.duration,
    shotSize: s.shotSize, angle: s.angle, cameraMove: s.cameraMove,
    sceneKey: s.sceneKey || '', prompt: '', note: s.note || '',
  }, i, arr.length, opts.assets || []));
  if (!shots.length) throw new Error('没拆出镜头，文字里至少写清楚「谁在哪做什么」');
  return {
    mode: 'local', title: '未命名短片',
    style: d.style, negative: d.negative, audio: d.audio,
    removed: d.removed, clean: d.clean,
    shots, beats: beatsOf(shots), grid: null, assets: opts.assets || [],
  };
}

/* ---------------- 三、按剧情自动决定宫格数 ---------------- */
export function decideGrid(shots, beats) {
  const n = shots.length;
  const groups = new Set(shots.map(s => String(s.sceneKey || '').trim() || '主线')).size;
  const k = (beats && beats.length) ? beats.length : groups;
  const m = Math.max(n, k);
  if (m <= 2) return '1x2';
  if (m <= 3) return '1x3';
  if (m <= 4) return '2x2';
  if (m <= 6) return '3x2';
  if (m <= 8) return '2x4';
  if (m <= 9) return '3x3';
  if (m <= 12) return '4x3';
  return '4x4';
}

/* ---------------- 四、资产图 ---------------- */
export function fileToDataURL(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('读图失败：' + file.name));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(fr.result);
      img.onload = () => {
        const r = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (r >= 1) return resolve(fr.result);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
        const c = cv.getContext('2d');
        c.drawImage(img, 0, 0, cv.width, cv.height);
        /* 主色：给本地兜底一个「这图大概什么色」的提示 */
        try {
          const d2 = c.getImageData(0, 0, cv.width, cv.height).data;
          let R = 0, G = 0, B = 0, cnt = 0;
          for (let i = 0; i < d2.length; i += 4 * 37) { R += d2[i]; G += d2[i + 1]; B += d2[i + 2]; cnt++; }
          file.__dominant = '#' + [R, G, B].map(v => Math.round(v / cnt).toString(16).padStart(2, '0')).join('');
        } catch (e) { }
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/** 本地兜底：没配视觉模型时，至少把文件名/主色变成资产卡 */
export function localAssets(items) {
  return items.map((it, i) => {
    const n = it.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const isScene = /场景|背景|环境|scene|bg|地点|室内|室外/i.test(n);
    const isProp = /道具|物品|产品|prop|物件|武器|服装/i.test(n);
    return {
      id: 'a' + i, name: n || ('资产 ' + (i + 1)),
      type: isScene ? '场景' : isProp ? '道具' : '角色',
      look: `参考图「${n}」的外观、配色${it.file.__dominant ? '（主色 ' + it.file.__dominant + '）' : ''}保持一致`,
      tags: [it.file.__dominant || '参考图'], dataURL: it.dataURL,
    };
  });
}

/** AI 视觉反推：一次把多张资产图发给支持图片的模型 */
export async function analyzeAssets(items, settings) {
  if (!items.length) return [];
  if (!settings.api || !settings.api.url || !settings.api.model) return localAssets(items);
  const sys = `你是影视美术资产管理员。看图识别每张资产图，只输出 JSON：
{"assets":[{"name":"简短中文名","type":"角色|场景|道具","look":"外观/服装/配色/材质，40字内，供生图保持一致","tags":["关键词"]}]}
assets 数组长度必须等于图片张数，顺序与图片一致。不要解释，不要 markdown。`;
  const content = [
    { type: 'text', text: `共 ${items.length} 张资产图，按上传顺序识别：${items.map((x, i) => `${i + 1}.${x.file.name}`).join('；')}` },
    ...items.map(it => ({ type: 'image_url', image_url: { url: it.dataURL } })),
  ];
  try {
    const raw = await callAI(settings, [{ role: 'system', content: sys }, { role: 'user', content }], { temperature: 0.3, json: true });
    const o = parseJSON(raw);
    const arr = Array.isArray(o.assets) ? o.assets : [];
    return items.map((it, i) => {
      const a = arr[i] || {};
      const n = it.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      return {
        id: 'a' + i, name: String(a.name || n || ('资产 ' + (i + 1))).slice(0, 20),
        type: ['角色', '场景', '道具'].includes(a.type) ? a.type : '角色',
        look: String(a.look || '按参考图外观保持一致').slice(0, 90),
        tags: Array.isArray(a.tags) ? a.tags.slice(0, 6) : [], dataURL: it.dataURL,
      };
    });
  } catch (e) {
    const fallback = localAssets(items);
    fallback.__warning = '视觉模型没认出来，已按文件名兜底：' + e.message;
    return fallback;
  }
}

/* ---------------- 五、落地到分镜板 ---------------- */
/** 写镜头 → 可选自动搭景。返回可展示的结果摘要 */
export function applyPlan(store, plan, opts = {}) {
  const p = store.active;
  if (!p) throw new Error('先到项目台打开一个项目');
  const replace = !!opts.replace;
  const shots = plan.shots.map(s => ({
    desc: s.desc, dialogue: s.dialogue, duration: s.duration,
    shotSize: s.shotSize, angle: s.angle, cameraMove: s.cameraMove,
    sceneKey: s.sceneKey, note: s.angleNote || '',
    prompt: s.prompt || imagePromptFor(s, plan),
    space: s.space, action: s.action, angleNote: s.angleNote,
    cast: s.cast || [], title: '',
  }));
  store.boardUndo && store.boardUndo('AI 导演台生成 ' + shots.length + ' 镜', '🤖');
  const n = store.importShots(shots, { replace });
  const proj = store.active;
  if (plan.style || plan.negative) {
    store.updateProject(proj.id, {
      brief: [plan.style && ('风格：' + plan.style), plan.negative && ('负向：' + plan.negative)].filter(Boolean).join('\n'),
    });
  }
  let built = 0;
  if (opts.buildScenes) {
    try {
      const offset = Math.max(0, proj.shots.length - n);
      const targets = proj.shots.map((_, i) => i).slice(offset);
      const plans = planProject(proj.shots, targets, { aspect: proj.aspect });
      const patches = [];
      for (const pl of plans) {
        try {
          const white = mnToShotScene(pl.plan.mnState);
          white.cam = pl.plan.whiteCam;
          patches.push({ id: pl.shot.id, patch: {
            scene: white, mnState: pl.plan.mnState, autoBuiltAt: Date.now(),
            cameraMove: 'free',
            space: shots[pl.index - offset] ? shots[pl.index - offset].space : '',
            action: shots[pl.index - offset] ? shots[pl.index - offset].action : '',
            angleNote: shots[pl.index - offset] ? shots[pl.index - offset].angleNote : '',
          } });
        } catch (e) { /* 单镜搭失败不影响其它 */ }
      }
      built = store.updateShots(patches);
    } catch (e) { console.warn('自动搭景失败', e); }
  } else {
    /* 不搭景也要把「空间关系/动作」写回每一镜，宫格字幕带才读得到 */
    const fresh = store.active.shots.slice(-n);
    store.updateShots(fresh.map((s, i) => ({ id: s.id, patch: {
      space: shots[i] ? shots[i].space : '', action: shots[i] ? shots[i].action : '',
      angleNote: shots[i] ? shots[i].angleNote : '',
    } })));
  }
  return { n, built, removed: plan.removed.length, beats: plan.beats.length };
}

/* ---------------- 六、生图提示词 / 自定义生图接口 ---------------- */
export function imagePromptFor(shot, plan = {}) {
  const L = [];
  L.push(shot.desc || '画面主体');
  if (shot.action) L.push('动作：' + shot.action);
  if (shot.space) L.push('空间关系：' + shot.space);
  L.push('镜头：' + (shot.angleNote || [shot.sizeCn, shot.angleCn, shot.moveCn].filter(Boolean).join(' / ')));
  if (shot.dialogue) L.push('台词氛围：' + shot.dialogue);
  if (plan.style) L.push('统一风格：' + plan.style);
  if (plan.assets && plan.assets.length) L.push('资产一致性：' + plan.assets.map(a => `${a.name}（${a.look}）`).join('；'));
  if (plan.negative) L.push('负向：' + plan.negative);
  return L.join('\n');
}

/** 生图：两种模式
 *   openai → POST {base}/images/generations（OpenAI 兼容，需密钥或免费额度）
 *   url    → GET  URL 模板，{prompt} 占位，直接回图片（Pollinations 这类免费无密钥接口）
 *  返回本地 dataURL，避免外链污染 canvas 导致宫格导不出来。 */
export async function callImageAPI(api, prompt, opt = {}) {
  if (!api || !api.url) throw new Error('未配置生图接口（设置 → 生图接口）');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const size = opt.size || api.size || '1024x1024';
    const [sw, sh] = String(size).split(/[x×]/).map(v => parseInt(v, 10) || 1024);

    if (api.mode === 'url') {
      const url = String(api.url)
        .replace(/\{prompt\}/g, encodeURIComponent(prompt))
        .replace(/\{size\}/g, encodeURIComponent(size))
        .replace(/\{w\}/g, sw).replace(/\{h\}/g, sh);
      let res;
      try { res = await fetch(url, { signal: ctrl.signal }); }
      catch (e) {
        /* 有些图片站不给 fetch 跨域但允许 <img> 加载，再试一次 */
        const ok = await new Promise(r => {
          const im = new Image(); im.crossOrigin = 'anonymous';
          im.onload = () => {
            try {
              const cv = document.createElement('canvas');
              cv.width = im.naturalWidth; cv.height = im.naturalHeight;
              cv.getContext('2d').drawImage(im, 0, 0);
              r(cv.toDataURL('image/png'));
            } catch (err) { r(null); }
          };
          im.onerror = () => r(null); im.src = url;
        });
        if (ok) return ok;
        throw new Error('取图失败（跨域被拦）：' + e.message);
      }
      if (!res.ok) throw new Error(`取图 ${res.status}：${(await res.text().catch(() => '')).slice(0, 120)}`);
      return await blobToDataURL(await res.blob());
    }

    if (!api.model) throw new Error('未填生图模型名（设置 → 生图接口）');
    const headers = { 'Content-Type': 'application/json' };
    if (api.key) headers['Authorization'] = 'Bearer ' + api.key;
    const body = { model: api.model, prompt, n: 1, size };
    /* 部分接口不认 response_format 字段，设成「不传」即可 */
    if (api.responseFormat) body.response_format = api.responseFormat;
    if (api.extra) { try { Object.assign(body, JSON.parse(api.extra)); } catch (e) { } }
    const res = await fetch(api.url.replace(/\/+$/, '') + '/images/generations', {
      method: 'POST', headers, signal: ctrl.signal, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`生图接口 ${res.status}：${t.slice(0, 140)}`);
    }
    const d = await res.json();
    const it = ((d && (d.data || d.images)) || [])[0] || d || {};
    if (it.b64_json) return 'data:image/png;base64,' + it.b64_json;
    if (it.url) return await blobToDataURL(await (await fetch(it.url)).blob());
    throw new Error('生图接口没返回图片（要 b64_json 或 url）');
  } finally { clearTimeout(timer); }
}

/** 生图接口连通测试：真的画一张小图，确认模型名/尺寸/返回格式都对 */
export async function testImageAPI(api) {
  const u = await callImageAPI(api, 'a single red apple on a white table, simple storyboard sketch', { size: '512x512' });
  if (!/^data:image\//.test(u)) throw new Error('返回的不是图片');
  return '连通正常，已成功生成一张测试图';
}

/** 逐格生图并回填到 sketch 槽（宫格会优先使用），并发 2 防止把接口打爆 */
export async function generateCellImages(store, shots, api, plan, onProgress = null, signal = null, promptFn = null, attach = null) {
  let done = 0, failed = 0;
  const queue = shots.map((s, i) => ({ s, i }));
  const worker = async () => {
    while (queue.length) {
      if (signal && signal.aborted) return;
      const { s, i } = queue.shift();
      try {
        const prompt = promptFn ? promptFn(s, i) : imagePromptFor(s, plan);
        const url = await callImageAPI(api, prompt);
        if (attach) await attach(s, i, url);
        else await store.attachSketch(s.id, dataURLToBlob(url));
        done++;
      } catch (e) { failed++; console.warn('第 ' + (i + 1) + ' 格生图失败', e); }
      if (onProgress) onProgress({ done, failed, total: shots.length, index: i });
    }
  };
  await Promise.all([worker(), worker()]);
  return { done, failed };
}

export { parseJSON, SIZE_KEYS, MOVE_KEYS, ANGLE_KEYS };
