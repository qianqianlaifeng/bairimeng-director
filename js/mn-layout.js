/* === 导演台 · 自动布局（防穿模）===
   一句话：别让家具互相穿、别让家具插进墙、别让人站进家具里。
   · 放置 / 拖动松手时：只挪「用户正在动的那一件」，去找最近的空位（不动你已经摆好的东西）。
   · AI 搭景 / 「自动摆好」：整场逐件排开，每件只允许小距离移动。

   依赖 mn-props.js 的坐标约定：p.x/p.y 是未旋转本地框的左上角，p.w/p.d 是宽深，rot 绕中心。
   碰撞体积（footprint）：
     家具 → w × d 的有向矩形
     人物 → 0.6 × 0.6（脚下占地，人不是一根针）
     墙   → 线段 + 厚度 th（默认 0.2m）的有向矩形，再各加 0.03m 余量
     房间 → 只当地面，不参与碰撞；但物体必须落在某个房间里（有房间时）
   ============================================================ */
(function () {
  'use strict';

  const PERSON_FP = 0.6;         // 人物脚下占地
  const WALL_GAP = 0.03;
  /* 门/窗本来就要嵌在墙里，地毯本来就要铺在家具下面 —— 这两类不当穿模处理 */
  const NO_WALL = { door: 1, window: 1, rug: 1 };
  const UNDERLAY = { rug: 1 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* 取物体的碰撞矩形（世界坐标，中心 + 半宽半深 + 弧度） */
  function boxOf(kind, o) {
    if (!o || o.hidden) return null;
    if (kind === 'prop') {
      const w = Math.abs(+o.w || 1), d = Math.abs(+o.d || 1);
      return { cx: (+o.x || 0) + w / 2, cy: (+o.y || 0) + d / 2, hw: w / 2, hd: d / 2, rot: (+o.rot || 0) * Math.PI / 180 };
    }
    if (kind === 'person') return { cx: +o.x || 0, cy: +o.y || 0, hw: PERSON_FP / 2, hd: PERSON_FP / 2, rot: 0 };
    if (kind === 'wall') {
      const x1 = +o.x1 || 0, y1 = +o.y1 || 0, x2 = +o.x2 || 0, y2 = +o.y2 || 0;
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 0.05) return null;
      const th = Math.max(0.08, +o.th || 0.2) / 2 + WALL_GAP;
      return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, hw: L / 2, hd: th, rot: Math.atan2(y2 - y1, x2 - x1) };
    }
    return null;
  }

  function corners(b) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const ax = c * b.hw, ay = s * b.hw;      // 本地 x 轴
    const bx = -s * b.hd, by = c * b.hd;     // 本地 y 轴
    return [
      [b.cx - ax - bx, b.cy - ay - by], [b.cx + ax - bx, b.cy + ay - by],
      [b.cx + ax + bx, b.cy + ay + by], [b.cx - ax + bx, b.cy - ay + by],
    ];
  }
  const proj = (pts, ax) => {
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) { const v = p[0] * ax[0] + p[1] * ax[1]; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    return [mn, mx];
  };

  /* 分离轴：返回把 A 推离 B 的最小平移向量 {@link {dx,dy,depth}}，不重叠返回 null */
  function mtv(A, B) {
    const pa = corners(A), pb = corners(B);
    const axes = [[Math.cos(A.rot), Math.sin(A.rot)], [-Math.sin(A.rot), Math.cos(A.rot)],
      [Math.cos(B.rot), Math.sin(B.rot)], [-Math.sin(B.rot), Math.cos(B.rot)]];
    let best = null;
    for (const ax of axes) {
      const [a0, a1] = proj(pa, ax), [b0, b1] = proj(pb, ax);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;                       // 有分离轴 → 不重叠
      if (!best || o < best.depth) {
        const sign = (A.cx * ax[0] + A.cy * ax[1]) < (B.cx * ax[0] + B.cy * ax[1]) ? -1 : 1;
        best = { dx: ax[0] * o * sign, dy: ax[1] * o * sign, depth: o };
      }
    }
    return best;
  }

  /* 一个物体与场景里其它东西的碰撞（不含自己） */
  function hitsFor(box, scene, ignoreId, selfKind, selfKindName) {
    const out = [];
    const selfUnderlay = !!(selfKindName && UNDERLAY[selfKindName]);
    for (const p of (scene.props || [])) {
      if (p.hidden || p.id === ignoreId) continue;
      if (selfUnderlay || UNDERLAY[p.kind]) continue;          // 地毯叠地毯/家具压地毯都不算撞
      const b = boxOf('prop', p);
      if (b && mtv(box, b)) out.push({ kind: 'prop', id: p.id, name: p.name });
    }
    if (!(selfKindName && NO_WALL[selfKindName])) {
      for (const w of (scene.walls || [])) {
        if (w.hidden) continue;
        const b = boxOf('wall', w);
        if (b && mtv(box, b)) out.push({ kind: 'wall', id: w.id, name: w.name || '墙' });
      }
    }
    for (const pe of (scene.persons || [])) {
      if (pe.hidden || pe.id === ignoreId) continue;
      const b = boxOf('person', pe);
      if (b && mtv(box, b)) out.push({ kind: 'person', id: pe.id, name: pe.name });
    }
    return out;
  }

  /* 有没有落在房间里（有房间时才检查）；返回 false = 出去了 */
  function insideRooms(box, scene) {
    const rooms = (scene.rooms || []).filter(r => !r.hidden);
    if (!rooms.length) return true;
    const cs = corners(box);
    return cs.some(p => rooms.some(r => p[0] >= +r.x - 0.05 && p[0] <= +r.x + +r.w + 0.05 && p[1] >= +r.y - 0.05 && p[1] <= +r.y + +r.d + 0.05));
  }

  /* 在 (x, y) 附近找最近的空位。
     kind/o 传入「移动后的物体」（o.x/o.y 已经是目标位置）；返回 {x, y, moved, dist, hits} */
  function findFreeSpot(scene, kind, o, opts) {
    const opt = opts || {};
    const maxR = opt.maxR != null ? opt.maxR : 4;
    const step = opt.step || 0.25;
    /* 房间只当「软边界」：物体本来在房间里，就别让它被推到房间外；
       本来就在房间外（露台、街边）的，不要硬塞回屋里。 */
    const startBox = boxOf(kind, o);
    const keepInside = startBox ? insideRooms(startBox, scene) : false;
    const test = (x, y) => {
      const t = Object.assign({}, o);
      if (kind === 'person') { t.x = x; t.y = y; }
      else if (kind === 'prop') { const w = Math.abs(+o.w || 1), d = Math.abs(+o.d || 1); t.x = x - w / 2; t.y = y - d / 2; }
      const box = boxOf(kind, t);
      if (!box) return { ok: true, t };
      if (keepInside && !insideRooms(box, scene)) return { ok: false, t, hits: [{ kind: 'room', name: '房间外' }] };
      const hits = hitsFor(box, scene, o.id, kind, o.kind);
      return { ok: hits.length === 0, t, hits };
    };
    const want = kind === 'person' ? { x: +o.x || 0, y: +o.y || 0 }
      : { x: (+o.x || 0) + Math.abs(+o.w || 1) / 2, y: (+o.y || 0) + Math.abs(+o.d || 1) / 2 };
    const first = test(want.x, want.y);
    if (first.ok) return { x: want.x, y: want.y, moved: false, dist: 0, hits: [] };

    /* 由近到远扫环：8 方向 × 每 0.25m 一圈，取第一个不撞的 */
    for (let r = step; r <= maxR + 1e-6; r += step) {
      const n = Math.max(8, Math.round(r * 16));
      let best = null;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = want.x + Math.cos(a) * r, y = want.y + Math.sin(a) * r;
        const t = test(x, y);
        if (!t.ok) continue;
        if (!best || Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) < best.k) best = { x, y, k: Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) };
      }
      if (best) return { x: best.x, y: best.y, moved: true, dist: r, hits: first.hits || [] };
    }
    return { x: want.x, y: want.y, moved: false, dist: 0, hits: first.hits || [], failed: true };
  }

  /* 整场排开：只挪家具和人物，墙/房间不动；每件最多挪 opt.maxR 米 */
  function resolveScene(scene, opts) {
    const opt = opts || {};
    const moved = [];
    const doOne = (kind, o) => {
      const r = findFreeSpot(scene, kind, o, { maxR: opt.maxR != null ? opt.maxR : 2.5, step: 0.2 });
      if (!r.moved || r.failed) return;
      if (kind === 'person') { o.x = r.x; o.y = r.y; }
      else { const w = Math.abs(+o.w || 1), d = Math.abs(+o.d || 1); o.x = r.x - w / 2; o.y = r.y - d / 2; }
      moved.push({ kind, id: o.id, name: o.name, dist: +r.dist.toFixed(2) });
    };
    /* 两遍：第一遍按顺序排，第二遍把第一遍被挤得又撞上的再处理一次 */
    for (let pass = 0; pass < 2; pass++) {
      (scene.props || []).forEach(o => { if (!o.hidden) doOne('prop', o); });
      (scene.persons || []).forEach(o => { if (!o.hidden) doOne('person', o); });
    }
    return moved;
  }

  /* 只处理一件（放置 / 拖动松手时用） */
  function settle(scene, kind, o) {
    const r = findFreeSpot(scene, kind, o, { maxR: 3, step: 0.2 });
    if (!r.moved) return { moved: false, hits: r.hits || [], failed: !!r.failed };
    if (kind === 'person') { o.x = +r.x.toFixed(2); o.y = +r.y.toFixed(2); }
    else {
      const w = Math.abs(+o.w || 1), d = Math.abs(+o.d || 1);
      o.x = +(r.x - w / 2).toFixed(2); o.y = +(r.y - d / 2).toFixed(2);
    }
    return { moved: true, dist: +r.dist.toFixed(2), hits: r.hits || [] };
  }

  /* 当前有没有撞上（拖动时给红框提示用） */
  function collides(scene, kind, o) {
    const b = boxOf(kind, o);
    if (!b) return false;
    return hitsFor(b, scene, o.id, kind, o.kind).length > 0;
  }

  window.MN_LAYOUT = { boxOf, mtv, hitsFor, insideRooms, findFreeSpot, resolveScene, settle, collides };
})();
