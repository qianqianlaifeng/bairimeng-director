/* === 导演台 · 道具库扩展包 ==========================================
   独立文件，只在 mn-props.js 之后加载，往 window.MN_PROP_KINDS / ORDER / BY_NAME
   里追加道具，不改动原文件一行。2D 俯视 / 3D 导演台 / 白模预演三端自动共用。

   坐标约定（与 mn-props.js 完全一致）：
     P(x, y, z, w, h, d, c) —— x/z 相对道具中心（米），y = 离地底面高度，
     w/h/d = 尺寸，c = 颜色角色（main / dark / light / accent）。
     top(ctx, w, d, st) 的局部坐标：中心为原点，x 沿宽，y 沿深，1 单位 = 1 米。
   ==================================================================== */
(function () {
  'use strict';
  const K = window.MN_PROP_KINDS, ORDER = window.MN_PROP_ORDER, BY_NAME = window.MN_PROP_BY_NAME;
  if (!K || !ORDER) return;

  const P = (x, y, z, w, h, d, c) => ({ x, y, z, w, h, d, c });
  const R = (ctx, x, y, w, h) => { ctx.fillRect(x, y, w, h); };
  const L = (ctx, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const CIR = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const CIRO = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
  const slab = (ctx, w, d, st) => { ctx.fillStyle = st.fill; R(ctx, -w / 2, -d / 2, w, d); };
  const det = (ctx, st) => { ctx.fillStyle = st.dark; ctx.strokeStyle = st.dark; ctx.lineWidth = 0.035; };
  const plainTop = (ctx, w, d, st) => { slab(ctx, w, d, st); };
  const lineTop = (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, 0, -d / 2, 0, d / 2); };
  const ringTop = (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIRO(ctx, 0, 0, Math.min(w, d) * 0.34); };

  /* 原有 23 类的分类归属（物件库面板按这个分组） */
  const LEGACY_CAT = {
    table: '家具', desk: '家具', coffee: '家具', chair: '家具', officechair: '家具',
    sofa: '家具', bed: '家具', bench: '家具', cabinet: '收纳', shelf: '收纳',
    box: '收纳', tv: '电器', fridge: '厨卫', washer: '厨卫', lamp: '灯饰',
    plant: '装饰', tree: '户外交通', pillar: '建筑', door: '建筑', window: '建筑',
    stairs: '建筑', rug: '装饰', counter: '办公商业', wall: '建筑', block: '其他',
  };
  const CATS = Object.assign({}, LEGACY_CAT);
  const CAT_ORDER = ['家具', '厨卫', '电器', '灯饰', '装饰', '建筑', '办公商业', '户外交通', '片场器材', '其他'];

  function add(key, o) {
    if (K[key]) return;
    K[key] = {
      name: o.name, w: o.w, d: o.d, h: o.h,
      color: o.color, accent: o.accent || '#8d8f94', cat: o.cat || '其他',
      parts: () => o.parts.map(x => ({ ...x })),
      top: o.top || plainTop,
      ...(o.seats ? { seats: o.seats } : {}),
    };
    ORDER.push(key);
    BY_NAME[o.name] = key;
    (o.alias || []).forEach(a => { BY_NAME[a] = key; });
    CATS[key] = o.cat || '其他';
  }

  /* ---------------- 家具 / 坐卧 ---------------- */
  add('armchair', {
    name: '扶手椅', w: 0.9, d: 0.9, h: 0.88, cat: '家具', color: '#a98d80', accent: '#7b655b',
    alias: ['单人沙发', '沙发椅'],
    seats: [{ x: 0, y: 0.06, h: 0.45, face: 90 }],
    parts: [
      P(0, 0.08, 0, 0.82, 0.16, 0.82, 'dark'), P(0, 0.24, 0.04, 0.74, 0.16, 0.70, 'light'),
      P(0, 0.40, -0.36, 0.86, 0.48, 0.16, 'main'),
      P(-0.39, 0.34, 0.02, 0.12, 0.28, 0.84, 'main'), P(0.39, 0.34, 0.02, 0.12, 0.28, 0.84, 'main'),
    ],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 2, -d / 2, w, 0.18); },
  });
  add('stool', {
    name: '圆凳', w: 0.42, d: 0.42, h: 0.46, cat: '家具', color: '#c9a06a', accent: '#8d8f94',
    alias: ['凳子', '板凳'],
    seats: [{ x: 0, y: 0, h: 0.46, face: 90 }],
    parts: [P(0, 0.42, 0, 0.42, 0.05, 0.42, 'main'), P(0, 0, 0, 0.30, 0.42, 0.30, 'dark')],
    top: ringTop,
  });
  add('barstool', {
    name: '吧凳', w: 0.42, d: 0.42, h: 0.76, cat: '办公商业', color: '#8d8f94', accent: '#5d6068',
    alias: ['高脚凳'],
    seats: [{ x: 0, y: 0, h: 0.76, face: 90 }],
    parts: [P(0, 0.72, 0, 0.42, 0.06, 0.42, 'main'), P(0, 0, 0, 0.12, 0.72, 0.12, 'accent'), P(0, 0.24, 0, 0.34, 0.04, 0.34, 'dark')],
    top: ringTop,
  });
  add('dining', {
    name: '餐桌', w: 1.8, d: 0.9, h: 0.76, cat: '家具', color: '#caa274', accent: '#8d8f94',
    alias: ['长桌', '饭桌'],
    parts: [P(0, 0.70, 0, 1.80, 0.06, 0.90, 'main'),
      P(-0.78, 0, -0.36, 0.10, 0.70, 0.10, 'dark'), P(0.78, 0, -0.36, 0.10, 0.70, 0.10, 'dark'),
      P(-0.78, 0, 0.36, 0.10, 0.70, 0.10, 'dark'), P(0.78, 0, 0.36, 0.10, 0.70, 0.10, 'dark')],
    top: lineTop,
  });
  add('roundtable', {
    name: '圆桌', w: 1.1, d: 1.1, h: 0.75, cat: '家具', color: '#d9b382', accent: '#8d8f94',
    parts: [P(0, 0.70, 0, 1.05, 0.05, 1.05, 'main'), P(0, 0, 0, 0.18, 0.70, 0.18, 'dark'), P(0, 0.66, 0, 0.60, 0.04, 0.60, 'accent')],
    top: ringTop,
  });
  add('nightstand', {
    name: '床头柜', w: 0.5, d: 0.42, h: 0.55, cat: '家具', color: '#c9a06a', accent: '#8d8f94',
    alias: ['床边柜'],
    parts: [P(0, 0, 0, 0.50, 0.55, 0.42, 'main'), P(0, 0.25, 0.22, 0.42, 0.03, 0.02, 'dark'), P(0, 0.40, 0.22, 0.42, 0.03, 0.02, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, 0, w / 2, 0); },
  });
  add('dresser', {
    name: '梳妆台', w: 1.2, d: 0.5, h: 1.5, cat: '家具', color: '#dcc0a0', accent: '#8d8f94',
    parts: [P(0, 0, 0, 1.20, 0.72, 0.48, 'main'), P(0, 0.72, -0.18, 0.90, 0.78, 0.05, 'light'), P(0, 0.02, 0.26, 1.00, 0.03, 0.02, 'dark')],
    top: lineTop,
  });
  add('bunk', {
    name: '上下铺', w: 2.0, d: 1.0, h: 1.9, cat: '家具', color: '#9aa8a2', accent: '#6d7c71',
    alias: ['双层床'],
    seats: [{ x: 0, y: 0.2, h: 0.45, face: 90 }],
    parts: [P(0, 0.42, 0, 1.90, 0.08, 0.95, 'main'), P(0, 1.32, 0, 1.90, 0.08, 0.95, 'main'),
      P(-0.94, 0, -0.46, 0.08, 1.90, 0.08, 'dark'), P(0.94, 0, -0.46, 0.08, 1.90, 0.08, 'dark'),
      P(-0.94, 0, 0.46, 0.08, 1.90, 0.08, 'dark'), P(0.94, 0, 0.46, 0.08, 1.90, 0.08, 'dark'),
      P(0, 0.50, 0, 1.80, 0.16, 0.88, 'light')],
    top: lineTop,
  });
  add('crib', {
    name: '婴儿床', w: 1.2, d: 0.7, h: 0.9, cat: '家具', color: '#e2d4bc', accent: '#b09c80',
    parts: [P(0, 0.28, 0, 1.16, 0.08, 0.66, 'main'),
      P(-0.56, 0.36, 0, 0.06, 0.52, 0.66, 'light'), P(0.56, 0.36, 0, 0.06, 0.52, 0.66, 'light'),
      P(0, 0.36, -0.32, 1.16, 0.52, 0.05, 'light'), P(0, 0.36, 0.32, 1.16, 0.52, 0.05, 'light')],
    top: plainTop,
  });
  add('screen', {
    name: '屏风', w: 1.8, d: 0.12, h: 1.8, cat: '装饰', color: '#b98f6b', accent: '#7c5a41',
    alias: ['隔断'],
    parts: [P(-0.6, 0, 0, 0.58, 1.80, 0.06, 'main'), P(0, 0, 0, 0.58, 1.80, 0.06, 'light'), P(0.6, 0, 0, 0.58, 1.80, 0.06, 'main'),
      P(-0.9, 0, 0, 0.06, 1.80, 0.12, 'dark'), P(0.9, 0, 0, 0.06, 1.80, 0.12, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 6, -d / 2, -w / 6, d / 2); L(ctx, w / 6, -d / 2, w / 6, d / 2); },
  });
  add('coatstand', {
    name: '衣帽架', w: 0.5, d: 0.5, h: 1.75, cat: '家具', color: '#8c765c', accent: '#5f5040',
    parts: [P(0, 0, 0, 0.44, 0.05, 0.44, 'dark'), P(0, 0.05, 0, 0.07, 1.62, 0.07, 'main'),
      P(0, 1.55, 0, 0.50, 0.05, 0.06, 'accent'), P(0, 1.38, 0, 0.06, 0.05, 0.50, 'accent')],
    top: ringTop,
  });

  /* ---------------- 厨卫 ---------------- */
  add('stove', {
    name: '灶台', w: 0.9, d: 0.6, h: 0.88, cat: '厨卫', color: '#9aa0a6', accent: '#4a4f55',
    alias: ['炉灶', '煤气灶'],
    parts: [P(0, 0, 0, 0.90, 0.84, 0.60, 'main'), P(0, 0.84, 0, 0.90, 0.04, 0.60, 'dark'),
      P(-0.22, 0.88, 0, 0.28, 0.01, 0.28, 'accent'), P(0.22, 0.88, 0, 0.28, 0.01, 0.28, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIRO(ctx, -w / 4, 0, 0.12); CIRO(ctx, w / 4, 0, 0.12); },
  });
  add('sink', {
    name: '水槽', w: 0.8, d: 0.55, h: 0.88, cat: '厨卫', color: '#b8bec4', accent: '#6c737a',
    alias: ['洗菜池'],
    parts: [P(0, 0, 0, 0.80, 0.84, 0.55, 'main'), P(0, 0.84, 0, 0.76, 0.04, 0.51, 'light'), P(0, 0.80, 0, 0.50, 0.06, 0.34, 'dark'), P(0, 0.88, -0.22, 0.05, 0.22, 0.05, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 4, -d / 4, w / 2, d / 2); },
  });
  add('toilet', {
    name: '马桶', w: 0.42, d: 0.7, h: 0.78, cat: '厨卫', color: '#f0f2f3', accent: '#b8bec4',
    parts: [P(0, 0, 0.06, 0.40, 0.42, 0.56, 'main'), P(0, 0.42, 0.06, 0.42, 0.05, 0.58, 'light'), P(0, 0.30, -0.28, 0.42, 0.48, 0.14, 'main')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIRO(ctx, 0, 0.08, 0.16); },
  });
  add('bathtub', {
    name: '浴缸', w: 1.7, d: 0.78, h: 0.6, cat: '厨卫', color: '#eef1f3', accent: '#b8bec4',
    parts: [P(0, 0, 0, 1.70, 0.58, 0.78, 'main'), P(0, 0.54, 0, 1.50, 0.06, 0.60, 'light'), P(0, 0.46, 0, 1.44, 0.10, 0.54, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 2 + 0.1, -d / 2 + 0.1, w - 0.2, d - 0.2); },
  });
  add('shower', {
    name: '淋浴间', w: 0.9, d: 0.9, h: 2.0, cat: '厨卫', color: '#cfe0e6', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.90, 0.06, 0.90, 'dark'), P(0, 0.06, -0.43, 0.90, 1.90, 0.04, 'light'), P(-0.43, 0.06, 0, 0.04, 1.90, 0.90, 'light'), P(0, 1.88, -0.30, 0.20, 0.06, 0.20, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, -d / 2, w / 2, -d / 2); },
  });
  add('microwave', {
    name: '微波炉', w: 0.5, d: 0.38, h: 0.3, cat: '厨卫', color: '#4a4f55', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.50, 0.30, 0.38, 'main'), P(-0.08, 0.05, 0.20, 0.28, 0.20, 0.02, 'accent'), P(0.18, 0.08, 0.20, 0.06, 0.06, 0.02, 'light')],
    top: lineTop,
  });
  add('hood', {
    name: '油烟机', w: 0.9, d: 0.5, h: 0.35, cat: '厨卫', color: '#9aa0a6', accent: '#4a4f55',
    parts: [P(0, 0.24, 0, 0.90, 0.10, 0.50, 'main'), P(0, 0, -0.14, 0.44, 0.24, 0.22, 'dark')],
    top: plainTop,
  });

  /* ---------------- 电器 ---------------- */
  add('computer', {
    name: '台式电脑', w: 0.6, d: 0.5, h: 0.5, cat: '电器', color: '#3f4650', accent: '#7f9bb5',
    alias: ['电脑'],
    parts: [P(0, 0.14, -0.18, 0.52, 0.34, 0.05, 'main'), P(0, 0.10, -0.18, 0.46, 0.28, 0.02, 'accent'), P(0, 0.10, -0.18, 0.18, 0.05, 0.10, 'dark'), P(-0.18, 0, 0.14, 0.20, 0.03, 0.12, 'light'), P(0.20, 0, 0.10, 0.10, 0.02, 0.10, 'light')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 2, -d / 2, w, 0.08); },
  });
  add('laptop', {
    name: '笔记本电脑', w: 0.4, d: 0.3, h: 0.24, cat: '电器', color: '#8d949c', accent: '#4a5560',
    alias: ['笔记本'],
    parts: [P(0, 0, 0.02, 0.40, 0.02, 0.28, 'main'), P(0, 0.02, -0.12, 0.40, 0.22, 0.02, 'accent')],
    top: lineTop,
  });
  add('monitor', {
    name: '显示器', w: 0.6, d: 0.2, h: 0.45, cat: '电器', color: '#2f353c', accent: '#7f9bb5',
    parts: [P(0, 0.08, 0, 0.60, 0.34, 0.04, 'main'), P(0, 0.10, 0.03, 0.54, 0.29, 0.01, 'accent'), P(0, 0, 0, 0.18, 0.08, 0.14, 'dark')],
    top: plainTop,
  });
  add('ac', {
    name: '空调', w: 0.9, d: 0.22, h: 0.3, cat: '电器', color: '#f0f2f3', accent: '#b8bec4',
    parts: [P(0, 0, 0, 0.90, 0.30, 0.22, 'main'), P(0, 0.02, 0.12, 0.80, 0.04, 0.02, 'dark')],
    top: lineTop,
  });
  add('fan', {
    name: '落地扇', w: 0.45, d: 0.45, h: 1.3, cat: '电器', color: '#c7ced4', accent: '#6c737a',
    parts: [P(0, 0, 0, 0.42, 0.04, 0.42, 'dark'), P(0, 0.04, 0, 0.06, 1.02, 0.06, 'main'), P(0, 1.06, 0, 0.40, 0.24, 0.10, 'light')],
    top: ringTop,
  });
  add('speaker', {
    name: '音箱', w: 0.3, d: 0.28, h: 0.6, cat: '电器', color: '#363a41', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.30, 0.60, 0.28, 'main'), P(0, 0.12, 0.15, 0.18, 0.18, 0.02, 'accent'), P(0, 0.40, 0.15, 0.10, 0.10, 0.02, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIR(ctx, 0, 0, 0.08); },
  });
  add('projector', {
    name: '投影仪', w: 0.34, d: 0.28, h: 0.14, cat: '电器', color: '#d6dade', accent: '#4a4f55',
    parts: [P(0, 0, 0, 0.34, 0.14, 0.28, 'main'), P(0.10, 0.04, 0.15, 0.08, 0.06, 0.02, 'accent')],
    top: plainTop,
  });
  add('vending', {
    name: '自动售货机', w: 0.9, d: 0.7, h: 1.9, cat: '办公商业', color: '#c93346', accent: '#f0f2f3',
    parts: [P(0, 0, 0, 0.90, 1.90, 0.70, 'main'), P(-0.10, 0.35, 0.36, 0.56, 1.20, 0.02, 'accent'), P(0.28, 0.35, 0.37, 0.16, 0.90, 0.02, 'light'), P(0, 0.18, 0.37, 0.70, 0.10, 0.03, 'dark')],
    top: lineTop,
  });

  /* ---------------- 灯饰 ---------------- */
  add('chandelier', {
    name: '吊灯', w: 0.7, d: 0.7, h: 0.7, cat: '灯饰', color: '#e6cf9c', accent: '#b8924f',
    parts: [P(0, 0.62, 0, 0.06, 0.08, 0.06, 'dark'), P(0, 0.30, 0, 0.70, 0.06, 0.70, 'main'),
      P(-0.30, 0.20, 0, 0.10, 0.16, 0.10, 'light'), P(0.30, 0.20, 0, 0.10, 0.16, 0.10, 'light'),
      P(0, 0.20, -0.30, 0.10, 0.16, 0.10, 'light'), P(0, 0.20, 0.30, 0.10, 0.16, 0.10, 'light')],
    top: ringTop,
  });
  add('tablelamp', {
    name: '台灯', w: 0.3, d: 0.3, h: 0.5, cat: '灯饰', color: '#e6cf9c', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.26, 0.04, 0.26, 'dark'), P(0, 0.04, 0, 0.04, 0.32, 0.04, 'main'), P(0, 0.36, 0, 0.30, 0.14, 0.30, 'light')],
    top: ringTop,
  });
  add('neon', {
    name: '霓虹灯牌', w: 1.4, d: 0.1, h: 0.6, cat: '灯饰', color: '#c93346', accent: '#ffd6a0',
    parts: [P(0, 0, 0, 1.40, 0.60, 0.08, 'dark'), P(0, 0.08, 0.05, 1.24, 0.44, 0.02, 'accent')],
    top: plainTop,
  });
  add('lantern', {
    name: '灯笼', w: 0.4, d: 0.4, h: 0.6, cat: '灯饰', color: '#c93346', accent: '#e6cf9c',
    parts: [P(0, 0.10, 0, 0.38, 0.40, 0.38, 'main'), P(0, 0.50, 0, 0.16, 0.05, 0.16, 'dark'), P(0, 0.05, 0, 0.16, 0.05, 0.16, 'accent')],
    top: ringTop,
  });
  add('streetlamp', {
    name: '路灯', w: 0.5, d: 0.5, h: 3.2, cat: '户外交通', color: '#5b6169', accent: '#ffe9b0',
    parts: [P(0, 0, 0, 0.44, 0.10, 0.44, 'dark'), P(0, 0.10, 0, 0.12, 2.90, 0.12, 'main'), P(0.20, 3.00, 0, 0.40, 0.10, 0.16, 'light')],
    top: ringTop,
  });

  /* ---------------- 装饰 ---------------- */
  add('mirror', {
    name: '镜子', w: 0.8, d: 0.08, h: 1.6, cat: '装饰', color: '#b8924f', accent: '#cfe4ff',
    parts: [P(0, 0, 0, 0.80, 1.60, 0.06, 'dark'), P(0, 0.10, 0.04, 0.68, 1.40, 0.01, 'accent')],
    top: plainTop,
  });
  add('picture', {
    name: '挂画', w: 1.0, d: 0.06, h: 0.7, cat: '装饰', color: '#b8924f', accent: '#8a9b8e',
    alias: ['画框'],
    parts: [P(0, 0, 0, 1.00, 0.70, 0.05, 'dark'), P(0, 0.06, 0.03, 0.88, 0.58, 0.01, 'accent')],
    top: plainTop,
  });
  add('clock', {
    name: '挂钟', w: 0.4, d: 0.08, h: 0.4, cat: '装饰', color: '#8c765c', accent: '#f0f2f3',
    parts: [P(0, 0, 0, 0.40, 0.40, 0.07, 'dark'), P(0, 0.04, 0.04, 0.32, 0.32, 0.01, 'accent')],
    top: ringTop,
  });
  add('vase', {
    name: '花瓶', w: 0.24, d: 0.24, h: 0.5, cat: '装饰', color: '#9fb6c9', accent: '#c9a06a',
    parts: [P(0, 0, 0, 0.20, 0.10, 0.20, 'dark'), P(0, 0.10, 0, 0.24, 0.30, 0.24, 'main'), P(0, 0.40, 0, 0.12, 0.10, 0.12, 'light')],
    top: ringTop,
  });
  add('books', {
    name: '书堆', w: 0.4, d: 0.3, h: 0.3, cat: '装饰', color: '#b06a5a', accent: '#8a9b8e',
    parts: [P(0, 0, 0, 0.40, 0.08, 0.30, 'main'), P(0.02, 0.08, 0, 0.36, 0.08, 0.28, 'accent'), P(-0.02, 0.16, 0, 0.38, 0.08, 0.30, 'light'), P(0, 0.24, 0, 0.34, 0.06, 0.26, 'dark')],
    top: lineTop,
  });
  add('piano', {
    name: '钢琴', w: 1.5, d: 0.65, h: 1.0, cat: '装饰', color: '#2f353c', accent: '#f0f2f3',
    parts: [P(0, 0.60, 0, 1.50, 0.16, 0.62, 'main'), P(0, 0.76, -0.22, 1.40, 0.20, 0.18, 'dark'),
      P(0, 0.58, 0.22, 1.20, 0.04, 0.16, 'accent'),
      P(-0.66, 0, 0.22, 0.08, 0.60, 0.08, 'dark'), P(0.66, 0, 0.22, 0.08, 0.60, 0.08, 'dark')],
    top: lineTop,
  });
  add('guitar', {
    name: '吉他', w: 0.4, d: 0.16, h: 1.0, cat: '装饰', color: '#c9a06a', accent: '#6b4b32',
    parts: [P(0, 0, 0, 0.36, 0.46, 0.14, 'main'), P(0, 0.46, 0, 0.10, 0.52, 0.08, 'dark'), P(0, 0.90, 0, 0.16, 0.10, 0.08, 'accent'), P(0, 0.22, 0.08, 0.12, 0.02, 0.02, 'accent')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIRO(ctx, 0, 0, 0.09); },
  });
  add('aquarium', {
    name: '鱼缸', w: 1.0, d: 0.45, h: 0.7, cat: '装饰', color: '#9fc6d8', accent: '#6c737a',
    parts: [P(0, 0, 0, 1.00, 0.62, 0.45, 'main'), P(0, 0.58, 0, 0.92, 0.06, 0.40, 'accent'), P(0, 0, 0, 1.02, 0.08, 0.47, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 2 + 0.05, -d / 2 + 0.05, w - 0.1, d - 0.1); },
  });
  add('curtain', {
    name: '窗帘', w: 1.6, d: 0.12, h: 2.2, cat: '装饰', color: '#b8928e', accent: '#8d6b68',
    parts: [P(-0.42, 0, 0, 0.76, 2.16, 0.10, 'main'), P(0.42, 0, 0, 0.76, 2.16, 0.10, 'light'), P(0, 2.16, 0, 1.60, 0.04, 0.12, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, 0, -d / 2, 0, d / 2); },
  });

  /* ---------------- 建筑 ---------------- */
  add('fence', {
    name: '围栏', w: 2.0, d: 0.12, h: 1.1, cat: '户外交通', color: '#a89478', accent: '#7c6a52',
    parts: [P(0, 0.28, 0, 2.00, 0.08, 0.08, 'main'), P(0, 0.76, 0, 2.00, 0.08, 0.08, 'main'),
      P(-0.94, 0, 0, 0.10, 1.10, 0.10, 'dark'), P(0, 0, 0, 0.10, 1.10, 0.10, 'dark'), P(0.94, 0, 0, 0.10, 1.10, 0.10, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, 0, w / 2, 0); },
  });
  add('arch', {
    name: '拱门', w: 1.8, d: 0.3, h: 2.6, cat: '建筑', color: '#c7bfb0', accent: '#9a9284',
    parts: [P(-0.80, 0, 0, 0.20, 2.60, 0.30, 'main'), P(0.80, 0, 0, 0.20, 2.60, 0.30, 'main'), P(0, 2.20, 0, 1.80, 0.40, 0.30, 'light')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w / 2, -d / 2, 0.2, d); R(ctx, w / 2 - 0.2, -d / 2, 0.2, d); },
  });
  add('railing', {
    name: '栏杆', w: 2.0, d: 0.1, h: 1.0, cat: '建筑', color: '#8d8f94', accent: '#5d6068',
    parts: [P(0, 0.94, 0, 2.00, 0.06, 0.10, 'main'), P(0, 0.10, 0, 2.00, 0.04, 0.06, 'dark'),
      P(-0.8, 0, 0, 0.05, 0.94, 0.05, 'dark'), P(-0.4, 0, 0, 0.05, 0.94, 0.05, 'dark'),
      P(0, 0, 0, 0.05, 0.94, 0.05, 'dark'), P(0.4, 0, 0, 0.05, 0.94, 0.05, 'dark'), P(0.8, 0, 0, 0.05, 0.94, 0.05, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, 0, w / 2, 0); },
  });
  add('well', {
    name: '水井', w: 1.0, d: 1.0, h: 0.9, cat: '户外交通', color: '#9a9284', accent: '#6b655b',
    parts: [P(0, 0, 0, 1.00, 0.80, 1.00, 'main'), P(0, 0.74, 0, 0.72, 0.08, 0.72, 'dark')],
    top: ringTop,
  });

  /* ---------------- 办公商业 ---------------- */
  add('cashier', {
    name: '收银台', w: 2.0, d: 0.7, h: 1.0, cat: '办公商业', color: '#a98d80', accent: '#6b5a50',
    parts: [P(0, 0, 0, 2.00, 0.92, 0.70, 'main'), P(0, 0.92, 0, 2.10, 0.08, 0.78, 'light'), P(0.60, 0.94, 0.10, 0.40, 0.24, 0.30, 'dark')],
    top: lineTop,
  });
  add('goodshelf', {
    name: '货架', w: 1.8, d: 0.5, h: 1.8, cat: '办公商业', color: '#8d949c', accent: '#5d6068',
    parts: [P(-0.86, 0, 0, 0.08, 1.80, 0.50, 'dark'), P(0.86, 0, 0, 0.08, 1.80, 0.50, 'dark'),
      P(0, 0.10, 0, 1.72, 0.05, 0.48, 'main'), P(0, 0.60, 0, 1.72, 0.05, 0.48, 'main'),
      P(0, 1.10, 0, 1.72, 0.05, 0.48, 'main'), P(0, 1.60, 0, 1.72, 0.05, 0.48, 'main')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); for (let i = 1; i < 4; i++) L(ctx, -w / 2, -d / 2 + i * d / 4, w / 2, -d / 2 + i * d / 4); },
  });
  add('whiteboard', {
    name: '白板', w: 1.6, d: 0.1, h: 1.2, cat: '办公商业', color: '#f0f2f3', accent: '#8d8f94',
    parts: [P(0, 0.20, 0, 1.60, 1.00, 0.06, 'main'), P(0, 0.16, 0.06, 1.60, 0.04, 0.10, 'dark')],
    top: plainTop,
  });
  add('filecab', {
    name: '文件柜', w: 0.5, d: 0.5, h: 1.2, cat: '办公商业', color: '#9aa0a6', accent: '#5d6068',
    parts: [P(0, 0, 0, 0.50, 1.20, 0.50, 'main'), P(0, 0.42, 0.26, 0.44, 0.02, 0.02, 'dark'), P(0, 0.82, 0.26, 0.44, 0.02, 0.02, 'dark')],
    top: lineTop,
  });
  add('meeting', {
    name: '会议桌', w: 2.6, d: 1.2, h: 0.75, cat: '办公商业', color: '#c9b79c', accent: '#8d8f94',
    parts: [P(0, 0.70, 0, 2.60, 0.06, 1.20, 'main'), P(-1.0, 0, 0, 0.30, 0.70, 0.50, 'dark'), P(1.0, 0, 0, 0.30, 0.70, 0.50, 'dark')],
    top: lineTop,
  });

  /* ---------------- 户外交通 ---------------- */
  add('car', {
    name: '汽车', w: 4.4, d: 1.9, h: 1.5, cat: '户外交通', color: '#c93346', accent: '#2f353c',
    alias: ['轿车', '小汽车'],
    parts: [P(0, 0.30, 0, 4.40, 0.60, 1.90, 'main'), P(-0.20, 0.90, 0, 2.20, 0.55, 1.70, 'light'),
      P(-1.45, 0.20, 0.96, 0.60, 0.34, 0.10, 'dark'), P(1.45, 0.20, 0.96, 0.60, 0.34, 0.10, 'dark'),
      P(-1.45, 0.20, -0.96, 0.60, 0.34, 0.10, 'dark'), P(1.45, 0.20, -0.96, 0.60, 0.34, 0.10, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); R(ctx, -w * 0.15, -d / 2, w * 0.3, d); },
  });
  add('bike', {
    name: '自行车', w: 1.7, d: 0.5, h: 1.1, cat: '户外交通', color: '#7aa0b8', accent: '#2f353c',
    parts: [P(-0.55, 0.24, 0, 0.42, 0.42, 0.06, 'dark'), P(0.55, 0.24, 0, 0.42, 0.42, 0.06, 'dark'),
      P(0, 0.50, 0, 1.00, 0.06, 0.06, 'main'), P(-0.25, 0.56, 0, 0.30, 0.06, 0.20, 'dark'), P(0.45, 0.54, 0, 0.06, 0.50, 0.06, 'main')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); CIRO(ctx, -w * 0.3, 0, 0.09); CIRO(ctx, w * 0.3, 0, 0.09); },
  });
  add('moto', {
    name: '摩托车', w: 2.0, d: 0.7, h: 1.2, cat: '户外交通', color: '#2f353c', accent: '#c93346',
    parts: [P(-0.62, 0.26, 0, 0.44, 0.44, 0.14, 'dark'), P(0.62, 0.26, 0, 0.44, 0.44, 0.14, 'dark'),
      P(0, 0.52, 0, 1.20, 0.30, 0.44, 'main'), P(-0.10, 0.82, 0, 0.44, 0.08, 0.40, 'accent'), P(0.70, 0.82, 0, 0.08, 0.34, 0.40, 'dark')],
    top: lineTop,
  });
  add('bus', {
    name: '公交车', w: 6.0, d: 2.2, h: 2.8, cat: '户外交通', color: '#d8b74a', accent: '#2f353c',
    parts: [P(0, 0.40, 0, 6.00, 2.30, 2.20, 'main'), P(0, 1.60, 1.11, 5.40, 0.70, 0.02, 'accent'),
      P(-2.0, 0.20, 1.10, 0.50, 0.40, 0.08, 'dark'), P(2.0, 0.20, 1.10, 0.50, 0.40, 0.08, 'dark')],
    top: lineTop,
  });
  add('bin', {
    name: '垃圾桶', w: 0.5, d: 0.5, h: 0.8, cat: '户外交通', color: '#6b8f76', accent: '#3f5a48',
    parts: [P(0, 0, 0, 0.48, 0.72, 0.48, 'main'), P(0, 0.72, 0, 0.52, 0.08, 0.52, 'dark')],
    top: ringTop,
  });
  add('planter', {
    name: '花坛', w: 1.2, d: 1.2, h: 0.45, cat: '户外交通', color: '#a89478', accent: '#6b8f76',
    parts: [P(0, 0, 0, 1.20, 0.42, 1.20, 'main'), P(0, 0.38, 0, 1.00, 0.07, 1.00, 'accent')],
    top: ringTop,
  });
  add('fountain', {
    name: '喷泉', w: 2.0, d: 2.0, h: 1.2, cat: '户外交通', color: '#b8bec4', accent: '#9fc6d8',
    parts: [P(0, 0, 0, 2.00, 0.36, 2.00, 'main'), P(0, 0.34, 0, 1.60, 0.06, 1.60, 'accent'),
      P(0, 0.40, 0, 0.24, 0.70, 0.24, 'dark'), P(0, 1.06, 0, 0.60, 0.08, 0.60, 'light')],
    top: ringTop,
  });
  add('parasol', {
    name: '遮阳伞', w: 2.2, d: 2.2, h: 2.3, cat: '户外交通', color: '#d98a72', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.40, 0.06, 0.40, 'dark'), P(0, 0.06, 0, 0.08, 2.00, 0.08, 'accent'), P(0, 2.06, 0, 2.20, 0.20, 2.20, 'main')],
    top: ringTop,
  });
  add('tent', {
    name: '帐篷', w: 2.4, d: 2.0, h: 1.6, cat: '户外交通', color: '#7a9b7e', accent: '#4f6b53',
    parts: [P(-0.60, 0, 0, 1.20, 1.20, 2.00, 'main'), P(0.60, 0, 0, 1.20, 1.20, 2.00, 'light'), P(0, 1.20, 0, 0.06, 0.40, 2.00, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, 0, -d / 2, 0, d / 2); },
  });
  add('campfire', {
    name: '篝火', w: 0.9, d: 0.9, h: 0.5, cat: '户外交通', color: '#8c765c', accent: '#e8a33c',
    parts: [P(0, 0, 0, 0.90, 0.12, 0.90, 'dark'), P(-0.24, 0.10, 0, 0.60, 0.12, 0.12, 'main'), P(0.24, 0.10, 0, 0.60, 0.12, 0.12, 'main'), P(0, 0.20, 0, 0.28, 0.30, 0.28, 'accent')],
    top: ringTop,
  });

  /* ---------------- 片场器材 ---------------- */
  add('tripod', {
    name: '三脚架', w: 0.7, d: 0.7, h: 1.5, cat: '片场器材', color: '#3f4650', accent: '#8d8f94',
    parts: [P(0, 0, 0, 0.06, 1.30, 0.06, 'main'), P(0, 1.30, 0, 0.34, 0.20, 0.26, 'dark'),
      P(-0.26, 0, 0, 0.04, 0.70, 0.04, 'main'), P(0.26, 0, 0, 0.04, 0.70, 0.04, 'main')],
    top: ringTop,
  });
  add('softbox', {
    name: '补光灯', w: 0.9, d: 0.3, h: 2.0, cat: '片场器材', color: '#2f353c', accent: '#fff3d0',
    parts: [P(0, 0, 0, 0.60, 0.05, 0.60, 'dark'), P(0, 0.05, 0, 0.05, 1.30, 0.05, 'main'), P(0, 1.35, 0, 0.90, 0.65, 0.25, 'accent')],
    top: plainTop,
  });
  add('reflector', {
    name: '反光板', w: 1.0, d: 0.1, h: 1.0, cat: '片场器材', color: '#e6cf9c', accent: '#8d8f94',
    parts: [P(0, 0.10, 0, 1.00, 0.90, 0.05, 'main'), P(0, 0, 0, 0.05, 0.10, 0.05, 'dark')],
    top: ringTop,
  });
  add('clapboard', {
    name: '场记板', w: 0.4, d: 0.05, h: 0.35, cat: '片场器材', color: '#2f353c', accent: '#f0f2f3',
    parts: [P(0, 0, 0, 0.40, 0.30, 0.04, 'main'), P(0, 0.30, 0, 0.40, 0.05, 0.04, 'accent')],
    top: plainTop,
  });
  add('greenscreen', {
    name: '绿幕', w: 3.0, d: 0.15, h: 2.6, cat: '片场器材', color: '#4d9a55', accent: '#5d6068',
    parts: [P(0, 0.06, 0, 3.00, 2.50, 0.06, 'main'), P(-1.45, 0, 0, 0.08, 2.60, 0.14, 'dark'), P(1.45, 0, 0, 0.08, 2.60, 0.14, 'dark')],
    top: plainTop,
  });
  add('track', {
    name: '轨道', w: 3.0, d: 0.8, h: 0.12, cat: '片场器材', color: '#8d8f94', accent: '#5d6068',
    parts: [P(0, 0, -0.30, 3.00, 0.10, 0.08, 'main'), P(0, 0, 0.30, 3.00, 0.10, 0.08, 'main'),
      P(-1.2, 0.02, 0, 0.08, 0.06, 0.70, 'dark'), P(1.2, 0.02, 0, 0.08, 0.06, 0.70, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, -d * 0.3, w / 2, -d * 0.3); L(ctx, -w / 2, d * 0.3, w / 2, d * 0.3); },
  });
  add('crate', {
    name: '木箱', w: 0.7, d: 0.7, h: 0.7, cat: '其他', color: '#b98f6b', accent: '#7c5a41',
    parts: [P(0, 0, 0, 0.70, 0.70, 0.70, 'main'), P(0, 0, 0.36, 0.70, 0.06, 0.02, 'dark'), P(0, 0, -0.36, 0.70, 0.06, 0.02, 'dark')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); det(ctx, st); L(ctx, -w / 2, -d / 2, w / 2, d / 2); L(ctx, -w / 2, d / 2, w / 2, -d / 2); },
  });

  /* 把原本定义了却没进物件库的两个道具放出来 */
  if (K.wall && ORDER.indexOf('wall') < 0) ORDER.push('wall');
  if (K.block && ORDER.indexOf('block') < 0) ORDER.push('block');

  /* 分类表给 UI 用；也提供按分类取 key 的快捷方法 */
  window.MN_PROP_CATS = CATS;
  window.MN_PROP_CAT_ORDER = CAT_ORDER;
  window.MN_propCat = k => CATS[k] || '其他';
  window.MN_propsByCat = () => {
    const out = {};
    CAT_ORDER.forEach(c => { out[c] = []; });
    ORDER.forEach(k => { const c = CATS[k] || '其他'; (out[c] = out[c] || []).push(k); });
    return out;
  };
})();
