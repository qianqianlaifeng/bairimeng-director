/* ============================================================
 * 白日梦导演台 · 数据字典
 * 运镜词典 / 景别 / 角度 / 提示词模板 / 成就 / 教程
 * 全部内容为本项目原创编写
 * ============================================================ */

/* ---------------- 运镜词典（37 种；页面计数一律用 CAMERA_MOVES.length） ----------------
 * sim: 运镜模拟器的动作定义
 *   type: dolly|orbit|pan|tilt|zoom|crane|track|rotate|static|handheld|spiral|fly
 *   dir: in|out|left|right|up|down|front|behind|cw|ccw ...
 *   fov: 视角变化（希区柯克变焦用）
 */
const CAMERA_MOVES = [
  /* — 固定 — */
  { key: 'static',     name: '固定镜头',   en: 'Static Shot',        cat: '固定',
    desc: '机位完全不动，靠画面内的表演与构图讲故事。最稳、最省钱，情绪段落的首选。',
    prompt: '固定机位，画面稳定不动，靠人物表演推动叙事，static camera, locked shot',
    sim: { type: 'static' } },
  { key: 'slowPush',   name: '缓推',       en: 'Slow Push In',       cat: '推拉',
    desc: '镜头极缓慢地向主体推进，观众不知不觉被"吸入"情绪。适合独白、告白、压抑爆发前。',
    prompt: '镜头缓慢向前推进，逐渐靠近主体面部，slow dolly in, gradual push in, cinematic',
    sim: { type: 'dolly', dir: 'in', speed: 0.35 } },
  { key: 'slowPull',   name: '缓拉',       en: 'Slow Pull Out',      cat: '推拉',
    desc: '缓慢后退拉开距离，主体逐渐变小、环境显现。表达孤独、抽离、故事收尾。',
    prompt: '镜头缓慢向后拉远，主体渐渐变小，环境全貌展开，slow dolly out, pull back reveal',
    sim: { type: 'dolly', dir: 'out', speed: 0.35 } },
  { key: 'crashZoomIn', name: '急推',      en: 'Crash Zoom In',      cat: '推拉',
    desc: '猛地一下怼到主体脸上。冲击力极强，用于震惊、发现、喜剧反差。',
    prompt: '镜头急速向前猛推，瞬间拉近到主体特写，crash zoom in, fast dolly in, impact',
    sim: { type: 'dolly', dir: 'in', speed: 1.6 } },
  { key: 'crashZoomOut', name: '急拉',     en: 'Crash Zoom Out',     cat: '推拉',
    desc: '猛然拉开，从局部瞬间看到全貌。揭示型镜头：原来他站在悬崖边！',
    prompt: '镜头急速拉远，从局部特写瞬间展示全景环境，crash zoom out, fast pull back, reveal',
    sim: { type: 'dolly', dir: 'out', speed: 1.6 } },
  { key: 'zoomIn',     name: '变焦推近',   en: 'Zoom In',            cat: '推拉',
    desc: '机位不动、只拧变焦环放大。画面有"压缩感"，和推轨的透视变化完全不同，老片质感。',
    prompt: '固定机位变焦推近，画面放大但透视不变，zoom in, lens zoom, vintage film look',
    sim: { type: 'zoom', dir: 'in', speed: 0.5 } },
  { key: 'zoomOut',    name: '变焦拉远',   en: 'Zoom Out',           cat: '推拉',
    desc: '固定机位变焦缩小，从细节交代到全环境。纪录片、监控、新闻感。',
    prompt: '固定机位变焦拉远，从细节展开到全景，zoom out, lens zoom out, documentary style',
    sim: { type: 'zoom', dir: 'out', speed: 0.5 } },
  { key: 'dollyZoom',  name: '希区柯克变焦', en: 'Dolly Zoom',       cat: '推拉',
    desc: '推轨前进的同时反向变焦，主体大小不变而背景空间扭曲变形。眩晕、恐惧、恍然的开创性拍法。',
    prompt: '镜头前推同时反向变焦，主体大小不变背景空间扭曲变形，dolly zoom, vertigo effect, hitchcock zoom',
    sim: { type: 'dollyZoom', dir: 'in', speed: 0.5 } },
  /* — 横移 / 摇 — */
  { key: 'truckLeft',  name: '左移',       en: 'Truck Left',         cat: '横移',
    desc: '整个机位向左平移，像人侧着走看风景。展现空间横向层次。',
    prompt: '镜头向左平稳横移，lateral tracking shot, truck left, smooth glide',
    sim: { type: 'track', dir: 'left', speed: 0.5 } },
  { key: 'truckRight', name: '右移',       en: 'Truck Right',        cat: '横移',
    desc: '机位向右平移。与左移成对使用可做"擦除转场"。',
    prompt: '镜头向右平稳横移，lateral tracking shot, truck right, smooth glide',
    sim: { type: 'track', dir: 'right', speed: 0.5 } },
  { key: 'panLeft',    name: '左摇',       en: 'Pan Left',           cat: '横移',
    desc: '机位不动，镜头向左水平转动。交代空间关系、跟随视线。',
    prompt: '机位固定镜头向左缓慢转动，pan left, horizontal pan, smooth rotation',
    sim: { type: 'pan', dir: 'left', speed: 0.5 } },
  { key: 'panRight',   name: '右摇',       en: 'Pan Right',          cat: '横移',
    desc: '镜头向右水平转动。开场交代环境的经典起手式。',
    prompt: '机位固定镜头向右缓慢转动，pan right, horizontal pan, smooth rotation',
    sim: { type: 'pan', dir: 'right', speed: 0.5 } },
  { key: 'whipPan',    name: '甩镜',       en: 'Whip Pan',           cat: '横移',
    desc: '极快的摇镜，画面糊成一片。两个甩镜对接就是最帅的免费转场。',
    prompt: '镜头快速甩动，画面动态模糊，whip pan, fast pan, motion blur transition',
    sim: { type: 'pan', dir: 'right', speed: 2.4, blur: true } },
  { key: 'swingShot',  name: '摆镜扫过',   en: 'Swing Sweep',        cat: '横移',
    desc: '大范围弧线扫过一个空间，像头转过去看。衔接两个关注点。',
    prompt: '镜头大幅弧线摆动扫过场景，swing shot, sweeping pan, wide arc movement',
    sim: { type: 'pan', dir: 'left', speed: 0.9, arc: true } },
  /* — 纵向 — */
  { key: 'craneUp',    name: '升镜头',     en: 'Crane Up',           cat: '纵向',
    desc: '机位垂直升起，从平视逐渐俯瞰。仪式感、解脱感、"故事变大"。',
    prompt: '镜头垂直升起逐渐俯瞰全景，crane up, rising shot, aerial ascend, cinematic',
    sim: { type: 'crane', dir: 'up', speed: 0.5 } },
  { key: 'craneDown',  name: '降镜头',     en: 'Crane Down',         cat: '纵向',
    desc: '机位下降贴近地面或主体。潜入感、压迫感登场。',
    prompt: '镜头从高处缓缓下降贴近主体，crane down, descending shot, camera drops',
    sim: { type: 'crane', dir: 'down', speed: 0.5 } },
  { key: 'tiltUp',     name: '上摇',       en: 'Tilt Up',            cat: '纵向',
    desc: '机位不动、镜头从下往上仰起。看高楼、看巨人、看它到底有多高。',
    prompt: '机位固定镜头从下往上仰摇，tilt up, vertical pan, low to high',
    sim: { type: 'tilt', dir: 'up', speed: 0.5 } },
  { key: 'tiltDown',   name: '下摇',       en: 'Tilt Down',          cat: '纵向',
    desc: '镜头从上往下俯摇。从天空落到事件，经典悬念开场。',
    prompt: '机位固定镜头从上往下俯摇，tilt down, vertical pan, high to low, reveal',
    sim: { type: 'tilt', dir: 'down', speed: 0.5 } },
  { key: 'pedestal',   name: '升降跟随',   en: 'Pedestal Follow',    cat: '纵向',
    desc: '机位升降同时轻微跟随主体。人物站起时镜头一起起来，气场全开。',
    prompt: '镜头随主体起立同步上升，pedestal move, camera rises with subject',
    sim: { type: 'crane', dir: 'up', speed: 0.4, follow: true } },
  /* — 环绕 — */
  { key: 'orbitLeft',  name: '左环绕',     en: 'Orbit Left',         cat: '环绕',
    desc: '围绕主体逆时针转圈。360°展示人物/产品，高光时刻专用。',
    prompt: '镜头围绕主体缓慢逆时针环绕，orbit shot, arc shot around subject, cinematic',
    sim: { type: 'orbit', dir: 'ccw', speed: 0.45 } },
  { key: 'orbitRight', name: '右环绕',     en: 'Orbit Right',        cat: '环绕',
    desc: '围绕主体顺时针转圈。和左环绕交替可做时间流逝感。',
    prompt: '镜头围绕主体缓慢顺时针环绕，orbit shot clockwise, arc shot, cinematic',
    sim: { type: 'orbit', dir: 'cw', speed: 0.45 } },
  { key: 'arcIn',      name: '弧形推进',   en: 'Arc Dolly In',       cat: '环绕',
    desc: '一边绕一边靠近主体。比直线推进更灵动，商业片出场标配。',
    prompt: '镜头沿弧线一边环绕一边推进靠近主体，arc dolly in, curved approach, dynamic',
    sim: { type: 'spiral', dir: 'cw', speed: 0.5, radiusIn: true } },
  { key: 'spiralUp',   name: '螺旋上升',   en: 'Spiral Up',          cat: '环绕',
    desc: '围绕主体盘旋上升。终极展示镜头：主角立于中央，天地旋转。',
    prompt: '镜头围绕主体螺旋盘旋上升，spiral shot, ascending orbit, epic reveal',
    sim: { type: 'spiral', dir: 'cw', speed: 0.5, rise: true } },
  /* — 跟随 — */
  { key: 'trackFront', name: '正面跟拍',   en: 'Tracking Front',     cat: '跟随',
    desc: '镜头在主体前方倒退着拍他走来。眼神直击镜头，代入感最强。',
    prompt: '镜头在主体正前方倒退跟拍，人物直视镜头走来，front tracking shot, steadicam backwards',
    sim: { type: 'follow', dir: 'front', speed: 0.6 } },
  { key: 'trackBehind', name: '背面跟拍',  en: 'Tracking Behind',    cat: '跟随',
    desc: '镜头在主体身后跟着走。观众变成"跟在他身后的人"，悬念感强。',
    prompt: '镜头在主体身后跟随前进，back view tracking shot, follow camera from behind',
    sim: { type: 'follow', dir: 'behind', speed: 0.6 } },
  { key: 'trackSide',  name: '侧面跟拍',   en: 'Tracking Side',      cat: '跟随',
    desc: '与主体并行同速侧跟。行进感、路程感一目了然。',
    prompt: '镜头与主体平行同速侧面跟拍，side tracking shot, parallel follow, walking shot',
    sim: { type: 'follow', dir: 'side', speed: 0.6 } },
  { key: 'revealTrack', name: '移出揭示',  en: 'Reveal Track',       cat: '跟随',
    desc: '前景先挡住画面，机位一移，藏在后面的主体显现。廉价又高级的惊喜。',
    prompt: '镜头横移越过前景遮挡物，隐藏的主体被揭示出来，reveal tracking shot, lateral reveal',
    sim: { type: 'reveal', dir: 'left', speed: 0.6 } },
  /* — 特殊 — */
  { key: 'handheld',   name: '手持跟拍',   en: 'Handheld',           cat: '特殊',
    desc: '摄影师手持的呼吸感晃动。纪实、慌乱、真实、纪实感拉满。',
    prompt: '手持摄影，画面轻微晃动有呼吸感，handheld camera, shaky cam, documentary realism',
    sim: { type: 'handheld', speed: 0.4 } },
  { key: 'steadicam',  name: '斯坦尼康',   en: 'Steadicam Glide',    cat: '特殊',
    desc: '稳定器的丝滑漂浮移动，像一只看不见的眼睛穿过空间。',
    prompt: '稳定器丝滑运镜，镜头漂浮穿过空间，steadicam shot, smooth floating camera, gliding',
    sim: { type: 'track', dir: 'left', speed: 0.4, glide: true } },
  { key: 'droneDive',  name: '无人机俯冲', en: 'Drone Dive',         cat: '特殊',
    desc: '无人机从高空直冲而下扎进场景。开场王炸，气势无解。',
    prompt: '无人机航拍从高空急速俯冲下降扎入场景，drone dive, aerial descent, epic opening',
    sim: { type: 'fly', dir: 'dive', speed: 0.8 } },
  { key: 'droneRise',  name: '无人机拉升', en: 'Drone Rise',         cat: '特殊',
    desc: '从主体身边垂直拔起到高空。结尾升华：人在天地间越来越小。',
    prompt: '无人机航拍从主体位置垂直拉升到高空俯瞰，drone rise up, aerial pull up, epic ending',
    sim: { type: 'fly', dir: 'rise', speed: 0.8 } },
  { key: 'topRotate',  name: '俯瞰旋转',   en: 'Top-Down Rotate',    cat: '特殊',
    desc: '正俯视 + 缓慢旋转。上帝视角，仪式感和宿命感。',
    prompt: '正上方俯拍，镜头缓慢旋转，top-down rotating shot, bird view, god perspective',
    sim: { type: 'rotate', speed: 0.3, top: true } },
  { key: 'overShoulder', name: '越肩环绕', en: 'Over-Shoulder Swing', cat: '特殊',
    desc: '从越肩位起幅绕过肩膀落到主体正面。对话戏的灵动变化。',
    prompt: '镜头从越肩机位弧线绕过人物肩膀转向正面，over-the-shoulder swing, arcing dialogue shot',
    sim: { type: 'swingOver', speed: 0.5 } },
  { key: 'pullReveal', name: '拉远揭示',   en: 'Pull Back Reveal',   cat: '特殊',
    desc: '从一个细节缓缓拉出，最终揭示令人意外的全貌。喜剧反转、惊悚揭底。',
    prompt: '镜头从局部细节缓缓拉远，揭示完整场景全貌，pull back reveal, zoom out to wide, surprise',
    sim: { type: 'dolly', dir: 'out', speed: 0.4, reveal: true } },
  { key: 'povWalk',    name: '第一人称',   en: 'POV Walking',        cat: '特殊',
    desc: '模拟主角眼睛的行走视角。沉浸式恐怖/探索标配。',
    prompt: '第一人称视角行走，模拟主角视线，POV shot, first person camera walking, immersive',
    sim: { type: 'pov', speed: 0.5 } },
  { key: 'snapZoom',   name: '急甩停顿',   en: 'Snap Zoom + Hold',   cat: '特殊',
    desc: '猛推到位后定住，配打击音效就是免费的情绪爆点。',
    prompt: '镜头快速推近到位后定住，snap zoom then hold, punch in, dramatic beat',
    sim: { type: 'dolly', dir: 'in', speed: 2.2, hold: 0.4 } },
  { key: 'free',       name: '自由机位',   en: 'Free Camera',        cat: '特殊',
    desc: '在场景搭建器里手动设计机位：方位角、距离、高度、视野全部自定义。',
    prompt: '自定义机位拍摄，custom camera position, manual framing, art-directed shot',
    sim: { type: 'free' } },
];

/* 运镜分类 */
const MOVE_CATS = ['固定', '推拉', '横移', '纵向', '环绕', '跟随', '特殊'];

/* ---------------- 景别 ---------------- */
const SHOT_SIZES = [
  { key: 'ELS', name: '大远景', prompt: '大远景，人物极小环境占满画面，extreme wide shot, epic landscape' },
  { key: 'LS',  name: '远景',   prompt: '远景，人物全身与环境并重，wide shot, full shot' },
  { key: 'MS',  name: '中景',   prompt: '中景，人物腰部以上，medium shot' },
  { key: 'MCU', name: '中近景', prompt: '中近景，胸部以上，medium close-up' },
  { key: 'CU',  name: '近景',   prompt: '近景，肩部以上，close-up shot' },
  { key: 'ECU', name: '特写',   prompt: '特写，面部或局部细节占满画面，extreme close-up, detail shot' },
];

/* ---------------- 角度 ---------------- */
const ANGLES = [
  { key: 'eye',   name: '平视', prompt: '平视角度，平易客观，eye level' },
  { key: 'low',   name: '仰拍', prompt: '低角度仰拍，主体高大威严，low angle shot, heroic' },
  { key: 'high',  name: '俯拍', prompt: '高角度俯拍，主体渺小弱势，high angle shot' },
  { key: 'bird',  name: '鸟瞰', prompt: '鸟瞰视角，正上方俯视，bird eye view, top-down' },
  { key: 'dutch', name: '斜侧', prompt: '倾斜构图，画面失衡不安，dutch angle, tilted frame' },
  { key: 'ots',   name: '越肩', prompt: '过肩镜头，over-the-shoulder shot' },
];

/* ---------------- 转场 ---------------- */
const TRANSITIONS = [
  { key: 'cut',      name: '硬切',   icon: '✂' },
  { key: 'fade',     name: '淡入淡出', icon: '◐' },
  { key: 'dissolve', name: '叠化',   icon: '◎' },
  { key: 'white',    name: '白场',   icon: '□' },
  { key: 'black',    name: '黑场',   icon: '■' },
];

/* ---------------- 提示词模板 ----------------
 * 可用占位：{desc} 画面描述 {move} 运镜 {size} 景别 {angle} 角度 {dialogue} 台词
 */
const PROMPT_TEMPLATES = [
  {
    key: 'cine', name: '电影质感 · 四段式', enabled: true,
    tpl: '场景：{desc}；镜头：{size}，{angle}，{move}；光线：电影级布光，主光+轮廓光，氛围层次丰富；风格：电影质感，35mm 胶片色调，高细节，cinematic, film grain'
  },
  {
    key: 'drama', name: '短剧快节奏', enabled: true,
    tpl: '{desc}。{size}，{angle}，{move}，画面主体突出，情绪浓度高，适合短剧快节奏剪辑，清晰锐利，4K 画质'
  },
  {
    key: 'anime', name: '动漫风', enabled: true,
    tpl: '{desc}。{size}，{move}，日式动漫画风，赛璐璐上色，干净线条，制作精良，anime style, cel shading'
  },
  {
    key: 'real', name: '写实记录', enabled: true,
    tpl: '{desc}。{size}，{angle}，{move}，写实风格，自然光，纪实摄影质感，photorealistic, natural lighting, documentary'
  },
  {
    key: 'onlyDesc', name: '仅画面描述', enabled: false,
    tpl: '{desc}'
  },
];

/* 风格后缀库（锦上添花：随机风格点缀） */
const STYLE_BANK = [
  '黄昏暖调逆光，金色氛围', '冷调蓝夜，霓虹反光', '清晨薄雾，柔光漫射',
  '雨天湿润质感，地面倒影', '高对比黑白光影', '暖阳午后，通透明亮',
  '赛博朋克光污染', '水墨留白意境', '胶片颗粒复古调',
];

/* ---------------- 等级体系（12 级） ---------------- */
const LEVELS = [
  { lv: 1,  xp: 0,    title: '场记打板员' },
  { lv: 2,  xp: 60,   title: '跟机组小弟' },
  { lv: 3,  xp: 160,  title: '摄助' },
  { lv: 4,  xp: 320,  title: '掌机' },
  { lv: 5,  xp: 540,  title: '分镜师' },
  { lv: 6,  xp: 820,  title: '执行导演' },
  { lv: 7,  xp: 1180, title: '副导演' },
  { lv: 8,  xp: 1640, title: '联合导演' },
  { lv: 9,  xp: 2220, title: '导演' },
  { lv: 10, xp: 2950, title: '知名导演' },
  { lv: 11, xp: 3860, title: '大导演' },
  { lv: 12, xp: 5000, title: '白日梦大师' },
];

/* ---------------- 成就徽章（15 枚） ---------------- */
const BADGES = [
  { key: 'firstProject', icon: '🎬', name: '开机大吉',   desc: '创建第一个项目' },
  { key: 'firstBreak',   icon: '✂️', name: '第一刀',     desc: '完成第一次拆分镜' },
  { key: 'shots20',      icon: '🎞️', name: '二十连拍',   desc: '单个项目分镜达到 20 个' },
  { key: 'shots50',      icon: '📽️', name: '半百长片',   desc: '累计分镜达到 50 个' },
  { key: 'dictLearner',  icon: '📖', name: '运镜学徒',   desc: '查看 10 种运镜详解' },
  { key: 'dictMaster',   icon: '🎓', name: '运镜百科',   desc: '查看全部运镜详解' },
  { key: 'firstPreview', icon: '👁️', name: '预演首映',   desc: '第一次播放运镜预演' },
  { key: 'animatic',     icon: '🌟', name: '动态首映',   desc: '第一次播放动态分镜' },
  { key: 'editor',       icon: '🎚️', name: '剪辑上手',   desc: '在剪辑台调整过镜头时长' },
  { key: 'prompter',     icon: '🪄', name: '提示词作家', desc: '生成 10 次镜头提示词' },
  { key: 'aiUser',       icon: '🤖', name: 'AI 副导演',  desc: '使用 AI 拆分镜或增强提示词' },
  { key: 'reviewer',     icon: '🔍', name: '拉片人',     desc: '完成一次镜头审核' },
  { key: 'exporter',     icon: '📦', name: '交付成片单', desc: '完成一次项目导出' },
  { key: 'streak7',      icon: '📅', name: '七日之约',   desc: '连续签到 7 天' },
  { key: 'dreamBig',     icon: '🌙', name: '白日梦成真', desc: '项目完整走完：拆分镜→预演→审核→导出' },
];

/* ---------------- 新手教程 ---------------- */
const TUTORIAL = [
  { icon: '🎬', title: '欢迎来到白日梦导演台', color: '#f5a6c8',
    body: '这是一台装在浏览器里的 AI 影片导演工作台：把剧本变成分镜、给每个镜头挑运镜、白模预演动态效果，最后产出可直接喂给 AI 视频工具的提示词。',
    tip: '所有数据只存在你的浏览器本地，不会上传任何服务器。' },
  { icon: '📂', title: '第 1 步 · 建项目', color: '#7ec8f5',
    body: '在「项目台」新建项目，选好画幅：横屏 16:9（长视频）、竖屏 9:16（短视频/短剧）、方形 1:1（社交贴图）。',
    tip: '项目可以建多个，互不干扰，随时切换。' },
  { icon: '📜', title: '第 2 步 · 贴剧本', color: '#a8e6a3',
    body: '进入项目后打开「剧本」，把你的故事大纲或完整剧本粘贴进去。点「⚡ 一键拆分镜」：自动按场次/段落切成镜头，每个镜头带上画面描述、台词、时长和运镜建议。',
    tip: '配置了 AI 接口的话可以点「🤖 AI 拆分镜」，拆得更聪明。' },
  { icon: '🎞️', title: '第 3 步 · 调分镜', color: '#f5d76e',
    body: '「分镜板」里逐镜打磨：改画面描述、换景别、换运镜、拖拽排序、加新镜头。不想动脑就开「傻瓜模式」，回答四个问题自动生成分镜。',
    tip: '每个镜头还可以上传参考图，预演时直接用你的图。' },
  { icon: '🧭', title: '第 4 步 · 学运镜', color: '#c9a7f5',
    body: `「运镜词典」收录 ${CAMERA_MOVES.length} 种电影运镜：每种都有白模动画演示 + 核心提示词。推拉摇移跟、环绕、希区柯克变焦……点「用到此镜头」一步到位。`,
    tip: '看不懂提示词没关系，词典里都是复制即用的成品句。' },
  { icon: '👁️', title: '第 5 步 · 看预演', color: '#7ef5d7',
    body: '「运镜预演」：选运镜、选人物动作、播放白模效果，像操控一台真摄影机。「动态分镜」：整部片子按顺序连播，带台词字幕和转场，这就是你的白模成片。',
    tip: '预演就是给 AI 出片前打草稿，运镜选对，成片气质就对了。' },
  { icon: '🎚️', title: '第 6 步 · 剪辑台', color: '#f5a07e',
    body: '「剪辑台」按时间线排镜头：拖拽换顺序、改时长、设转场，总时长实时统计。粗剪就在这里完成。',
    tip: '短剧单集建议 60~90 秒，节奏别拖。' },
  { icon: '🪄', title: '第 7 步 · 出提示词', color: '#f5e17e',
    body: '「提示词工坊」为每个镜头生成结构化提示词（场景/镜头/光线/风格），支持模板切换和风格点缀。一键复制，粘到即梦、可灵、海螺、Vidu 等 AI 视频工具里直接出片。',
    tip: '配了 AI 接口还能一键增强，提示词更专业。' },
  { icon: '🔍', title: '第 8 步 · 拉片审核', color: '#9df57e',
    body: '出片后回「审核台」逐镜打分：构图、运镜、光线、表演、音画五个维度，写下修改意见，不满意的镜头一键「打回重拍」。',
    tip: 'AI 出片十次九崩，审核台就是你的质检关卡。' },
  { icon: '🏗', title: '进阶 · 场景搭建（3D）', color: '#8fd0ff',
    body: '「分镜板 / 场景库 → 新建场景」进 3D 导演台：左边画房间、画墙、放道具、放人物；右键任何东西出菜单（隐藏 / 删除 / 复制 / 请人坐下）。人物放上去会自动避让家具，拖到椅子边还会自己坐。',
    tip: '相机操作：左拖=转视角，滚轮=缩放，右键或空格+左拖=平移，双击=回到全景。挡画面就点底栏「▦ 隐藏界面」。' },
  { icon: '🖼', title: '进阶 · 导入环境图（照片变 3D 世界）', color: '#ffd08f',
    body: '场景库或导演台底栏点「🖼 环境图」，丢一张场景图进去。2:1 的全景图会自动铺成「环境球」——左右拖就是在原地转头；普通画幅会立成「背景板」挡在景后面。原图还会被反推成房间尺寸、配色和光位。',
    tip: '人物踩不实就调「拍摄高度」（拍这张图时人眼离地几米）；地面会自动按它重投影，镜头移动时地面还会跟着视差滑动。' },
  { icon: '🧍', title: '进阶 · 人物（体型 / 大小 / 关节）', color: '#a8e6a3',
    body: '选中人物：右侧可改「体型」（标准 / 瘦 / 胖 / 小孩 —— 小孩是头大身短，不是缩小的大人）、「整体大小」0.3–3×（直接显示换算身高）、「四肢关节」九条滑杆。3D 里还能**直接点着胳膊腿拖**，拖到想要的角度。',
    tip: '正面胳膊和胸口在屏幕上会重叠，先转到侧面再拖你要的那条。' },
  { icon: '🎞', title: '进阶 · 拉片台（拆别人的片子）', color: '#f5a6c8',
    body: '「拉片台」丢一段参考视频进来自动拆镜：镜头卡上有缩略图、时间码、景别/运镜/角度/备注，还能填「焦段 / 机高 / 距离 / 方位」四个数。点「进 3D 复刻」时这一镜的参考帧会铺成背景板、机位按这四个数摆好，调完「保存到镜头」就写回分镜。',
    tip: '视频只在本机分析、不上传也不存库；下次打开要重新选同一个文件。硬切最准，淡入淡出会被当成一个镜头。' },
  { icon: '📚', title: '进阶 · 场景库怎么存才不白做', color: '#c9a7f5',
    body: '三个口子：①「💾 保存到镜头」只进这一镜；②「📚 存入场景库」进库，任意镜头可套用；③ 场景库卡片「✏️ 打开编辑」改完要再点「保存到场景库」才**原地覆盖**那一条。',
    tip: '搭完点「📷 截图」会自动存进镜头册，保存到镜头时自动挂成这一镜的参考图 —— 不用再去分镜板手动挂。' },
  { icon: '🆘', title: '救命 · 场景好像不见了？', color: '#ff9f9f',
    body: '按顺序试这三步：① 先看左上角画布是不是被切走了（01 ▾ 共 8 个），切回原来的编号；② 在导演台按 **Ctrl+Z**（打开场景搭建会把画布整份替换，撤销能退回搭建前）；③ 去「场景库」找有没有存过、或回分镜板看那一镜里有没有。',
    tip: '养成习惯：搭完先「📚 存入场景库」再继续折腾，这是唯一不会丢的保险。' },
  { icon: '🏆', title: '升级吧，导演！', color: '#ffb3c9',
    body: '拆分镜、预演、导出、签到都会涨经验：12 级导演称号从「场记打板员」到「白日梦大师」，15 枚徽章等你集齐。',
    tip: '每天打开自动签到 +20 XP，断签会清零，别偷懒！' },
];

/* ---------------- 背景与主题 ---------------- */
const THEMES = [
  { key: 'porcelain', name: '晴空', desc: '晴白底 · 潮玩蓝点缀（默认 · 年轻化）' },
  { key: 'obsidian', name: '曜夜', desc: '深蓝夜幕 · 亮蓝点缀（深色模式）' },
  { key: 'gilt', name: '鎏金', desc: '深棕暖金，影院奢华感' },
];

const BACKGROUNDS = [
  { key: 'aurora',   name: '极光' },
  { key: 'pure',     name: '纯净' },
  { key: 'starfall', name: '星尘' },
  { key: 'bokeh',    name: '光斑' },
  { key: 'beam',     name: '光束' },
  { key: 'ripple',   name: '波纹' },
];

/* 演员动作（预演用） */
const ACTOR_ACTIONS = [
  { key: 'stand',  name: '站立' },
  { key: 'walk',   name: '行走' },
  { key: 'run',    name: '奔跑' },
  { key: 'turn',   name: '转身' },
  { key: 'sit',    name: '坐下' },
];

/* 场景模板（预演白模的布景） */
const STAGE_SCENES = [
  { key: 'plain',  name: '空舞台' },
  { key: 'street', name: '街道' },
  { key: 'room',   name: '房间' },
  { key: 'stage',  name: '舞台' },
];

export {
  CAMERA_MOVES, MOVE_CATS, SHOT_SIZES, ANGLES, TRANSITIONS,
  PROMPT_TEMPLATES, STYLE_BANK, LEVELS, BADGES, TUTORIAL,
  THEMES, BACKGROUNDS, ACTOR_ACTIONS, STAGE_SCENES,
};
