/* ============================================================
 * AI 智能导演台 · 视图
 * 一个输入框 + 一个按钮，把「拆镜 → 去噪 → 配运镜 → 搭景 → 故事板」跑完。
 * ============================================================ */
import { esc, toast, modal } from './ui.js';
import { openGridModal, dataURLToBlob } from './mn-grid.js';
import {
  planByAI, planByLocal, applyPlan, analyzeAssets, fileToDataURL,
  decideGrid, generateCellImages, imagePromptFor,
} from './ai-director.js';

let store;
export function initViewsAi(s) { store = s; }

const STEPS = ['拆镜', '去噪', '配运镜景别', '自动搭景', '故事板'];

function stepsHtml(cur = -1, done = false) {
  return `<div class="ai-steps">${STEPS.map((s, i) =>
    `<span class="ai-step ${done || i < cur ? 'ok' : i === cur ? 'on' : ''}">${done || i < cur ? '✓' : i + 1} ${s}</span>`
  ).join('')}</div>`;
}

export function renderAiDirector(container, payload = {}) {
  const p = store.active;
  if (!p) {
    container.innerHTML = `<div class="page-head"><h2>🤖 AI 智能导演台</h2></div>
      <div class="empty-tip">先到「项目台」新建一个项目，再回来一键开拍。</div>`;
    return;
  }

  let plan = null, items = [], assets = [], busy = false, abort = null, lastResult = null;

  const apiOk = !!(store.settings.api && store.settings.api.url && store.settings.api.model);
  const imgOk = !!(store.settings.imageApi && store.settings.imageApi.url && store.settings.imageApi.model);

  container.innerHTML = `
    <div class="page-head">
      <h2>🤖 AI 智能导演台 <span class="dim">· ${esc(p.name)}</span></h2>
      <p class="dim">贴一段剧本或视频提示词，AI 自动去掉没用的信息、拆成分镜、配好运镜景别、把场景搭起来，再按剧情多少拼成宫格故事板。</p>
    </div>

    <div class="ai-status card">
      <span class="tag ${apiOk ? 'ok' : ''}">${apiOk ? '✅ 文本/视觉接口已配置' : '⚪ 文本接口未配置（可用本地拆镜）'}</span>
      <span class="tag ${imgOk ? 'ok' : ''}">${imgOk ? '✅ 生图接口已配置' : '⚪ 生图接口未配置'}</span>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="aiGoSettings">⚙️ 去设置接口</button>
    </div>

    <div class="card ai-card">
      <div class="ai-h">① 一句话开工 <span class="dim">剧本 / 视频提示词 / 分镜提示词 / 时间码表，都能贴</span></div>
      <textarea id="aiText" class="input ai-text" rows="9" placeholder="例：深夜便利店，灯光惨白。店员小林趴在柜台上打瞌睡。自动门叮地开了，一个浑身湿透的女孩走进来，径直走向冰柜拿出一罐冰可乐。小林抬头：外面下雨了吗？女孩没回答，把可乐贴在脸上。"></textarea>
      <div class="ai-opts">
        <label><input type="checkbox" id="aiUseAI" ${apiOk ? 'checked' : ''}> AI 智能拆镜 <span class="dim">（不勾＝本地规则，完全不联网）</span></label>
        <label><input type="checkbox" id="aiBuild" checked> 自动搭建场景 + 机位</label>
        <label><input type="checkbox" id="aiReplace"> 替换现有分镜 <span class="dim">（不勾＝追加）</span></label>
        <label><input type="checkbox" id="aiAutoGrid" checked> 完成后自动弹出宫格故事板</label>
      </div>
      <input id="aiNote" class="input" placeholder="导演额外要求（可空）例：冷色调，多用特写，节奏慢一点" />
      <div class="ai-actions">
        <button class="btn btn-primary" id="aiGo">⚡ 一键开拍</button>
        <button class="btn btn-ghost" id="aiDemo">📝 填个示例</button>
        <div class="spacer"></div>
        <span class="dim" id="aiTip">${apiOk ? 'AI 接口已就绪' : '没配接口也能用，走本地规则'}</span>
      </div>
      <div id="aiProgress"></div>
    </div>

    <div class="card ai-card">
      <div class="ai-h">② 上传资产图 <span class="dim">角色立绘 / 场景图 / 道具图，可多张；AI 会照着图保持长相和配色</span></div>
      <div class="ai-drop" id="aiDrop">🖼 把图片拖到这里，或点这里选图 · 也支持 Ctrl+V 粘贴截图</div>
      <input type="file" id="aiFiles" accept="image/*" multiple hidden />
      <div class="ai-assets" id="aiAssetList"></div>
      <div class="ai-actions">
        <button class="btn" id="aiAnalyze">🔍 让 AI 看懂这些图</button>
        <button class="btn btn-ghost" id="aiClearAssets">清空</button>
        <div class="spacer"></div>
        <span class="dim" id="aiAssetTip"></span>
      </div>
    </div>

    <div class="card ai-card" id="aiResultCard" hidden>
      <div class="ai-h">③ 导演台结果 <span class="dim">每一镜都带空间关系 / 角度 / 动作，故事板看得懂</span></div>
      <div id="aiSummary"></div>
      <div id="aiShotList" class="ai-shots"></div>
      <div class="ai-actions">
        <button class="btn btn-primary" id="aiGrid">🎛 宫格故事板</button>
        <button class="btn" id="aiGenImg">🎨 AI 逐格生图${imgOk ? '' : '（先配接口）'}</button>
        <button class="btn btn-ghost" id="aiStop" hidden>⏹ 停止生图</button>
        <button class="btn btn-ghost" id="aiGoBoard">🎞 去分镜板</button>
      </div>
      <div id="aiImgProgress" class="dim"></div>
    </div>`;

  const $ = id => container.querySelector('#' + id);
  const prog = $('aiProgress');
  const resultCard = $('aiResultCard');

  /* ---------- 资产图 ---------- */
  function renderAssets() {
    $('aiAssetList').innerHTML = items.map((it, i) => `
      <div class="ai-asset">
        <img src="${esc(it.dataURL)}" alt="" />
        <div class="ai-asset-txt"><b>${esc(assets[i] ? assets[i].name : it.file.name)}</b>
          <span>${esc(assets[i] ? (assets[i].type + ' · ' + assets[i].look) : '还没识别，点「让 AI 看懂」')}</span></div>
        <button class="ai-x" data-rm="${i}" title="移除">×</button>
      </div>`).join('');
    container.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      const i = +b.dataset.rm;
      items.splice(i, 1); assets.splice(i, 1);
      renderAssets();
    });
  }
  async function addFiles(fileList) {
    const fs = Array.from(fileList || []).filter(f => /^image\//.test(f.type)).slice(0, 8 - items.length);
    if (!fs.length) return;
    $('aiAssetTip').textContent = '正在读图…';
    for (const f of fs) {
      try { items.push({ file: f, dataURL: await fileToDataURL(f) }); } catch (e) { toast(e.message, 'warn'); }
    }
    assets = [];
    renderAssets();
    $('aiAssetTip').textContent = `已加入 ${items.length} 张，最多 8 张`;
  }
  $('aiDrop').onclick = () => $('aiFiles').click();
  $('aiFiles').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => $('aiDrop').addEventListener(ev, e => { e.preventDefault(); $('aiDrop').classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => $('aiDrop').addEventListener(ev, e => { e.preventDefault(); $('aiDrop').classList.remove('on'); }));
  $('aiDrop').addEventListener('drop', e => addFiles(e.dataTransfer.files));
  const onPaste = e => { if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return; const fs = Array.from(e.clipboardData?.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } };
  document.addEventListener('paste', onPaste);

  $('aiClearAssets').onclick = () => { items = []; assets = []; renderAssets(); $('aiAssetTip').textContent = ''; };
  $('aiAnalyze').onclick = async () => {
    if (!items.length) return toast('先上传几张资产图', 'warn');
    $('aiAssetTip').textContent = 'AI 正在看图…（没配视觉模型会立刻按文件名兜底）';
    try {
      assets = await analyzeAssets(items, store.settings);
      renderAssets();
      if (assets.__warning) toast(assets.__warning, 'warn');
      else toast(`认出 ${assets.length} 个资产`, 'ok');
      $('aiAssetTip').textContent = (store.settings.api && store.settings.api.url) ? 'AI 识别完成' : '按文件名兜底（想要真识别，去设置里配一个支持图片的模型）';
    } catch (e) { toast('资产识别失败：' + e.message, 'warn'); $('aiAssetTip').textContent = ''; }
  };

  /* ---------- 一键开拍 ---------- */
  $('aiDemo').onclick = () => {
    $('aiText').value = `第1场 深夜便利店 内\n灯光惨白，货架投下长长的影子。店员小林趴在柜台上打瞌睡。\n自动门「叮」地开了，一个浑身湿透的女孩走进来，鞋跟在地砖上留下水痕。\n小林抬头：「欢迎光临……诶？外面下雨了吗？」\n女孩没有回答，径直走向冰柜，拿出一罐冰可乐，把罐子贴在发烫的脸上。\n小林看着她，欲言又止。窗外雨越下越大。\n\n整体风格：冷色调，写实电影感，轻微颗粒。\n负向：不要字幕，不要水印，不要卡通。\n音效：雨声、冰柜压缩机嗡鸣。\n4K 60fps 导出。`;
    toast('示例填好了，直接点「一键开拍」');
  };

  function setStep(i, note = '') {
    prog.innerHTML = stepsHtml(i) + (note ? `<p class="ai-note">${esc(note)}</p>` : '');
  }

  $('aiGo').onclick = async () => {
    if (busy) return;
    const text = $('aiText').value.trim();
    if (!text) return toast('先贴一段剧本或提示词', 'warn');
    const useAI = $('aiUseAI').checked;
    if (useAI && !apiOk) {
      $('aiUseAI').checked = false;
      toast('没配 AI 接口，已自动改用本地拆镜（不联网也能拍）', 'warn');
    }
    busy = true; $('aiGo').disabled = true; $('aiGo').textContent = '⏳ 正在拍…';
    resultCard.hidden = true;
    try {
      setStep(0, '正在读剧情、判断该拆几镜…');
      await new Promise(r => setTimeout(r, 30));
      let usedAI = $('aiUseAI').checked;
      if (usedAI) {
        try {
          plan = await planByAI(text, store.settings, { assets, note: $('aiNote').value.trim() });
        } catch (e) {
          usedAI = false;
          toast('AI 拆镜没成功，已自动改本地规则：' + e.message, 'warn');
        }
      }
      if (!usedAI) plan = planByLocal(text, { assets });
      const note = $('aiNote').value.trim();
      if (note && plan.style) plan.style += '；' + note;
      else if (note) plan.style = note;

      setStep(1, `剥离 ${plan.removed.length} 条与画面无关的信息（风格 / 负向 / 音轨 / 分辨率），只留能拍的动作`);
      await new Promise(r => setTimeout(r, 30));
      setStep(2, `${plan.shots.length} 镜已配好景别 / 角度 / 运镜，分成 ${plan.beats.length} 个剧情节拍`);
      await new Promise(r => setTimeout(r, 30));

      const build = $('aiBuild').checked;
      setStep(3, build ? '正在按每镜描述搭房间、摆人物、放机位…' : '跳过搭景（你没勾）');
      await new Promise(r => setTimeout(r, 30));
      lastResult = applyPlan(store, plan, { replace: $('aiReplace').checked, buildScenes: build });

      const grid = plan.grid || decideGrid(plan.shots, plan.beats);
      plan.grid = grid;
      setStep(4, `完成 · 宫格按 ${plan.beats.length} 个节拍自动选了 ${grid}`);
      prog.innerHTML = stepsHtml(-1, true) + `<p class="ai-note ai-ok">✅ 拆出 ${lastResult.n} 镜 · 搭好 ${lastResult.built} 个场景 · 去掉 ${lastResult.removed} 条噪声 · ${usedAI ? 'AI 拆镜' : '本地规则'}</p>`;

      showResult();
      toast(`已生成 ${lastResult.n} 镜，宫格 ${grid}`, 'ok');
      if ($('aiAutoGrid').checked) openGrid();
    } catch (e) {
      prog.innerHTML = `<p class="ai-note ai-err">❌ ${esc(e.message)}</p>`;
      toast('开拍失败：' + e.message, 'warn');
    } finally {
      busy = false; $('aiGo').disabled = false; $('aiGo').textContent = '⚡ 一键开拍';
    }
  };

  function showResult() {
    resultCard.hidden = false;
    const rows = plan.shots.map((s, i) => `
      <tr><td>${i + 1}</td><td><b>${esc(s.sizeCn || s.shotSize)}</b><br><span class="dim">${esc(s.angleCn || s.angle)}</span></td>
      <td>${esc(s.desc)}<br><span class="dim">${esc(s.action || '')}</span></td>
      <td>${esc(s.space || '')}</td><td>${esc(s.moveCn || s.cameraMove)}</td><td>${esc(s.angleNote || '')}</td></tr>`).join('');
    $('aiSummary').innerHTML = `<p class="dim">共 <b>${plan.shots.length}</b> 镜 · <b>${plan.beats.length}</b> 个节拍 · 宫格 <b>${esc(plan.grid || '-')}</b>${plan.style ? ' · 风格：' + esc(plan.style) : ''}</p>`;
    $('aiShotList').innerHTML = `<table class="ai-table"><thead><tr><th>镜</th><th>景别/角度</th><th>画面与动作</th><th>空间关系</th><th>运镜</th><th>机位说明</th></tr></thead><tbody>${rows}</tbody></table>`;
    const genBtn = $('aiGenImg');
    genBtn.textContent = imgOk ? '🎨 AI 逐格生图' : '🎨 AI 逐格生图（先配接口）';
  }

  function openGrid() {
    const shots = (store.active && store.active.shots) || [];
    if (!shots.length) return toast('还没有镜头', 'warn');
    openGridModal({
      title: store.active.name + (plan ? ' · AI 故事板' : ''),
      aspect: store.active.aspect, shots, source: 'ai',
      preset: plan ? (plan.grid || decideGrid(plan.shots, plan.beats)) : undefined,
      style: plan ? plan.style : '', negative: plan ? plan.negative : '',
      onCellArt: (i, dataURL) => {
        const s = shots[i]; if (!s) return null;
        return store.attachSketch(s.id, dataURLToBlob(dataURL), { msg: `第 ${i + 1} 镜格子图已回填 🖼` });
      },
    });
  }
  $('aiGrid').onclick = openGrid;
  $('aiGoBoard').onclick = () => window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'storyboard' } }));
  $('aiGoSettings').onclick = () => window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'settings' } }));

  /* ---------- 逐格生图 ---------- */
  $('aiGenImg').onclick = async () => {
    const api = store.settings.imageApi;
    if (!api || !api.url || !api.model) {
      toast('先去「设置 → 生图接口」填地址、模型、密钥（密钥只发给你填的那个接口）', 'warn');
      window.dispatchEvent(new CustomEvent('bdm-nav', { detail: { view: 'settings' } }));
      return;
    }
    if (busy) return;
    const shots = (store.active && store.active.shots) || [];
    if (!shots.length) return toast('没有镜头可画', 'warn');
    busy = true; abort = { aborted: false };
    $('aiGenImg').disabled = true; $('aiStop').hidden = false;
    $('aiImgProgress').textContent = `0 / ${shots.length} 格`;
    try {
      const r = await generateCellImages(store, shots, api, plan || {}, pr => {
        $('aiImgProgress').textContent = `生图中 ${pr.done + pr.failed} / ${pr.total} 格 · 成功 ${pr.done} · 失败 ${pr.failed}`;
      }, abort);
      $('aiImgProgress').textContent = `完成：成功 ${r.done} 格${r.failed ? ' · 失败 ' + r.failed + ' 格（接口报错，去设置里检查模型名/尺寸）' : ''}`;
      toast(r.done ? `已画好 ${r.done} 格，自动打开宫格故事板` : '一格都没画出来，检查生图接口配置', r.done ? 'ok' : 'warn');
      if (r.done) setTimeout(openGrid, 250);
    } catch (e) {
      $('aiImgProgress').textContent = '生图中断：' + e.message;
      toast('生图中断：' + e.message, 'warn');
    } finally {
      busy = false; abort = null; $('aiGenImg').disabled = false; $('aiStop').hidden = true;
    }
  };
  $('aiStop').onclick = () => { if (abort) abort.aborted = true; toast('正在停止，已开始的这一格会画完'); };

  return () => { document.removeEventListener('paste', onPaste); };
}
