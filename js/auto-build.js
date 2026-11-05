/* ============================================================
 * 一键搭景（批量搭景）· 纯规则规划器
 * ------------------------------------------------------------
 * 输入：分镜板上的镜头（景别 / 角度 / 运镜 / 画面描述 / 台词 / 场次）
 * 输出：导演台原生场景快照 mnState（房间 + 墙 + 道具 + 人物 + 机位）
 *
 * 三张写死的对照表（同学要的「按景别定距离、按角度定高低、按运镜给起止」）：
 *   SIZE_CAM   景别 → 机位距离 / 高度 / 视野 / 瞄准高度
 *   ANGLE_ADJ  角度 → 在同一基准上抬高、压低、转到斜侧
 *   movePoints 运镜 → 1~2 个机位（起幅 / 落幅），机位册里一眼能看出「怎么动」
 *
 * 坐标约定与导演台一致：单位米，地图 x 向右 / y 向下，世界 (X=x, Z=y)，Y 是离地高度。
 * rot：0=朝画面右(+x)、90=朝画面下(+y)、180=朝左、270=朝上。
 * 机位永远待在「开口那一侧」（房间 y 大的一侧不砌墙），方位角夹在 ±50° 内，
 * 这样自动搭出来的景不会出现「机位在自己搭的墙后面」这种整幅画面糊住的情况。
 * ============================================================ */

const DEG = Math.PI / 180;
let seq = 0;
const uid = p => p + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
const cl = (v, a, b) => Math.min(b, Math.max(a, isFinite(+v) ? +v : a));

/* ================= 表一：景别 → 机位 ================= */
/* 导演台的 fov 是**竖向**视角（perspective(fovy,…)），所以这几个数按
   「画面竖向要盖住多少米」定：竖向覆盖 = 2·dist·tan(fov/2)，cover 就是这个覆盖量。
     ECU 脸 0.34m / CU 肩以上 0.55m / MCU 胸以上 0.9m / MS 腰以上 1.25m /
     LS 全身带一点环境 3.0m / ELS 整个空间 6.0m
   dist = 机位到主体的水平距离，h = 机位离地高度，aim = 瞄准点离地高度。
   两个人并排时下面还会按画幅把 dist 再拉远一点（fitDist），保证两人都进画。 */
export const SIZE_CAM = {
  ELS: { dist: 8.5, h: 3.00, fov: 40, aim: 1.00, cover: 6.0 },
  LS:  { dist: 4.8, h: 2.10, fov: 35, aim: 0.95, cover: 3.0 },
  MS:  { dist: 2.5, h: 1.50, fov: 27, aim: 1.15, cover: 1.25 },
  MCU: { dist: 1.8, h: 1.50, fov: 27, aim: 1.32, cover: 0.9 },
  CU:  { dist: 1.1, h: 1.55, fov: 27, aim: 1.52, cover: 0.55 },
  ECU: { dist: 0.7, h: 1.60, fov: 27, aim: 1.58, cover: 0.34 },
};
export const SIZE_FALLBACK = SIZE_CAM.MS;
/* 画幅 → 宽高比（决定同样的竖向视野能装下多宽的东西） */
export const ASPECT = { '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '1:1': 1, '2.35:1': 2.35 };
/** 要装下 w 米宽 × h 米高的东西，机位至少退多远。
 *  高度那一项就是景别表本身（cover 由 dist/fov 反推），不再放大；
 *  宽度多留 12% 余量：导演台窗口不是标准 16:9，贴边算会把肩膀切在画外。 */
export function fitDist(w, h, fovDeg, asp) {
  const t = Math.tan(cl(fovDeg, 12, 90) * DEG / 2);
  const a = asp > 0 ? asp : 16 / 9;
  return Math.max(h > 0 ? h / (2 * t) : 0, w > 0 ? w * 1.12 / (2 * t * a) : 0);
}

/* ================= 表二：角度 → 在同一基准上怎么改 =================
 * dh  机位高度增减（相对主体眼高）
 * aimMul / dAim 瞄准高度
 * dAz 方位角偏置（斜侧）
 * top 强制接近正上方
 * over 越肩：机位落到「第二个人」的肩后
 */
export const ANGLE_ADJ = {
  eye:   { },
  low:   { dh: -0.90, dAim: +0.10 },
  high:  { dh: +1.05, dAim: -0.10 },
  bird:  { dh: +3.40, dAim: -0.35, distMul: 0.45, fov: 55, top: true },
  dutch: { dAz: 34 },
  ots:   { over: true, distMul: 0.62, fovMul: 1.1 },
};

/* ================= 表三：运镜 → 起止机位 =================
 * 返回 [{distMul,hMul,az,dFov,tMul}, …]（1 或 2 点），相对基准机位做比例变换；
 * tMul 是「目标点沿视线方向偏移」——摇镜用的就是这一维（机位不动、看向的地方转）。
 */
export const MOVE_LENS = {
  /* 固定 */
  static:      [{ }],
  handheld:    [{ }, { dx: 0.18, dy: 0.10, hAdd: 0.05 }],
  steadicam:   [{ }, { dx: 0.35, hAdd: 0.02 }],
  povWalk:     [{ distMul: 1.15 }, { distMul: 0.62 }],
  /* 推拉 */
  slowPush:    [{ distMul: 1.85 }, { }],
  slowPull:    [{ }, { distMul: 1.95 }],
  crashZoomIn: [{ distMul: 2.6 }, { distMul: 0.9 }],
  crashZoomOut:[{ distMul: 0.9 }, { distMul: 2.6 }],
  zoomIn:      [{ distMul: 1.5 }, { }],
  zoomOut:     [{ }, { distMul: 1.6 }],
  dollyZoom:   [{ distMul: 1.55, fovMul: 0.72 }, { distMul: 0.95, fovMul: 1.25 }],
  snapZoom:    [{ distMul: 2.2 }, { distMul: 0.95 }],
  pullReveal:  [{ distMul: 0.55 }, { distMul: 2.1 }],
  /* 横移 / 摇 */
  truckLeft:   [{ dx: -0.55 }, { dx: 0.55 }],
  truckRight:  [{ dx: 0.55 }, { dx: -0.55 }],
  revealTrack: [{ dx: -0.8 }, { dx: 0.25 }],
  panLeft:     [{ tMul: 1 }, { tAz: -26 }],
  panRight:    [{ tMul: 1 }, { tAz: 26 }],
  whipPan:     [{ tAz: -22 }, { tAz: 22 }],
  swingShot:   [{ tAz: -34 }, { tAz: 34 }],
  /* 纵向 */
  craneUp:     [{ }, { hAdd: 1.9, distMul: 1.15 }],
  craneDown:   [{ hAdd: 1.9, distMul: 1.15 }, { }],
  pedestal:    [{ }, { hAdd: 0.75 }],
  tiltUp:      [{ tDy: 0.42 }, { tDy: -0.42 }],
  tiltDown:    [{ tDy: -0.42 }, { tDy: 0.42 }],
  /* 环绕 */
  orbitLeft:   [{ dAz: -22 }, { dAz: 22 }],
  orbitRight:  [{ dAz: 22 }, { dAz: -22 }],
  arcIn:       [{ dAz: -24, distMul: 1.6 }, { dAz: 14 }],
  spiralUp:    [{ dAz: -18 }, { dAz: 22, hAdd: 1.7 }],
  /* 跟随：机位跟着人走，两点前后拉开 */
  trackFront:  [{ distMul: 1.45 }, { distMul: 0.95 }],
  trackBehind: [{ distMul: 1.45 }, { distMul: 0.95, hAdd: 0.15 }],
  trackSide:   [{ dAz: -26, distMul: 1.15 }, { dAz: 26, distMul: 1.15 }],
  /* 特殊 */
  droneDive:   [{ hAdd: 6.5, distMul: 1.6 }, { }],
  droneRise:   [{ }, { hAdd: 6.5, distMul: 1.6 }],
  topRotate:   [{ dAz: -20, hAdd: 3.2 }, { dAz: 20, hAdd: 3.2 }],
  overShoulder:[{ over: true }],
  free:        [{ }],
};
export const MOVE_DEFAULT = [{ }];

/* ================= 场景类型：描述关键词 → 房间模板 =================
 * size = 房间宽×深（米）；props = [kind, 中心点在房间里的比例 fx/fy, rot]
 * walls: open3 = 后墙 + 左右墙（开口朝机位那侧）；back = 只有后墙；none = 全开放
 */
export const TPL = [
  { key: 'living', name: '客厅', size: [6, 4.5], walls: 'open3',
    re: /客厅|沙发|茶几|起居|电视墙|living/i,
    /* 沙发靠后墙、正面朝机位：两个人并排坐 = 标准双人镜头
       （以前沙发贴左墙，两个座位一前一后正好排在视线上，近景里就变成一个人挡住另一个人） */
    props: [['sofa', .42, .17, 0], ['coffee', .42, .42, 0], ['tv', .93, .35, 90], ['shelf', .8, .06, 0], ['lamp', .1, .85, 0], ['plant', .93, .08, 0]],
    subject: [.42, .45] },
  { key: 'bedroom', name: '卧室', size: [5, 4.2], walls: 'open3',
    re: /卧室|床|房间睡|主卧|寝室/,
    props: [['bed', .42, .3, 0], ['cabinet', .85, .12, 0], ['lamp', .12, .12, 0], ['chair', .82, .72, 180], ['plant', .12, .86, 0]],
    subject: [.55, .62] },
  { key: 'kitchen', name: '厨房', size: [4.6, 3.6], walls: 'open3',
    re: /厨房|灶|水槽|冰箱|做饭|橱柜/,
    props: [['fridge', .12, .12, 0], ['counter', .55, .1, 0], ['table', .5, .62, 0], ['chair', .28, .62, 270], ['chair', .72, .62, 90]],
    subject: [.5, .55] },
  { key: 'bath', name: '卫生间', size: [3.4, 2.6], walls: 'open3',
    re: /卫生间|浴室|洗手间|厕所|浴缸|马桶/,
    props: [['washer', .18, .2, 0], ['counter', .62, .18, 0], ['box', .2, .8, 0]],
    subject: [.5, .6] },
  { key: 'office', name: '办公室', size: [7, 5], walls: 'open3',
    re: /办公|工位|公司|写字楼|会议室?桌|电脑桌/,
    props: [['desk', .18, .2, 0], ['officechair', .18, .42, 180], ['desk', .5, .2, 0], ['officechair', .5, .42, 180], ['desk', .18, .62, 0], ['officechair', .18, .84, 180], ['cabinet', .86, .14, 90], ['plant', .86, .84, 0], ['shelf', .62, .9, 0]],
    subject: [.4, .5] },
  { key: 'class', name: '教室', size: [8, 5.5], walls: 'open3',
    re: /教室|课桌|黑板|学校|自习|课堂/,
    props: [['counter', .5, .1, 0], ['desk', .25, .45, 0], ['desk', .5, .45, 0], ['desk', .75, .45, 0], ['desk', .25, .75, 0], ['desk', .5, .75, 0], ['desk', .75, .75, 0], ['shelf', .08, .1, 0]],
    subject: [.5, .55] },
  { key: 'dining', name: '餐厅', size: [6, 4.5], walls: 'open3',
    re: /餐厅|饭桌|餐桌|馆子|饭店|食堂|吃饭/,
    props: [['table', .3, .45, 0], ['chair', .1, .45, 270], ['chair', .5, .45, 90], ['table', .72, .72, 0], ['chair', .55, .72, 270], ['chair', .88, .72, 90], ['plant', .1, .1, 0], ['lamp', .9, .12, 0]],
    subject: [.32, .45] },
  { key: 'meeting', name: '会议室', size: [6.5, 4.6], walls: 'open3',
    re: /会议|谈判|董事会|签约/,
    props: [['desk', .5, .45, 0], ['chair', .28, .28, 0], ['chair', .5, .28, 0], ['chair', .72, .28, 0], ['chair', .28, .62, 180], ['chair', .5, .62, 180], ['chair', .72, .62, 180], ['tv', .92, .45, 90], ['plant', .08, .88, 0]],
    subject: [.5, .45] },
  { key: 'balcony', name: '阳台', size: [3.4, 2.2], walls: 'back',
    re: /阳台|露台|天台|屋顶/,
    props: [['plant', .15, .3, 0], ['plant', .35, .3, 0], ['bench', .7, .35, 0], ['box', .9, .8, 0]],
    subject: [.45, .6] },
  { key: 'hall', name: '走廊', size: [7, 2.4], walls: 'open3',
    re: /走廊|过道|楼道|大厅|门厅|候诊/,
    props: [['bench', .2, .3, 0], ['plant', .62, .3, 0], ['shelf', .88, .3, 0], ['lamp', .05, .8, 0]],
    subject: [.45, .5] },
  { key: 'shop', name: '店铺', size: [6, 4.5], walls: 'open3',
    re: /便利店|超市|柜台|店里|店铺|咖啡|吧台|药房/,
    props: [['counter', .5, .2, 0], ['shelf', .1, .6, 0], ['shelf', .32, .6, 0], ['table', .78, .62, 0], ['chair', .66, .62, 270], ['chair', .9, .62, 90], ['plant', .92, .12, 0]],
    subject: [.45, .45] },
  { key: 'grove', name: '桃林', size: [12, 8], walls: 'none',
    /* 武戏外景：桃林/树林/溪谷/山道。没有墙（贴脸就穿墙），两侧一排树当内景框架，
       中间留出「横向杀线」那条空地；box/block 当溪谷湿石，plant 当草丛与落叶堆。 */
    re: /桃林|桃树|树林|森林|竹林|果园|溪谷|山谷|山道|林间|林子|野外|荒林|桃花/,
    /* 石头/草丛都压到画面两侧：以前一块「湿石」正好落在机位与主体之间，
       近景格里半屏都是石头，人反而看不见了 */
    props: [['tree', .05, .18, 0], ['tree', .22, .06, 0], ['tree', .44, .1, 0], ['tree', .68, .06, 0], ['tree', .88, .14, 0],
      ['tree', .06, .74, 0], ['tree', .26, .9, 0], ['tree', .5, .92, 0], ['tree', .74, .9, 0], ['tree', .94, .7, 0],
      ['box', .08, .46, 20], ['block', .93, .5, -15], ['plant', .16, .3, 0], ['plant', .84, .32, 0], ['plant', .4, .78, 0]],
    subject: [.62, .5] },
  { key: 'street', name: '街道', size: [10, 7], walls: 'back',
    re: /街|马路|巷|城外|路边|夜市|广场|门口|院子|庭院|公园|湖边|沙滩|荒野|高速/,
    props: [['tree', .12, .3, 0], ['tree', .38, .18, 0], ['tree', .74, .26, 0], ['tree', .92, .5, 0], ['pillar', .26, .62, 0], ['bench', .55, .62, 0], ['box', .84, .78, 0], ['lamp', .6, .4, 0]],
    subject: [.5, .5] },
  { key: 'interior', name: '房间', size: [5.5, 4.2], walls: 'open3',
    re: /.^/,
    props: [['table', .42, .42, 0], ['chair', .2, .42, 270], ['chair', .64, .42, 90], ['shelf', .86, .1, 0], ['lamp', .1, .86, 0], ['plant', .88, .84, 0]],
    subject: [.45, .45] },
];
export const OX = 2, OY = 2;    // 第一间房在网格上的落点

/* 人物配色：同一个名字在所有镜头里都是同一个颜色，连戏看得出来 */
const PALETTE = ['#2e7cf6', '#e2574c', '#2fa36b', '#e0a13a', '#8a5cd6', '#1fa8a0', '#d06a2a', '#5a6ac0'];
function colorOf(name) {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/* 人物识别：先从台词的「谁：」拿，再从画面描述里的身份词拿 */
const ROLE_RE = /(女主角?|男主角?|女|男|老人|老者|爷爷|奶奶|外公|外婆|爸爸|母亲|妈妈|父亲|儿子|女儿|孩子|小孩|婴儿|少年|少女|青年|中年|老师|学生|医生|护士|警察|警官|法官|律师|老板|经理|员工|同事|客服|快递员|外卖|司机|消防员|厨师|服务员|访客|陌生人|邻居|闺蜜|朋友|丈夫|妻子|老公|老婆|主角|反派|杀手|侦探|记者|主播|程序员|设计师)/g;
const WALK_RE = /走|进|出|跑|冲|奔|靠近|退|穿过|经过|迎上去|追/;
const SIT_RE = /坐|沙发|吃饭|用餐|开会|办公|喝茶|聊天|谈|写|看电脑|伏案|躺/;
const EMPTY_RE = /空镜|无人|空荡|没有[一人]|环境|远景空|街道|天空|海面/;

export function peopleOf(shot) {
  const text = String((shot && (shot.desc || '')) + ' ' + (shot.note || ''));
  const dlg = String((shot && shot.dialogue) || '');
  const out = [];
  const add = n => {
    const name = String(n).trim().slice(0, 6);
    if (!name || /^(台词|对白|字幕|画外音|旁白|无|空)$/.test(name)) return;
    if (!out.some(o => o.name === name)) out.push({ name, color: colorOf(name) });
  };
  /* H3 提示词导入的镜头自带出场人名表（@图 绑定 + 角色词），优先照它摆，别再猜 */
  ((shot && shot.cast) || []).forEach(add);
  /* 台词前缀：「女主：茶凉了」/「（男主）……」 */
  dlg.split(/[\n。！？!?]/).forEach(line => {
    const m = line.match(/^\s*[（(]?([^\s，。！？、：:,()（）]{1,6})[）)]?\s*[:：]/);
    if (m) add(m[1]);
  });
  /* 描述里的身份词 */
  const hits = text.match(ROLE_RE) || [];
  hits.forEach(h => add(h));
  /* 明确写了人数（「三个人围着桌子」「2 名员工」「一男一女」里的数量词也算）→ 补够人数 */
  const cap = capOf(shot, text);
  const cnt = countOf(text);
  for (let i = out.length + 1; i <= Math.max(cnt, ((shot && shot.cast) || []).length); i++) add('人物' + i);
  /* 兜底：有台词 / 是近景特写 / 描述里有人在做动作 → 至少 1 人；写明白是空镜就 0 人 */
  if (!out.length && !EMPTY_RE.test(text)) {
    const hasAct = /站|坐|走|躺|蹲|拿|看|说|哭|笑|打|抱|拉|推|望|回头|低|抬|吃|喝|写|敲|接|挂|开会|聊天|吵|跪|摔|亲|唱|跳|睡/.test(text);
    const tight = ['MCU', 'CU', 'ECU'].indexOf(shot && shot.shotSize) >= 0;
    if (dlg || hasAct || tight) out.push({ name: '人物', color: PALETTE[0] });
  }
  return out.slice(0, cap);
}

/* 一镜最多摆几个人：普通戏还是 3 个，H3 武戏（cast 里点了 5 个人）就按人数放开，
   否则「领头＋A＋B＋C＋青云」永远少两个人，画面里那场群架就打不起来。 */
function capOf(shot, text) {
  const named = ((shot && shot.cast) || []).length;
  return Math.max(3, Math.min(8, Math.max(named, countOf(text))));
}

/* 中文数字 + 阿拉伯数字的人数；「一个人物/人群」这类不算 */
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
export function countOf(text) {
  const s = String(text || '');
  let n = 0;
  const m1 = s.match(/(\d+|[一两二三四五六七八九十])\s*[个名位]\s*(?:人|演员|角色|男生|女生|男孩|女孩|孩子|学生|员工|同事|客人|警察|医生|护士)/);
  if (m1) n = CN_NUM[m1[1]] || +m1[1] || 0;
  const m2 = s.match(/(\d+|[一两二三四五六七八九十])\s*人/);
  if (m2) n = Math.max(n, CN_NUM[m2[1]] || +m2[1] || 0);
  if (/众人|人群|大家|一桌人|几个人/.test(s)) n = Math.max(n, 3);
  return Math.min(8, n);
}

/* ---------- 场景模板挑选 ---------- */
/* 一镜「算数」时看的所有文字。place 是 H3 导入带进来的地点（桃林口内侧）：
   时间码块里往往只写动作不写地方，少了它就会把一场桃林群架搭进客厅。 */
export function shotText(shot) {
  return [shot && shot.desc, shot && shot.dialogue, shot && shot.note, shot && shot.sceneKey, shot && shot.place].filter(Boolean).join(' ');
}
export function tplOf(text) {
  const s = String(text || '');
  for (const t of TPL) if (t.re.test(s)) return t;
  return TPL[TPL.length - 1];
}

/* ---------- 光线：描述里的时间 ---------- */
export function sunOf(text) {
  const s = String(text || '');
  if (/深夜|凌晨|夜里|夜晚|晚上|漆黑|月光|半夜/.test(s)) return { on: true, dir: 250, alt: 12 };
  if (/黄昏|傍晚|落日|夕阳|余晖/.test(s)) return { on: true, dir: 285, alt: 18 };
  if (/清晨|早晨|拂晓|晨光|日出/.test(s)) return { on: true, dir: 95, alt: 22 };
  if (/正午|烈日|大太阳|晴天/.test(s)) return { on: true, dir: 300, alt: 72 };
  if (/阴天|雨|雾|灰蒙/.test(s)) return { on: true, dir: 300, alt: 38 };
  return { on: true, dir: 300, alt: 53 };
}

/* ---------- 机位换算 ---------- */
function eyeTarget(cam) {
  const a = cam.az * DEG;
  return {
    eye: [cam.tx + Math.sin(a) * cam.dist, cam.h, cam.tz + Math.cos(a) * cam.dist],
    tgt: [cam.tx, cam.aim, cam.tz],
  };
}
/** eye/target → 导演台轨道相机（eye = target + r(sinφcosθ, cosφ, sinφsinθ)） */
export function camFromEye(eye, tgt) {
  const dx = eye[0] - tgt[0], dy = eye[1] - tgt[1], dz = eye[2] - tgt[2];
  const r = Math.hypot(dx, dy, dz) || 0.001;
  const phi = Math.acos(cl(dy / r, -1, 1));
  return {
    theta: Math.atan2(dz, dx),
    phi: cl(phi, 0.06, 3.02),
    r: cl(r, 0.45, 60),
    tx: tgt[0], ty: tgt[1], tz: tgt[2],
  };
}
/** 轨道相机 → 白模机位（builder.mnToShotScene 那套互逆公式） */
export function camToAz(c) {
  const th = (c.theta || 0) / DEG;
  return {
    az: ((90 - th) % 360 + 360) % 360,
    dist: Math.max(1.0, Math.abs(c.r * Math.sin(c.phi || 1))),
    h: Math.max(0.25, c.ty + c.r * Math.cos(c.phi || 1)),
    fov: 45,
  };
}

/* ---------- 房间 + 墙 + 道具 ---------- */
function buildLayout(tpl, box) {
  const [w, d] = tpl.size;
  const r = { id: uid('r'), name: tpl.name, x: box.x, y: box.y, w, d, h: 4, color: '' };
  const rooms = [r];
  const walls = [];
  const W = (x1, y1, x2, y2) => walls.push({ id: uid('w'), name: '', x1, y1, x2, y2, h: 2.6, holes: [] });
  if (tpl.walls === 'open3' || tpl.walls === 'back') W(r.x, r.y, r.x + r.w, r.y);              // 后墙
  if (tpl.walls === 'open3') { W(r.x, r.y, r.x, r.y + r.d); W(r.x + r.w, r.y, r.x + r.w, r.y + r.d); }
  const K = window.MN_PROP_KINDS || {};
  const props = (tpl.props || []).map(([kind, fx, fy, rot]) => {
    const def = K[kind] || {};
    const pw = cl(def.w || 1, 0.15, 6), pd = cl(def.d || 1, 0.15, 6), ph = cl(def.h || 1, 0.05, 4);
    return {
      id: uid('p'), name: def.name || kind, kind,
      x: r.x + fx * r.w - pw / 2, y: r.y + fy * r.d - pd / 2,
      w: pw, d: pd, h: ph, rot: ((rot || 0) % 360 + 360) % 360, color: '', hidden: false,
    };
  });
  const lights = tpl.walls === 'none' ? [] : [{ id: uid('l'), name: '顶灯', x: r.x + r.w * 0.5, y: r.y + r.d * 0.45, color: '#ffe9b0', hidden: false }];
  return { rooms, walls, props, lights, room: r };
}

/* 座位清单（世界坐标），按道具出现顺序 */
function seatList(scene) {
  const L = window.MN_LAYOUT;
  const out = [];
  if (!L || !L.seatsOf) return out;
  for (const p of (scene.props || [])) {
    const ss = L.seatsOf(p);
    if (!ss) continue;
    for (let i = 0; i < ss.length; i++) {
      const sw = L.seatWorld(p, i);
      if (sw) out.push(sw);
    }
  }
  return out;
}

/* ---------- 人物摆位 ---------- */
function placePeople(people, scene, room, o) {
  const cx = room.x + (o.subject ? o.subject[0] : 0.45) * room.w;
  const cy = room.y + (o.subject ? o.subject[1] : 0.45) * room.d;
  const seats = seatList(scene);
  const wantSit = !!o.sit && seats.length >= Math.min(people.length, 2);
  const n = people.length;
  const stand = [];
  /* 武戏（刀剑劈刺抹磕）另走一套站位：主体站画面右、对手沿画面左一条浅弧排开，
     双方互相面对——这就是「横向杀线」，不是开会那种围桌。 */
  const duel = !!o.duel && n >= 2;
  if (duel) {
    stand.push([cx + 0.9, cy]);
    for (let i = 1; i < n; i++) {
      const t = (i - 1) / Math.max(1, n - 2) - 0.5;
      stand.push([cx - 1.05 - 0.6 * Math.abs(t), cy + t * 2.9]);
    }
  } else if (n === 1) stand.push([cx, cy]);
  else if (n === 2) { stand.push([cx - 0.75, cy]); stand.push([cx + 0.75, cy]); }
  else if (n === 3) { stand.push([cx - 1.05, cy + 0.15]); stand.push([cx + 1.05, cy - 0.1]); stand.push([cx, cy + 1.05]); }
  else {
    /* 4 人以上（武戏群架）：以前 stand 只有三格，第 4 个人直接 stand[i][0] 崩。
       主体站画面右侧、其余沿左侧一条浅弧排开并压出纵深，符合「横向杀线」的走位。 */
    stand.push([cx + 0.9, cy]);
    for (let i = 1; i < n; i++) {
      const t = (i - 1) / Math.max(1, n - 2) - 0.5;
      stand.push([cx - 1.05 - 0.5 * Math.abs(t), cy + t * 2.8]);
    }
  }
  const persons = people.map((pe, i) => {
    let x = stand[i][0], y = stand[i][1], rot = 90, pose = '站立', sat = null;
    /* 面对面的对话戏：两个人互相看着（景别收紧时主体那一侧仍会被机位转到正面） */
    if (duel) rot = i === 0 ? 180 : 0;          // 主体朝画面左压进，对手都朝画面右
    else if (n === 2) rot = i === 0 ? 0 : 180;
    else if (n === 3) rot = i === 2 ? 90 : (i === 0 ? 20 : 160);
    else if (n > 3) rot = i === 0 ? 180 : 0;
    if (wantSit && seats[i]) sat = seats[i];
    const p = {
      id: uid('a'), name: pe.name, x: +x.toFixed(2), y: +y.toFixed(2),
      rot, color: pe.color || '#2e7cf6', pose,
      face: 1, faceDir: 0, jump: 0, hidden: false,
    };
    /* 落座交给导演台自己的 seatPerson：位置 / 朝向 / 坐面高一次算好，格式和手动摆的完全一致 */
    if (sat && window.MN_LAYOUT && window.MN_LAYOUT.seatPerson) {
      window.MN_LAYOUT.seatPerson(p, sat);
    } else if (sat) {
      p.x = +sat.x.toFixed(2); p.y = +sat.y.toFixed(2); p.rot = sat.rot; p.sitH = sat.h; p.pose = '坐下';
      p.sitOn = { id: sat.propId, seat: sat.seat };
    }
    /* 走路戏：只有没坐下的人给走位线，方向一律朝机位这侧（画面里看得见在靠近） */
    if (o.walk && !sat && i === 0) {
      p.path = [{ x: p.x, y: +Math.max(room.y + 0.4, p.y - 1.3).toFixed(2) }, { x: p.x, y: p.y }];
      p.pose = '走路'; p.speed = 1.1;
    }
    return p;
  });
  return { persons, cx, cy };
}

/* 这一镜的「主体那个人」：描述里第一个点名的，没点名就是花名册第一个 */
function pickSubject(persons, text) {
  const live = (persons || []).filter(p => p && !p.hidden);
  if (!live.length) return null;
  let pick = live[0], at = Infinity;
  for (const p of live) {
    const i = String(text || '').indexOf(p.name);
    if (i >= 0 && i < at) { at = i; pick = p; }
  }
  return pick;
}

/* ---------- 主体点 ----------
 * 宽景别（ELS/LS/MS）看向两个人中间 = 双人镜头；
 * 紧景别（MCU/CU/ECU）看向主体本人。没人就看房间里的主体位。
 * 主体优先取「这一镜描述里第一个点名的那个人」，这样近景男主不会怼到女主脸上。 */
function subjectOf(persons, fallback, wide, text) {
  const live = (persons || []).filter(p => p && !p.hidden);
  if (!live.length) return { tx: fallback[0], tz: fallback[1] };
  if (wide && live.length >= 2) return { tx: (live[0].x + live[1].x) / 2, tz: (live[0].y + live[1].y) / 2 };
  const pick = pickSubject(live, text);
  return { tx: pick.x, tz: pick.y };
}

/* ---------- 一次镜头的完整方案 ----------
 * ctx = { project, groupKey, layout（同场次沿用）, people（同场次花名册）, aspect }
 * 返回 { mnState, whiteCam, notes, tpl, layout, people }
 */
export function planShot(shot, ctx = {}) {
  const text = shotText(shot);
  const tpl = ctx.tpl || tplOf(text);
  const aspect = ctx.aspect || '16:9';

  /* 空间：同场次沿用同一套房间/墙/道具 */
  let layout = ctx.layout;
  if (!layout) layout = buildLayout(tpl, { x: OX, y: OY });
  const scene = { rooms: layout.rooms, walls: layout.walls, props: layout.props, lights: layout.lights };
  const room = layout.room;

  /* 人：同场次沿用花名册，本镜识别到新的就补进来（上限按这一镜点名的人数放开） */
  const found = peopleOf(shot);
  const cap = capOf(shot, text);
  const roster = (ctx.people || []).slice();
  for (const pe of found) if (!roster.some(o => o.name === pe.name)) roster.push(pe);
  /* 明确写了空镜/无人 → 这一镜不放人（花名册留着，下一镜还会回来） */
  const emptyShot = /空镜|无人|空荡|没有人|不见人影/.test(String(shot.desc || '') + String(shot.note || ''));
  let people = emptyShot ? [] : roster.slice(0, cap);
  /* 这一镜点名的人必须在场：花名册满了就顶掉一个本镜没点名的，
     否则「特写，女主的手在抖」会因为前面一场先出现了「三个人」而拍错人。 */
  for (const pe of found) {
    if (people.some(o => o.name === pe.name)) continue;
    if (people.length < cap) { people.push(pe); continue; }
    const i = people.findIndex(o => !found.some(f => f.name === o.name));
    people[i >= 0 ? i : people.length - 1] = pe;
  }

  const placed = placePeople(people, scene, room, {
    subject: tpl.subject,
    sit: SIT_RE.test(text) && !/站|站起来|起身/.test(String(shot.desc || '')),
    walk: WALK_RE.test(String(shot.desc || '')) && !/站|坐|躺/.test(String(shot.desc || '').slice(0, 6)),
    duel: /劈|刺|抹|磕|砍|斩|交手|格挡|抢进|让过|收势|杀|弯刀|长剑|破铁剑|拳|弓/.test(text),
  });
  scene.persons = placed.persons;

  /* 撞了家具的东西自动排开；走位线绕开障碍 */
  const L = window.MN_LAYOUT;
  if (L && L.resolveScene && !ctx.layout) L.resolveScene(scene, { maxR: 2.5 });
  if (L && L.routeAllPaths) L.routeAllPaths(scene);

  /* 机位基准 */
  const sz = SIZE_CAM[shot.shotSize] || SIZE_FALLBACK;
  const ang = ANGLE_ADJ[shot.angle] || {};
  const wide = ['ELS', 'LS', 'MS'].indexOf(shot.shotSize) >= 0;
  const subj = pickSubject(scene.persons, shot.desc);
  const s = subjectOf(scene.persons, [room.x + tpl.subject[0] * room.w, room.y + tpl.subject[1] * room.d], wide, shot.desc);
  /* 坐着的人整体矮 0.45m：机位高度和瞄准点一起降，不然近景拍到的是天花板 */
  const seatShift = (subj && subj.pose === '坐下') ? -0.45 : 0;
  const noPeople = !scene.persons.length;
  const base = {
    az: 0,
    dist: cl(sz.dist, 0.6, 16),
    h: cl(sz.h + (noPeople ? 0.2 : seatShift), 0.25, 12),
    aim: cl(sz.aim + seatShift * 0.8, 0.2, 6),
    fov: cl(sz.fov, 12, 90),
    tx: s.tx, tz: s.tz,
  };
  if (ang.dh) base.h = cl(base.h + ang.dh, 0.25, 12);
  if (ang.dAim) base.aim = cl(base.aim + ang.dAim, 0.2, 6);
  if (ang.distMul) base.dist = cl(base.dist * ang.distMul, 0.6, 18);
  if (ang.fov) base.fov = ang.fov;
  if (ang.fovMul) base.fov = cl(base.fov * ang.fovMul, 12, 90);
  if (ang.dAz) base.az = cl(base.az + ang.dAz, -50, 50);
  const angleOver = !!ang.over && scene.persons.length >= 2;

  /* 提示词里写了硬数字就照数字来（H3 导入的镜头带焦段 + 机位高度）。
     这一步是「预览终于会读关键信息」的关键：35mm 和 100mm 不该是同一个画面，
     「齐腰高」和「低机位微仰」也不该都落到表里的 1.5m。 */
  if (isFinite(+shot.lens) && +shot.lens >= 8) base.fov = cl(2 * Math.atan(12 / +shot.lens) * 180 / Math.PI, 8, 100);
  if (shot.camH != null && shot.camH !== '' && isFinite(+shot.camH)) base.h = cl(+shot.camH, 0.25, 12);
  if (shot.aimY != null && shot.aimY !== '' && isFinite(+shot.aimY)) base.aim = cl(+shot.aimY, 0.2, 6);

  /* 画幅核对：并排的两个人要都进画、空镜要装下整间房 —— 该退后就得退，
     不然 16:9 里算好的「中景」到了 4:3 的窗口里就成了切头切身的近景。 */
  {
    const asp = ASPECT[aspect] || 16 / 9;
    const inFrame = angleOver ? (subj ? [subj] : []) : (wide ? scene.persons : (subj ? [subj] : []));
    let needW = 0.8, needH = sz.cover;
    if (inFrame.length >= 2) {
      const rx = Math.cos(base.az * DEG), rz = -Math.sin(base.az * DEG);   // 屏幕横向单位向量
      let span = 0;
      for (let i = 1; i < inFrame.length; i++) span = Math.max(span, Math.abs((inFrame[i].x - inFrame[0].x) * rx + (inFrame[i].y - inFrame[0].y) * rz));
      needW = span + 0.9; needH = Math.max(sz.cover, 1.15);
    } else if (!inFrame.length) {
      needW = room.w * 0.95; needH = Math.max(sz.cover, room.d * 0.8 + 1.2);
    }
    /* 宽度余量在 fitDist 里；单人/特写这类「表里已经算准」的情况不会被改变 */
    base.dist = cl(Math.max(base.dist, fitDist(needW, needH, base.fov, asp)), 0.6, 22);
  }

  /* 越肩：机位落到「第二个人」肩后 0.9m、看向主体 —— 前景那颗肩膀就是过肩镜头的灵魂 */
  function overEyeTarget(c) {
    const p0 = subj || scene.persons[0];
    const p1 = scene.persons.find(p => p !== p0 && !p.hidden);
    if (!p0 || !p1) return null;
    const a = c.az * DEG, back = 0.9;
    return {
      eye: [p1.x + Math.sin(a) * back, cl(p1.pose === '坐下' ? 1.18 : 1.46, 0.3, 12), p1.y + Math.cos(a) * back],
      tgt: [p0.x, cl(p0.pose === '坐下' ? 1.05 : 1.45, 0.2, 6), p0.y],
    };
  }

  /* 运镜 → 起止机位 */
  const lens = MOVE_LENS[shot.cameraMove] || MOVE_DEFAULT;
  const pts = lens.map(v => {
    const c = Object.assign({}, base);
    if (v.distMul) c.dist = cl(c.dist * v.distMul, 0.6, 18);
    if (v.fovMul) c.fov = cl(c.fov * v.fovMul, 12, 90);
    if (v.hAdd) c.h = cl(c.h + v.hAdd, 0.2, 14);
    if (v.dAz) c.az = cl(c.az + v.dAz, -50, 50);
    if (v.dx) { const a = c.az * DEG; c.tx += Math.cos(a) * v.dx * c.dist; c.tz += -Math.sin(a) * v.dx * c.dist; }
    let et = eyeTarget(c);
    if (v.over || angleOver) { const o = overEyeTarget(c); if (o) et = o; }
    /* 摇镜：机位不动，把「看向的地方」绕机位转一个角度 —— 这才是真正的 pan，不是机位搬家 */
    let tgt = et.tgt;
    if (v.tAz) {
      const a = v.tAz * DEG, ca = Math.cos(a), sa = Math.sin(a);
      const vx = tgt[0] - et.eye[0], vz = tgt[2] - et.eye[2];
      tgt = [et.eye[0] + vx * ca - vz * sa, tgt[1], et.eye[2] + vx * sa + vz * ca];
    }
    if (v.tDy) tgt = [tgt[0], cl(tgt[1] + v.tDy * c.dist * 0.35, 0.05, 6), tgt[2]];
    return { cam: camFromEye(et.eye, tgt), fov: c.fov, eye: et.eye, tgt };
  });

  const mvName = lens.length > 1 ? '起/止两个机位' : '单机位';
  const notes = [
    tpl.name + ' ' + room.w + '×' + room.d + 'm',
    scene.persons.length ? (scene.persons.length + ' 人（' + scene.persons.map(p => p.name).join('、') + '）' + (scene.persons.some(p => p.sitOn) ? '已落座' : '')) : '空镜（无人）',
    '机位 ' + pts.map(p => Math.hypot(p.eye[0] - p.tgt[0], p.eye[2] - p.tgt[2]).toFixed(1) + 'm/高' + p.eye[1].toFixed(1) + 'm').join(' → ') + ' · ' + Math.round(pts[0].fov) + '°',
    (shot.cameraMoveName || shot.cameraMove) + '：' + mvName,
  ];

  const st = {
    format: 'aistudio-director', version: 1, updatedAt: Date.now(),
    scene: {
      title: (String(shot.desc || tpl.name).replace(/\s+/g, '') || tpl.name).slice(0, 18),
      rooms: scene.rooms, walls: scene.walls, props: scene.props, persons: scene.persons,
      lights: scene.lights, ground: { color: '#ffffff', grid: true },
    },
    view: { mode: '3d', material: 'original', zoom: 1, x: 0, y: 0, grid: true, floorColor: true },
    sun: sunOf(text),
    camera: { size: aspect, frame: false, cutaway: true, ceil: tpl.walls !== 'none', fov: Math.round(pts[0].fov) },
    directorShots: pts.map((p, i) => ({
      name: (pts.length > 1 ? (i ? '落幅 ' : '起幅 ') : '机位 ') + Math.round(Math.hypot(p.eye[0] - p.tgt[0], p.eye[2] - p.tgt[2]) * 10) / 10 + 'm',
      cam: p.cam,
    })),
    project: null, cuttingDesk: null, cameraPath: null, editorPreferences: {},
    autoBuild: { tpl: tpl.key, people: scene.persons.map(p => p.name), move: shot.cameraMove || 'static' },
  };
  return { mnState: st, whiteCam: Object.assign(camToAz(pts[0].cam), { fov: Math.round(pts[0].fov) }), notes, tpl, layout, people: scene.persons.map(p => ({ name: p.name, color: p.color })) };
}

/* ---------- 批量：整板规划 ----------
 * targets = 要处理的镜头下标数组；已经搭过景的镜头由调用方决定跳过（这里不判）
 * 返回 [{ shot, index, plan }]
 */
export function planProject(shots, targets, opts = {}) {
  const groups = {};
  const out = [];
  for (const idx of targets) {
    const shot = shots[idx];
    if (!shot) continue;
    const text = shotText(shot);
    const key = String(shot.sceneKey || '').trim() || tplOf(text).key;
    const g = groups[key] || (groups[key] = { tpl: tplOf(text), layout: null, people: [] });
    const plan = planShot(shot, Object.assign({ aspect: opts.aspect }, g, {
      layout: g.layout,
      people: g.people,
    }));
    /* 第一条定下这一场的空间与花名册，后面的镜头沿用 */
    if (!g.layout) {
      g.layout = plan.layout;
      g.people = plan.people;
    } else {
      g.people = plan.people;
    }
    out.push({ shot, index: idx, plan, groupKey: key });
  }
  return out;
}

/* ---------- 「这个镜头已经有景了吗」 ---------- */
export function hasScene(shot) {
  if (!shot) return false;
  const sc = shot.mnState && shot.mnState.scene;
  if (sc && ((sc.rooms || []).length || (sc.props || []).length || (sc.persons || []).length || (sc.walls || []).length || (sc.env && (sc.env.src || sc.env.ref)))) return true;
  return !!(shot.scene && Array.isArray(shot.scene.objects) && shot.scene.objects.length);
}

/* 供测试与外部复用 */
export const _internals = { uid, cl, colorOf, seatList, buildLayout, eyeTarget, pickSubject, subjectOf, placePeople };
