/* === AI 导演助手（MN_AGENT）===
   内置对话侧栏：读「设置 → AI 接口」里配好的 OpenAI 兼容模型（window.__bdm.settings.api），
   在导演台里用自然语言让 AI 搭景 / 改景 / 排走位 / 加机位。
   协议：AI 只回一个 JSON：{ reply, scene?, shots?, walk? }
   - scene：完整场景（rooms/walls/props/persons/lights/markers），走 miaoningApplyAiScene 落地（可撤销）
   - shots：机位数组 [{name, cam:{theta,phi,r,tx,ty,tz}}]
   - walk：[{person:'名字', from:'B', to:'A', speed:1.2}] —— 按地面标点排走位并播放
   依赖：window.__bdm.settings / breakdown.js callAI / miaoningApplyAiScene / MN_STAGE */
(function () {
  'use strict';
  const M = (window.MN_AGENT = {});
  M.ok = true;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (n, c) => window.icon ? window.icon(n, c) : '';
  const toast = (m, k) => { if (window.toast) window.toast(m, k); else console.log('[MN_AGENT]', m); };

  let panel = null, busy = false;
  const history = [];   // {role, content}，assistant 存原始 JSON 文本

  function settings() {
    const s = window.__bdm && window.__bdm.settings;
    return (s && s.api && s.api.url && s.api.model) ? s : null;
  }

  const SYS = `你是「白日梦导演台」的 AI 导演助手，帮用户用自然语言搭建/修改 3D 场景。
坐标系：米制，x 向右、y 向下（俯视平面），原点左上；rot 单位度、俯视顺时针、0° 朝 +x。
只输出一个 JSON 对象（不要 markdown 代码块、不要多余文字），字段：
{"reply":"给用户的中文简短说明","scene":{...},"shots":[...],"walk":[...]}
scene/shots/walk 都可选：只改哪里就只给哪里；纯聊天只给 reply。
scene 是完整场景（会整体替换，未提到的东西会消失，所以改景时要把保留的东西也带上）：
{"title":"标题","rooms":[{"name":"客厅","x":0,"y":0,"w":6,"d":5,"h":3}],
 "walls":[{"name":"隔墙","x1":0,"y1":0,"x2":4,"y2":0,"h":2.6,"holes":[{"t":0.5,"w":1}]}],
 "props":[{"name":"沙发","kind":"sofa","x":2,"y":2,"w":2,"d":0.9,"h":0.8,"rot":0,"color":"#8a6f4d"}],
 "persons":[{"name":"小明","x":1,"y":1,"rot":90,"pose":"站立","color":"#2e7cf6"}],
 "lights":[{"name":"顶灯","x":3,"y":2,"h":2.6,"color":"#ffe9b0","intensity":1}],
 "markers":[{"name":"A","x":1,"y":1},{"name":"B","x":5,"y":4}]}
props.kind 常见值：table/chair/sofa/bed/cabinet/door/plant/tv/desk/shelf（不确定就省略）。
persons.pose 只能取：站立/走路/坐下/招手/躺下/运动。
shots：[{"name":"机位名","cam":{"theta":0.6,"phi":1.0,"r":10,"tx":3,"ty":1.5,"tz":2}}]（phi 0.02~1.52，r 4~120）。
walk：让角色沿地面标点走位，[{"person":"角色名","from":"B","to":"A","speed":1.2}]；跑步 speed 2.2，走路 1.2。
from/to 是 markers 的 name。用户说「从B点走到A点」而现场没有标点时，直接在 scene.markers 里补上并给 walk。
改景前先参考「当前场景」JSON，保留用户没让动的东西。reply 里说清你做了什么。`;

  function sceneContext() {
    const st = window.MN && MN.state;
    if (!st || !st.scene) return '（空画布）';
    const sc = st.scene;
    const shots = (st.directorShots || []).map(s => ({ name: s.name, cam: s.cam }));
    return JSON.stringify({ scene: sc, shots }).slice(0, 6000);
  }

  function addMsg(kind, text) {
    const log = $('#mnAgentLog', panel);
    if (!log) return null;
    const d = document.createElement('div');
    d.className = 'mn-agent-msg ' + kind;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  /* 从模型输出里抠 JSON：容忍代码块 / 前后废话 */
  function parseReply(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { }
    }
    try { return JSON.parse(t); } catch (e) { }
    return { reply: String(text || '').trim() || '（模型没有返回内容）' };
  }
  M._parseReply = parseReply;  /* ---------- 落地：scene / shots / walk ---------- */
  function applyActions(act) {
    const done = [];
    if (act.scene && typeof act.scene === 'object' && window.miaoningApplyAiScene) {
      const msg = window.miaoningApplyAiScene({ scene: act.scene });
      done.push(msg || '已更新场景');
    }
    if (Array.isArray(act.shots) && act.shots.length && window.mnImportAiData) {
      const n0 = ((MN.state && MN.state.directorShots) || []).length;
      window.mnImportAiData({ shots: act.shots }, 'model');
      const n1 = ((MN.state && MN.state.directorShots) || []).length;
      if (n1 > n0) done.push('新增机位 ' + (n1 - n0) + ' 个（镜头册）');
    }
    if (Array.isArray(act.walk) && act.walk.length) {
      const st = window.MN && MN.state;
      if (st && st.scene) {
        const markers = st.scene.markers || [];
        const findM = (n) => markers.find(m => String(m.name).trim().toUpperCase() === String(n).trim().toUpperCase());
        let played = 0;
        window.pushUndo && pushUndo();
        act.walk.forEach(w => {
          const p = (st.scene.persons || []).find(q => q.name === w.person) ||
                    (st.scene.persons || []).find(q => String(q.name).includes(String(w.person || '')));
          const a = findM(w.from), b = findM(w.to);
          if (!p || !a || !b) return;
          p.path = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
          p.x = a.x; p.y = a.y;
          p.pose = '走路';
          p.speed = Math.max(0.3, Math.min(3, +w.speed || 1.2));
          if (p.sitOn && window.mnStandUp) { try { window.mnStandUp(p); } catch (e) { } }
          if (window.MN_STAGE && MN_STAGE.playWalk(p.id)) played++;
          done.push(p.name + '：' + a.name + ' → ' + b.name);
        });
        window.renderAll && renderAll();
        window.saveSoon && saveSoon();
        if (played) done.push('走位动画播放中（' + played + ' 人）');
      }
    }
    return done;
  }
  M._applyActions = applyActions;

  async function send(text) {
    if (busy) return;
    const cfg = settings();
    if (!cfg) {
      addMsg('sys', '还没配置 AI 接口：先去「设置 → AI 接口」填 OpenAI 兼容地址和模型，再回来聊。');
      toast('先去设置里配好 AI 接口');
      return;
    }
    const ta = $('#mnAgentText', panel);
    const q = String(text != null ? text : (ta ? ta.value : '')).trim();
    if (!q) return;
    if (ta) ta.value = '';
    busy = true;
    const btn = $('#mnAgentSend', panel); if (btn) btn.disabled = true;
    addMsg('user', q);
    history.push({ role: 'user', content: q });
    const wait = addMsg('ai', '思考中…');
    try {
      const { callAI } = await import('./breakdown.js');
      const msgs = [
        { role: 'system', content: SYS },
        { role: 'system', content: '当前场景：' + sceneContext() },
        ...history.slice(-8),
      ];
      const raw = await callAI(cfg, msgs, { temperature: 0.4, json: true });
      history.push({ role: 'assistant', content: raw });
      const act = parseReply(raw);
      let applied = [];
      try { applied = applyActions(act); }
      catch (e) { applied = ['落地失败：' + e.message]; }
      if (wait) wait.textContent = act.reply || '（已完成）';
      if (applied.length) addMsg('sys', '✓ ' + applied.join(' · '));
    } catch (e) {
      if (wait) wait.textContent = '调用失败：' + e.message;
      history.pop();   // 失败的那轮不进上下文
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
      const t2 = $('#mnAgentText', panel); if (t2) t2.focus();
    }
  }
  M.send = send;

  /* ---------- 面板 ---------- */
  M.open = function () {
    if (panel) return;
    if (!window.MN || !MN.state) { toast('先进导演台'); return; }
    const root = $('#mnRoot'); if (!root) { toast('导演台没打开'); return; }
    panel = document.createElement('div');
    panel.className = 'mn-agent-panel';
    panel.innerHTML = `
      <div class="mn-agent-head">${icon('bot')} AI 导演助手 <button class="mn-modal-x" id="mnAgentX">${icon('x')}</button></div>
      <div class="mn-agent-log" id="mnAgentLog"></div>
      <div class="mn-agent-quick">
        <button data-q="搭一间 6×5 米的客厅：沙发、茶几、电视柜，一个人站在中间">搭个客厅</button>
        <button data-q="在地面标 A、B 两点，让角色从 B 点跑步移动到 A 点">B→A 跑步</button>
        <button data-q="给当前场景加两个机位：一个全景俯拍、一个贴近人物的中景">加两个机位</button>
      </div>
      <div class="mn-agent-input">
        <textarea id="mnAgentText" placeholder="说需求，比如：让小明从 B 点走到 A 点，加一个俯拍机位…"></textarea>
        <button class="mn-agent-send" id="mnAgentSend" title="发送">${icon('send')}</button>
      </div>`;
    root.appendChild(panel);
    $('#mnAgentX', panel).onclick = () => M.close();
    $('#mnAgentSend', panel).onclick = () => send();
    $('#mnAgentText', panel).addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      e.stopPropagation();   // 别让打字触发导演台快捷键
    });
    panel.querySelectorAll('[data-q]').forEach(b => b.onclick = () => send(b.dataset.q));
    if (!history.length) {
      addMsg('ai', '你好，我是导演助手。用一句话告诉我要什么景、谁走到哪、拍什么机位，我直接搭给你。所有改动都能 Ctrl+Z 撤销。');
      if (!settings()) addMsg('sys', '提示：先在「设置 → AI 接口」配置 OpenAI 兼容模型（地址 / 模型名 / Key）。');
    } else {
      const log = $('#mnAgentLog', panel);
      history.forEach(h => addMsg(h.role === 'user' ? 'user' : 'ai',
        h.role === 'user' ? h.content : (parseReply(h.content).reply || '（已完成）')));
      log.scrollTop = log.scrollHeight;
    }
    setTimeout(() => { const t = $('#mnAgentText', panel); if (t) t.focus(); }, 60);
  };
  M.close = function () { if (panel) { panel.remove(); panel = null; } };
  M.toggle = function () { panel ? M.close() : M.open(); };
  M.isOpen = () => !!panel;
  M._debug = () => ({ open: !!panel, busy, turns: history.length, configured: !!settings() });
})();