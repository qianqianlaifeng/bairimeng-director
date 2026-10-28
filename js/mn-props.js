/* === 导演台 · 道具库（多部件精细建模）===
   一套家具 = 多个部件（桌面/桌腿/围板/靠背/扶手/坐垫…），不是一块光板。
   3D 引擎按 parts 逐件建模；2D 俯视图按 top 画各自的平面符号；白模预演按同一套 parts 出多边形。

   【坐标约定】全部模块统一：
   · 地图坐标 (x, y)：x 向右，y 向下；映射到 3D 世界 (X = x, Z = y)。
   · rot = 偏航角（度）。rot=0 时道具/人物朝 +X（地图右方）。
     绕 Y 轴转 rot：局部 +X → 世界 (cos rot, sin rot)（在 XZ 平面里 +rot 是「俯视顺时针」）。
   · 道具尺寸 p.w = 局部 X 向宽，p.d = 局部 Z 向深，p.h = 高；p.x/p.y = 局部矩形左上角。
     旋转围绕局部矩形中心，所以 p.x/p.y/p.w/p.d 始终描述「未旋转时的本地框」，
     世界包围盒 = 旋转后的 AABB（见 propAABB）。

   暴露 window.MN_PROP_KINDS / MN_PROP_ORDER / MN_kindOf / MN_propAABB / MN_propCenter。
   本文件是普通脚本（先于 miaoning.js 加载），2D / 3D / 白模三端共用。 */
(function () {
  'use strict';

  /* 部件：x/z = 相对道具中心（米），y = 离地底面（米），w/h/d = 尺寸，c = 颜色角色 */
  const P = (x, y, z, w, h, d, c) => ({ x, y, z, w, h, d, c });

  /* ---------- 2D 俯视平面符号小工具（局部坐标：x=宽，y=深，1 单位 = 1 米） ---------- */
  const R = (ctx, x, y, w, h) => { ctx.fillRect(x, y, w, h); };
  const L = (ctx, x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const CIR = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const CIRO = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };

  /* 统一底板：铺主色 */
  function slab(ctx, w, d, st) { ctx.fillStyle = st.fill; R(ctx, -w / 2, -d / 2, w, d); }
  /* 细节色 */
  function det(ctx, st) { ctx.fillStyle = st.dark; ctx.strokeStyle = st.dark; ctx.lineWidth = 0.035; }

  const K = {};

  /* ================= 桌子 ================= */
  K.table = {
    name: '桌子', w: 1.4, d: 0.8, h: 0.75, color: '#d9b382', accent: '#8d8f94',
    parts: () => [
      P(0, 0.70, 0, 1.40, 0.05, 0.80, 'main'),
      P(0, 0.58, 0.34, 1.26, 0.12, 0.04, 'dark'),
      P(0, 0.58, -0.34, 1.26, 0.12, 0.04, 'dark'),
      P(0.62, 0, 0.32, 0.08, 0.62, 0.08, 'dark'),
      P(-0.62, 0, 0.32, 0.08, 0.62, 0.08, 'dark'),
      P(0.62, 0, -0.32, 0.08, 0.62, 0.08, 'dark'),
      P(-0.62, 0, -0.32, 0.08, 0.62, 0.08, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      const l = 0.09;
      R(ctx, -w / 2 + l / 2, -d / 2 + l / 2, l, l);
      R(ctx, w / 2 - l * 1.5, -d / 2 + l / 2, l, l);
      R(ctx, -w / 2 + l / 2, d / 2 - l * 1.5, l, l);
      R(ctx, w / 2 - l * 1.5, d / 2 - l * 1.5, l, l);
    }
  };

  /* ================= 办公桌 ================= */
  K.desk = {
    name: '办公桌', w: 1.6, d: 0.8, h: 0.75, color: '#8d6a4f', accent: '#8d8f94',
    parts: () => [
      P(0, 0.70, 0, 1.60, 0.05, 0.80, 'main'),
      P(-0.74, 0, 0, 0.06, 0.70, 0.72, 'dark'),
      P(0.74, 0, 0, 0.06, 0.70, 0.72, 'dark'),
      P(0.42, 0, 0, 0.48, 0.68, 0.64, 'dark'),
      P(0.42, 0.20, 0.33, 0.42, 0.16, 0.02, 'light'),
      P(0.42, 0.40, 0.33, 0.42, 0.16, 0.02, 'light'),
      P(0.42, 0.60, 0.33, 0.42, 0.06, 0.02, 'light'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -w / 2, -d / 2, 0.07, d);
      R(ctx, w / 2 - 0.07, -d / 2, 0.07, d);
      R(ctx, w / 2 - 0.56, -d / 2 + 0.06, 0.50, d - 0.12);
    }
  };

  /* ================= 茶几 ================= */
  K.coffee = {
    name: '茶几', w: 1.1, d: 0.6, h: 0.42, color: '#d9b382', accent: '#8d8f94',
    parts: () => [
      P(0, 0.38, 0, 1.10, 0.04, 0.60, 'main'),
      P(0.48, 0, 0.24, 0.06, 0.38, 0.06, 'dark'),
      P(-0.48, 0, 0.24, 0.06, 0.38, 0.06, 'dark'),
      P(0.48, 0, -0.24, 0.06, 0.38, 0.06, 'dark'),
      P(-0.48, 0, -0.24, 0.06, 0.38, 0.06, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      const l = 0.07;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        R(ctx, a * (w / 2 - l / 2) - l / 2, b * (d / 2 - l / 2) - l / 2, l, l));
    }
  };

  /* ================= 椅子 ================= */
  K.chair = {
    name: '椅子', w: 0.5, d: 0.5, h: 0.92, color: '#c98d6b', accent: '#8d8f94',
    parts: () => [
      P(0, 0.45, 0, 0.50, 0.05, 0.50, 'main'),
      P(0, 0.50, -0.225, 0.50, 0.42, 0.05, 'main'),
      P(0, 0.66, -0.24, 0.42, 0.06, 0.02, 'dark'),
      P(0.20, 0, 0.20, 0.05, 0.45, 0.05, 'dark'),
      P(-0.20, 0, 0.20, 0.05, 0.45, 0.05, 'dark'),
      P(0.20, 0, -0.20, 0.05, 0.45, 0.05, 'dark'),
      P(-0.20, 0, -0.20, 0.05, 0.45, 0.05, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -w / 2, -d / 2, w, 0.06);
      const l = 0.06;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) =>
        R(ctx, a * (w / 2 - l / 2) - l / 2, b * (d / 2 - l / 2) - l / 2, l, l));
    }
  };

  /* ================= 办公椅 ================= */
  K.officechair = {
    name: '办公椅', w: 0.62, d: 0.62, h: 1.1, color: '#3c6e9e', accent: '#8d8f94',
    parts: () => [
      P(0, 0.48, 0, 0.50, 0.08, 0.50, 'main'),
      P(0, 0.56, -0.23, 0.46, 0.52, 0.08, 'main'),
      P(0, 0.10, 0, 0.09, 0.40, 0.09, 'accent'),
      P(0, 0.02, 0, 0.56, 0.05, 0.08, 'dark'),
      P(0, 0.02, 0, 0.08, 0.05, 0.56, 'dark'),
      P(0.28, 0.56, 0, 0.05, 0.05, 0.34, 'dark'),
      P(-0.28, 0.56, 0, 0.05, 0.05, 0.34, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.25, -d / 2, 0.50, 0.07);
      R(ctx, -0.28, -0.04, 0.56, 0.08);
      R(ctx, -0.04, -0.28, 0.08, 0.56);
    }
  };

  /* ================= 沙发 ================= */
  K.sofa = {
    name: '沙发', w: 2.0, d: 0.85, h: 0.82, color: '#8a9b8e', accent: '#6d7c71',
    parts: () => [
      P(0, 0.08, 0, 1.90, 0.14, 0.78, 'dark'),
      P(0, 0.22, 0, 2.00, 0.16, 0.85, 'main'),
      P(0, 0.38, -0.325, 2.00, 0.44, 0.20, 'main'),
      P(-0.93, 0.38, 0.02, 0.14, 0.30, 0.81, 'main'),
      P(0.93, 0.38, 0.02, 0.14, 0.30, 0.81, 'main'),
      P(-0.45, 0.38, 0.06, 0.90, 0.13, 0.68, 'light'),
      P(0.45, 0.38, 0.06, 0.90, 0.13, 0.68, 'light'),
      P(-0.45, 0.44, -0.20, 0.90, 0.30, 0.12, 'light'),
      P(0.45, 0.44, -0.20, 0.90, 0.30, 0.12, 'light'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -w / 2, -d / 2, w, 0.22);
      R(ctx, -w / 2, -d / 2, 0.15, d);
      R(ctx, w / 2 - 0.15, -d / 2, 0.15, d);
      L(ctx, 0, -d / 2 + 0.22, 0, d / 2 - 0.08);
    }
  };

  /* ================= 床 ================= */
  K.bed = {
    name: '床', w: 1.6, d: 2.0, h: 0.80, color: '#b8b0a4', accent: '#7d9ec0',
    parts: () => [
      P(0, 0.04, 0, 1.56, 0.14, 1.96, 'dark'),
      P(0, 0.18, 0, 1.50, 0.22, 1.90, 'main'),
      P(0, 0.40, 0.30, 1.52, 0.06, 1.20, 'accent'),
      P(0, 0.40, -0.66, 1.10, 0.12, 0.40, 'light'),
      P(0, 0.18, -0.96, 1.60, 0.62, 0.08, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.55, -d / 2 + 0.06, 1.10, 0.40);
      L(ctx, -w / 2, -d / 2 + 0.50, w / 2, -d / 2 + 0.50);
    }
  };

  /* ============ 座位点（「让人坐上这把椅子」用）============
     局部坐标：x 沿道具的「宽」、y 沿「深」（= 3D 的 z；负 = 靠背那一侧），
     h = 坐面高度（米），face = 坐下后人物朝向（0 = 朝 +x，90 = 朝 +y，即背对靠背）。
     道具被缩放时按 sx/sy/sz 一起缩放，所以这里一律写标称尺寸下的值。 */
  const SEATS = {
    chair: [{ x: 0, y: 0.05, h: 0.475, face: 90 }],
    officechair: [{ x: 0, y: 0.03, h: 0.52, face: 90 }],
    sofa: [{ x: -0.45, y: 0.08, h: 0.445, face: 90 }, { x: 0.45, y: 0.08, h: 0.445, face: 90 }],
    bench: [{ x: -0.36, y: 0.02, h: 0.48, face: 90 }, { x: 0.36, y: 0.02, h: 0.48, face: 90 }],
    bed: [{ x: -0.4, y: 0.55, h: 0.43, face: 90 }, { x: 0.4, y: 0.55, h: 0.43, face: 90 }],
  };
  Object.keys(SEATS).forEach(k => { if (K[k]) K[k].seats = SEATS[k]; });

  /* ================= 柜子 ================= */
  K.cabinet = {
    name: '柜子', w: 1.2, d: 0.55, h: 2.0, color: '#a3b8c9', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 1.20, 2.00, 0.55, 'main'),
      P(0, 0, 0, 1.10, 0.08, 0.48, 'dark'),
      P(-0.29, 0.10, 0.28, 0.55, 1.80, 0.03, 'light'),
      P(0.29, 0.10, 0.28, 0.55, 1.80, 0.03, 'light'),
      P(-0.03, 0.95, 0.31, 0.03, 0.28, 0.03, 'accent'),
      P(0.03, 0.95, 0.31, 0.03, 0.28, 0.03, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      L(ctx, 0, -d / 2, 0, d / 2);
    }
  };

  /* ================= 书架 ================= */
  K.shelf = {
    name: '书架', w: 0.9, d: 0.32, h: 1.9, color: '#a9743f', accent: '#c96f5a',
    parts: () => [
      P(-0.43, 0, 0, 0.04, 1.90, 0.32, 'main'),
      P(0.43, 0, 0, 0.04, 1.90, 0.32, 'main'),
      P(0, 0, 0.14, 0.86, 1.90, 0.03, 'dark'),
      P(0, 0.06, 0, 0.86, 0.03, 0.32, 'main'),
      P(0, 0.50, 0, 0.86, 0.03, 0.32, 'main'),
      P(0, 0.94, 0, 0.86, 0.03, 0.32, 'main'),
      P(0, 1.38, 0, 0.86, 0.03, 0.32, 'main'),
      P(-0.28, 0.09, 0.04, 0.09, 0.30, 0.22, 'accent'),
      P(-0.14, 0.09, 0.04, 0.08, 0.26, 0.22, 'light'),
      P(0.06, 0.53, 0.04, 0.10, 0.28, 0.22, 'light'),
      P(0.22, 0.53, 0.04, 0.08, 0.32, 0.22, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -w / 2, -d / 2, 0.05, d);
      R(ctx, w / 2 - 0.05, -d / 2, 0.05, d);
    }
  };

  /* ================= 电视 ================= */
  K.tv = {
    name: '电视', w: 1.2, d: 0.12, h: 0.78, color: '#2b3038', accent: '#5b6470',
    parts: () => [
      P(0, 0.20, 0, 1.20, 0.56, 0.06, 'main'),
      P(0, 0.18, 0.02, 1.24, 0.60, 0.02, 'dark'),
      P(0, 0, 0, 0.10, 0.20, 0.08, 'dark'),
      P(0, 0, 0, 0.50, 0.03, 0.20, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.25, -0.10, 0.50, 0.20);
    }
  };

  /* ================= 冰箱 ================= */
  K.fridge = {
    name: '冰箱', w: 0.7, d: 0.7, h: 1.85, color: '#dfe3e8', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 0.70, 1.85, 0.70, 'main'),
      P(0, 1.18, 0.36, 0.66, 0.02, 0.02, 'dark'),
      P(0.25, 0.90, 0.37, 0.04, 0.40, 0.04, 'accent'),
      P(0.25, 1.40, 0.37, 0.04, 0.26, 0.04, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      L(ctx, -w / 2, -d / 2 + 0.32, w / 2, -d / 2 + 0.32);
    }
  };

  /* ================= 洗衣机 ================= */
  K.washer = {
    name: '洗衣机', w: 0.6, d: 0.6, h: 0.85, color: '#eceff2', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 0.60, 0.85, 0.60, 'main'),
      P(0, 0.78, 0.30, 0.50, 0.08, 0.02, 'dark'),
      P(0, 0.40, 0.30, 0.34, 0.34, 0.03, 'accent'),
      P(0, 0.40, 0.32, 0.24, 0.24, 0.02, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      CIRO(ctx, 0, 0, 0.17);
    }
  };

  /* ================= 落地灯 ================= */
  K.lamp = {
    name: '落地灯', w: 0.4, d: 0.4, h: 1.6, color: '#f0e6c8', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 0.34, 0.04, 0.34, 'dark'),
      P(0, 0.04, 0, 0.05, 1.12, 0.05, 'accent'),
      P(0, 1.16, 0, 0.40, 0.30, 0.40, 'main'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      CIRO(ctx, 0, 0, 0.15);
    }
  };

  /* ================= 盆栽 ================= */
  K.plant = {
    name: '盆栽', w: 0.5, d: 0.5, h: 0.9, color: '#7fa85c', accent: '#b5714a',
    parts: () => [
      P(0, 0, 0, 0.30, 0.28, 0.30, 'accent'),
      P(0, 0.26, 0, 0.26, 0.04, 0.26, 'dark'),
      P(0, 0.28, 0, 0.05, 0.30, 0.05, 'dark'),
      P(0.13, 0.48, 0, 0.22, 0.28, 0.12, 'main'),
      P(-0.13, 0.48, 0, 0.22, 0.28, 0.12, 'main'),
      P(0, 0.58, 0.11, 0.16, 0.24, 0.30, 'light'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      CIR(ctx, 0, 0, 0.20);
      CIRO(ctx, 0, 0, 0.14);
    }
  };

  /* ================= 树 ================= */
  K.tree = {
    name: '树', w: 1.2, d: 1.2, h: 2.8, color: '#7d8c63', accent: '#7a5a3c',
    parts: () => [
      P(0, 0, 0, 0.18, 1.20, 0.18, 'accent'),
      P(0, 1.05, 0, 1.10, 0.80, 1.10, 'main'),
      P(0, 1.70, 0, 0.80, 0.70, 0.80, 'light'),
      P(0, 2.30, 0, 0.50, 0.60, 0.50, 'main'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      CIR(ctx, 0, 0, 0.42);
      CIRO(ctx, 0, 0, 0.26);
    }
  };

  /* ================= 箱子 ================= */
  K.box = {
    name: '箱子', w: 0.8, d: 0.8, h: 0.8, color: '#c9a06a', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 0.78, 0.70, 0.78, 'main'),
      P(0, 0.70, 0, 0.84, 0.08, 0.84, 'dark'),
      P(0, 0, 0, 0.84, 0.06, 0.10, 'accent'),
      P(0, 0, 0, 0.10, 0.06, 0.84, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.05, -d / 2, 0.10, d);
      R(ctx, -w / 2, -0.05, w, 0.10);
    }
  };

  /* ================= 柱子 ================= */
  K.pillar = {
    name: '柱子', w: 0.45, d: 0.45, h: 2.6, color: '#b0aaa1', accent: '#8d8f94',
    parts: () => [
      P(0, 0, 0, 0.50, 0.10, 0.50, 'light'),
      P(0, 0.10, 0, 0.36, 2.40, 0.36, 'main'),
      P(0, 2.50, 0, 0.50, 0.10, 0.50, 'light'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      CIRO(ctx, 0, 0, 0.18);
    }
  };

  /* ================= 门 ================= */
  K.door = {
    name: '门', w: 1.0, d: 0.15, h: 2.1, color: '#c98d6b', accent: '#8d8f94',
    parts: () => [
      P(-0.45, 0, 0, 0.10, 2.10, 0.16, 'main'),
      P(0.45, 0, 0, 0.10, 2.10, 0.16, 'main'),
      P(0, 2.00, 0, 1.00, 0.10, 0.16, 'main'),
      P(0, 0, 0.03, 0.80, 2.00, 0.05, 'light'),
      P(0.30, 1.00, 0.08, 0.05, 0.05, 0.05, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.40, -0.03, 0.80, 0.06);
    }
  };

  /* ================= 窗 ================= */
  K.window = {
    name: '窗', w: 1.5, d: 0.15, h: 1.4, color: '#cfe4ff', accent: '#e8eef5',
    parts: () => [
      P(-0.70, 0, 0, 0.10, 1.40, 0.16, 'main'),
      P(0.70, 0, 0, 0.10, 1.40, 0.16, 'main'),
      P(0, 0, 0, 1.50, 0.10, 0.16, 'main'),
      P(0, 1.30, 0, 1.50, 0.10, 0.16, 'main'),
      P(0, 0.10, 0, 1.30, 1.20, 0.03, 'accent'),
      P(0, 0, 0, 0.05, 1.40, 0.16, 'main'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -0.05, -d / 2, 0.10, d);
    }
  };

  /* ================= 地毯 ================= */
  K.rug = {
    name: '地毯', w: 2.0, d: 1.4, h: 0.03, color: '#c96f5a', accent: '#e0c2a8',
    parts: () => [
      P(0, 0, 0, 2.00, 0.02, 1.40, 'main'),
      P(0, 0.02, 0, 1.80, 0.01, 1.20, 'accent'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      ctx.lineWidth = 0.04;
      ctx.strokeRect(-w / 2 + 0.10, -d / 2 + 0.10, w - 0.20, d - 0.20);
    }
  };

  /* ================= 吧台 ================= */
  K.counter = {
    name: '吧台', w: 2.0, d: 0.6, h: 1.05, color: '#9e7b52', accent: '#8d8f94',
    parts: () => [
      P(0, 1.00, 0, 2.10, 0.05, 0.66, 'main'),
      P(0, 0, 0, 2.00, 1.00, 0.60, 'main'),
      P(0, 0.10, 0.31, 1.90, 0.70, 0.03, 'light'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      L(ctx, -w / 2, d / 2 - 0.03, w / 2, d / 2 - 0.03);
    }
  };

  /* ================= 楼梯 ================= */
  K.stairs = {
    name: '楼梯', w: 1.0, d: 2.2, h: 1.8, color: '#c0b6a4', accent: '#8d8f94',
    parts: () => {
      const out = [];
      for (let i = 0; i < 6; i++) out.push(P(0, i * 0.30, 0, 1.00, 0.30, 2.20 - i * 0.33, 'main'));
      return out;
    },
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      for (let i = 1; i < 6; i++) L(ctx, -w / 2, -d / 2 + i * 0.33, w / 2, -d / 2 + i * 0.33);
    }
  };

  /* ================= 长凳 ================= */
  K.bench = {
    name: '长凳', w: 1.5, d: 0.42, h: 0.85, color: '#8a6a4a', accent: '#8d8f94',
    parts: () => [
      P(0, 0.45, 0, 1.50, 0.06, 0.42, 'main'),
      P(0, 0.51, -0.19, 1.50, 0.34, 0.05, 'main'),
      P(0.66, 0, 0, 0.07, 0.45, 0.36, 'dark'),
      P(-0.66, 0, 0, 0.07, 0.45, 0.36, 'dark'),
    ],
    top: (ctx, w, d, st) => {
      slab(ctx, w, d, st); det(ctx, st);
      R(ctx, -w / 2, -d / 2, w, 0.06);
      R(ctx, -w / 2 + 0.60, -d / 2, 0.08, d);
      R(ctx, w / 2 - 0.68, -d / 2, 0.08, d);
    }
  };

  /* ================= 隔断墙 ================= */
  K.wall = {
    name: '隔断墙', w: 2.0, d: 0.2, h: 2.4, color: '#c7bfb0', accent: '#8d8f94',
    parts: () => [P(0, 0, 0, 2.00, 2.40, 0.20, 'main')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); }
  };

  /* ================= 通用方块（兼容旧数据） ================= */
  K.block = {
    name: '方块', w: 1.0, d: 1.0, h: 1.0, color: '#d9b382', accent: '#8d8f94',
    parts: () => [P(0, 0, 0, 1.00, 1.00, 1.00, 'main')],
    top: (ctx, w, d, st) => { slab(ctx, w, d, st); }
  };

  /* ---------- 导出 ---------- */
  const ORDER = ['table', 'desk', 'coffee', 'chair', 'officechair', 'sofa', 'bed', 'cabinet',
    'shelf', 'tv', 'fridge', 'washer', 'lamp', 'plant', 'tree', 'box', 'pillar', 'door',
    'window', 'rug', 'counter', 'stairs', 'bench'];

  window.MN_PROP_KINDS = K;
  window.MN_PROP_ORDER = ORDER;

  /* 名字 → kind（旧数据迁移用） */
  const BY_NAME = {
    '桌子': 'table', '桌': 'table', '书桌': 'desk', '办公桌': 'desk', '茶几': 'coffee',
    '椅子': 'chair', '办公椅': 'officechair', '转椅': 'officechair', '沙发': 'sofa',
    '床': 'bed', '柜子': 'cabinet', '衣柜': 'cabinet', '书架': 'shelf', '电视': 'tv',
    '冰箱': 'fridge', '洗衣机': 'washer', '落地灯': 'lamp', '台灯': 'lamp',
    '盆栽': 'plant', '树': 'tree', '箱子': 'box', '木箱': 'box', '木头箱子': 'box',
    '柱子': 'pillar', '门': 'door', '窗': 'window', '地毯': 'rug', '吧台': 'counter',
    '柜台': 'counter', '楼梯': 'stairs', '长凳': 'bench'
  };
  window.MN_PROP_BY_NAME = BY_NAME;

  /* 判定道具属于哪一类（优先用 kind，其次按名字猜，最后按比例猜） */
  window.MN_kindOf = function (p) {
    if (!p) return 'block';
    if (p.kind && K[p.kind]) return p.kind;
    const n = (p.name ? String(p.name) : '').trim();
    if (n && BY_NAME[n]) return BY_NAME[n];
    const w = Math.abs(+p.w || 1), d = Math.abs(+p.d || 1), h = Math.abs(+p.h || 1);
    if (h > 2.2 && w < 0.8) return 'pillar';
    if (h > 1.6 && w < 1.0) return 'fridge';
    if (h > 1.2 && h < 2.6 && w > 0.7 && w < 1.4 && d < 0.6) return 'cabinet';
    if (h < 0.5 && w > 1.6) return 'sofa';
    if (h > 0.6 && h < 1.0 && w > 1.2) return 'table';
    return 'block';
  };

  /* 道具本地框中心（地图坐标） */
  window.MN_propCenter = function (p) {
    const w = Math.abs(+p.w || 1), d = Math.abs(+p.d || 1);
    return { x: (+p.x || 0) + w / 2, y: (+p.y || 0) + d / 2 };
  };

  /* 旋转后的世界包围盒（AABB）：本地框 w×d 绕中心转 rot 后的外接矩形 */
  window.MN_propAABB = function (p) {
    const w = Math.abs(+p.w || 1), d = Math.abs(+p.d || 1);
    const r = ((+p.rot || 0) % 360) * Math.PI / 180;
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const aw = w * c + d * s, ad = w * s + d * c;
    const ct = window.MN_propCenter(p);
    return { x: ct.x - aw / 2, y: ct.y - ad / 2, w: aw, d: ad, cx: ct.x, cy: ct.y };
  };

  /* 把世界点转回道具本地坐标（判断是否点在道具上，含旋转） */
  window.MN_propLocal = function (p, wx, wy) {
    const ct = window.MN_propCenter(p);
    const r = -((+p.rot || 0) % 360) * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const dx = wx - ct.x, dy = wy - ct.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };
})();
