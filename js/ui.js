/* ============================================================
 * 白日梦导演台 · 共享 UI 工具
 * ============================================================ */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 字符串 → DOM */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* 通用弹窗。返回 { close, body } */
function modal({ title = '', body = '', wide = false, onClose = null } = {}) {
  const ov = el(`<div class="modal-ov">
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog">
      <div class="modal-head"><div class="modal-title">${title}</div><button class="modal-x" aria-label="关闭">✕</button></div>
      <div class="modal-body">${body}</div>
    </div></div>`);
  document.body.appendChild(ov);
  const close = (result) => {
    ov.classList.add('closing');
    setTimeout(() => ov.remove(), 180);
    if (onClose) onClose(result);
  };
  ov.querySelector('.modal-x').onclick = () => close(null);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
  document.addEventListener('keydown', function h(ev) {
    if (ev.key === 'Escape' && document.body.contains(ov)) { close(null); document.removeEventListener('keydown', h); }
  });
  // 防滚动穿透
  const prevOv = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const origClose = close;
  const wrappedClose = (r) => { document.body.style.overflow = prevOv; origClose(r); };
  ov.querySelector('.modal-x').onclick = () => wrappedClose(null);
  return { close: wrappedClose, root: ov, body: ov.querySelector('.modal-body') };
}

/* 确认框（Promise） */
function confirmDlg(msg, { danger = false, okText = '确定', cancelText = '取消' } = {}) {
  return new Promise(resolve => {
    const m = modal({
      title: danger ? '⚠️ 确认操作' : '确认',
      body: `<div class="confirm-msg">${esc(msg)}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="no">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes">${esc(okText)}</button>
        </div>`,
      onClose: null,
    });
    m.body.querySelector('[data-act="no"]').onclick = () => { m.close(false); resolve(false); };
    m.body.querySelector('[data-act="yes"]').onclick = () => { m.close(true); resolve(true); };
    m.root.querySelector('.modal-x').onclick = () => { m.close(false); resolve(false); };
  });
}

/* toast（通过事件交给 app 统一渲染） */
function toast(msg, type = 'info') {
  window.dispatchEvent(new CustomEvent('bdm-toast', { detail: { msg, type } }));
}

/* 复制到剪贴板（带降级） */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板 ✂️', 'ok');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? '已复制到剪贴板 ✂️' : '复制失败，请手动选择复制', ok ? 'ok' : 'warn');
    return ok;
  }
}

/* 下拉文件读取 */
function pickFile(accept = '*/*') {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => resolve(inp.files?.[0] || null);
    inp.click();
  });
}

/* 秒 → mm:ss.d */
function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m > 0 ? `${m}分${(s.toFixed(1))}秒` : `${(+s).toFixed(1)}秒`;
}

/* select 构造帮助 */
function opts(list, val, labelFn = x => x.name, groupFn = null) {
  if (!groupFn) return list.map(o => `<option value="${esc(o.key)}" ${o.key === val ? 'selected' : ''}>${esc(labelFn(o))}</option>`).join('');
  const groups = new Map();
  for (const o of list) { const g = groupFn(o); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
  return [...groups.entries()].map(([g, arr]) =>
    `<optgroup label="${esc(g)}">${arr.map(o => `<option value="${esc(o.key)}" ${o.key === val ? 'selected' : ''}>${esc(labelFn(o))}</option>`).join('')}</optgroup>`
  ).join('');
}

export { esc, el, modal, confirmDlg, toast, copyText, pickFile, fmtDur, opts };
