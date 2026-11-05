/* ================================================================
 * 白日梦导演台 · H3 / 时间码分镜提示词解析（v1.24.0）
 *
 * 为什么要有这个文件：同学（和创作者自己）手上的成品是「一条视频提示词」，
 * 长这样：① 画面规格 / ② 定场帧 / ③ 参考图与绑定 / … / ⑩ 时间码分镜（[0.0–2.0] E1 …）
 * / ⑪ 台词与口型 / ⑫ 镜头语言 / ⑬ 账本 / ⑭ 音频 / ⑮ 负面。
 * 以前的导入器只认表格与「每行一条」，于是 ①②③④⑤ 全被当成镜头，
 * 51 镜一律「中景·固定·3s」——预览不动、宫格没东西可拼，全线崩。
 *
 * 这里的口径：
 *   ① 只有「时间码分镜」里的 [a–b] 块才是镜头，别的一律不变成卡片；
 *   ② 每个块里能读出来的东西全部落到分镜字段上（时长/景别/角度/机位高/焦段/
 *      运镜/快慢/台词/出场人物/命中点），读不出来才留默认值；
 *   ③ 读不出的信息不是丢掉，而是按段落归档进 meta（风格锁/负面锁/光影/轴线/
 *      账本/音频/参考图绑定），导入后写进项目，随时能看、也能再喂给 AI；
 *   ④ 每一镜的原文整块留在 shot.prompt 里，拆得不准也不损失任何东西。
 *
 * 焦段→竖向视角：这台引擎的 fov 是竖向角，全画幅竖边按 24mm 算，
 * 所以 fov = 2·atan(12/mm)：35mm≈37.8°、50mm≈27.0°、100mm≈13.7°。
 * ================================================================ */
(function () {
  'use strict';

  const CN_NO = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉓㉔㉕';
  const SECTION_RE = new RegExp('^\\s*([' + CN_NO + '])\\s*([^\\n]{0,40})');
  /* [0.0–2.0] / [2.0-5.6] / （11.2–14.6） / 11.2~14.6 */
  const TC_RE = /^\s*[\[(（]?\s*(\d+(?:\.\d+)?)\s*(?:[–—~─]|至|到)\s*(\d+(?:\.\d+)?)\s*[\])）]?\s*[.、:：]?\s*(.*)$/;
  /* 只吃掉行首的时间码前缀（TC_RE 末尾带 (.*)$，整行都是它的匹配，直接拿去 replace 会把整块清空） */
  const TC_PREFIX = /^\s*[\[(（]?\s*\d+(?:\.\d+)?\s*(?:[–—~─]|至|到)\s*\d+(?:\.\d+)?\s*[\])）]?\s*[.、:：]?\s*/;
  const MM_RE = /(\d{2,4})\s*mm/i;
  const PROP_RE = /剑|刀|弓|锚|比例|图|卷轴|文书|符|鼎|印/;
  const PLACE_RE = /空间|场景|参考帧|全景图|地图|林|谷|街|房|院|道/;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lensToFov = mm => clamp(2 * Math.atan(12 / clamp(mm, 8, 300)) * 180 / Math.PI, 8, 100);

  /* ---------- 判定：这段文本是不是「时间码分镜」提示词 ---------- */
  function tcLines(text) {
    const out = [];
    String(text || '').split(/\r?\n/).forEach((l, i) => {
      const m = TC_RE.exec(l);
      if (!m) return;
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (isFinite(a) && isFinite(b) && b > a && (b - a) >= 0.3 && (b - a) <= 30) out.push({ i, a, b, rest: m[3] });
    });
    return out;
  }
  function looksLike(text) {
    const t = String(text || '');
    if (t.length < 40) return false;
    const n = tcLines(t).length;
    if (n < 2) return false;
    /* 表格 CSV 里也可能有「1.5-3.0」这种格子，所以还要求有分镜的样子：
       ⑩ 段标题 / mm 焦段 / 机位高度词 / 固定·跟移 之类的镜头语言 */
    return /时间码|分镜|逐拍|镜头表/.test(t)
      || /\d{2,4}\s*mm/i.test(t)
      || /齐[胸腰眼膝]高|低机位|高机位|微仰|仰拍|俯拍/.test(t);
  }

  /* ---------- 分段 ---------- */
  function sections(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = [];
    let cur = { no: '', title: '开头', body: [] };
    lines.forEach(l => {
      const m = SECTION_RE.exec(l);
      if (m && CN_NO.indexOf(m[1]) >= 0) {
        if (cur.body.join('\n').trim() || cur.no) out.push(cur);
        cur = { no: m[1], title: (m[2] || '').trim(), body: [] };
      } else cur.body.push(l);
    });
    if (cur.body.join('\n').trim() || cur.no) out.push(cur);
    out.forEach(s => { s.text = s.body.join('\n').trim(); });
    return out;
  }

  /* ---------- 单块解析 ---------- */
  const CAM_H = [
    [/齐眼高|与眼同高|eye\s*level/i, 1.6],
    [/齐胸高|胸部高/, 1.35],
    [/齐腰高|腰部高/, 1.1],
    [/齐膝|膝高/, 0.75],
    [/低机位|贴地|仰角低/, 0.9],
    [/高机位|俯角|越顶/, 2.4],
  ];
  const MOVE_RULES = [
    [/向后拉|后拉|拉\s*[\d.]+\s*秒|拉远|退开|镜头退/, 'slowPull'],
    [/横移|跟他|跟移|随他|抢进半步|跟两步|侧移|跟着走/, 'trackSide'],
    [/推近|前推|推进|镜头推|压上来/, 'slowPush'],
    [/环绕|绕半圈|绕拍/, 'orbitRight'],
    [/摇|转向/, 'panRight'],
    [/手持|微晃|呼吸感/, 'handheld'],
    [/升降|升起|降下/, 'craneUp'],
  ];
  function firstHit(rules, text) {
    for (const [re, v] of rules) if (re.test(text)) return v;
    return null;
  }
  /* 景别：先看取景对象（局部/同框），再看焦段 + 机位高度 ——
     这条规则是照 d06 那条 30 秒原文一条条对出来的（E1/E2 中景、E4/E5 近景、
     E6 特写只给交点、E7/E8 中近景、E9 拉到三层同框＝远景） */
  function sizeOf(spec, body, mm) {
    /* 「只给两把剑与交点／贴着交汇处」这种取景对象只能看镜头规格句：
       正文里出现「剑尖沉回中线」是动作，不是特写（E1 曾被这条误判成 CU） */
    if (/只给|交汇处|交点|贴着|局部|细节/.test(spec) && !/同框/.test(spec)) return mm >= 85 ? 'ECU' : 'CU';
    if (/三层同框|四层|同框.*(桃树|人)|全景|群像|收势|拉开.*(四|五)人/.test(spec + ' ' + body)) return 'LS';
    if (mm) {
      if (mm >= 95) return 'ECU';
      if (mm >= 70) return 'CU';
      if (mm >= 44) return /齐腰/.test(spec) ? 'MCU' : 'CU';
      if (mm >= 30) return /齐胸/.test(spec) ? 'MCU' : 'MS';
      return /齐胸/.test(spec) ? 'MS' : 'LS';
    }
    const t = String(spec || '') + ' ' + String(body || '');
    const cn = /大远景|极远景/.test(t) ? 'ELS' : /远景|全景/.test(t) ? 'LS' : /中近景/.test(t) ? 'MCU'
      : /中景/.test(t) ? 'MS' : /近景/.test(t) ? 'CU' : /特写|大特写/.test(t) ? 'ECU' : null;
    return cn;
  }
  function angleOf(spec, body) {
    const t = spec + ' ' + body;
    if (/过肩|肩后|越肩/.test(t)) return 'ots';
    if (/微仰|仰拍|仰角|朝上仰/.test(t) || /低机位/.test(t)) return 'low';
    if (/鸟瞰|航拍|上帝视角/.test(t)) return 'bird';
    if (/俯拍|俯角|从上往下|高机位/.test(t)) return 'high';
    if (/斜角|倾斜构图|dutch/i.test(t)) return 'dutch';
    return 'eye';
  }
  function moveOf(spec) {
    return firstHit(MOVE_RULES, spec || '') || 'static';
  }
  function speedOf(body) {
    const fast = (String(body).match(/快打|连击|抢攻|疾/g) || []).length;
    if (fast >= 2) return 'fast';
    if (/慢|缓缓|半拍才|迟疑/.test(body)) return 'slow';
    return 'std';
  }
  /* 台词：块内「…」＋ ⑪ 段里带时间范围的行（按中点归到对应镜）
     正文里的「」常常不是台词（「青云—倒下的四人—桃树」三层同框这种是列举），
     所以要求它要么带句末语气标点，要么前面就是「说/喊/嘴大张」这类说话动词。 */
  const SAY_RE = /(说|喊|叫道|吼|答|念|低语|耳语|嘴大张|压低嗓子|台词)[^」』\n]{0,8}$/;
  function quotes(text, force) {
    const out = [];
    const clean = String(text || '').replace(/【[^】]*】/g, '');
    const re = /(.{0,10})[「『]([^」』\n]{1,80})[」』]/g;
    let m;
    while ((m = re.exec(clean))) {
      const s = m[2].trim();
      if (!s || /^(这里填|待写)/.test(s)) continue;
      if (!force && !/[！？…。！?]$/.test(s) && !/[！？]/.test(s) && !SAY_RE.test(m[1])) continue;
      if (out.indexOf(s) < 0) out.push(s);
    }
    return out;
  }
  function beatsOf(text) {
    const out = [];
    const re = /@\s*(\d+(?:\.\d+)?)\s*([^｜@。\n]{0,26})/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const t = parseFloat(m[1]);
      if (!isFinite(t)) continue;
      const seg = String(m[2] || '').trim();
      out.push({ t, txt: seg.slice(0, 24) });
    }
    return out.slice(0, 14);
  }
  /* 没进 @图 绑定表的角色（弓手／随从／甲士…）也算出场人物，
     不然「放倒弓手」这一镜搭景时场上少一个人 */
  const ROLE_WORDS = ['弓手', '随从', '甲士', '弟子', '卫兵', '伙计', '店员', '少年', '女孩', '长老', '护士', '警察'];
  function castOf(text, cast) {
    const t = String(text || '');
    const hit = [];
    cast.forEach(name => {
      const alts = [name];
      if (name.length >= 3) alts.push(name.slice(-2));                 // 陆青云 → 青云
      const latin = /([A-Za-z])$/.exec(name);                            // 追兵A → A
      if (latin) alts.push(latin[1]);
      const ok = alts.some(a => a && (a.length > 1
        ? t.indexOf(a) >= 0
        : new RegExp('(^|[^A-Za-z0-9])' + a + '([^A-Za-z0-9]|$)').test(t)));
      if (ok) hit.push(name);
    });
    ROLE_WORDS.forEach(w => { if (t.indexOf(w) >= 0 && hit.indexOf(w) < 0) hit.push(w); });
    return hit;
  }
  function stripLocks(text) {
    return String(text || '')
      .replace(/【[^】]*】/g, '')
      .replace(/情绪目的\s*[＝=:：][^。\n]*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* ---------- 主解析 ---------- */
  function parse(text) {
    const raw = String(text || '').trim();
    const secs = sections(raw);
    const warnings = [];
    /* ③ 参考图绑定 → 人名表（顺序就是 @图 顺序，后面宫格/资产都靠它） */
    const refs = [];
    const cast = [];
    secs.concat([{ text: raw }]).forEach(s => {
      const re = /@\s*图\s*(\d+)\s*[＝=:：]\s*([^；;\n，]{1,20})/g;
      let m;
      while ((m = re.exec(s.text || ''))) {
        const n = +m[1], name = m[2].trim();
        if (!refs.some(r => r.n === n)) refs.push({ n, name });
      }
    });
    refs.forEach(r => {
      const kind = PROP_RE.test(r.name) ? 'prop' : PLACE_RE.test(r.name) ? 'place' : 'person';
      r.kind = kind;
      if (kind === 'person' && cast.indexOf(r.name) < 0) cast.push(r.name);
    });
    /* 「追兵共 4 人＝领头＋A＋B＋C」这类人数锁也认一下，但人名仍以绑定表为准 */

    /* 镜头来源：段标题带「时间码/分镜/逐拍」的那一段；没有就用含最多时间码行的段 */
    let src = secs.find(s => /时间码|分镜|逐拍|镜头表/.test(s.title)) || null;
    if (!src || tcLines(src.text).length < 2) {
      const alt = secs.map(s => ({ s, n: tcLines(s.text).length })).sort((a, b) => b.n - a.n)[0];
      if (alt && alt.n >= 2) src = alt.s;
    }
    if (!src || tcLines(src.text).length < 2) return { shots: [], meta: null, warnings: ['没找到 [a–b] 时间码分镜块'] };

    /* ⑪ 台词与口型：带范围的行按中点归到对应镜 */
    const dlgSec = secs.find(s => /台词|口型|对白/.test(s.title));
    const timedLines = [];
    if (dlgSec) {
      String(dlgSec.text).split(/\r?\n/).forEach(l => {
        const m = TC_RE.exec(l.trim());
        if (!m) return;
        const qs = quotes(m[3], true);
        if (qs.length) timedLines.push({ mid: (parseFloat(m[1]) + parseFloat(m[2])) / 2, text: qs.join(' ') });
      });
    }

    const lines = src.text.split(/\r?\n/);
    const marks = [];
    lines.forEach((l, i) => {
      const m = TC_RE.exec(l);
      if (!m) return;
      const a = parseFloat(m[1]), b = parseFloat(m[2]);
      if (!(b > a) || (b - a) < 0.3 || (b - a) > 30) return;
      marks.push({ i, a, b, first: m[3] });
    });
    const shots = [];
    let prevEnd = null;
    marks.forEach((mk, k) => {
      const next = marks[k + 1];
      const bodyLines = lines.slice(mk.i, next ? next.i : lines.length);
      const full = bodyLines.join('\n').replace(TC_PREFIX, '').trim();
      const head = mk.first || '';
      /* 镜头规格句＝第一个 ｜ 到第一个 。 之间，且它确实像在说机位 */
      let spec = '', rest = full;
      const bar = head.indexOf('｜') >= 0 ? head.indexOf('｜') : head.indexOf('|');
      if (bar > 0) {
        const tail = head.slice(bar + 1);
        const stop = tail.indexOf('。');
        const cand = (stop > 0 ? tail.slice(0, stop) : tail).trim();
        if (/mm|机位|齐[胸腰眼膝]高|低机位|高机位|固定|微仰|仰拍|俯拍|手持/i.test(cand)) {
          spec = cand;
          rest = (stop > 0 ? tail.slice(stop + 1) : '') + '\n' + bodyLines.slice(1).join('\n');
        } else rest = head.slice(0, bar) + '\n' + bodyLines.slice(1).join('\n');
      } else rest = bodyLines.slice(1).join('\n');
      const tagM = /^([Ee]?\s*\d+[A-Za-z]?)\s+/.exec(head);
      const label = tagM ? tagM[1].replace(/\s+/g, '') : ('T' + (k + 1));
      const title = (tagM ? head.slice(tagM[0].length) : head).split('｜')[0].split('|')[0].trim().slice(0, 24) || ('镜头 ' + (k + 1));
      const mmM = MM_RE.exec(spec || head);
      const mm = mmM ? +mmM[1] : null;
      const desc = stripLocks(rest).slice(0, 420);
      const sizeKey = sizeOf(spec || '', desc, mm);
      const camH = firstHit(CAM_H, spec || '');
      const dlg = quotes(head + '\n' + rest);
      timedLines.forEach(t => {
        if (t.mid >= mk.a - 0.05 && t.mid <= mk.b + 0.05 && dlg.indexOf(t.text) < 0) dlg.push(t.text);
      });
      if (prevEnd != null && Math.abs(mk.a - prevEnd) > 0.05) warnings.push(`${label} 与上一镜之间有 ${(mk.a - prevEnd).toFixed(1)} 秒空档`);
      prevEnd = mk.b;
      shots.push({
        desc: desc || title,
        dialogue: dlg.slice(0, 3).join(' / ').slice(0, 200),
        duration: Math.round((mk.b - mk.a) * 10) / 10,
        shotSize: sizeKey || 'MS',
        angle: angleOf(spec || '', desc),
        cameraMove: moveOf(spec || ''),
        moveSpeed: speedOf(desc),
        aimY: null,
        camH: camH == null ? null : camH,
        lens: mm,
        from: mk.a, to: mk.b,
        cast: castOf((spec || '') + ' ' + desc + ' ' + head, cast),
        beats: beatsOf(full),
        purpose: ((/情绪目的\s*[＝=:：]([^。\n]{1,60})/.exec(full) || [])[1] || '').trim(),
        sceneKey: '',
        note: [label, spec ? spec.replace(/\s+/g, ' ').slice(0, 46) : '', title].filter(Boolean).join(' · ').slice(0, 120),
        prompt: full.slice(0, 1500),
      });
      if (!sizeKey) warnings.push(`${label} 没读出焦段/景别，先按中景，可手动改`);
    });

    /* 条号（d06）：② 定场帧里的「承 dXX」或标题里的 d\d+ */
    const idM = /承\s*([dD]\d+)/.exec(raw) || /([dD]\d{2,3})/.exec(raw);
    /* 地点：② 定场帧第一句（「桃林口内侧，暮意加深、贴地雾」）——
       时间码块里常常只写动作不提地方，搭景时要有这个「在哪打」才认得出桃林 */
    const openSec = secs.find(s => /定场|开场|空间|场景/.test(s.title)) || secs[1] || secs[0];
    const placeM = /^([\u4e00-\u9fa5A-Za-z0-9]{2,10}?(?:口|内|里|侧|外|边|旁|间))[，、]/.exec(((openSec || {}).text || '').split(/\r?\n/)[0] || '');
    const place = placeM ? placeM[1] : '';
    const aspM = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec((secs.find(s => /画面规格|规格|画幅/.test(s.title)) || secs[0] || {}).text || '');
    const durM = /(\d{1,3}(?:\.\d+)?)\s*秒/.exec((secs.find(s => /画面规格|规格/.test(s.title)) || secs[0] || {}).text || '');
    const fpsM = /(\d{2})\s*fps/i.exec(raw);
    const usedNos = {};
    shots.forEach(s => { if (s.note) usedNos[s.note.split(' · ')[0]] = 1; });
    const meta = {
      kind: 'h3',
      id: idM ? idM[1].toLowerCase() : '',
      place,
      aspect: aspM ? (aspM[1] + ':' + aspM[2]) : '',
      total: durM ? parseFloat(durM[1]) : Math.max.apply(null, shots.map(s => s.to || 0)) || 0,
      fps: fpsM ? +fpsM[1] : null,
      cast,
      castAll: (() => { const u = []; shots.forEach(s => s.cast.forEach(c => { if (u.indexOf(c) < 0) u.push(c); })); return u; })(),
      refs,
      shotCount: shots.length,
      /* 非镜头段落：不变成卡片，但一个字都不丢 */
      globals: secs.filter(s => s !== src && s.text).map(s => ({ no: s.no, title: s.title, text: s.text.slice(0, 1200) })),
      styleLock: ((secs.find(s => /风格|画质/.test(s.title)) || {}).text || '').slice(0, 600),
      negative: ((secs.find(s => /负面|禁止/.test(s.title)) || {}).text || '').slice(0, 900),
      light: ((secs.find(s => /光影|灯光/.test(s.title)) || {}).text || '').slice(0, 500),
      axis: ((secs.find(s => /轴线|空间与/.test(s.title)) || {}).text || '').slice(0, 500),
      audio: ((secs.find(s => /音频|声音/.test(s.title)) || {}).text || '').slice(0, 500),
      ledger: ((secs.find(s => /物理|连续性|账本/.test(s.title)) || {}).text || '').slice(0, 900),
      plot: ((secs.find(s => /剧情|目的/.test(s.title)) || {}).text || '').slice(0, 500),
      locks: (raw.match(/【[^】]{4,200}】/g) || []).slice(0, 24),
      srcTitle: (src.no || '') + ' ' + src.title,
      /* 原文整条留着（上限 40000 字）：拆得不准也不损失任何东西，还能一键复制回 AI */
      raw,
    };
    shots.forEach(s => { s.sceneKey = meta.id ? (meta.id + '-' + (s.from != null ? s.note.split(' · ')[0] : '')) : ''; });
    /* 地点写进每一镜：分镜卡只写「A 举弯刀自左上劈落」这种动作，
       搭景要靠「桃林口」才知道该铺树林而不是客厅 */
    if (place) shots.forEach(s => { s.place = place; });
    return { shots, meta, warnings: warnings.slice(0, 6), stats: { rows: marks.length, used: shots.length, skipped: 0 } };
  }

  window.H3PARSE = { looksLike, parse, sections, tcLines, lensToFov, sizeOf, angleOf, moveOf, speedOf, quotes, beatsOf, castOf };
})();
