/* ============================================================
 * 🖼 导入环境图：一张场景图 → 可编辑的 3D 景（UI 层）
 *   有 AI 接口（支持视觉）→ 反推房间/家具/人物/光位/机位；
 *   没接口 → 本地采样出「尺寸 + 配色 + 光位」的起手景。
 *   两条路都只注入导演台草稿，同学看过满意再点保存。
 *   算法在 env-import.js，这里只管弹窗和落地。
 * ============================================================ */
/* store 单例挂在 window.__bdm 上（app.js 里赋的），这里不额外走 init 注入 */
const getStore = () => window.__bdm;
import { esc, modal, toast } from './ui.js';

/* 等导演台建好（openSceneBuilder 内部要异步 loadMiaoning） */
async function waitDirector(ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (window.MN && window.MN.built && window.MN.state) return true;
    await new Promise(r => setTimeout(r, 120));
  }
  return false;
}

export function openEnvImport(opts = {}) {
  let file = null, busy = false;

  const m = modal({
    title: '🖼 导入环境图（看图生成 3D 场景）',
    wide: true,
    body: `
      <p class="dim" style="margin-top:0">把场景图拖进来：<b>原图会直接铺成 3D 环境</b>（2:1 全景图 → 环境球，转视角就是在原地转头；普通图 → 立在景后面的背景板），
      同时反推出导演台能编辑的白模景：房间尺寸、家具位置、人物站位、光位色温，还有对应这张图的机位视角。</p>
      <div id="eiDrop" class="ei-drop">
        <div class="ei-drop-ico">🖼</div>
        <div><b>把图片拖到这里</b>，或 <label class="ei-link">选文件<input type="file" id="eiFile" accept="image/*" style="display:none"></label></div>
        <div class="ei-drop-tip">png / jpg / webp · 也可以直接 Ctrl+V 粘截图 · 最长边会压到 1536（2:1 的图认作全景图）</div>
      </div>
      <div id="eiPrevWrap" class="ei-prev" style="display:none"><img id="eiPrev" alt=""><div id="eiMeta" class="dim"></div></div>
      <div class="form-row" style="margin-top:10px"><label>补充说明（可选，越具体越准）</label>
        <input id="eiHint" class="input" placeholder="例：19 世纪书房，五个人围着书桌，老者在立遗嘱，两人坐着三人站着"></div>
      <div class="form-row ei-modes">
        <label><input type="radio" name="eiMode" value="auto" checked> 自动（有 AI 用 AI，没有走本地）</label>
        <label><input type="radio" name="eiMode" value="ai"> 只用 AI 视觉反推</label>
        <label><input type="radio" name="eiMode" value="local"> 只用本地起手景</label>
      </div>
      <div class="form-row ei-modes">
        <label><input type="checkbox" id="eiEnv" checked> 把原图铺成 3D 环境（不勾就只出白模）</label>
      </div>
      <div id="eiApiHint" class="dim ei-api"></div>
      <div id="eiStatus" class="dim ei-status"></div>
      <div id="eiOut"></div>
      <div class="modal-actions">
        <div class="spacer"></div>
        <button class="btn btn-ghost" id="eiCancel">取消</button>
        <button class="btn btn-primary" id="eiGo" disabled>🚀 开始反推</button>
        <button class="btn btn-magic" id="eiApply" style="display:none" disabled>✅ 应用到导演台</button>
      </div>`,
  });

  const $ = sel => m.body.querySelector(sel);
  const st = msg => { $('#eiStatus').textContent = msg; };

  const api = (getStore().settings && getStore().settings.api) || {};
  $('#eiApiHint').innerHTML = (api.url && api.model)
    ? `当前接口：<b>${esc(api.model)}</b> · 反推整张图大约 10~40 秒`
    : `⚠️ 还没配 AI 接口（<b>设置 → AI 接口</b>，要支持图片的模型，如 gpt-4o / glm-4v / qwen-vl）。不配也能用：走「本地起手景」，房间尺寸、配色、光位照图取，家具再手动补。`;

  const setFile = async (f) => {
    if (!f) return;
    if (!/^image\//.test(f.type || '')) { toast('请选图片文件（png / jpg / webp）', 'warn'); return; }
    file = f;
    try {
      const url = await window.ENV_IMPORT.fileToDataURL(f, 512);
      $('#eiPrev').src = url;
      $('#eiPrevWrap').style.display = '';
      $('#eiMeta').textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`;
      $('#eiGo').disabled = false;
      $('#eiOut').innerHTML = '';
      $('#eiApply').style.display = 'none';
      st('图收到了，点「开始反推」。');
    } catch (e) { toast('读图失败：' + e.message, 'warn'); }
  };

  $('#eiFile').onchange = e => setFile(e.target.files && e.target.files[0]);
  const drop = $('#eiDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('on'); }));
  drop.addEventListener('drop', e => setFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));

  /* 粘贴截图直接进来了 */
  const onPaste = e => {
    const it = Array.from((e.clipboardData && e.clipboardData.items) || []).find(x => x.type && x.type.startsWith('image/'));
    if (it) setFile(it.getAsFile());
  };
  document.addEventListener('paste', onPaste);
  const off = () => document.removeEventListener('paste', onPaste);
  const origClose = m.close;
  m.close = (r) => { off(); origClose(r); };

  $('#eiCancel').onclick = () => m.close();

  const showSummary = (res) => {
    const sc = res.obj.scene || {};
    const n = a => (a || []).length;
    const pal = ((res.samples && res.samples.palette) || []).slice(0, 5)
      .map(c => `<i class="ei-swatch" style="background:${c}"></i>`).join('');
    const envTxt = res.env ? (res.env.mode === 'sphere'
      ? `原图 2:1 → 认作<b>全景图</b>，铺成环境球（转视角 = 在原地转头）`
      : `原图 ${(res.imgW || 0) }×${res.imgH} → 立成<b>背景板</b>挡在景后面`) : '';
    $('#eiOut').innerHTML = `
      <div class="card ei-result">
        <div><b>${esc(res.from)}</b> · 房 ${n(sc.rooms)} · 墙 ${n(sc.walls)} · 道具 ${n(sc.props)} · 人物 ${n(sc.persons)} · 光源 ${n(sc.lights)}${pal ? `<span class="ei-pal">取色 ${pal}</span>` : ''}</div>
        ${envTxt ? `<div class="ei-env">🌄 ${envTxt}</div>` : ''}
        ${(res.issues || []).length ? `<div class="ei-issues">${res.issues.slice(0, 5).map(x => esc(x)).join('<br>')}</div>` : ''}
        ${res.note ? `<div class="ei-issues">💡 ${esc(res.note)}</div>` : ''}
      </div>`;
  };

  $('#eiGo').onclick = async () => {
    if (!file || busy) return;
    busy = true;
    const mode = (m.body.querySelector('input[name="eiMode"]:checked') || {}).value || 'auto';
    $('#eiGo').disabled = true; $('#eiApply').disabled = true; $('#eiOut').innerHTML = '';
    st(mode === 'ai' ? '🤖 正在让 AI 看图反推…（10~40 秒，别关页面）' : mode === 'local' ? '🎨 正在采样图片…' : '🚀 正在反推…');
    try {
      const res = await window.ENV_IMPORT.fromFile(file, { mode, hint: $('#eiHint').value.trim(), settings: getStore().settings });
      window.__envLast = res;
      showSummary(res);
      $('#eiApply').style.display = '';
      $('#eiApply').disabled = false;
      st('反推完成。点「应用到导演台」只是装成草稿，你看过点保存才会存。');
    } catch (e) {
      st('❌ ' + e.message);
      toast('反推失败：' + e.message, 'warn');
    } finally {
      busy = false;
      $('#eiGo').disabled = false;
    }
  };

  $('#eiApply').onclick = async () => {
    const res = window.__envLast;
    if (!res) return toast('先点「开始反推」', 'warn');
    $('#eiApply').disabled = true;
    st('正在装进导演台…');
    try {
      if (!opts.inDirector) {
        const { openSceneBuilder } = await import('./builder.js');
        const shots = (getStore().active && getStore().active.shots) || [];
        const shot = shots[shots.length - 1];
        openSceneBuilder(shot || null, () => { }, shot ? {} : { library: true });
        if (!await waitDirector()) throw new Error('导演台没起来，刷新页面再试一次');
      }
      const envOn = $('#eiEnv');
      if (envOn && !envOn.checked) res.env = null;
      const msg = window.ENV_IMPORT.applyToDirector(res);
      m.close();
      toast(msg + (res.env ? ' · 图已铺进 3D，点「🔄 环绕」转一圈看' : ' · 点「🔄 环绕」转一圈看'), 'ok');
      if (opts.onApplied) opts.onApplied(res);
    } catch (e) {
      $('#eiApply').disabled = false;
      st('❌ ' + e.message);
      toast('应用失败：' + e.message, 'warn');
    }
  };

  setTimeout(() => $('#eiHint').focus(), 80);
  return m;
}
