/* 校园令牌快捷入口：获取 -> 粘贴 -> 服务端校验 -> 随每次提问交给后端查询 */
(() => {
  const KEY = 'starwood.hduhelp.token';
  const TOKEN_PAGE = 'https://neo.hduhelp.com/account/tokens/new';
  const chatEndpoint = (window.STARWOOD_CHAT?.endpoint || '').trim();
  const apiBase = chatEndpoint.replace(/\/chat$/, '');
  const read = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  let token = read();
  let info = null;

  const insecure = location.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(location.hostname);

  const dialog = document.createElement('dialog');
  dialog.className = 'token-dialog';
  dialog.setAttribute('aria-labelledby', 'tokenTitle');
  dialog.innerHTML = `
    <header class="token-head">
      <div><span class="eyebrow">CAMPUS DATA</span><h2 id="tokenTitle">校园令牌</h2></div>
      <button type="button" class="token-close" aria-label="关闭">×</button>
    </header>
    <p class="token-lead">绑定杭电助手个人访问令牌后，烁才能经团队后端读取你的课表、校园卡、电费等校园数据并回答你。令牌只保存在本浏览器，提问时随请求发送给后端，仅用于向杭电助手查询，不会写入聊天记录。</p>
    <ol class="token-steps">
      <li>打开令牌页，新建一个个人访问令牌（建议只勾选只读权限，妥善保管）。</li>
      <li>复制以 hduhelp_pat_ 开头的令牌，粘贴到下方。</li>
    </ol>
    <a class="token-link" href="${TOKEN_PAGE}" target="_blank" rel="noopener noreferrer">去获取令牌 ↗</a>
    <label class="token-field">粘贴令牌
      <input id="tokenInput" type="password" autocomplete="off" spellcheck="false" placeholder="hduhelp_pat_...">
    </label>
    <p class="token-status" id="tokenStatus" role="status"></p>
    ${insecure ? '<p class="token-warn">当前是 HTTP 明文连接，令牌在传输途中可能被窃听。正式使用请为服务配置 HTTPS，或仅在本人设备的受信网络中使用。</p>' : ''}
    <div class="token-actions">
      <button type="button" class="token-primary" id="tokenSave">验证并保存</button>
      <button type="button" id="tokenClear" hidden>清除令牌</button>
      <button type="button" id="tokenCancel">取消</button>
    </div>`;
  document.body.append(dialog);

  const input = dialog.querySelector('#tokenInput');
  const status = dialog.querySelector('#tokenStatus');
  const clearBtn = dialog.querySelector('#tokenClear');
  const saveBtn = dialog.querySelector('#tokenSave');
  const shortcut = document.querySelector('#tokenShortcut');

  function paint() {
    if (!shortcut) return;
    shortcut.textContent = token ? '校园令牌 · 已连接' : '校园令牌';
    shortcut.classList.toggle('token-bound', !!token);
  }

  function setStatus(text, kind) {
    status.textContent = text || '';
    status.dataset.kind = kind || '';
  }

  function refreshClear() {
    clearBtn.hidden = !token;
  }

  function describe() {
    if (info && (info.nickname || info.staffId)) {
      return '已连接' + (info.nickname ? ' · ' + info.nickname : '') +
        (info.staffId ? ' · 学号 ' + info.staffId : '');
    }
    return token ? '已保存令牌，尚未验证' : '尚未绑定';
  }

  async function verify(raw) {
    if (!apiBase) {
      token = raw;
      try { localStorage.setItem(KEY, raw); } catch (e) {}
      info = null;
      setStatus('本地预览模式下只保存在浏览器，部署到服务器后才会校验并启用数据查询。', 'warn');
      paint(); refreshClear();
      dispatch();
      return;
    }
    saveBtn.disabled = true;
    setStatus('正在验证令牌……');
    try {
      const response = await fetch(apiBase + '/token/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token: raw }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || '验证失败（' + response.status + '）');
      token = raw;
      info = result;
      try { localStorage.setItem(KEY, raw); } catch (e) {}
      paint(); refreshClear();
      setStatus('验证通过：' + (result.nickname || '已识别身份') +
        (result.staffId ? ' · 学号 ' + result.staffId : '') +
        (result.schoolName ? ' · ' + result.schoolName : ''), 'ok');
      dispatch();
      setTimeout(() => { if (dialog.open) dialog.close(); }, 900);
    } catch (error) {
      const message = error.name === 'AbortError'
        ? '验证超时，请检查网络后重试。'
        : error.name === 'TypeError'
          ? '无法连接验证服务，请确认后端已启动。'
          : error.message;
      setStatus(message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function dispatch() {
    window.dispatchEvent(new CustomEvent('starwood:token-changed', { detail: { bound: !!token } }));
  }

  function open() {
    input.value = '';
    refreshClear();
    setStatus(describe(), token ? 'ok' : '');
    if (!dialog.open) dialog.showModal();
    input.focus({ preventScroll: true });
  }

  dialog.querySelector('.token-close').onclick = () => dialog.close();
  dialog.querySelector('#tokenCancel').onclick = () => dialog.close();
  clearBtn.onclick = () => {
    token = ''; info = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    paint(); refreshClear(); setStatus('已清除本机保存的令牌。', 'warn'); dispatch();
  };
  saveBtn.onclick = () => {
    const raw = input.value.trim();
    if (!/^hduhelp_pat_[A-Za-z0-9]{20,}$/.test(raw)) {
      setStatus('格式不对：令牌应以 hduhelp_pat_ 开头，后面是一长串字母数字。请从令牌页复制完整内容。', 'error');
      return;
    }
    verify(raw);
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); saveBtn.click(); }
  });

  if (shortcut) shortcut.onclick = open;
  // 学习页的连接卡片通过这个接口打开同一个快捷弹窗
  window.StarwoodTokenUI = { open, hasToken: () => !!token };

  (async () => {
    paint();
    if (!token || !apiBase) return;
    try {
      const response = await fetch(apiBase + '/token/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return;
      info = await response.json();
      dispatch();
    } catch (e) {}
  })();
})();