/* ============================================================
 * 白日梦导演台 · 剧本拆分镜引擎
 * 通道一：本地规则拆分（无需联网）
 *   - 识别场次标题（第X场 / 场景： / 内/外·日/夜）
 *   - 识别台词行（「…」 "…" （…） 引号包裹）
 *   - 叙事段 → 镜头，按字数估时长
 *   - 轮换分配运镜建议，关键词推断景别
 * 通道二：AI 拆分（用户自配 OpenAI 兼容接口）
 * ============================================================ */
import { CAMERA_MOVES, SHOT_SIZES, ANGLES } from './data.js';

const moveByKey = Object.fromEntries(CAMERA_MOVES.map(m => [m.key, m]));
const sizeByKey = Object.fromEntries(SHOT_SIZES.map(s => [s.key, s]));
const angleByKey = Object.fromEntries(ANGLES.map(a => [a.key, a]));

/* 拆分镜轮换运镜表：按叙事节奏排布，避免连续同款 */
const MOVE_ROTATION = ['static', 'slowPush', 'truckRight', 'trackSide', 'panLeft', 'craneUp', 'slowPull', 'orbitRight', 'trackFront', 'tiltUp', 'handheld', 'revealTrack', 'truckLeft', 'arcIn', 'panRight', 'craneDown'];

/* 关键词 → 景别 */
const SIZE_HINTS = [
  [/\b(特写|眼神|瞳孔|嘴唇|手部|手指|细节|戒指|眼泪)\b/, 'ECU'],
  [/\b(面部|表情|脸|抬头|低头)\b/, 'CU'],
  [/\b(对话|对视|转身|坐下|起身|拥抱)\b/, 'MCU'],
  [/\b(走|跑|打斗|动作|追逐|舞)\b/, 'MS'],
  [/\b(全景|房间|街道|众人|人群|入场)\b/, 'LS'],
  [/\b(远景|天空|城市|山|海|大场面|俯瞰|全城)\b/, 'ELS'],
];
/* 关键词 → 角度 */
const ANGLE_HINTS = [
  [/\b(仰望|高大|威严|巨人| towering|仰视)\b/, 'low'],
  [/\b(俯瞰|渺小|俯视|上帝视角)\b/, 'high'],
  [/\b(航拍|无人机|鸟瞰)\b/, 'bird'],
  [/\b(不安|慌乱|眩晕|倾斜)\b/, 'dutch'],
];

function pickSize(text) {
  for (const [re, key] of SIZE_HINTS) if (re.test(text)) return key;
  return 'MS';
}
function pickAngle(text) {
  for (const [re, key] of ANGLE_HINTS) if (re.test(text)) return key;
  return 'eye';
}
function pickMove(i, dialogue) {
  if (dialogue) return i % 2 === 0 ? 'slowPush' : 'static';
  return MOVE_ROTATION[i % MOVE_ROTATION.length];
}
function estDuration(text, dialogue) {
  const n = (text || '').replace(/\s/g, '').length;
  const base = dialogue ? Math.max(2, dialogue.replace(/\s/g, '').length / 4.2) : 0;
  return Math.round(Math.min(12, Math.max(2, 1.5 + n / 9 + base)) * 10) / 10;
}

/* 台词提取：「」“”『』（）里的内容 */
function extractDialogue(line) {
  const m = line.match(/[「『]([^」』]{2,})[」』]|"([^"]{2,})"|（([^）]{2,})）|\(([^)]{2,})\)/);
  if (m) return (m[1] || m[2] || m[3] || m[4] || '').trim();
  return null;
}
/* 场次标题识别 */
const SCENE_HEAD_RE = /^\s*(第[一二三四五六七八九十百\d]+[场幕]|【[^】]+】|#[^#]+#|场景[:：]|INT\.|EXT\.)/i;

/* ---------------- 本地规则拆分 ---------------- */
function localBreakdown(script, opts = {}) {
  const lines = (script || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const shots = [];
  let moveIdx = 0, sceneLabel = '';

  const pushShot = (partial) => {
    const move = moveByKey[pickMove(moveIdx, partial.dialogue)] ? pickMove(moveIdx, partial.dialogue) : 'static';
    moveIdx++;
    shots.push({
      title: sceneLabel ? `${sceneLabel}·${shots.length + 1}` : '',
      sceneKey: sceneLabel || '',
      desc: partial.desc,
      dialogue: partial.dialogue || '',
      duration: partial.duration || estDuration(partial.desc, partial.dialogue),
      cameraMove: move,
      shotSize: pickSize(partial.desc + (partial.dialogue || '')),
      angle: pickAngle(partial.desc),
      transition: 'cut',
      note: partial.note || '',
    });
  };

  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const desc = buf.join('；');
    pushShot({ desc });
    buf = [];
  };

  for (const line of lines) {
    if (SCENE_HEAD_RE.test(line)) {          // 场次标题行
      flush();
      sceneLabel = line.replace(/[【】#]/g, '').slice(0, 12);
      continue;
    }
    if (line.length <= 2 && !/[，。！？…]/.test(line)) continue; // 无意义短行
    const dlg = extractDialogue(line);
    if (dlg && line.replace(/[「」『』""（）()]/g, '').replace(dlg, '').trim().length < 14) {
      // 整行基本就是台词 → 台词镜头
      flush();
      pushShot({ desc: `人物说：「${dlg}」${/哭|怒|笑|冷冷|颤/.test(line) ? '（情绪特写）' : '（正反打）'}`, dialogue: dlg });
    } else if (dlg) {
      // 叙述 + 台词混合行
      const narr = line.replace(/[「」『』]/g, '').trim();
      pushShot({ desc: narr, dialogue: dlg });
    } else if (/[。！？；\n]/.test(line) && line.length > 26) {
      // 长叙述行：按句号切两个镜头
      const sens = line.split(/(?<=[。！？])/).filter(s => s.trim().length > 1);
      if (sens.length >= 2 && !opts.noSplitLong) {
        const mid = Math.ceil(sens.length / 2);
        pushShot({ desc: sens.slice(0, mid).join('') });
        pushShot({ desc: sens.slice(mid).join('') });
      } else pushShot({ desc: line });
    } else {
      buf.push(line.replace(/[。；]$/, ''));
      if (buf.join('').length > 34) flush();
    }
  }
  flush();

  // 首尾镜头美化：第一个用大远景交代，最后一个缓拉收尾
  if (shots.length >= 3) {
    shots[0].shotSize = 'LS';
    shots[0].cameraMove = shots[0].dialogue ? shots[0].cameraMove : 'panRight';
    const last = shots[shots.length - 1];
    if (!last.dialogue) { last.cameraMove = 'slowPull'; last.shotSize = 'LS'; }
  }
  return shots;
}

/* ---------------- 提示词组装 ---------------- */
function buildPrompt(shot, tplText) {
  const move = moveByKey[shot.cameraMove] || moveByKey.static;
  const size = sizeByKey[shot.shotSize] || sizeByKey.MS;
  const angle = angleByKey[shot.angle] || angleByKey.eye;
  return (tplText || '{desc}')
    .replace(/\{desc\}/g, shot.desc || '未描述的画面')
    .replace(/\{move\}/g, move.prompt)
    .replace(/\{size\}/g, size.prompt)
    .replace(/\{angle\}/g, angle.prompt)
    .replace(/\{dialogue\}/g, shot.dialogue || '');
}

/* ---------------- AI 拆分 / 增强 ---------------- */
const AI_BREAKDOWN_SYS = `你是一位专业影视分镜师。把用户剧本拆解为分镜数组，严格输出 JSON：
[{"desc":"画面描述（谁在哪做什么，具体可视）","dialogue":"台词（无则空串）","duration":数字秒,"cameraMove":"运镜key","shotSize":"景别key","angle":"角度key"}]
运镜key只能取: ${CAMERA_MOVES.map(m => m.key).join(',')}
景别key只能取: ${SHOT_SIZES.map(s => s.key).join(',')}
角度key只能取: ${ANGLES.map(a => a.key).join(',')}
规则：每镜2-12秒；对话用正反打；每3-5镜变化一次景别；只输出JSON数组，不要任何解释。`;

const AI_ENHANCE_SYS = `你是AI视频提示词专家。把用户的画面描述改写为高质量AI视频提示词，结构：场景：…；主体：…；镜头：…（含景别与运镜）；光线：…；风格：…。只输出改写结果一行，不要解释。`;

async function callAI(settings, messages, { temperature = 0.7, json = false } = {}) {
  const api = settings.api;
  if (!api || !api.url || !api.model) throw new Error('未配置 AI 接口（设置 → AI 接口）');
  const headers = { 'Content-Type': 'application/json' };
  if (api.key) headers['Authorization'] = 'Bearer ' + api.key;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(api.url.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({
        model: api.model, messages, temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`接口返回 ${res.status}：${t.slice(0, 120)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(timer); }
}

async function aiBreakdown(script, settings, refsText = '') {
  const NL = String.fromCharCode(10);
  const raw = await callAI(settings, [
    { role: 'system', content: AI_BREAKDOWN_SYS + (refsText ? NL + NL + '必须遵守以下参考资料中的规范：' + NL + refsText.slice(0, 6000) : '') },
    { role: 'user', content: '剧本：' + NL + script.slice(0, 8000) },
  ], { temperature: 0.4 });
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('AI 返回的内容不是分镜 JSON，请重试或换用本地拆分');
  let arr;
  try { arr = JSON.parse(m[0]); } catch { throw new Error('分镜 JSON 解析失败，请重试'); }
  const validMoves = new Set(CAMERA_MOVES.map(x => x.key));
  const validSizes = new Set(SHOT_SIZES.map(x => x.key));
  const validAngles = new Set(ANGLES.map(x => x.key));
  return arr.filter(s => s && s.desc).slice(0, 200).map(s => ({
    desc: String(s.desc).slice(0, 300),
    dialogue: String(s.dialogue || '').slice(0, 200),
    duration: Math.min(15, Math.max(1.5, +s.duration || 3)),
    cameraMove: validMoves.has(s.cameraMove) ? s.cameraMove : 'static',
    shotSize: validSizes.has(s.shotSize) ? s.shotSize : 'MS',
    angle: validAngles.has(s.angle) ? s.angle : 'eye',
    transition: 'cut',
    note: '',
  }));
}

async function aiEnhancePrompt(desc, settings) {
  const out = await callAI(settings, [
    { role: 'system', content: AI_ENHANCE_SYS },
    { role: 'user', content: desc.slice(0, 1500) },
  ], { temperature: 0.8 });
  return out.trim();
}

/* AI 拉片审核：传入成片截图（dataURL），按资料文档标准打分 */
async function aiReview(shot, imageDataURL, refsText, settings) {
  const NL = String.fromCharCode(10);
  const sys = '你是严格的影视拉片审核员。根据审核标准对这张画面打分并给出具体问题。' +
    '严格输出 JSON：{"score":1到5的整数,"issues":["具体问题1","问题2"],"suggestion":"一句话修改建议"}，不要任何其他文字。' +
    (refsText ? NL + NL + '审核标准（必须依据）：' + NL + refsText.slice(0, 6000) : NL + '无附加标准时按构图/运镜/光线/表演/信息量五维度常识审核。');
  const user = {
    role: 'user',
    content: [
      { type: 'text', text: '镜头画面描述：' + (shot.desc || '无') + NL +
        '运镜：' + (shot.cameraMove || '') + '　景别：' + (shot.shotSize || '') + '　角度：' + (shot.angle || '') + NL +
        '所用提示词：' + (shot.prompt || '无') + NL + NL + '请审核这张成片画面：' },
      { type: 'image_url', image_url: { url: imageDataURL } },
    ],
  };
  const raw = await callAI(settings, [
    { role: 'system', content: sys },
    user,
  ], { temperature: 0.3, json: true });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI 返回内容无法解析');
  const j = JSON.parse(m[0]);
  return { score: Math.min(5, Math.max(1, Math.round(+j.score || 3))), issues: (j.issues || []).slice(0, 6), suggestion: String(j.suggestion || '').slice(0, 300) };
}

/* 测试接口连通性 */
async function testAPI(api) {
  if (!api.url || !api.model) throw new Error('请先填写接口地址和模型名');
  const headers = { 'Content-Type': 'application/json' };
  if (api.key) headers['Authorization'] = 'Bearer ' + api.key;
  const res = await fetch(api.url.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({ model: api.model, messages: [{ role: 'user', content: '你好' }], max_tokens: 8 }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('HTTP 401：API Key 未提供或错误');
    throw new Error('HTTP ' + res.status);
  }
  return '连通正常';
}

export { localBreakdown, buildPrompt, aiBreakdown, aiEnhancePrompt, aiReview, testAPI, callAI, moveByKey, sizeByKey, angleByKey };
