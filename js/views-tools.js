/* ============================================================
 * 白日梦导演台 · 工具视图
 * 提示词工坊 / 审核台 / 成就图鉴 / 设置
 * ============================================================ */
import { PROMPT_TEMPLATES, STYLE_BANK, LEVELS, BADGES, THEMES, BACKGROUNDS, SHOT_SIZES } from './data.js';
import { buildPrompt, aiEnhancePrompt, testAPI, moveByKey, aiReview } from './breakdown.js';
import { esc, el, modal, confirmDlg, toast, copyText, pickFile, fmtDur } from './ui.js';

let store;
export function initViewsTools(s) { store = s; }

/* ============================================================
 * 提示词工坊
 * ============================================================ */
export function renderPrompts(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }

  let tplKey = store.settings.promptTpl || 'cine';
  let styleOn = false;

  container.innerHTML = `
    <div class="page-head">
      <h2>🪄 提示词工坊 <span class="dim">· 一键生成整片提示词，直接喂给 AI 出图/出片工具</span></h2>
      <div class="page-head-actions">
        <button class="btn btn-ghost" id="pwGenAll">⚡ 全部生成</button>
        <button class="btn btn-ghost" id="pwCopyAll">📋 全部复制</button>
        <button class="btn btn-ghost" id="pwExport">📄 导出 TXT</button>
      </div>
    </div>
    <div class="card pw-config">
      <div class="pw-tpl-row" id="pwTpls"></div>
      <label class="pw-style-toggle"><input type="checkbox" id="pwStyle"> 加一点风格点缀（随机氛围光线，避免千篇一律）</label>
    </div>
    <div id="pwList" class="pw-list"></div>`;

  const tplRow = container.querySelector('#pwTpls');
  const list = container.querySelector('#pwList');
  const styleCb = container.querySelector('#pwStyle');

  const genOne = (s) => {
    const tpl = PROMPT_TEMPLATES.find(t => t.key === tplKey) || PROMPT_TEMPLATES[0];
    let out = buildPrompt(s, tpl.tpl);
    if (styleOn) out += '；' + STYLE_BANK[Math.floor(Math.random() * STYLE_BANK.length)];
    return out;
  };

  const renderTpls = () => {
    tplRow.innerHTML = PROMPT_TEMPLATES.map(t =>
      `<button class="chip ${t.key === tplKey ? 'chip-on' : ''}" data-k="${t.key}">${esc(t.name)}</button>`).join('');
    tplRow.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      tplKey = b.dataset.k;
      store.setSettings({ promptTpl: tplKey });
      renderTpls();
    });
  };

  const renderList = () => {
    if (!p.shots.length) { list.innerHTML = '<div class="empty-tip">还没有镜头。先去「剧本」拆分镜。</div>'; return; }
    list.innerHTML = '';
    p.shots.forEach((s, i) => {
      const item = el(`<div class="pw-item card" data-id="${s.id}">
        <div class="pw-item-head">
          <span class="pw-idx">${i + 1}</span>
          <span class="pw-desc">${esc((s.desc || '（未描述）').slice(0, 50))}</span>
          <span class="tag">${esc(moveByKey[s.cameraMove]?.name || '')}</span>
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-sm" data-op="gen">🪄 生成</button>
          <button class="btn btn-ghost btn-sm" data-op="ai" ${store.settings.api ? '' : 'disabled title="未配置 AI 接口"'}>✨ AI 增强</button>
          <button class="btn btn-ghost btn-sm" data-op="copy">📋</button>
        </div>
        <textarea class="input mono pw-text" rows="2" placeholder="点「生成」按模板产出，或直接手写">${esc(s.prompt)}</textarea>
      </div>`);
      const ta = item.querySelector('.pw-text');
      ta.addEventListener('change', () => store.updateShot(s.id, { prompt: ta.value }));
      item.querySelector('[data-op="gen"]').onclick = () => {
        ta.value = genOne(s);
        store.updateShot(s.id, { prompt: ta.value });
        store.achv.counts.prompts++;
        store.persistAchv();
        if (store.achv.counts.prompts >= 10) store.unlock('prompter');
        store.addXP(1, '生成提示词');
      };
      item.querySelector('[data-op="copy"]').onclick = () => copyText(ta.value || genOne(s));
      const aiBtn = item.querySelector('[data-op="ai"]');
      if (aiBtn) aiBtn.onclick = async () => {
        aiBtn.disabled = true; aiBtn.textContent = '✨ 中…';
        try {
          const out = await aiEnhancePrompt(s.desc, store.settings);
          if (out) {
            ta.value = out;
            store.updateShot(s.id, { prompt: out });
            store.unlock('aiUser');
            store.addXP(2, 'AI 增强');
          }
        } catch (e) { toast('AI 增强失败：' + e.message, 'warn'); }
        finally { aiBtn.disabled = false; aiBtn.textContent = '✨ AI 增强'; }
      };
      list.appendChild(item);
    });
  };

  styleCb.onchange = () => { styleOn = styleCb.checked; };

  container.querySelector('#pwGenAll').onclick = () => {
    if (!p.shots.length) { toast('没有镜头', 'warn'); return; }
    for (const s of p.shots) store.updateShot(s.id, { prompt: genOne(s) });
    store.achv.counts.prompts += p.shots.length;
    store.persistAchv();
    if (store.achv.counts.prompts >= 10) store.unlock('prompter');
    store.addXP(Math.min(20, p.shots.length), '批量生成提示词');
    renderList();
    toast(`已生成 ${p.shots.length} 条提示词 🪄`, 'ok');
  };
  container.querySelector('#pwCopyAll').onclick = () => {
    const txt = p.shots.map((s, i) => `【第${i + 1}镜 · ${s.duration}s】\n${s.prompt || genOne(s)}`).join('\n\n');
    copyText(txt);
  };
  container.querySelector('#pwExport').onclick = () => {
    const txt = `# ${p.name} · 提示词清单\n画幅：${p.aspect} ｜ 镜头：${p.shots.length} ｜ 总时长：${store.totalDuration(p).toFixed(1)}s\n\n` +
      p.shots.map((s, i) =>
        `【第${i + 1}镜】${SHOT_SIZES.find(x => x.key === s.shotSize)?.name} · ${moveByKey[s.cameraMove]?.name} · ${s.duration}s\n画面：${s.desc}\n${s.dialogue ? '台词：' + s.dialogue + '\n' : ''}提示词：${s.prompt || genOne(s)}\n`).join('\n');
    downloadText(`${p.name}-提示词清单.txt`, txt);
  };

  renderTpls();
  renderList();
}

/* ============================================================
 * 审核台（拉片）
 * ============================================================ */
const REVIEW_DIMS = ['构图', '运镜', '光线', '表演', '音画'];

export function renderReview(container) {
  const p = store.active;
  if (!p) { container.innerHTML = `<div class="empty-tip">先打开一个项目</div>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <h2>🔍 审核台 <span class="dim">· AI 出片后逐镜拉片：上传成片截图，AI 依据资料文档打分给建议</span></h2>
    </div>
    <div class="card ref-card">
      <div class="card-title">📚 审核标准资料库 <span class="dim">（仅存本地 · 勾选后作为 AI 审核 / AI 拆分镜的依据）</span></div>
      <div class="ref-list" id="refList"></div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn btn-ghost btn-sm" id="refUp">📤 上传文档（txt/md/json/csv/srt）</button>
        <button class="btn btn-ghost btn-sm" id="refPaste">✍️ 粘贴文本</button>
        <span class="dim ref-tip">例：上传你的《短剧审核标准》，AI 会逐条对照打分</span>
      </div>
    </div>
    <div class="card review-summary" id="rvSummary"></div>
    <div id="rvList" class="review-list"></div>`;

  /* ---- 资料文档库 ---- */
  const refList = container.querySelector('#refList');
  const renderRefs = () => {
    const sel = store.settings.refSel || [];
    if (!store.refs.length) { refList.innerHTML = '<div class="dim ref-empty">还没有文档。上传你的审核标准 / 分镜规范，AI 审核时会严格依据。</div>'; return; }
    refList.innerHTML = store.refs.map(r => `
      <div class="ref-row">
        <label class="ref-check"><input type="checkbox" ${sel.includes(r.id) ? 'checked' : ''} data-id="${r.id}"></label>
        <span class="ref-name">${esc(r.name)}</span>
        <span class="dim ref-size">${r.text.length} 字</span>
        <button class="icon-btn ref-del" data-id="${r.id}" title="删除">✕</button>
      </div>`).join('');
    refList.querySelectorAll('.ref-check input').forEach(cb => cb.onchange = () => {
      const cur = new Set(store.settings.refSel || []);
      cb.checked ? cur.add(cb.dataset.id) : cur.delete(cb.dataset.id);
      store.setSettings({ refSel: [...cur] });
    });
    refList.querySelectorAll('.ref-del').forEach(b => b.onclick = () => { store.delRef(b.dataset.id); renderRefs(); });
  };
  renderRefs();
  container.querySelector('#refUp').onclick = async () => {
    const f = await pickFile('.txt,.md,.markdown,.json,.csv,.srt,.lrc,.html,.htm,text/plain');
    if (!f) return;
    try { store.addRef(f.name, await f.text()); } catch { toast('读取文档失败', 'warn'); }
    renderRefs();
  };
  container.querySelector('#refPaste').onclick = () => {
    const m = modal({
      title: '✍️ 粘贴审核标准',
      body: `
        <div class="form-row"><label>文档名称</label><input id="refPName" class="input" placeholder="例：短剧审核标准 v2"></div>
        <div class="form-row"><label>内容</label><textarea id="refPText" class="input" rows="8" placeholder="逐条写标准，AI 会对照执行…"></textarea></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-act="c">取消</button><button class="btn btn-primary" data-act="ok">加入资料库</button></div>`,
    });
    m.body.querySelector('[data-act="c"]').onclick = () => m.close();
    m.body.querySelector('[data-act="ok"]').onclick = () => {
      const t = m.body.querySelector('#refPText').value.trim();
      if (!t) { toast('内容是空的', 'warn'); return; }
      store.addRef(m.body.querySelector('#refPName').value.trim() || '粘贴的文档', t);
      m.close(); renderRefs();
    };
  };

  /* ---- 汇总 ---- */
  const renderSummary = () => {
    const reviewed = p.shots.filter(s => s.review);
    const avg = reviewed.length ? reviewed.reduce((a, s) => a + s.review.score, 0) / reviewed.length : 0;
    const bad = p.shots.filter(s => s.review && s.review.score <= 2).length;
    container.querySelector('#rvSummary').innerHTML = `
      <div class="rv-sum-item"><b>${reviewed.length}/${p.shots.length}</b><span>已审核</span></div>
      <div class="rv-sum-item"><b class="${avg >= 4 ? 'text-ok' : avg && avg < 3 ? 'text-bad' : ''}">${reviewed.length ? avg.toFixed(1) : '—'}</b><span>平均分</span></div>
      <div class="rv-sum-item"><b class="${bad ? 'text-bad' : 'text-ok'}">${bad}</b><span>待重拍</span></div>
      <div class="rv-sum-tip dim">${!p.shots.length ? '没有镜头' : reviewed.length === p.shots.length ? '✅ 全部镜头已审核' : '逐镜审核中'}</div>`;
  };

  const list = container.querySelector('#rvList');
  if (!p.shots.length) { list.innerHTML = '<div class="empty-tip">没有镜头可审核</div>'; return; }

  const REVIEW_DIMS = ['构图', '运镜', '光线', '表演', '音画'];
  p.shots.forEach((s, i) => {
    const r = s.review || { score: 0, checks: {}, note: '' };
    const item = el(`<div class="review-item card" data-id="${s.id}">
      <div class="rv-head">
        <span class="pw-idx">${i + 1}</span>
        <span class="rv-desc">${esc((s.desc || '').slice(0, 44))}</span>
        <div class="spacer"></div>
        <div class="rv-stars">${[1, 2, 3, 4, 5].map(n => `<button class="star ${r.score >= n ? 'on' : ''}" data-n="${n}">★</button>`).join('')}</div>
      </div>
      <div class="rv-shot-row">
        <div class="rv-shot-pic"><img class="rv-img" ${s.reviewImg ? '' : 'style="display:none"'} alt="成片截图"><button class="btn btn-ghost btn-sm" data-op="img">🖼 上传成片截图</button></div>
        <div class="rv-main">
          <div class="rv-ai-row">
            <button class="btn btn-magic btn-sm" data-op="ai">🤖 AI 审核（依据资料库）</button>
            <span class="dim rv-ai-status"></span>
          </div>
          <div class="rv-ai-out"></div>
          <div class="rv-checks">
            ${REVIEW_DIMS.map(d => `<button class="chip ${r.checks?.[d] ? 'chip-on' : ''}" data-dim="${d}">${d}${r.checks?.[d] ? ' ✓' : ''}</button>`).join('')}
            <span class="dim rv-checks-tip">点亮的维度 = 通过</span>
          </div>
          <div class="rv-note-row">
            <input class="input rv-note" placeholder="修改意见…" value="${esc(r.note || '')}">
            <button class="btn btn-ghost btn-sm rv-save">保存</button>
          </div>
        </div>
      </div>
    </div>`);
    const stars = item.querySelectorAll('.star');
    stars.forEach(st => st.onclick = () => {
      const n = +st.dataset.n;
      const cur = s.review?.score === n ? 0 : n;
      stars.forEach(x => x.classList.toggle('on', +x.dataset.n <= cur && cur > 0));
      s.review = { ...(s.review || { checks: {}, note: '' }), score: cur };
    });
    item.querySelectorAll('[data-dim]').forEach(ch => ch.onclick = () => {
      s.review = s.review || { score: 0, checks: {}, note: '' };
      s.review.checks = s.review.checks || {};
      s.review.checks[ch.dataset.dim] = !s.review.checks[ch.dataset.dim];
      ch.classList.toggle('chip-on', !!s.review.checks[ch.dataset.dim]);
      ch.textContent = ch.dataset.dim + (s.review.checks[ch.dataset.dim] ? ' ✓' : '');
    });
    /* 成片截图 */
    const imgEl = item.querySelector('.rv-img');
    if (s.reviewImg) store.getImage(s.reviewImg).then(b => { if (b) imgEl.src = URL.createObjectURL(b); });
    item.querySelector('[data-op="img"]').onclick = async () => {
      const f = await pickFile('image/*');
      if (!f) return;
      await store.attachReviewImg(s.id, f);
      const b = await store.getImage(s.reviewImg);
      if (b) { imgEl.src = URL.createObjectURL(b); imgEl.style.display = ''; }
      toast('成片截图已挂到该镜头 🖼', 'ok');
    };
    /* AI 审核 */
    const status = item.querySelector('.rv-ai-status');
    const out = item.querySelector('.rv-ai-out');
    item.querySelector('[data-op="ai"]').onclick = async e => {
      if (!store.settings.api) { toast('先到 设置 → AI接口 配置接口（审核图片需支持视觉的模型）', 'warn'); return; }
      const btn = e.currentTarget;
      const dataURL = await store.getReviewImgData(s.id);
      if (!dataURL) { toast('请先给这个镜头上传成片截图，AI 才有得看', 'warn'); return; }
      btn.disabled = true;
      status.textContent = '🤖 AI 正在对照' + ((store.settings.refSel || []).length ? '资料库' : '五维常识') + '拉片…';
      try {
        const res = await aiReview(s, dataURL, store.selectedRefText(), store.settings);
        s.review = { ...(s.review || { checks: {}, note: '' }), score: res.score };
        s.review.note = ('AI：' + res.issues.join('；') + (res.suggestion ? ' ｜ 建议：' + res.suggestion : '')).slice(0, 290);
        store.updateShot(s.id, { review: s.review });
        item.querySelector('.rv-note').value = s.review.note;
        stars.forEach(x => x.classList.toggle('on', +x.dataset.n <= res.score));
        out.innerHTML = `<div class="rv-ai-res">🤖 AI 评分 <b>${res.score}/5</b>${res.issues.length ? ' · ' + res.issues.map(esc).join('；') : ''}${res.suggestion ? '<br>💡 ' + esc(res.suggestion) : ''}</div>`;
        store.unlock('reviewer');
        p.meta.reviewed = true;
        store.addXP(3, 'AI 审核');
        renderSummary();
      } catch (err) {
        status.textContent = '❌ ' + err.message;
      } finally { btn.disabled = false; if (status.textContent.startsWith('🤖')) status.textContent = ''; }
    };
    /* 手动保存 */
    item.querySelector('.rv-save').onclick = () => {
      if (!s.review) s.review = { score: 0, checks: {}, note: '' };
      s.review.note = item.querySelector('.rv-note').value.trim();
      store.updateShot(s.id, { review: s.review });
      store.unlock('reviewer');
      p.meta.reviewed = true;
      store.addXP(2, '镜头审核');
      toast('审核意见已保存 ✅', 'ok');
      renderSummary();
    };
    list.appendChild(item);
  });
  renderSummary();
}

/* ============================================================
 * 成就图鉴
 * ============================================================ */
export function renderAchievements(container) {
  const info = store.levelInfo();
  const achv = store.achv;
  const today = new Date().toISOString().slice(0, 10);
  const checkedToday = achv.lastCheckin === today;

  container.innerHTML = `
    <div class="page-head"><h2>🏆 成就图鉴</h2></div>
    <div class="ach-layout">
      <div class="card ach-level-card">
        <div class="ach-lv-badge">Lv.${info.lv}</div>
        <div class="ach-lv-info">
          <div class="ach-lv-title">${esc(info.title)}</div>
          <div class="ach-xp-bar"><div class="ach-xp-fill" style="width:${info.prog * 100}%"></div></div>
          <div class="dim">${info.next ? `${info.xp} / ${info.next} XP · 下一级「${esc(info.nextTitle)}」` : `${info.xp} XP · 已满级，传奇！`}</div>
        </div>
      </div>
      <div class="card ach-checkin-card">
        <div class="ach-checkin-head">
          <div>
            <div class="card-title">📅 每日签到</div>
            <div class="dim">连续 ${achv.streak || 0} 天 · 最长 ${achv.maxStreak || 0} 天</div>
          </div>
          <button class="btn ${checkedToday ? 'btn-ghost' : 'btn-primary'}" id="achCheckin" ${checkedToday ? 'disabled' : ''}>
            ${checkedToday ? '✅ 今日已签' : '签到 +20 XP'}
          </button>
        </div>
        <div class="ach-days">${last7Days().map(d => {
          const on = achv.checkinHistory.includes(d.date);
          return `<div class="ach-day ${on ? 'on' : ''} ${d.date === today ? 'today' : ''}"><span>${d.label}</span><i></i></div>`;
        }).join('')}</div>
      </div>
    </div>
    <div class="badge-grid">
      ${BADGES.map(b => {
        const on = !!achv.unlocked[b.key];
        return `<div class="badge-card ${on ? 'on' : ''}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${esc(b.name)}</div>
          <div class="badge-desc dim">${esc(b.desc)}</div>
          ${on ? `<div class="badge-date">${new Date(achv.unlocked[b.key]).toLocaleDateString()} 解锁</div>` : '<div class="badge-locked">🔒 未解锁</div>'}
        </div>`;
      }).join('')}
    </div>
    <div class="card ach-stats">
      <div><b>${store.projects.length}</b><span>项目</span></div>
      <div><b>${achv.counts.shots || 0}</b><span>累计镜头</span></div>
      <div><b>${achv.counts.prompts || 0}</b><span>生成提示词</span></div>
      <div><b>${achv.counts.previews || 0}</b><span>预演次数</span></div>
      <div><b>${Object.keys(achv.counts.dictViews || {}).length}/${36}</b><span>学过的运镜</span></div>
      <div><b>${Object.keys(achv.unlocked).length}/${BADGES.length}</b><span>徽章</span></div>
    </div>`;

  container.querySelector('#achCheckin').onclick = () => {
    if (store.checkIn()) renderAchievements(container);
  };
}

function last7Days() {
  const out = [];
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), label: names[d.getDay()] });
  }
  return out;
}

/* ============================================================
 * 设置
 * ============================================================ */
export function renderSettings(container) {
  const st = store.settings;
  container.innerHTML = `
    <div class="page-head"><h2>⚙️ 设置</h2></div>

    <div class="card set-card">
      <div class="card-title">🎨 外观主题</div>
      <div class="theme-row">
        ${THEMES.map(t => `<button class="theme-card theme-${t.key} ${st.theme === t.key ? 'on' : ''}" data-k="${t.key}">
          <div class="theme-preview"></div><div class="theme-name">${t.name}</div><div class="theme-desc dim">${t.desc}</div>
        </button>`).join('')}
      </div>
      <div class="card-title" style="margin-top:18px">🖼️ 背景氛围</div>
      <div class="bg-row">
        ${BACKGROUNDS.map(b => `<button class="chip ${st.background === b.key ? 'chip-on' : ''}" data-k="${b.key}">${b.name}</button>`).join('')}
      </div>
      <div class="set-toggles">
        <label class="toggle-row"><span>✨ 动效全开（入场浮现 / 按钮流光 / 涟漪）</span><input type="checkbox" id="setEffects" ${st.effects ? 'checked' : ''}></label>
        <label class="toggle-row"><span>🎞️ 噪点纹理质感（胶片颗粒）</span><input type="checkbox" id="setNoise" ${st.noise ? 'checked' : ''}></label>
      </div>
    </div>

    <div class="card set-card">
      <div class="card-title">🤖 AI 接口（可选 · 拆分镜 / 提示词增强用）</div>
      <div class="dim set-sub">填一个 OpenAI 兼容接口即可解锁 AI 拆分镜与 AI 增强提示词。密钥只存在你的浏览器里，不上传任何服务器。</div>
      <div class="api-grid">
        <div class="form-row"><label>名称</label><input id="apiName" class="input" placeholder="我的接口" value="${esc(st.api?.name || '')}"></div>
        <div class="form-row"><label>接口地址（/v1 结尾）</label><input id="apiUrl" class="input" placeholder="https://api.example.com/v1" value="${esc(st.api?.url || '')}"></div>
        <div class="form-row"><label>模型名</label><input id="apiModel" class="input" placeholder="gpt-4o-mini / glm-4-flash / …" value="${esc(st.api?.model || '')}"></div>
        <div class="form-row"><label>API Key</label><input id="apiKey" class="input" type="password" placeholder="sk-…" value="${esc(st.api?.key || '')}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="apiTest">🔌 测试连通</button>
        <div class="spacer"></div>
        ${st.api ? '<button class="btn btn-danger btn-sm" id="apiClear">清除配置</button>' : ''}
        <button class="btn btn-primary" id="apiSave">保存</button>
      </div>
      <div class="api-status dim" id="apiStatus"></div>
    </div>

    <div class="card set-card">
      <div class="card-title">💾 数据管理</div>
      <div class="dim set-sub">所有数据（项目/分镜/成就/设置）都只存在这台设备的浏览器里。换电脑前记得导出备份。</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="dataExport">📦 导出全部备份</button>
        <button class="btn btn-ghost" id="dataImport">📥 导入备份</button>
        <div class="spacer"></div>
        <button class="btn btn-danger btn-sm" id="dataClear">🗑 清空全部数据</button>
      </div>
    </div>

    <div class="card set-card about-card">
      <div class="card-title">🌙 关于</div>
      <p>白日梦导演台 v1.12.5 · 纯前端 AI 影片导演工作台</p>
      <p class="dim">剧本 → 分镜 → 运镜预演 → 动态分镜 → 剪辑 → 提示词 → 审核，一站式完成 AI 短片前期制作。<br>
      无后端、无追踪、无依赖，部署在 GitHub Pages 上，离线也能用。</p>
    </div>`;

  container.querySelectorAll('.theme-card').forEach(b => b.onclick = () => {
    store.setSettings({ theme: b.dataset.k });
    toast('主题已切换 🎨', 'ok');
    renderSettings(container);
  });
  container.querySelectorAll('.bg-row .chip').forEach(b => b.onclick = () => {
    store.setSettings({ background: b.dataset.k });
    container.querySelectorAll('.bg-row .chip').forEach(x => x.classList.remove('chip-on'));
    b.classList.add('chip-on');
  });
  container.querySelector('#setEffects').onchange = e => store.setSettings({ effects: e.target.checked });
  container.querySelector('#setNoise').onchange = e => store.setSettings({ noise: e.target.checked });

  const readApi = () => ({
    name: container.querySelector('#apiName').value.trim(),
    url: container.querySelector('#apiUrl').value.trim(),
    model: container.querySelector('#apiModel').value.trim(),
    key: container.querySelector('#apiKey').value.trim(),
  });
  const status = container.querySelector('#apiStatus');
  container.querySelector('#apiTest').onclick = async e => {
    const btn = e.currentTarget;
    btn.disabled = true; status.textContent = '测试中…'; status.className = 'api-status dim';
    try {
      await testAPI(readApi());
      status.textContent = '✅ 连通正常'; status.className = 'api-status text-ok';
    } catch (err) {
      status.textContent = '❌ ' + err.message; status.className = 'api-status text-bad';
    } finally { btn.disabled = false; }
  };
  container.querySelector('#apiSave').onclick = () => {
    const api = readApi();
    store.setSettings({ api: api.url && api.model ? api : null });
    toast('AI 接口配置已保存 ✅', 'ok');
    renderSettings(container);
  };
  const clearBtn = container.querySelector('#apiClear');
  if (clearBtn) clearBtn.onclick = () => { store.setSettings({ api: null }); toast('已清除 AI 接口配置'); renderSettings(container); };

  container.querySelector('#dataExport').onclick = () => {
    const data = JSON.stringify(store.exportAll(), null, 2);
    downloadText(`白日梦导演台-备份-${new Date().toISOString().slice(0, 10)}.json`, data);
    const p = store.active;
    if (p) { p.meta.exported = true; store.persistProjects(); }
    store.unlock('exporter');
    store.addXP(5, '导出备份');
  };
  container.querySelector('#dataImport').onclick = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      store.importAll(data);
      toast('备份已导入 ✅ 页面即将刷新', 'ok');
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast('导入失败：' + e.message, 'warn'); }
  };
  container.querySelector('#dataClear').onclick = async () => {
    if (!(await confirmDlg('清空全部数据？所有项目、分镜、成就都会消失，且不可恢复！', { danger: true, okText: '全部清空' }))) return;
    if (!(await confirmDlg('再确认一次：真的全部清空？建议先导出备份。', { danger: true, okText: '我确定' }))) return;
    localStorage.clear();
    indexedDB.deleteDatabase('bdm_images');
    location.reload();
  };
}

/* ---------- 下载文本文件 ---------- */
function downloadText(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('已导出 📄', 'ok');
}

/* ============================================================
 * 项目导出（JSON / 分镜表）
 * ============================================================ */
export function openProjectExport() {
  const p = store.active;
  if (!p) { toast('先打开一个项目', 'warn'); return; }
  const m = modal({
    title: '📦 导出项目',
    body: `
      <div class="export-opts">
        <button class="btn btn-primary" data-k="json">💾 项目 JSON（完整，可再导入）</button>
        <button class="btn btn-ghost" data-k="csv">📊 分镜表 CSV（Excel 可开）</button>
        <button class="btn btn-ghost" data-k="md">📝 分镜表 Markdown</button>
        <button class="btn btn-ghost" data-k="prompts">🪄 提示词清单 TXT</button>
      </div>`,
  });
  m.body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (k === 'json') downloadText(`${p.name}.json`, JSON.stringify({ app: 'bairimeng-director', ...p }, null, 2));
    if (k === 'csv') downloadText(`${p.name}-分镜表.csv`, '\ufeff' + toCSV(p));
    if (k === 'md') downloadText(`${p.name}-分镜表.md`, toMarkdown(p));
    if (k === 'prompts') downloadText(`${p.name}-提示词.txt`, toPromptList(p));
    p.meta.exported = true;
    store.persistProjects();
    store.unlock('exporter');
    store.addXP(5, '导出项目');
    m.close();
  });
}

function toCSV(p) {
  const head = ['镜号', '画面描述', '台词', '时长(s)', '景别', '角度', '运镜', '转场', '提示词', '备注'];
  const rows = p.shots.map((s, i) => [
    i + 1, s.desc, s.dialogue, s.duration,
    SHOT_SIZES.find(x => x.key === s.shotSize)?.name || '',
    s.angle, moveByKey[s.cameraMove]?.name || '',
    s.transition, s.prompt, s.note,
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  return [head.join(','), ...rows].join('\r\n');
}
function toMarkdown(p) {
  const rows = p.shots.map((s, i) =>
    `| ${i + 1} | ${(s.desc || '').replace(/\|/g, '\\|')} | ${(s.dialogue || '').replace(/\|/g, '\\|')} | ${s.duration}s | ${SHOT_SIZES.find(x => x.key === s.shotSize)?.name} | ${moveByKey[s.cameraMove]?.name} | ${TRANS_NAME(s.transition)} |`).join('\n');
  return `# ${p.name} · 分镜表\n\n画幅：${p.aspect} ｜ 镜头数：${p.shots.length} ｜ 总时长：${fmtDur(store.totalDuration(p))}\n\n| 镜号 | 画面 | 台词 | 时长 | 景别 | 运镜 | 转场 |\n|---|---|---|---|---|---|---|\n${rows}\n`;
}
function toPromptList(p) {
  return p.shots.map((s, i) => `【第${i + 1}镜 · ${s.duration}s】\n${s.prompt || s.desc}`).join('\n\n');
}
function TRANS_NAME(k) { return { cut: '硬切', fade: '淡入淡出', dissolve: '叠化', white: '白场', black: '黑场' }[k] || k; }
