/* === 白日梦导演台 · AI 搭景（按镜头自动生成场景 + 机位 + 走位） ===
   走「设置 → AI 接口」里那套 OpenAI 兼容接口，产出与 mn-rules.js 同构的 JSON，
   交给导演台自己的 importAiData 落地（校验/夹取在那边已经做了一层，本文件再收紧一层）。

   逐镜确认：这里只把草稿注入导演台，不落库、不保存——
   用户在场景搭建里看过 2D/3D，满意再点「💾 保存到镜头」。

   坐标：单位米，x 向右 y 向下；房间/造物 x,y 左上角，人物 x,y 脚底中心，墙是两端点。
   朝向 rot：0 朝右、90 朝下、180 朝左、270 朝上（与 mn-props.js 一致）。 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const cl = (v, a, b) => Math.min(b, Math.max(a, isFinite(+v) ? +v : a));
  const arr = x => (Array.isArray(x) ? x.filter(Boolean) : (x ? [x] : []));

  const POSES = ['站立', '走路', '坐下', '招手', '躺下', '运动'];

  function kindCatalog() {
    const K = window.MN_PROP_KINDS || {}, order = window.MN_PROP_ORDER || [];
    return order.map(k => k + '(' + ((K[k] || {}).name || k) + ')').join('、');
  }

  /* ---------- 提示词 ---------- */
  function sysPrompt() {
    return [
      '你是「白日梦导演台」的场景搭建助手：根据一个镜头的信息，产出导演台能直接导入的场景 JSON。',
      '只输出一个 JSON 对象，不要解释、不要注释、不要尾逗号。',
      '',
      '输出结构：',
      '{',
      '  "scene": {',
      '    "title": "≤14字的场景名",',
      '    "rooms": [{"id":"r1","name":"客厅","x":2,"y":2,"w":5,"d":4,"h":4,"color":""}],',
      '    "walls": [{"id":"w1","name":"墙","x1":2,"y1":2,"x2":7,"y2":2,"h":2.6,"holes":[{"t":0.5,"w":1}]}],',
      '    "props": [{"id":"p1","name":"沙发","kind":"sofa","x":2,"y":5,"w":2,"d":0.9,"h":0.8,"rot":0,"color":""}],',
      '    "persons": [{"id":"a1","name":"女主","x":4.5,"y":4,"rot":180,"pose":"站立","face":1,"faceDir":0,"jump":0,',
      '                 "path":[{"x":4.5,"y":4},{"x":4.5,"y":5.5}],"speed":1.2}],',
      '    "lights": [{"id":"l1","name":"主光","x":4.5,"y":3,"color":"#ffe9b0"}],',
      '    "ground": {"color":"#ffffff","grid":true}',
      '  },',
      '  "sun": {"on":true,"dir":300,"alt":53},',
      '  "camera": {"az":25,"dist":7,"h":1.8,"fov":50}',
      '}',
      '',
      '【坐标】米制；x 向右、y 向下；网格 0.5（坐标取 0.5 的整数倍）。房间/造物 x,y 是左上角；人物 x,y 是脚底中心；墙写两端点 x1,y1 → x2,y2。',
      '【朝向】rot：0=朝画面右、90=朝画面下、180=朝画面左、270=朝画面下上。',
      '【道具】kind 只能取以下之一：' + kindCatalog() + '。给 kind 时 w/d/h 可以省略（会按该种类的真实尺寸）。',
      '【人物】pose 只能取：' + POSES.join(' / ') + '。',
      '【走位】path 是 2~6 个途经点，必须落在该人物所在房间内，最后一点是走到的位置；有 path 时 pose 写「走路」。没走位就不要写 path。',
      '【机位】camera.az 是机位绕场景中心的方位角：0=机位在场景下方（y 大的一侧）朝上看，90=机位在右侧（x 大的一侧）朝左看，180=机位在场景上方朝下看，270=机位在左侧朝右看；dist 距离 3~14；h 机位高度 0.5~5；fov 35~65。',
      '',
      '【硬性要求】',
      '1. 先给 1 个房间铺地；墙只围「镜头里需要看到」的 2~3 面，**机位所在的那一侧不要砌墙**（会拍到墙背面、整幅画面被糊住）。',
      '2. 家具必须落在房间里、离墙 ≥0.1 米、彼此不重叠；门/窗要贴在墙上（门洞写进墙的 holes）。',
      '3. 人物站在房间里、朝向对着镜头或对话对象，不许穿墙、不许站在家具里。',
      '4. 每镜只搭镜头里看得见的东西：道具 ≤12 件、人物 ≤3 人、光源 ≤2 个。',
      '5. 同场次的相邻镜头会沿用同一个空间，布局要稳定；只有景别/机位变化时，房间与家具不要推倒重来。',
    ].join('\n');
  }

  function userPrompt(ctx) {
    const shot = ctx.shot || {}, p = ctx.project || {};
    const L = [];
    L.push('【项目】' + (p.name || '未命名项目') + ' · 画幅 ' + (p.aspect || '16:9'));
    if (ctx.sceneKey) L.push('【场次】' + ctx.sceneKey);
    L.push('【本镜】第 ' + (ctx.index != null ? ctx.index + 1 : 1) + ' 镜 / ' + (shot.duration || 3) + ' 秒 / 景别 ' + (ctx.sizeName || '中景') + ' / 运镜 ' + (ctx.moveName || '固定') + ' / 角度 ' + (ctx.angleName || '平视'));
    if (shot.dialogue) L.push('【台词】' + shot.dialogue);
    L.push('【画面】' + (shot.desc || '（无描述）'));
    if (ctx.prevDesc) L.push('【上一镜】' + ctx.prevDesc);
    if (ctx.nextDesc) L.push('【下一镜】' + ctx.nextDesc);
    if (ctx.prevScene) L.push('【上一镜搭好的场景】' + ctx.prevScene + '（同场次请沿用这套空间与家具位置，只调整机位和本镜需要的少量道具）');
    if (ctx.libraryNames && ctx.libraryNames.length) L.push('【本项目已有场景】' + ctx.libraryNames.join('、') + '（同场次请保持同样布局）');
    L.push('');
    L.push('按系统要求输出 JSON。');
    return L.join('\n');
  }

  /* ---------- 解析 ---------- */
  function extractJson(raw) {
    const s = String(raw == null ? '' : raw);
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1] : s;
    const i = body.indexOf('{'), j = body.lastIndexOf('}');
    if (i < 0 || j <= i) throw new Error('AI 没有返回 JSON 对象');
    const txt = body.slice(i, j + 1).replace(/,\s*([}\]])/g, '$1');   // 容忍尾逗号
    return JSON.parse(txt);
  }

  /* ---------- 场景包围盒（房间优先） ---------- */
  function boxOf(sc) {
    const rs = arr(sc.rooms).filter(r => isFinite(+r.x) && isFinite(+r.w));
    const src = rs.length ? rs.map(r => [+r.x, +r.y, +r.x + +r.w, +r.y + +r.d]) : arr(sc.props).filter(p => isFinite(+p.x)).map(p => [+p.x, +p.y, +p.x + (+p.w || 1), +p.y + (+p.d || 1)]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [a, b, c, d] of src) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 6, y1: 5, cx: 3, cy: 2.5 };
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  const inBox = (x, y, b, m) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m;

  /* ---------- 校验 / 夹取 ----------
     返回 {obj, issues[], fatal}；fatal 表示这次输出根本用不了（需要重问 AI） */
  function sanitize(data, ctx) {
    const issues = [];
    let obj = (data && typeof data === 'object') ? JSON.parse(JSON.stringify(data)) : {};
    if (!obj.scene || typeof obj.scene !== 'object') {
      if (obj.rooms || obj.props || obj.walls || obj.persons) { obj = { scene: obj, sun: obj.sun, camera: obj.camera }; issues.push('模型把场景字段放在顶层，已自动包一层'); }
      else obj.scene = {};
    }
    const sc = obj.scene;
    const K = window.MN_PROP_KINDS || {};

    /* 房间：只留 3 个以内，尺寸/坐标夹到合理范围 */
    sc.rooms = arr(sc.rooms).filter(r => r && isFinite(+r.x) && isFinite(+r.y)).slice(0, 3).map((r, i) => ({
      id: r.id || 'r' + (i + 1), name: String(r.name || '房间 ' + (i + 1)).slice(0, 12),
      x: cl(r.x, 0, 60), y: cl(r.y, 0, 60),
      w: cl(r.w, 1.5, 20), d: cl(r.d, 1.5, 20), h: cl(r.h || 4, 2.4, 8), color: r.color || '',
    }));
    if (!sc.rooms.length) {
      sc.rooms.push({ id: 'r1', name: '场景', x: 0, y: 0, w: 6, d: 5, h: 4, color: '' });
      issues.push('AI 没给房间，已补一个 6×5 的默认房间');
    }
    let box = boxOf(sc);

    /* 墙：端点夹进房间外扩 1m，门洞保留 */
    const wallN = arr(sc.walls).length;
    sc.walls = arr(sc.walls).filter(w => w && isFinite(+w.x1) && isFinite(+w.x2)).slice(0, 10).map((w, i) => ({
      id: w.id || 'w' + (i + 1), name: String(w.name || '墙 ' + (i + 1)).slice(0, 12),
      x1: cl(w.x1, box.x0 - 1, box.x1 + 1), y1: cl(w.y1, box.y0 - 1, box.y1 + 1),
      x2: cl(w.x2, box.x0 - 1, box.x1 + 1), y2: cl(w.y2, box.y0 - 1, box.y1 + 1),
      h: cl(w.h || 2.6, 1.2, 4),
      holes: arr(w.holes).map(hp => ({ t: cl(hp.t, 0.02, 0.98), w: cl(hp.w, 0.4, 4) })),
    }));
    if (wallN > 10) issues.push('墙超过 10 面，已截断');

    /* 道具：kind 必须是道具库里的种类；落在房间外 >1.5m 的直接丢掉 */
    const badKinds = [];
    sc.props = arr(sc.props).filter(p => p && isFinite(+p.x)).map((p, i) => {
      let kind = p.kind && K[p.kind] ? p.kind : null;
      if (!kind) {
        const guess = window.MN_kindOf ? window.MN_kindOf(p) : 'block';
        kind = guess;
        if (p.kind) badKinds.push(String(p.kind));
      }
      return { p, kind, i };
    }).filter(({ p }) => inBox(+p.x + (+p.w || 1) / 2, +p.y + (+p.d || 1) / 2, box, 1.5))
      .slice(0, 14)
      .map(({ p, kind, i }) => {
        const kd = K[kind] || {};
        const w = cl(p.w || kd.w || 1, 0.15, 6), d = cl(p.d || kd.d || 1, 0.15, 6), h = cl(p.h || kd.h || 1, 0.05, 4);
        return {
          id: p.id || 'p' + (i + 1), name: String(p.name || kd.name || kind).slice(0, 12), kind,
          x: cl(p.x, box.x0 - 0.5, box.x1), y: cl(p.y, box.y0 - 0.5, box.y1),
          w, d, h, color: p.color || '', rot: ((Math.round((+p.rot || 0) / 15) * 15) % 360 + 360) % 360, hidden: false,
        };
      });
    if (badKinds.length) issues.push('不认识的 kind 已按名字/比例归到道具库：' + badKinds.slice(0, 4).join('、'));

    /* 人物：夹进房间；走位点也夹进房间，点数不够就丢掉整条 path */
    sc.persons = arr(sc.persons).filter(p => p && isFinite(+p.x)).slice(0, 4).map((p, i) => {
      const path = arr(p.path).filter(q => q && isFinite(+q.x) && isFinite(+q.y))
        .slice(0, 6)
        .map(q => ({ x: cl(q.x, box.x0 + 0.2, box.x1 - 0.2), y: cl(q.y, box.y0 + 0.2, box.y1 - 0.2) }));
      return {
        id: p.id || 'a' + (i + 1), name: String(p.name || '人物 ' + (i + 1)).slice(0, 12),
        x: cl(p.x, box.x0 + 0.2, box.x1 - 0.2), y: cl(p.y, box.y0 + 0.2, box.y1 - 0.2),
        rot: ((Math.round((+p.rot || 0) / 15) * 15) % 360 + 360) % 360,
        color: p.color || '#2e7cf6',
        pose: path.length >= 2 ? '走路' : (POSES.indexOf(p.pose) >= 0 ? p.pose : '站立'),
        face: cl(p.face || 1, 0.5, 2), faceDir: cl(p.faceDir || 0, 0, 360), jump: cl(p.jump || 0, 0, 3),
        ...(path.length >= 2 ? { path, speed: cl(p.speed || 1.2, 0.3, 3) } : {}),
        hidden: false,
      };
    });

    /* 光源 */
    sc.lights = arr(sc.lights).filter(l => l && isFinite(+l.x)).slice(0, 3).map((l, i) => ({
      id: l.id || 'l' + (i + 1), name: String(l.name || '光源 ' + (i + 1)).slice(0, 12),
      x: cl(l.x, box.x0, box.x1), y: cl(l.y, box.y0, box.y1), color: l.color || '#ffe9b0', hidden: false,
    }));
    if (!sc.ground) sc.ground = { color: '#ffffff', grid: true };

    /* 机位 */
    const cam = (obj.camera && typeof obj.camera === 'object') ? obj.camera : {};
    obj.camera = {
      az: ((+cam.az || 25) % 360 + 360) % 360,
      dist: cl(cam.dist || 7, 3, 14),
      h: cl(cam.h || 1.8, 0.5, 5),
      fov: cl(cam.fov || 50, 35, 65),
    };
    /* 机位被自己搭的墙挡住 → 转到没有墙的一面（否则 3D 里就是一面大白墙） */
    if (blockedBy(sc, box, obj.camera)) {
      const before = obj.camera.az;
      for (const d of [180, 90, -90, 45, -45, 135, -135]) {
        const t = Object.assign({}, obj.camera, { az: ((before + d) % 360 + 360) % 360 });
        if (!blockedBy(sc, box, t)) { obj.camera = t; issues.push('机位 az ' + Math.round(before) + '° 被墙挡住，已转到 ' + Math.round(t.az) + '°'); break; }
      }
    }
    if (!obj.sun || typeof obj.sun !== 'object') obj.sun = { on: true, dir: 300, alt: 53 };

    const fatal = !sc.props.length && !sc.persons.length && !sc.walls.length;
    return { obj, issues, fatal, box };
  }

  /* 机位到场景中心的连线是否被墙挡住（墙比机位高才算挡） */
  function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    const d1 = o(ax, ay, bx, by, cx, cy), d2 = o(ax, ay, bx, by, dx, dy);
    const d3 = o(cx, cy, dx, dy, ax, ay), d4 = o(cx, cy, dx, dy, bx, by);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function blockedBy(sc, box, cam) {
    const a = cam.az * DEG, dist = Math.max(1, cam.dist);
    const ex = box.cx + Math.sin(a) * dist, ey = box.cy + Math.cos(a) * dist;
    for (const w of (sc.walls || [])) {
      if ((w.h || 2.6) <= cam.h) continue;
      if (segCross(ex, ey, box.cx, box.cy, w.x1, w.y1, w.x2, w.y2)) return true;
    }
    return false;
  }

  /* 白模自由机位（az/dist/h，绕场景中心）→ 导演台轨道相机（theta/phi/r/目标点）。
     builder.mnToShotScene 的反向换算是 az = 90° - θ、dist = r·sinφ、h = ty + r·cosφ，这里严格互逆。 */
  function toDirectorCam(cam, box) {
    const h = cl(cam.h, 0.5, 5);
    const ty = Math.min(1.6, Math.max(1.0, h));          // 轨道中心高度：低机位时允许 φ>90°
    const vert = h - ty;
    const r = Math.hypot(cam.dist, vert);
    const phi = Math.atan2(cam.dist, vert);              // cosφ = vert/r
    const a = cam.az * DEG;
    const theta = Math.atan2(Math.cos(a), Math.sin(a));
    return { theta, phi: Math.min(2.95, Math.max(0.05, phi)), r: Math.max(4, Math.min(60, r)), tx: box.cx, ty, tz: box.cy };
  }

  /* ---------- 主流程 ---------- */
  async function build(ctx) {
    const settings = ctx.settings || {};
    const api = settings.api || {};
    if (!api.url || !api.model) throw new Error('还没配置 AI 接口：设置 → AI 接口（地址 + 模型名 + Key）');
    const { callAI } = await import('./breakdown.js');
    const sys = sysPrompt();
    const user = userPrompt(ctx);
    const messages = [{ role: 'system', content: sys }, { role: 'user', content: user }];

    let raw = await callAI(settings, messages, { temperature: 0.55, json: true });
    let parsed, clean;
    try {
      parsed = extractJson(raw);
      clean = sanitize(parsed, ctx);
    } catch (e) {
      throw new Error('AI 返回解析失败：' + e.message);
    }
    /* 一次自动返修：把问题喂回去让它补 */
    if (clean.fatal) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: '上一版不能用：' + (clean.issues.join('；') || '场景是空的') +
          '。请重新输出：必须至少有 1 个房间、2 件以上家具或至少 1 个人物，且道具 kind 只能取系统列出的种类。只输出 JSON。',
      });
      raw = await callAI(settings, messages, { temperature: 0.4, json: true });
      try {
        parsed = extractJson(raw);
        clean = sanitize(parsed, ctx);
      } catch (e) {
        throw new Error('AI 返修后仍无法解析：' + e.message);
      }
      if (clean.fatal) throw new Error('AI 两次都没搭出可用场景，换个模型或手搭一下');
      clean.issues.push('第一版不可用，已自动返修一次');
    }

    /* 落地：交给导演台自己的导入器（mode='model' 保留机位/故事板，只换场景） */
    if (typeof window.miaoningApplyAiScene !== 'function') throw new Error('导演台还没准备好，稍后再试');
    const summary = window.miaoningApplyAiScene(clean.obj);
    if (window.AI_SCENE) window.AI_SCENE._last = { raw, issues: clean.issues.slice(), camera: clean.obj.camera, summary };

    /* 机位：写成一条「机位」进镜头册，3D 视图直接跳过去 */
    const cam = toDirectorCam(clean.obj.camera, clean.box);
    try {
      window.MN.state.directorShots = (window.MN.state.directorShots || []).filter(s => s && s.name !== 'AI 机位');
      window.MN.state.directorShots.push({ name: 'AI 机位', cam });
      if (window.MN3D && window.MN3D.setCamera) window.MN3D.setCamera(cam);
      if (window.paint) window.paint();
    } catch (e) { console.warn('[AI 搭景] 机位应用失败', e); }

    return { summary, issues: clean.issues, camera: clean.obj.camera, obj: clean.obj, raw };
  }

  window.AI_SCENE = { build, sanitize, toDirectorCam, sysPrompt, userPrompt, extractJson, boxOf, kindCatalog, _last: null };
})();
