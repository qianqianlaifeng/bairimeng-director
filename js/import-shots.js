/* === 分镜导入（给同学用的）===
   场景：同学用自己的表格/文档写好分镜，导进项目里直接变卡片。
   支持：CSV / TSV（Excel、飞书、石墨导出）· Markdown 表格 · 每行一条的纯文本 · JSON 数组
   表头识别（有就用，没有就按位置猜）：镜号 / 画面(描述) / 台词 / 时长 / 景别 / 运镜 / 角度 / 场次 / 备注

   解码：先按 UTF-8 解，出现替换字符就退回 GBK（Excel 在中文 Windows 上另存 CSV 默认就是 GBK）。
   ============================================================ */
(function () {
  'use strict';

  const SIZES = [
    [/(大远景|极远景|超大远景)/, 'ELS'],
    [/(远景|全景|wide)/i, 'LS'],
    [/(中近景)/, 'MCU'],
    [/(中景)/, 'MS'],
    [/(近景)/, 'CU'],
    [/(特写|大特写|细节)/, 'ECU'],
  ];
  const MOVES = [
    [/(不变焦|固定|静止|不动|static)/i, 'static'],
    [/(缓推|慢推|慢慢推|推近)/, 'slowPush'],
    [/(急推|快推|crash)/i, 'crashZoomIn'],
    [/(变焦推|zoom\s*in)/i, 'zoomIn'],
    [/(缓拉|慢拉|拉远|后退)/, 'slowPull'],
    [/(急拉|快拉)/, 'crashZoomOut'],
    [/(变焦拉|zoom\s*out)/i, 'zoomOut'],
    [/(变焦推拉|齐焦|dolly\s*zoom|希区柯克)/i, 'dollyZoom'],
    [/(左摇|向左摇|pan\s*left)/i, 'panLeft'],
    [/(右摇|向右摇|pan\s*right)/i, 'panRight'],
    [/(甩镜|甩|whip)/i, 'whipPan'],
    [/(摆镜|swing)/i, 'swingShot'],
    [/(左移|向左移|truck\s*left)/i, 'truckLeft'],
    [/(右移|向右移|truck\s*right)/i, 'truckRight'],
    [/(正面跟|前跟|退着跟|track\s*front)/i, 'trackFront'],
    [/(背面跟|背跟|背后跟|track\s*behind)/i, 'trackBehind'],
    [/(侧面跟|侧跟|track\s*side)/i, 'trackSide'],
    [/(手持|handheld)/i, 'handheld'],
    [/(主观|第一人称|走位跟拍|pov)/i, 'povWalk'],
    [/(跟拍|跟镜|追随)/, 'trackSide'],
    [/(升镜|上升|升起|crane\s*up)/i, 'craneUp'],
    [/(降镜|下降|落下|crane\s*down)/i, 'craneDown'],
    [/(上摇|向上摇|tilt\s*up)/i, 'tiltUp'],
    [/(下摇|向下摇|tilt\s*down)/i, 'tiltDown'],
    [/(升降|pedestal)/i, 'pedestal'],
    [/(左环绕|orbit\s*left)/i, 'orbitLeft'],
    [/(环绕|绕拍|orbit)/i, 'orbitRight'],
    [/(弧形推进|弧推|arc)/i, 'arcIn'],
    [/(螺旋上升|spiral)/i, 'spiralUp'],
    [/(移出揭示|reveal)/i, 'revealTrack'],
    [/(拉远揭示|pull\s*reveal)/i, 'pullReveal'],
    [/(斯坦尼康|steadicam)/i, 'steadicam'],
    [/(俯冲|无人机俯冲|drone\s*dive)/i, 'droneDive'],
    [/(拉升|无人机升|drone\s*rise)/i, 'droneRise'],
    [/(俯拍旋转|上帝视角|top\s*rotate)/i, 'topRotate'],
    [/(过肩|over\s*shoulder)/i, 'overShoulder'],
    [/(急停|snap)/i, 'snapZoom'],
    [/(自由机位|free)/i, 'free'],
    [/(推|push)/i, 'slowPush'],
    [/(拉|pull)/i, 'slowPull'],
    [/(摇|pan)/i, 'panRight'],
    [/(移|轨道|track)/i, 'truckRight'],
  ];
  const ANGLES = [
    [/(鸟瞰|航拍|俯视|bird)/i, 'bird'],
    [/(过肩|over\s*shoulder)/i, 'ots'],
    [/(仰拍|仰角|低角|low)/i, 'low'],
    [/(俯拍|俯角|高角|high)/i, 'high'],
    [/(斜侧|倾斜|dutch)/i, 'dutch'],
    [/(平视|eye)/i, 'eye'],
  ];

  const hit = (list, s) => {
    for (const [re, key] of list) if (re.test(s)) return key;
    return null;
  };
  /* 单元格可能直接写英文 key（MS / CU / slowPush），先精确匹配再走中文映射 */
  const KEY_SIZE = ['ELS', 'LS', 'MS', 'MCU', 'CU', 'ECU'];
  const KEY_MOVE = ['static', 'slowPush', 'slowPull', 'crashZoomIn', 'crashZoomOut', 'zoomIn', 'zoomOut', 'dollyZoom',
    'truckLeft', 'truckRight', 'panLeft', 'panRight', 'whipPan', 'swingShot', 'craneUp', 'craneDown', 'tiltUp', 'tiltDown',
    'pedestal', 'orbitLeft', 'orbitRight', 'arcIn', 'spiralUp', 'trackFront', 'trackBehind', 'trackSide', 'revealTrack',
    'handheld', 'steadicam', 'droneDive', 'droneRise', 'topRotate', 'overShoulder', 'pullReveal', 'povWalk', 'snapZoom', 'free'];
  const KEY_ANGLE = ['eye', 'low', 'high', 'bird', 'dutch', 'ots'];
  const keyOf = (list, raw, keys) => {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const exact = keys.find(k => k.toLowerCase() === s.toLowerCase());
    if (exact) return exact;
    return hit(list, s);
  };

  /* ---------- 解码：UTF-8 → GBK 兜底 ---------- */
  function decodeBuffer(buf) {
    let txt = '';
    try { txt = new TextDecoder('utf-8', { fatal: false }).decode(buf); } catch (e) { txt = ''; }
    const bad = (txt.match(/\uFFFD/g) || []).length;
    if (bad > 2) {
      try { const g = new TextDecoder('gbk').decode(buf); if (g && !/\uFFFD/.test(g)) return g.replace(/^\uFEFF/, ''); } catch (e) { }
    }
    return txt.replace(/^\uFEFF/, '');
  }

  /* ---------- 文本 → 行 ---------- */
  function splitLines(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
  }
  /* CSV 单行解析（支持引号、引号内逗号/换行） */
  function parseCSVLine(line) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }
  function parseDelimited(text) {
    const lines = splitLines(text);
    if (!lines.length) return [];
    const sample = lines[0];
    const delim = sample.indexOf('\t') >= 0 ? '\t' : sample.indexOf('|') >= 0 ? '|' : ',';
    const rows = [];
    for (const line of lines) {
      if (delim === '|') {
        /* markdown 表格：去掉首尾竖线，跳过 |---| 分隔行 */
        if (/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue;
        const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
        rows.push(cells);
      } else if (delim === '\t') rows.push(line.split('\t').map(s => s.trim()));
      else rows.push(parseCSVLine(line));
    }
    return rows;
  }

  /* ---------- 表头识别 ---------- */
  const COLS = [
    ['no', /镜号|镜头号|序号|编号|^#|no\.?$/i],
    ['size', /景别|size|shot\s*size/i],
    ['desc', /画面|描述|内容|视觉|镜头内容|画面内容|shot|action|desc|description|content|visual/i],
    ['dialogue', /台词|对白|字幕|dialog|line/i],
    ['duration', /时长|秒数|时间|duration|秒/i],
    ['move', /运镜|机位运动|机位位移|camera|movement|镜头运动/i],
    ['angle', /角度|机位角度|angle/i],
    ['scene', /场次|场景|scene/i],
    ['note', /备注|说明|note|remark/i],
  ];
  function headerMap(row) {
    const map = {};
    const cols = [];
    row.forEach((cell, i) => {
      const s = String(cell || '');
      let hitKey = null;
      for (const [key, re] of COLS) {
        if (map[key] == null && re.test(s)) { map[key] = i; hitKey = key; break; }
      }
      cols.push({ key: hitKey || 'extra', i });
    });
    map.cols = cols;
    return map;
  }
  const isHeader = row => {
    const s = row.join(' ');
    return /镜号|画面|描述|台词|时长|景别|运镜|角度|场景|场次|备注|shot|duration/i.test(s) && !/^\d+$/.test(s.trim());
  };

  /* ---------- 列对齐：同学手写的表常常少一列（最常见是漏了「台词」空列），
     直接按列号对位会把「时长 2」塞进「台词」。这里按每列的“形状”打分，
     用动态规划挑最合理的一种对位（允许某列留空 / 某个格丢掉，丢格要扣分）。 ---------- */
  function scoreCell(key, cell) {
    const v = String(cell == null ? '' : cell).trim();
    if (v === '') return key === 'desc' ? -4 : 0;
    if (key === 'duration') return numDur(v) != null ? 4 : -3;
    if (key === 'size') return keyOf(SIZES, v, KEY_SIZE) ? 4 : -2;
    if (key === 'move') return keyOf(MOVES, v, KEY_MOVE) ? 4 : -2;
    if (key === 'angle') return keyOf(ANGLES, v, KEY_ANGLE) ? 4 : -2;
    if (key === 'no') return /^\d+$/.test(v) ? 3 : -1;
    if (key === 'desc') return /^\d+(\.\d+)?$/.test(v) ? -3 : 3;
    if (key === 'dialogue') return /^\d+(\.\d+)?\s*s?$/i.test(v) ? -3 : 2;
    if (key === 'extra') return 1;
    return 1;
  }
  function alignRow(cols, cells) {
    const H = cols.length, R = cells.length;
    if (!H || !R) return cells.slice();
    const NEG = -1e9;
    const dp = [], back = [];
    for (let i = 0; i <= H; i++) { dp.push(new Array(R + 1).fill(NEG)); back.push(new Array(R + 1).fill(null)); }
    dp[0][0] = 0;
    for (let i = 1; i <= H; i++) {
      for (let j = 0; j <= R; j++) {
        /* 跳过这一列（该列没填） */
        if (dp[i - 1][j] > NEG / 2) { dp[i][j] = dp[i - 1][j]; back[i][j] = { type: 'skipCol', i: i - 1, j }; }
        /* 把第 j-1 个格丢掉（内容丢失，扣分） */
        if (j >= 1 && dp[i][j - 1] > NEG / 2) {
          const v = dp[i][j - 1] - 3;
          if (v > dp[i][j]) { dp[i][j] = v; back[i][j] = { type: 'drop', i: i - 1, j }; }
        }
        /* 第 j-1 个格给第 i-1 列 */
        if (j >= 1 && dp[i - 1][j - 1] > NEG / 2) {
          const key = cols[i - 1].key;
          const v = dp[i - 1][j - 1] + scoreCell(key, cells[j - 1]);
          if (v > dp[i][j]) { dp[i][j] = v; back[i][j] = { type: 'assign', i: i - 1, j }; }
        }
      }
    }
    if (dp[H][R] <= NEG / 2) return cells.slice(0, H);
    /* 回溯：结果按「原表头列号」对齐 */
    const total = cols[cols.length - 1].i + 1;
    const assign = new Array(total).fill(null);
    let i = H, j = R;
    while (i > 0 && j > 0) {
      const b = back[i][j];
      if (!b) break;
      if (b.type === 'assign') { assign[cols[b.i].i] = cells[b.j - 1]; i--; j--; }
      else if (b.type === 'drop') { j--; }
      else { i--; }
    }
    return assign;
  }

  /* ---------- 单行 → 分镜字段 ---------- */
  function numDur(v) {
    const s = String(v || '').trim();
    const m = s.match(/(\d{1,2}):(\d{1,2})/);
    if (m) return Math.max(1, Math.min(20, (+m[1]) * 60 + (+m[2])));
    const n = parseFloat(s.replace(/[^\d.]/g, ''));
    return isFinite(n) && n > 0 ? Math.max(1, Math.min(20, n)) : null;
  }
  function toShot(cell, ctx) {
    const desc = String(cell.desc || '').trim();
    if (!desc) return null;
    const shot = {
      desc: desc.slice(0, 300),
      dialogue: String(cell.dialogue || '').trim().slice(0, 200),
      duration: cell.durationNum || 3,
      cameraMove: cell.moveKey || 'static',
      shotSize: cell.sizeKey || 'MS',
      angle: cell.angleKey || 'eye',
      sceneKey: String(cell.scene || '').trim().slice(0, 24),
      note: String(cell.note || '').trim().slice(0, 120),
    };
    /* 没单独给景别/运镜时，从画面描述里猜（同学常写成「中景，女主推门」） */
    if (!cell.sizeKey) { const k = hit(SIZES, desc); if (k) shot.shotSize = k; }
    if (!cell.moveKey) { const k = hit(MOVES, desc); if (k) shot.cameraMove = k; }
    if (!cell.angleKey) { const k = hit(ANGLES, desc); if (k) shot.angle = k; }
    return shot;
  }

  /* ---------- 主解析 ---------- */
  function parse(text) {
    const raw = String(text || '').trim();
    if (!raw) return { shots: [], stats: { rows: 0, used: 0, skipped: 0 }, warnings: ['没有内容'] };

    /* JSON：数组，或 {shots:[...]} */
    if (raw[0] === '[' || raw[0] === '{') {
      try {
        const j = JSON.parse(raw);
        const arr = Array.isArray(j) ? j : (Array.isArray(j.shots) ? j.shots : (Array.isArray(j.storyboard) ? j.storyboard : null));
        if (arr) {
          const shots = [];
          let skipped = 0;
          arr.forEach(o => {
            if (!o || typeof o !== 'object') { skipped++; return; }
            const desc = o.desc || o.画面 || o.描述 || o.action || o.title || '';
            if (!String(desc).trim()) { skipped++; return; }
            shots.push({
              desc: String(desc).trim().slice(0, 300),
              dialogue: String(o.dialogue || o.台词 || '').trim().slice(0, 200),
              duration: numDur(o.duration || o.时长) || 3,
              cameraMove: o.cameraMove || keyOf(MOVES, o.运镜 || o.camera || o.运镜方式, KEY_MOVE) || 'static',
              shotSize: o.shotSize || keyOf(SIZES, o.景别 || o.size || o.景别大小, KEY_SIZE) || 'MS',
              angle: o.angle || keyOf(ANGLES, o.角度 || o.angleName || o.机位角度, KEY_ANGLE) || 'eye',
              sceneKey: String(o.sceneKey || o.场次 || o.scene || '').trim().slice(0, 24),
              note: String(o.note || o.备注 || '').trim().slice(0, 120),
            });
          });
          return { shots, stats: { rows: arr.length, used: shots.length, skipped }, warnings: [] };
        }
      } catch (e) { /* 不是 JSON，继续按表格解析 */ }
    }

    const rows = parseDelimited(raw);
    if (!rows.length) return { shots: [], stats: { rows: 0, used: 0, skipped: 0 }, warnings: ['没读到任何行'] };

    let map = null, dataRows = rows;
    if (isHeader(rows[0])) { map = headerMap(rows[0]); dataRows = rows.slice(1); }

    const warnings = [];
    const shots = [];
    let skipped = 0;
    dataRows.forEach((cells, idx) => {
      if (!cells.length || cells.every(c => !String(c).trim())) { skipped++; return; }
      let cell;
      if (map && map.desc != null) {
        const row = alignRow(map.cols, cells);
        const at = (key) => {
          const idx = map[key];
          return idx == null ? '' : (row[idx] == null ? '' : row[idx]);
        };
        cell = {
          desc: at('desc'),
          dialogue: at('dialogue'),
          durationNum: map.duration != null ? numDur(at('duration')) : null,
          sizeKey: map.size != null ? keyOf(SIZES, at('size'), KEY_SIZE) : null,
          moveKey: map.move != null ? keyOf(MOVES, at('move'), KEY_MOVE) : null,
          angleKey: map.angle != null ? keyOf(ANGLES, at('angle'), KEY_ANGLE) : null,
          scene: at('scene'),
          note: at('note'),
        };
      } else {
        /* 没有表头：先按位置猜（镜号|画面|台词|时长），再退化到「整行就是画面」 */
        const c = cells.slice();
        if (c.length >= 2 && /^\d+$/.test(String(c[0]).trim())) c.shift();
        const hasDur = c.length >= 2 && numDur(c[c.length - 1]) != null && String(c[c.length - 1]).length <= 6;
        cell = {
          desc: c[0],
          dialogue: c.length >= 3 ? c[1] : (c.length === 2 && !hasDur ? c[1] : ''),
          durationNum: hasDur ? numDur(c[c.length - 1]) : null,
        };
        if (cells.length > 1) warnings.push('第 ' + (idx + 1) + ' 行没有表头，按「镜号|画面|台词|时长」猜的');
      }
      const shot = toShot(cell, {});
      if (!shot) { skipped++; return; }
      shots.push(shot);
    });
    if (map && map.desc == null) warnings.push('表头里没找到「画面/描述」列，可能认错了');
    return { shots, stats: { rows: dataRows.length, used: shots.length, skipped }, warnings: warnings.slice(0, 3) };
  }

  /* ---------- 给同学的模板 ---------- */
  function templateCSV() {
    const rows = [
      ['镜号', '画面描述', '台词', '时长', '景别', '运镜', '角度', '场次', '备注'],
      ['1', '傍晚客厅全景，女主站在沙发前，男主从书架边走过来', '', '4', '远景', '固定', '平视', '第1场', '建立空间'],
      ['2', '中景缓推，女主坐下拿起茶几上的杯子', '茶凉了', '3.5', '中景', '缓推', '平视', '第1场', ''],
      ['3', '特写：杯口的热气', '', '2', '特写', '固定', '低角度', '第1场', '插入镜'],
    ];
    return '\uFEFF' + rows.map(r => r.map(c => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\n');
  }

  window.SHOT_IMPORT = { parse, parseDelimited, decodeBuffer, templateCSV, numDur, hit, keyOf, SIZES, MOVES, ANGLES };
})();
