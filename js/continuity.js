/* ============================================================
 * 连戏一致性检查（Continuity Check）
 * 逐对比较相邻镜头：越轴 / 人物跳位 / 人物转向 / 光线突变 / 换景
 * 纯函数：analyzeContinuity(project) → { issues, stats }
 * ============================================================ */

const DEG = 180 / Math.PI;
const wrap360 = a => { a = a % 360; return a < 0 ? a + 360 : a; };
const angDiff = (a, b) => { const d = Math.abs(wrap360(a) - wrap360(b)); return d > 180 ? 360 - d : d; };

/* 从镜头的场景数据里提取可比对的信息（兼容两种存储：导演台原生快照 / 白模场景） */
export function shotSceneInfo(shot) {
  const mn = shot && shot.mnState && shot.mnState.scene;
  if (mn) {
    const shots = (shot.mnState.directorShots || []);
    const last = shots.length ? shots[shots.length - 1] : null;
    const cam = last && last.cam
      ? { az: wrap360((last.cam.theta || 0) * DEG), h: +last.cam.ty, dist: +last.cam.r, src: 'orbit' }
      : null;
    return {
      has: true,
      kind: 'mn',
      persons: (mn.persons || []).filter(p => !p.hidden).map(p => ({ name: p.name || '', x: +p.x || 0, z: +p.y || 0, rot: wrap360(+p.rot || 0) })),
      light: shot.mnState.sun ? { dir: wrap360(+shot.mnState.sun.dir || 0), alt: +shot.mnState.sun.alt || 0 } : null,
      cam,
    };
  }
  const sc = shot && shot.scene;
  if (sc && Array.isArray(sc.objects)) {
    const actors = sc.objects.filter(o => o.type === 'actor' && !o.hidden);
    return {
      has: true,
      kind: 'white',
      persons: actors.map(o => ({ name: o.name || '', x: +o.x || 0, z: +o.z || 0, rot: wrap360((+o.rot || 0)) })),
      light: sc.light ? { dir: wrap360(+sc.light.az || 0), alt: +sc.light.el || 0 } : null,
      cam: sc.cam ? { az: wrap360(+sc.cam.az || 0), h: +sc.cam.h || 1.8, dist: +sc.cam.dist || 7, src: 'scene' } : null,
    };
  }
  return { has: false, kind: 'none', persons: [], light: null, cam: null };
}

/* 相邻两镜的对比 */
function comparePair(a, b, i) {
  const issues = [];
  const A = shotSceneInfo(a), B = shotSceneInfo(b);
  if (!A.has && !B.has) return issues;
  const push = (level, kind, title, detail, fix) => issues.push({ level, kind, idx: i + 1, shotId: b.id, prevId: a.id, title, detail, fix });

  /* 1. 越轴：相邻两镜机位方位角差太大（超过 120°）却没换景 */
  if (A.cam && B.cam) {
    const d = angDiff(A.cam.az, B.cam.az);
    if (d > 120) push('err', 'axis', `第 ${i + 1}→${i + 2} 镜疑似越轴`,
      `机位方位角从 ${A.cam.az.toFixed(0)}° 跳到 ${B.cam.az.toFixed(0)}°（差 ${d.toFixed(0)}°），观众会瞬间失去方位感`, 'cam');
  }

  /* 2. 换景提示（不是错误，只是提醒） */
  if (a.sceneId && b.sceneId && a.sceneId !== b.sceneId) {
    push('info', 'scene', `第 ${i + 1}→${i + 2} 镜换了场景`, '两镜引用了场景库里不同的景；若本意是同场戏，建议套用同一个景', 'all');
  }

  /* 3. 人物数量 / 位置 / 朝向 */
  if (A.persons.length && B.persons.length) {
    const nDiff = B.persons.length - A.persons.length;
    if (Math.abs(nDiff) >= 1) push('info', 'count', `第 ${i + 1}→${i + 2} 镜人物数变化`,
      `${A.persons.length} 人 → ${B.persons.length} 人${nDiff < 0 ? '（有人消失，注意是否穿帮）' : '（有人入画）'}`, 'persons');

    const n = Math.min(A.persons.length, B.persons.length);
    let maxMove = 0, maxTurn = 0, worstName = '';
    for (let k = 0; k < n; k++) {
      const p1 = A.persons[k], p2 = B.persons[k];
      const d = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      const t = angDiff(p1.rot, p2.rot);
      if (d > maxMove) { maxMove = d; worstName = p1.name || p2.name || `人物 ${k + 1}`; }
      if (t > maxTurn) maxTurn = t;
    }
    if (maxMove > 2.0) push('warn', 'pos', `第 ${i + 1}→${i + 2} 镜人物位置跳变`,
      `「${worstName}」位移 ${maxMove.toFixed(1)}m —— 同场戏里人会突然"瞬移"，检查是否忘了摆位`, 'persons');
    if (maxTurn > 100) push('warn', 'turn', `第 ${i + 1}→${i + 2} 镜人物朝向跳变`,
      `最大转向 ${maxTurn.toFixed(0)}° —— 正反打时注意保持轴线一致`, 'persons');
  }

  /* 4. 光线突变 */
  if (A.light && B.light) {
    const dd = angDiff(A.light.dir, B.light.dir), da = Math.abs(A.light.alt - B.light.alt);
    if (dd > 40 || da > 25) push('warn', 'light', `第 ${i + 1}→${i + 2} 镜光线突变`,
      `太阳方位差 ${dd.toFixed(0)}°、高度差 ${da.toFixed(0)}° —— 同场戏光比不一致会明显跳戏`, 'light');
  }
  return issues;
}

export function analyzeContinuity(p) {
  const shots = (p && p.shots) || [];
  const issues = [];
  for (let i = 0; i < shots.length - 1; i++) issues.push(...comparePair(shots[i], shots[i + 1], i));
  const stats = {
    shots: shots.length,
    pairs: Math.max(0, shots.length - 1),
    err: issues.filter(x => x.level === 'err').length,
    warn: issues.filter(x => x.level === 'warn').length,
    info: issues.filter(x => x.level === 'info').length,
    withScene: shots.filter(s => shotSceneInfo(s).has).length,
  };
  return { issues, stats };
}
