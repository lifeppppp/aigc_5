const $ = (s) => document.querySelector(s);
const token = () => localStorage.getItem('sih_token') || '';

async function api(path, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-Token': token() }, opts.headers || {});
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { msg = (await r.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  $('#tab-' + t.dataset.tab).classList.add('active');
  if (t.dataset.tab === 'dingtalk') { loadStatus(); loadMessages(); }
  if (t.dataset.tab === 'docs') { loadGroups(); loadDocs(); }
  if (t.dataset.tab === 'settings') loadSettings();
}));

/* ---------- health badge ---------- */
async function loadHealth() {
  try {
    const h = await api('/api/health');
    const b = $('#model-badge');
    b.textContent = h.model_ready ? '模型已就绪 · ' + h.model : '演示模式 · 未配置 Key';
    b.className = 'badge ' + (h.model_ready ? 'ok' : 'mock');
  } catch (e) { $('#model-badge').textContent = '服务异常'; }
}

/* ---------- chat ---------- */
let convId = null, sending = false;

async function loadConvs() {
  const list = await api('/api/conversations');
  $('#convs').innerHTML = '';
  list.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'conv' + (c.id === convId ? ' active' : '');
    d.textContent = c.title;
    d.onclick = () => openConv(c.id);
    $('#convs').appendChild(d);
  });
}

async function openConv(id) {
  convId = id;
  const msgs = await api('/api/conversations/' + id);
  $('#chat-box').innerHTML = '';
  msgs.forEach((m) => addBubble(m.role === 'user' ? 'user' : 'bot', m.content));
  loadConvs();
}

function addBubble(role, text) {
  const empty = $('#chat-box .empty');
  if (empty) empty.remove();
  const d = document.createElement('div');
  d.className = 'bubble ' + role;
  d.textContent = text;
  $('#chat-box').appendChild(d);
  $('#chat-box').scrollTop = $('#chat-box').scrollHeight;
  return d;
}

async function send() {
  if (sending) return;
  const text = $('#msg').value.trim();
  if (!text) return;
  sending = true; $('#send').disabled = true;
  $('#msg').value = '';
  addBubble('user', text);
  const bot = addBubble('bot', '…');
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': token() },
      body: JSON.stringify({ conversation_id: convId, message: text, search: $('#search-toggle').checked }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!line.startsWith('data:')) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.type === 'delta') { acc += ev.text; bot.textContent = acc; }
        if (ev.type === 'done') { convId = ev.conversation_id; loadConvs(); }
      }
      $('#chat-box').scrollTop = $('#chat-box').scrollHeight;
    }
  } catch (e) { bot.textContent = '【发送失败】' + e.message; }
  sending = false; $('#send').disabled = false;
}

$('#send').onclick = send;
$('#msg').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
$('#new-conv').onclick = () => { convId = null; $('#chat-box').innerHTML = '<div class="empty">新对话，输入问题开始。</div>'; loadConvs(); };

/* ---------- dingtalk ---------- */
async function loadStatus() {
  const s = await api('/api/dingtalk/status');
  $('#dt-status').textContent = (s.connected ? '✅ 已接入' : '⚠ 未接入') + ' — ' + s.message;
}

async function loadGroups() {
  const { groups } = await api('/api/messages?limit=1');
  ['#msg-group', '#sum-group'].forEach((sel) => {
    const cur = $(sel).value;
    $(sel).innerHTML = '<option value="">全部群</option>' + groups.map((g) => `<option>${esc(g)}</option>`).join('');
    $(sel).value = cur;
  });
}

async function loadMessages() {
  await loadGroups();
  const g = $('#msg-group').value;
  const { messages } = await api('/api/messages?limit=200' + (g ? '&group=' + encodeURIComponent(g) : ''));
  $('#msg-table tbody').innerHTML = messages.map((m) =>
    `<tr><td>${fmtTime(m.ts)}</td><td>${esc(m.group_name)}</td><td>${esc(m.sender || '-')}</td><td></td></tr>`).join('');
  const rows = $('#msg-table tbody').rows;
  messages.forEach((m, i) => { rows[i].cells[3].textContent = m.content; });
}

$('#msg-refresh').onclick = loadMessages;
$('#msg-group').onchange = loadMessages;
$('#imp-btn').onclick = async () => {
  try {
    const r = await api('/api/messages/import', {
      method: 'POST',
      body: JSON.stringify({ group_name: $('#imp-group').value, text: $('#imp-text').value }),
    });
    $('#imp-result').textContent = `已导入 ${r.imported} 条`;
    $('#imp-text').value = '';
    loadMessages();
  } catch (e) { $('#imp-result').textContent = '导入失败：' + e.message; }
};

/* ---------- docs ---------- */
async function loadDocs() {
  const docs = await api('/api/documents');
  const t = token() ? '?token=' + encodeURIComponent(token()) : '';
  const td = token() ? '&token=' + encodeURIComponent(token()) : '';
  $('#doc-table tbody').innerHTML = docs.map((d) =>
    `<tr><td>${esc(d.title)}</td><td>${d.used_model ? '模型摘要' : '原始整理'}</td><td>${fmtTime(d.created_at)}</td>` +
    `<td><a href="/api/documents/${d.id}/download${t}">Markdown</a>` +
    `<a href="/api/documents/${d.id}/download?fmt=docx${td}">Word</a></td></tr>`).join('');
}

$('#doc-refresh').onclick = loadDocs;
$('#sum-btn').onclick = async () => {
  $('#sum-btn').disabled = true;
  $('#sum-result').textContent = '生成中…';
  try {
    const hours = parseFloat($('#sum-hours').value);
    const r = await api('/api/summary', {
      method: 'POST',
      body: JSON.stringify({ group: $('#sum-group').value || null, hours: isNaN(hours) ? null : hours }),
    });
    $('#sum-result').textContent = `已生成（${r.message_count} 条消息，${r.used_model ? '模型摘要' : '原始整理'}）`;
    loadDocs();
  } catch (e) { $('#sum-result').textContent = '生成失败：' + e.message; }
  $('#sum-btn').disabled = false;
};

/* ---------- settings ---------- */
async function loadSettings() {
  const s = await api('/api/settings');
  $('#set-base').value = s.bailian.base_url || '';
  $('#set-model').value = s.bailian.model || '';
  $('#set-key').value = s.bailian.api_key || '';
  $('#set-search').checked = !!s.bailian.enable_search;
  $('#set-token').value = token();
}

$('#set-save').onclick = async () => {
  const patch = {
    bailian: {
      base_url: $('#set-base').value.trim(),
      model: $('#set-model').value.trim(),
      api_key: $('#set-key').value.trim(),
      enable_search: $('#set-search').checked,
    },
  };
  const newTok = $('#set-token').value.trim();
  const oldTok = token();
  try {
    if (newTok !== oldTok) patch.server = { access_token: newTok };
    await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    localStorage.setItem('sih_token', newTok);
    $('#set-result').textContent = '已保存，立即生效';
    loadHealth();
  } catch (e) { $('#set-result').textContent = '保存失败：' + e.message; }
};

/* ---------- init ---------- */
loadHealth();
loadConvs();