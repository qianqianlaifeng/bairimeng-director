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
    if (kind === 'person') { const bH = ((window.MN3D && window.MN3D.BODIES && window.MN3D.BODIES[o.build || '标准']) || { H: 1 }).H;
      const fp = PERSON_FP * Math.max(0.3, Math.min(3, +o.scale || 1)) * bH; return { cx: +o.x || 0, cy: +o.y || 0, hw: fp / 2, hd: fp / 2, rot: 0 }; }
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
  function hitsFor(box, scene, ignoreId, selfKind, selfKindName, selfObj) {
    const out = [];
    const selfUnderlay = !!(selfKindName && UNDERLAY[selfKindName]);
    const mySeat = selfObj && selfObj.sitOn && selfObj.sitOn.id;      // 坐在椅子上的那个人，椅子本身不算穿模
    for (const p of (scene.props || [])) {
      if (p.hidden || p.id === ignoreId || p.id === mySeat) continue;
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
      if (selfKind === 'prop' && pe.sitOn && pe.sitOn.id === ignoreId) continue;   // 家具挪动时不必把坐在它身上的人当障碍
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
      const hits = hitsFor(box, scene, o.id, kind, o.kind, t);
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
      (scene.persons || []).forEach(o => { if (!o.hidden && !o.sitOn) doOne('person', o); });   // 坐着的人由座位定位，不参与避让
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
    return hitsFor(b, scene, o.id, kind, o.kind, o).length > 0;
  }

  /* ============================================================
   * 走位路径：绕开家具与墙
   * ------------------------------------------------------------
   * 路径是折线（person.path）。这里做两件事：
   *   1) 判断某一段是否被挡（家具/墙，按人脚半径外扩）
   *   2) 被挡就用 A* 在 0.2m 网格上绕过去，再做「视线简化」把多余拐点去掉
   * 墙上的门洞算通路（把墙按洞切段）。
   * ============================================================ */
  const PATH_R = 0.34;                 // 人脚半径（比人物占地 0.3 略大，免得贴脸走）
  const WALK_SKIP = { rug: 1, door: 1, window: 1, light: 1 };

  function pointInBox(px, py, b) {
    const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    const dx = px - b.cx, dy = py - b.cy;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hd;
  }

  /* 收集挡路的东西：家具（除地毯/门窗/灯）+ 墙（按门洞切段） */
  function pathObstacles(scene, r) {
    const R = r == null ? PATH_R : r;
    const out = [];
    for (const p of (scene.props || [])) {
      if (p.hidden || WALK_SKIP[p.kind]) continue;
      const b = boxOf('prop', p);
      if (b) out.push({ cx: b.cx, cy: b.cy, hw: b.hw + R, hd: b.hd + R, rot: b.rot });
    }
    for (const w of (scene.walls || [])) {
      if (w.hidden) continue;
      const x1 = +w.x1 || 0, y1 = +w.y1 || 0, x2 = +w.x2 || 0, y2 = +w.y2 || 0;
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (L < 0.05) continue;
      const th = Math.max(0.08, +w.th || 0.2) / 2 + 0.04 + R;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      const rot = Math.atan2(uy, ux);
      const holes = (w.holes || []).map(hp => {
        const half = Math.max(0.12, (+hp.w || 1) / 2) / L;
        return [Math.max(0, +hp.t - half), Math.min(1, +hp.t + half)];
      }).sort((a, b) => a[0] - b[0]);
      let cur = 0;
      const spans = [];
      for (const hp of holes) { if (hp[0] > cur) spans.push([cur, hp[0]]); cur = Math.max(cur, hp[1]); }
      if (cur < 1) spans.push([cur, 1]);
      for (const sp of spans) {
        const len = (sp[1] - sp[0]) * L;
        if (len < 0.06) continue;
        const t = (sp[0] + sp[1]) / 2;
        out.push({ cx: x1 + ux * L * t, cy: y1 + uy * L * t, hw: len / 2, hd: th, rot });
      }
    }
    return out;
  }

  /* 线段是否被挡（每 0.12m 采样，够用且便宜） */
  function segBlocked(ax, ay, bx, by, boxes) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.ceil(d / 0.12));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      for (const b of boxes) if (pointInBox(px, py, b)) return true;
    }
    return false;
  }

  /* A* 绕行（0.2m 网格），返回折线点（含起终点） */
  function detour(ax, ay, bx, by, boxes, step) {
    const S = step || 0.2;
    let x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    for (const b of boxes) {
      const rr = Math.hypot(b.hw, b.hd);
      if (b.cx + rr < x0 - 2 || b.cx - rr > x1 + 2 || b.cy + rr < y0 - 2 || b.cy - rr > y1 + 2) continue;
      x0 = Math.min(x0, b.cx - rr); x1 = Math.max(x1, b.cx + rr);
      y0 = Math.min(y0, b.cy - rr); y1 = Math.max(y1, b.cy + rr);
    }
    x0 -= 1.2; y0 -= 1.2; x1 += 1.2; y1 += 1.2;
    const NX = Math.min(260, Math.ceil((x1 - x0) / S) + 1), NY = Math.min(260, Math.ceil((y1 - y0) / S) + 1);
    if (NX * NY > 40000) return null;
    const toCell = (x, y) => [clamp(Math.round((x - x0) / S), 0, NX - 1), clamp(Math.round((y - y0) / S), 0, NY - 1)];
    const center = (ix, iy) => [x0 + ix * S, y0 + iy * S];
    const blocked = new Uint8Array(NX * NY);
    for (let ix = 0; ix < NX; ix++) for (let iy = 0; iy < NY; iy++) {
      const c = center(ix, iy);
      for (const b of boxes) if (pointInBox(c[0], c[1], b)) { blocked[iy * NX + ix] = 1; break; }
    }
    const nearFree = (x, y) => {
      const cell = toCell(x, y);
      if (!blocked[cell[1] * NX + cell[0]]) return cell;
      for (let r = 1; r <= 8; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const jx = cell[0] + dx, jy = cell[1] + dy;
        if (jx < 0 || jy < 0 || jx >= NX || jy >= NY) continue;
        if (!blocked[jy * NX + jx]) return [jx, jy];
      }
      return null;
    };
    const s0 = nearFree(ax, ay), s1 = nearFree(bx, by);
    if (!s0 || !s1) return null;
    const key = (ix, iy) => iy * NX + ix;
    const open = [{ ix: s0[0], iy: s0[1], g: 0, f: Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) }];
    const gScore = new Map(), came = new Map();
    gScore.set(key(s0[0], s0[1]), 0);
    let found = false, guard = 0;
    while (open.length && guard++ < 200000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.ix, cur.iy);
      if (cur.ix === s1[0] && cur.iy === s1[1]) { found = true; break; }
      if (cur.g > (gScore.get(ck) == null ? Infinity : gScore.get(ck))) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const jx = cur.ix + dx, jy = cur.iy + dy;
        if (jx < 0 || jy < 0 || jx >= NX || jy >= NY) continue;
        if (blocked[jy * NX + jx]) continue;
        const diag = dx && dy;
        if (diag && (blocked[cur.iy * NX + jx] || blocked[jy * NX + cur.ix])) continue;   // 不切角
        const ng = cur.g + (diag ? 1.414 : 1);
        const jk = key(jx, jy);
        const old = gScore.get(jk);
        if (old != null && ng >= old) continue;
        gScore.set(jk, ng); came.set(jk, ck);
        open.push({ ix: jx, iy: jy, g: ng, f: ng + Math.hypot(jx - s1[0], jy - s1[1]) });
      }
    }
    if (!found) return null;
    const cells = [];
    let ck = key(s1[0], s1[1]);
    for (let guard2 = 0; guard2 < 20000; guard2++) {
      const ix = ck % NX, iy = Math.floor(ck / NX);
      cells.push(center(ix, iy));
      if (!came.has(ck)) break;
      ck = came.get(ck);
    }
    cells.reverse();
    cells[0] = [ax, ay];
    cells[cells.length - 1] = [bx, by];
    return cells;
  }

  /* 视线简化：能直连就删掉中间点 */
  function simplify(pts, boxes) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) if (!segBlocked(pts[i][0], pts[i][1], pts[j][0], pts[j][1], boxes)) break;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /* 整条路径绕障：返回 {pts, changed, added} */
  function routePath(scene, path, opts) {
    const list = (path || []).map(p => ({ x: +p.x || 0, y: +p.y || 0 }));
    if (list.length < 2) return { pts: list, changed: false, added: 0 };
    const boxes = pathObstacles(scene, (opts && opts.radius) || PATH_R);
    const out = [];
    let changed = false;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (i === 0) out.push([a.x, a.y]);
      if (!segBlocked(a.x, a.y, b.x, b.y, boxes)) { out.push([b.x, b.y]); continue; }
      const det = detour(a.x, a.y, b.x, b.y, boxes, (opts && opts.step) || 0.2);
      if (det) { changed = true; for (let k = 1; k < det.length; k++) out.push(det[k]); }
      else out.push([b.x, b.y]);            // 绕不过去就保留直连，至少不比原来差
    }
    const simp = simplify(out, boxes);
    const pts = simp.map(p => ({ x: +p[0].toFixed(2), y: +p[1].toFixed(2) }));
    return { pts, changed, added: Math.max(0, pts.length - list.length) };
  }

  /* 整场：所有带路径的人都绕一遍 */
  function routeAllPaths(scene) {
    let n = 0, added = 0;
    for (const pe of (scene.persons || [])) {
      if (!pe.path || pe.path.length < 2) continue;
      const r = routePath(scene, pe.path, {});
      if (r.changed) { pe.path = r.pts; n++; added += r.added; }
    }
    return { count: n, added };
  }

  /* ================= 座位：让「人」和「椅子/沙发/长凳/床」真的发生关系 =================
     道具 kind 上挂 seats = [{x, y, h, face}]（局部米 + 坐面高 + 坐下朝向），
     这里负责把局部座位换算成地图坐标，并处理「谁占了哪个座位」。 */
  function kindDef(o) {
    const K = window.MN_PROP_KINDS; if (!K) return null;
    const key = window.MN_kindOf ? window.MN_kindOf(o) : (o && o.kind);
    return (key && K[key]) ? K[key] : null;
  }
  function seatsOf(o) {
    if (!o || o.hidden) return null;
    const def = kindDef(o);
    return (def && Array.isArray(def.seats) && def.seats.length) ? def.seats : null;
  }
  /* 第 i 个座位的地图坐标 + 人物朝向 + 坐面高度（道具缩放/旋转/移动后都重算） */
  function seatWorld(o, i) {
    const seats = seatsOf(o); if (!seats || !seats[i]) return null;
    const def = kindDef(o);
    const w = Math.abs(+o.w || 1), d = Math.abs(+o.d || 1), h = Math.abs(+o.h || 1);
    const ct = window.MN_propCenter ? window.MN_propCenter(o) : { x: (+o.x || 0) + w / 2, y: (+o.y || 0) + d / 2 };
    const sx = def.w ? w / def.w : 1, sy = def.h ? h / def.h : 1, sz = def.d ? d / def.d : 1;
    const s = seats[i];
    const lx = (+s.x || 0) * sx, ly = (+s.y || 0) * sz;
    const r = ((+o.rot || 0) % 360) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    return {
      x: ct.x + lx * c - ly * sn,
      y: ct.y + lx * sn + ly * c,
      rot: (((+o.rot || 0) + (+s.face || 90)) % 360 + 360) % 360,
      h: Math.max(0.15, (+s.h || 0.45) * sy),
      propId: o.id, seat: i, name: o.name || (def.name || '座位'),
    };
  }
  function seatKey(pid, i) { return pid + ':' + i; }
  function occupiedSeats(scene) {
    const s = new Set();
    (scene.persons || []).forEach(p => { if (p.sitOn && p.sitOn.id) s.add(seatKey(p.sitOn.id, p.sitOn.seat || 0)); });
    return s;
  }
  /* 找最近的空座位（radius 米内；allowTaken=true 时已坐的也算） */
  function nearestSeat(scene, x, y, opts = {}) {
    const rad = opts.radius == null ? 1.2 : opts.radius;
    const taken = opts.allowTaken ? new Set() : occupiedSeats(scene);
    let best = null;
    for (const p of (scene.props || [])) {
      const seats = seatsOf(p); if (!seats) continue;
      for (let i = 0; i < seats.length; i++) {
        if (taken.has(seatKey(p.id, i))) continue;
        const sw = seatWorld(p, i); if (!sw) continue;
        const dd = Math.hypot(sw.x - x, sw.y - y);
        if (dd <= rad && (!best || dd < best.dist)) best = Object.assign({}, sw, { dist: dd });
      }
    }
    return best;
  }
  /* 把某个座位坐到人物身上（返回改动人物的字段；调用方负责 pushUndo/paint） */
  function seatPerson(person, seat) {
    person.sitOn = { id: seat.propId, seat: seat.seat };
    person.x = seat.x; person.y = seat.y;
    person.rot = seat.rot;
    person.sitH = seat.h;
    person.pose = '坐下';
    person.path = [];
    return person;
  }
  function unseatPerson(person, standUpPose) {
    person.sitOn = null; person.sitH = 0;
    if (!standUpPose || standUpPose === '坐下') person.pose = '站立';
    else person.pose = standUpPose;
    return person;
  }
  /* 道具被挪动 / 旋转 / 缩放 / 删除后，让坐在上面的人跟着走 */
  function refitSitters(scene, movedPropId) {
    let n = 0;
    for (const p of (scene.persons || [])) {
      if (!p.sitOn || !p.sitOn.id) continue;
      if (movedPropId && p.sitOn.id !== movedPropId) continue;
      const prop = (scene.props || []).find(o => o.id === p.sitOn.id);
      if (!prop || prop.hidden) { unseatPerson(p); continue; }
      const sw = seatWorld(prop, p.sitOn.seat || 0);
      if (!sw) { unseatPerson(p); continue; }
      p.x = sw.x; p.y = sw.y; p.rot = sw.rot; p.sitH = sw.h; n++;
    }
    return n;
  }
  /* 一键「谁站在椅子上 / 谁写了坐下就真坐下去」：AI 搭景、自动摆好之后跑一遍。
     opts.radius 吸附半径（米）；opts.onlySitPose = 只吸附姿势已写成「坐下」的人。 */
  function autoSeatAll(scene, opts = {}) {
    const radius = opts.radius == null ? 0.45 : opts.radius;
    let n = 0;
    const taken = occupiedSeats(scene);
    for (const p of (scene.persons || [])) {
      if (p.hidden || p.sitOn) continue;
      if (p.pose === '躺下') continue;
      if (Array.isArray(p.path) && p.path.length >= 2) continue;      // 有走位线的人是在走路，不要半路按坐下
      if (opts.onlySitPose && p.pose !== '坐下') continue;             // 放宽半径时只吸附「已经写了坐下」的，免得人莫名其妙坐下去
      const seats = [];
      for (const o of (scene.props || [])) {
        const ss = seatsOf(o); if (!ss) continue;
        for (let i = 0; i < ss.length; i++) {
          if (taken.has(seatKey(o.id, i))) continue;
          const sw = seatWorld(o, i); if (!sw) continue;
          if (Math.hypot(sw.x - p.x, sw.y - p.y) <= radius) seats.push(sw);
        }
      }
      if (!seats.length) continue;
      seats.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      seatPerson(p, seats[0]);
      taken.add(seatKey(seats[0].propId, seats[0].seat));
      n++;
    }
    return n;
  }

  window.MN_LAYOUT = { boxOf, mtv, hitsFor, insideRooms, findFreeSpot, resolveScene, settle, collides,
    pathObstacles, segBlocked, routePath, routeAllPaths,
    seatsOf, seatWorld, nearestSeat, seatPerson, unseatPerson, refitSitters, autoSeatAll, occupiedSeats };
})();
