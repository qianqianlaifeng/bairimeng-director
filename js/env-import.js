/* === 白日梦导演台 · 环境图导入（看图 → 3D 场景） ===
   同学手里往往只有一张场景图（AI 概念图 / 实拍 / 美术设定稿），
   这个模块把图变成导演台能直接编辑的 3D 景：房间尺寸、家具位置、人物站位、光位色温、机位视角。

   两条路：
   ① 🤖 AI 视觉反推（设置里配了支持视觉的接口）—— 复用 AI_SCENE 的 schema 提示词与 sanitize 校验器，
      所以产出和「AI 搭景」完全同构，落地走同一条 importAiData 通道。
   ② 🎨 本地起手（没接口 / 模型不支持图）—— 纯前端采样图片：画幅、地面/墙主色、亮区当光位、
      冷暖按色相判，生成一个「空但配色和光对得上」的起手景，并把原图挂成镜头参考图。

   两条路都只注入草稿，不落库 —— 看过 2D/3D 满意再点「保存到镜头 / 存入场景库」。 */
(function () {
  'use strict';

  const MAX_SIDE = 1024;    /* 发给 AI 的那版 */
  const ENV_SIDE = 1536;    /* 普通图存进场景当环境贴图 */
  const PANO_SIDE = 4096;   /* 2:1 全景图另说：整张图要裹满 360°，压到 1536 时 45° 视野只剩 ~190 真实像素，糊成一片 */

  /* ---------- 图片 → dataURL ---------- */
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('请选图片文件（png / jpg / webp）')); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('读文件失败'));
      fr.onload = () => resolve(String(fr.result));
      fr.readAsDataURL(file);
    });
  }
  /* 只要 dataURL（弹窗预览用） */
  async function fileToDataURL(file, maxSide) {
    return (await resizeDataURL(await readAsDataURL(file), maxSide || MAX_SIDE)).dataURL;
  }
  /* 连真尺寸和解码好的 Image 一起给（采样必须用原图，aspect 才对） */
  async function loadResized(file, maxSide) {
    const raw = await readAsDataURL(file);
    const nat = await measureDataURL(raw);
    /* 没显式给尺寸就按画幅自动选：2:1 认作全景图，保 4096 */
    const ia = nat.w / (nat.h || 1);
    const side = maxSide || (ia > 1.85 && ia < 2.15 ? PANO_SIDE : ENV_SIDE);
    return resizeDataURL(raw, side);
  }
  function measureDataURL(dataURL) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onerror = () => reject(new Error('图片解码失败'));
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.src = dataURL;
    });
  }
  function resizeDataURL(dataURL, maxSide) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onerror = () => reject(new Error('图片解码失败'));
      im.onload = () => {
        const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.max(16, Math.round(im.naturalWidth * k)), h = Math.max(16, Math.round(im.naturalHeight * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.drawImage(im, 0, 0, w, h);
        try { resolve({ dataURL: c.toDataURL('image/jpeg', w >= 3000 ? 0.87 : 0.82), w, h, img: im }); }
        catch (e) { reject(new Error('图片转码失败：' + e.message)); }
      };
      im.src = dataURL;
    });
  }

  /* ---------- 本地采样：主色 / 亮度分布 / 冷暖 ---------- */
  function sampleImage(img, w, h) {
    const S = 48;                                   // 采样网格足够估色和亮度
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    const buckets = new Map();
    let sumL = 0, bx = 0, by = 0, bw = 0;           // 亮度加权重心（主光方向）
    const grid = [];
    for (let y = 0; y < S; y++) {
      grid[y] = [];
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sumL += lum;
        bx += x * lum; by += y * lum; bw += lum;
        grid[y][x] = lum;
        const key = [r >> 5, g >> 5, b >> 5].join(',');
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    }
    const top = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k]) => k.split(',').map(v => Math.min(255, (v << 5) + 16)));
    const hex = a => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
    /* 上/下两半的均色：上面多半是墙，下面是地面 */
    const avg = (x0, x1, y0, y1) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * S + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      return [r / n, g / n, b / n];
    };
    const up = avg(0, S, 0, Math.round(S * 0.42)), dn = avg(0, S, Math.round(S * 0.58), S);
    /* 3×3 亮度块 → 候选光位 */
    const cells = [];
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      let s = 0, n = 0;
      for (let y = gy * (S / 3); y < (gy + 1) * (S / 3); y++) for (let x = gx * (S / 3); x < (gx + 1) * (S / 3); x++) { s += grid[y | 0][x | 0]; n++; }
      const col = avg(Math.round(gx * S / 3), Math.round((gx + 1) * S / 3), Math.round(gy * S / 3), Math.round((gy + 1) * S / 3));
      cells.push({ gx, gy, lum: s / n, rgb: col });
    }
    return {
      aspect: w / h, meanLum: sumL / (S * S),
      lightCX: bw ? bx / bw / (S - 1) : 0.5, lightCY: bw ? by / bw / (S - 1) : 0.5,
      palette: top.map(hex), wallColor: hex(up.map(Math.round)), floorColor: hex(dn.map(Math.round)),
      hotspots: cells.sort((a, b) => b.lum - a.lum).slice(0, 3),
    };
  }
  const warmOrCool = rgb => (rgb[0] > rgb[2] + 12 ? '#ffb26b' : rgb[2] > rgb[0] + 12 ? '#8fb6e8' : '#ffe9b0');

  /* ---------- ① AI 视觉反推 ---------- */
  function visionSys() {
    return [
      '你现在做「看一张场景图 → 反推出可编辑的 3D 布局」。',
      '图可能是一张概念图 / 剧照 / 美术设定稿，通常是斜俯视或平视的透视画面。',
      '你要把画面里的空间**俯视图重建**出来：房间多大、家具在哪多大、人站在哪朝哪、光从哪来什么色温、镜头在哪个方位看过去。',
      '',
      '除了系统下面这份 JSON 规范，另外硬性要求：',
      '1. 先估房间真实尺寸（按图里的门/人/桌当比例尺，一般书房 4~7m、客厅 5~8m、街道开阔），写进 rooms 的 w/d。',
      '2. 家具按图里看到的**全部**摆出来，kind 从白名单里挑最接近的；w/d/h 用真实米制（拿不准就省略，会按该种类标准尺寸）。',
      '3. 每个人物一条：x,y 是脚底在俯视图里的位置，rot 是朝向（对着谁/对着镜头），pose 用「站立/走路/坐下/躺下/招手/运动」；**坐在椅子沙发上的人 pose 写「坐下」**，本地会自动把他吸附到最近的座位面上。',
      '4. 光源按图里的亮部来：壁炉/台灯/火光写暖色（#ff8a3c~#ffd9a0）、窗/月光/荧幕写冷色（#7fa8d8~#cfe4ff），h 给真实高度（桌面灯 0.9、落地灯 1.6、吊灯 2.5）。',
      '5. ground.color 和 rooms[0].color 用图里地板的实际颜色；sun 的方向照图的来光方向写。',
      '6. camera 要还原**这张参考图自己的视角**：图是俯拍就 dist 大 + h 高，是平视就 h≈1.6；az 按"镜头在场景哪个方位"给。',
      '7. 图里看不清的东西**不要瞎补**；宁可少放几件，也别放错位置。',
      '8. 上限放宽到：道具 ≤18 件、人物 ≤6 人、光源 ≤5 个（场景图本来就比单个镜头东西多）。',
      '',
      '—— 以下是导演台的 JSON 规范 ——',
      '',
    ].join('\n');
  }
  function visionUser(hint, aspect) {
    const L = [];
    L.push('【任务】把这张场景图反推成导演台场景 JSON。');
    L.push('【图片画幅】约 ' + (Math.round(aspect * 100) / 100) + ':1（宽/高）' + (aspect > 1.15 ? '，横屏' : aspect < 0.87 ? '，竖屏' : '，方图'));
    if (hint) L.push('【同学补充说明】' + hint);
    L.push('【要求】只输出一个 JSON 对象。输出前自检一遍：家具都在房间里、彼此不重叠、人没站进家具里、机位那一侧没有墙。');
    return L.join('\n');
  }

  async function analyzeByAI(dataURL, hint, settings, aspect) {
    const { callAI } = await import('./breakdown.js');
    const A = window.AI_SCENE;
    if (!A) throw new Error('AI 搭景模块没加载（刷新页面重试）');
    const api = (settings && settings.api) || {};
    if (!api.url || !api.model) throw new Error('还没配置 AI 接口：设置 → AI 接口（要选支持图片的模型，如 gpt-4o / glm-4v / qwen-vl）');

    const messages = [
      { role: 'system', content: visionSys() + A.sysPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: visionUser(hint, aspect) },
          { type: 'image_url', image_url: { url: dataURL } },
        ],
      },
    ];
    let raw = await callAI(settings, messages, { temperature: 0.4, json: true });
    let parsed, clean;
    try {
      parsed = A.extractJson(raw);
      clean = A.sanitize(parsed, { shot: {}, project: {} });
    } catch (e) { throw new Error('看图结果解析失败：' + e.message); }

    /* 一次自动返修（和 AI 搭景同一套） */
    if (clean.fatal) {
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: '上一版不能用：' + (clean.issues.join('；') || '场景是空的') +
          '。请重新输出：至少 1 个房间 + 2 件以上家具，道具 kind 只能取系统列出的种类，坐标必须在房间里。只输出 JSON。',
      });
      raw = await callAI(settings, messages, { temperature: 0.35, json: true });
      parsed = A.extractJson(raw);
      clean = A.sanitize(parsed, { shot: {}, project: {} });
      if (clean.fatal) throw new Error('AI 两次都没给出可用场景：' + (clean.issues.join('；') || '空场景'));
    }
    return { obj: clean.obj, issues: clean.issues, box: clean.box, from: 'AI 视觉反推' };
  }

  /* ---------- ② 本地起手（不联网） ---------- */
  function localScene(smp, hint) {
    /* 画幅是「取景框」不是房间尺寸，猜不出来 —— 给一个够拍一场戏的中性景 8×6m，
       同学要改就在导演台里拖一下房间的角，或者配 AI 接口走视觉反推。 */
    const W = 8, D = 6;
    const x0 = 2, y0 = 2;
    const lights = smp.hotspots.filter(h => h.lum > Math.max(0.12, smp.meanLum * 0.85)).slice(0, 3)
      .map((h, i) => ({
        id: 'l' + (i + 1), name: '图上亮区 ' + (i + 1),
        x: Math.round((x0 + (h.gx + 0.5) / 3 * W) * 2) / 2,
        y: Math.round((y0 + (h.gy + 0.5) / 3 * D) * 2) / 2,
        color: warmOrCool(h.rgb), h: h.gy === 0 ? 2.4 : 1.2, hidden: false,
      }));
    if (!lights.length) lights.push({ id: 'l1', name: '主光', x: x0 + W / 2, y: y0 + D / 2, color: '#ffe9b0', h: 2.5, hidden: false });
    const obj = {
      scene: {
        title: (hint ? String(hint).slice(0, 12) : '环境图起手景'),
        rooms: [{ id: 'r1', name: '环境图房间', x: x0, y: y0, w: W, d: D, h: 3.2, color: smp.floorColor }],
        walls: [
          { id: 'w1', name: '背景墙', x1: x0, y1: y0, x2: x0 + W, y2: y0, h: 3.2, holes: [] },
          { id: 'w2', name: '左侧墙', x1: x0, y1: y0, x2: x0, y2: y0 + D, h: 3.2, holes: [] },
        ],
        props: [],
        persons: [],
        lights,
        ground: { color: smp.floorColor, grid: true },
      },
      sun: {
        on: true,
        dir: Math.round(((smp.lightCX - 0.5) * 180 + 360) % 360),
        alt: Math.round(20 + (1 - Math.min(1, smp.meanLum * 2)) * 40),
      },
      camera: { az: 25, dist: Math.max(6, Math.round(W * 1.25)), h: 1.8, fov: 50 },
    };
    return {
      obj, from: '本地起手（没联网）',
      issues: ['只做了房间 / 配色 / 光位：' + W + '×' + D + 'm、地面 ' + smp.floorColor + '、墙 ' + smp.wallColor + '、' + lights.length + ' 个光'],
      palette: smp.palette,
      note: '家具和人物请在导演台里点两下补上（右侧物件库 → 点画布落地），或配一个支持视觉的 AI 接口走「AI 反推」。',
    };
  }

  /* ---------- 主流程：文件 → 结果 ---------- */
  async function fromFile(file, opts = {}) {
    /* 环境图要当贴图铺进 3D，压太狠一放大就糊；2:1 全景会自动保 4096。AI 那张另出一版小的省 token */
    const big = await loadResized(file, opts.maxSide);
    const smp = sampleImage(big.img, big.w, big.h);       // 采样用原图，aspect 才是真画幅
    const mode = opts.mode || 'auto';
    const api = (opts.settings && opts.settings.api) || {};
    let res;
    if (mode === 'local') {
      res = localScene(smp, opts.hint);
    } else if (!api.url || !api.model) {
      if (mode === 'ai') throw new Error('还没配置 AI 接口：设置 → AI 接口（要选支持图片的模型）');
      res = localScene(smp, opts.hint);
      res.issues.unshift('没配 AI 接口，改走本地起手景');
    } else {
      try {
        const aiURL = Math.max(big.w, big.h) > 1030 ? (await resizeDataURL(big.dataURL, 1024)).dataURL : big.dataURL;
        res = await analyzeByAI(aiURL, opts.hint, opts.settings, big.w / big.h);
      } catch (e) {
        if (mode === 'ai') throw e;
        res = localScene(smp, opts.hint);
        res.issues.unshift('AI 反推没成功（' + String(e.message).slice(0, 70) + '），改用本地起手景');
      }
    }
    res.dataURL = big.dataURL;
    res.imgW = big.w; res.imgH = big.h;
    res.samples = smp;
    res.env = envFromResult(res);
    /* 真 360 全景本身就是一个房间：本地猜的那两面墙只会挡在照片前面 */
    if (res.env.mode === 'sphere' && String(res.from).indexOf('本地') === 0 && (res.obj.scene.walls || []).length) {
      res.obj.scene.walls = [];
      res.issues.push('原图是 360 全景，不再叠本地猜的墙 —— 照片本身就是房间，要加墙在导演台里画');
    }
    return res;
  }

  /* ---------- 把原图变成 3D 环境 ----------
     2:1 画幅 = 等距柱状全景图 → 环境球，转视角就是在原地转头；
     其它画幅（概念图 / 剧照 / 实拍）→ 背景板立在景后面，转视角能看到它是"立着的"。 */
  function envFromResult(res) {
    const w = res.imgW || 16, h = res.imgH || 9, ia = w / (h || 1);
    const r = (res.obj.scene.rooms || [])[0] || { x: 2, y: 2, w: 8, d: 6 };
    const cx = r.x + r.w / 2, cz = r.y + r.d / 2;
    const pano = ia > 1.85 && ia < 2.15;
    const bw = Math.round(Math.max(r.w, r.d) * 2.2 * 10) / 10;
    return {
      on: true,
      mode: pano ? 'sphere' : 'board',
      src: res.dataURL,
      yaw: 0, bright: 1, vSpread: 0.62,
      bx: Math.round(cx * 10) / 10, bz: Math.round((r.y - bw * 0.42) * 10) / 10,
      by: Math.round(bw / ia / 2 * 10) / 10, bw: bw, brot: 0, opacity: 1,
    };
  }

  /* ---------- 落到导演台（只注入草稿，不落库） ---------- */
  function applyToDirector(res) {
    const A = window.AI_SCENE;
    const data = { scene: res.obj.scene, sun: res.obj.sun, camera: res.obj.camera };
    const msg = window.miaoningAPI.importAiData(data, 'model').msg;   // 'model' 只换场景，保留机位册
    /* 环境图本体（全景球 / 背景板）跟着景一起装上 —— 这一步才是"能转着看的 3D 场景" */
    try {
      if (res.env && res.env.src && window.MN && window.MN.state) {
        window.MN.state.scene.env = res.env;
        if (window.MN.state.view && window.MN.state.view.mode !== '3d' && typeof window.setMode === 'function') window.setMode('3d');
      }
    } catch (e) { console.warn('[环境图] 环境贴图应用失败', e); }
    /* 机位：按参考图视角推进镜头册并跳过去 */
    try {
      const cam = A && A.toDirectorCam ? A.toDirectorCam(res.obj.camera, res.box || { cx: 5, cy: 4 }) : null;
      if (cam) {
        window.MN.state.directorShots = (window.MN.state.directorShots || []).filter(s => s && s.name !== '环境图机位');
        window.MN.state.directorShots.push({ name: '环境图机位', cam });
        if (window.MN3D && window.MN3D.setCamera) {
          if (window.MN.state.view && window.MN.state.view.mode !== '3d' && window.setMode) window.setMode('3d');
          window.MN3D.setCamera(cam);
        }
      }
    } catch (e) { console.warn('[环境图] 机位应用失败', e); }
    if (window.renderAll) window.renderAll();
    if (window.saveSoon) window.saveSoon();
    return msg;
  }

  window.ENV_IMPORT = { fileToDataURL, loadResized, resizeDataURL, sampleImage, analyzeByAI, localScene, fromFile, applyToDirector, envFromResult, visionSys, visionUser, warmOrCool };
})();
