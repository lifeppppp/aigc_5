const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const token = () => store.get('sih_token', '');

async function api(path, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json', 'X-Token': token() }, opts.headers || {});
  const r = await fetch(path, opts);
  if (!r.ok) { let m = 'HTTP ' + r.status; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
  return r.json();
}
function fmtTime(ts) {
  const d = new Date(ts * 1000), p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= 主题 / 背景 ================= */
const BG_PRESETS = [
  { name: '云海', path: 'assets/bg/bg-clouds.jpg' },
  { name: '雾岭', path: 'assets/bg/bg-hills.jpg' },
  { name: '湖光', path: 'assets/bg/bg-lake.jpg' },
];
const ACCENTS = ['#3d6bff', '#0ea5a5', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e'];
let theme = store.get('sih_theme', { tone: 0, accent: '#3d6bff', bg: BG_PRESETS[0].path });

function hexSoft(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function applyTheme() {
  const r = document.documentElement.style;
  r.setProperty('--accent', theme.accent);
  r.setProperty('--accent-soft', hexSoft(theme.accent, .14));
  const v = theme.tone / 100;
  const bg = $('#bg');
  bg.style.backgroundImage = `url("${theme.bg}")`;
  bg.style.filter = v >= 0
    ? `sepia(${v * .4}) saturate(${1 + v * .25}) hue-rotate(${-v * 10}deg)`
    : `hue-rotate(${-v * 14}deg) saturate(${1 + v * .3}) brightness(${1 - v * .04})`;
  $('#bg-tint').style.background = v >= 0 ? `rgba(255,150,60,${v * .12})` : `rgba(80,140,255,${-v * .12})`;
  $('#tone').value = theme.tone;
  $('#tone-label').textContent = theme.tone === 0 ? '中性' : (theme.tone > 0 ? `偏暖 +${theme.tone}` : `偏冷 ${theme.tone}`);
  $$('#swatches .swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === theme.accent));
  $$('#bg-thumbs .bg-thumb').forEach((s) => s.classList.toggle('on', s.dataset.p === theme.bg));
}
function saveTheme() { store.set('sih_theme', theme); applyTheme(); }

$('#tone').addEventListener('input', (e) => { theme.tone = +e.target.value; saveTheme(); });
ACCENTS.forEach((c) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.dataset.c = c; b.style.background = c; b.title = c;
  b.onclick = () => { theme.accent = c; saveTheme(); };
  $('#swatches').appendChild(b);
});
BG_PRESETS.forEach((p) => {
  const b = document.createElement('button');
  b.className = 'bg-thumb'; b.dataset.p = p.path; b.style.backgroundImage = `url("${p.path}")`; b.title = p.name;
  b.onclick = () => { theme.bg = p.path; saveTheme(); toast('已切换背景：' + p.name); };
  $('#bg-thumbs').appendChild(b);
});
$('#bg-upload-btn').onclick = () => $('#bg-file').click();
$('#bg-file').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 4 * 1024 * 1024) { toast('图片请小于 4MB'); return; }
  const rd = new FileReader();
  rd.onload = () => { theme.bg = rd.result; saveTheme(); toast('已使用自定义背景'); };
  rd.readAsDataURL(f);
  e.target.value = '';
};
$('#bg-reset').onclick = () => { theme.bg = BG_PRESETS[0].path; saveTheme(); toast('已恢复默认背景'); };

/* ================= 侧边栏 ================= */
const sidebar = $('#sidebar'), scrim = $('#scrim'), home = $('#home');
let sideOpen = false;
function setSide(open) {
  sideOpen = open;
  sidebar.style.transition = ''; sidebar.style.transform = '';
  sidebar.classList.toggle('open', open);
  scrim.classList.toggle('hidden', !open);
  requestAnimationFrame(() => scrim.classList.toggle('show', open));
}
$('#menu-btn').onclick = () => setSide(true);
scrim.onclick = () => setSide(false);

let drag = null;
home.style.touchAction = 'pan-y';
home.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, active: false }; });
home.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.active) {
    if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      drag.active = true;
      scrim.classList.remove('hidden');
      sidebar.style.transition = 'none';
    } else return;
  }
  const W = sidebar.offsetWidth;
  const base = sideOpen ? 0 : -W;
  const px = Math.max(-W, Math.min(0, base + dx));
  sidebar.style.transform = `translateX(${px}px)`;
  scrim.style.opacity = String((px + W) / W * .9);
});
function endDrag(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const wasActive = drag.active;
  drag = null;
  if (!wasActive) return;
  scrim.style.opacity = '';
  const W = sidebar.offsetWidth;
  const open = sideOpen ? dx > -W * .3 : dx > W * .3;
  setSide(open);
}
home.addEventListener('pointerup', endDrag);
home.addEventListener('pointercancel', () => { if (drag && drag.active) setSide(sideOpen); drag = null; });

/* ================= 页面切换 ================= */
function openPage(id) {
  setSide(false);
  $('#page-' + id).classList.add('open');
  if (id === 'settings') loadSettings();
  if (id === 'calendar') renderCal();
  if (id === 'dingtalk') { loadStatus(); loadMessages(); }
  if (id === 'docs') { loadGroups(); loadDocs(); }
  if (id === 'hist') loadConvs();
}
$$('.page .back').forEach((b) => b.onclick = () => b.closest('.page').classList.remove('open'));
$$('.side-item').forEach((b) => b.onclick = () => openPage(b.dataset.page));

/* ================= 个人中心 ================= */
$('#p-name').textContent = store.get('sih_name', '同学');
$('#profile').onclick = () => {
  $('#rename-input').value = store.get('sih_name', '同学');
  $('#rename-modal').classList.remove('hidden');
  $('#rename-input').focus();
};
$('#rename-cancel').onclick = () => $('#rename-modal').classList.add('hidden');
$('#rename-save').onclick = () => {
  const v = $('#rename-input').value.trim();
  if (!v) { toast('名称不能为空'); return; }
  store.set('sih_name', v);
  $('#p-name').textContent = v;
  $('#rename-modal').classList.add('hidden');
  toast('名称已修改');
};

/* ================= 链接市场 ================= */
const LINKS = [
  { name: '数字杭电', url: 'https://i.hdu.edu.cn/', ico: '🖥️' },
  { name: '杭电后勤生活', url: 'https://neo.hduhelp.com/', ico: '🍚' },
  { name: '杭电助手', url: 'https://neo.hduhelp.com/', ico: '🤖' },
  { name: '杭电官网', url: 'https://www.hdu.edu.cn/', ico: '🏫' },
  { name: '青春杭电', url: 'https://erke.hdu.edu.cn/', ico: '🌱' },
  { name: '学习通', url: 'https://www.chaoxing.com/', ico: '📚' },
  { name: 'PTA', url: 'https://pintia.cn/', ico: '⌨️' },
];
LINKS.forEach((l) => {
  const w = document.createElement('div');
  w.className = 'win';
  w.innerHTML =
    `<div class="win-title">${esc(l.name)}<span class="dots"><i></i><i></i></span></div>` +
    `<div class="win-body"><span class="win-ico">${l.ico}</span><span class="win-name">${esc(l.name)}</span>` +
    `<span class="win-url">${esc(l.url.replace(/^https?:\/\//, ''))}</span></div>` +
    `<div class="shutter l"></div><div class="shutter r"></div>`;
  w.onclick = () => {
    if (w.classList.contains('opening')) return;
    w.classList.add('opening');
    setTimeout(() => window.open(l.url, '_blank'), 550);
    setTimeout(() => w.classList.remove('opening'), 1100);
  };
  $('#win-grid').appendChild(w);
});

/* ================= 左滑删除（通用） ================= */
function attachSwipe(item, onDel) {
  const main = item.querySelector('.item-main');
  let sx = null, dx = 0;
  main.addEventListener('pointerdown', (e) => { sx = e.clientX; dx = 0; main.style.transition = 'none'; });
  main.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    dx = Math.max(-72, Math.min(0, e.clientX - sx));
    if (Math.abs(dx) > 6) main.style.transform = `translateX(${dx}px)`;
  });
  const up = () => {
    if (sx == null) return;
    main.style.transition = ''; main.style.transform = '';
    item.classList.toggle('revealed', dx < -36);
    sx = null;
  };
  main.addEventListener('pointerup', up);
  main.addEventListener('pointercancel', up);
  item.querySelector('.item-del').onclick = () => onDel();
}
document.addEventListener('pointerdown', (e) => {
  $$('.item.revealed').forEach((it) => { if (!it.contains(e.target)) it.classList.remove('revealed'); });
});

function itemRow(it, onToggle, onDel) {
  const row = document.createElement('div');
  row.className = 'item' + (it.done ? ' done' : '');
  row.innerHTML =
    `<div class="item-main"><button class="ck${it.done ? ' on' : ''}">${it.done ? '✓' : ''}</button>` +
    `<span class="item-text">${esc(it.text)}</span>${it.weekly ? '<span class="wbadge">↻ 每周</span>' : ''}</div>` +
    `<button class="item-del">删除</button>`;
  row.querySelector('.ck').onclick = () => onToggle();
  attachSwipe(row, onDel);
  return row;
}

/* ================= 个人日历 ================= */
let calDate = new Date();
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const calDays = () => store.get('sih_cal_days', {});
const calWeekly = () => store.get('sih_cal_weekly', []);
const calWDone = () => store.get('sih_cal_wdone', {});

function dayItems(key) {
  const wd = (new Date(key + 'T00:00:00').getDay() + 6) % 7;
  const own = (calDays()[key] || []).map((it) => ({ ...it, weekly: false }));
  const wk = calWeekly().filter((w) => w.wd === wd).map((w) => ({
    id: 'w' + w.id, text: w.text, weekly: true, done: !!calWDone()[key + '|' + w.id],
  }));
  return [...own, ...wk];
}
function renderCal() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  $('#monthLabel').textContent = `${y} 年 ${m + 1} 月`;
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const todayKey = dkey(new Date());
  const grid = $('#grid'); grid.innerHTML = '';
  for (let i = 0; i < first; i++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'cell blank' }));
  for (let d = 1; d <= n; d++) {
    const key = dkey(new Date(y, m, d));
    const items = dayItems(key);
    const cell = document.createElement('button');
    cell.className = 'cell' + (key === todayKey ? ' today' : '');
    let dots = '';
    if (items.length) {
      const pending = items.some((i) => !i.done);
      const cls = pending ? 'dot-red' : 'dot-gray';
      dots = `<i class="${cls}"></i>` + (items.length > 1 ? `<i class="${cls}"></i>` : '');
    }
    cell.innerHTML = `<span>${d}</span><span class="dots">${dots}</span>` +
      (items.length > 1 ? `<span class="cnt">${items.length}</span>` : '');
    cell.onclick = () => openDay(key);
    grid.appendChild(cell);
  }
}
$('#prevM').onclick = () => { calDate.setMonth(calDate.getMonth() - 1); renderCal(); };
$('#nextM').onclick = () => { calDate.setMonth(calDate.getMonth() + 1); renderCal(); };

let dayKey = null;
function openDay(key) {
  dayKey = key;
  const d = new Date(key + 'T00:00:00');
  $('#day-title').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${'一二三四五六日'[(d.getDay() + 6) % 7]}`;
  renderDay();
  $('#day-modal').classList.remove('hidden');
  $('#day-text').focus();
}
function renderDay() {
  const list = $('#day-list'); list.innerHTML = '';
  const items = dayItems(dayKey);
  if (!items.length) list.innerHTML = '<div class="day-empty">还没有事项，在下面输入添加</div>';
  items.forEach((it) => {
    list.appendChild(itemRow(it, () => {
      if (it.weekly) {
        const wd = calWDone(); const k = dayKey + '|' + it.id.slice(1);
        wd[k] = !it.done; store.set('sih_cal_wdone', wd);
      } else {
        const days = calDays();
        const t = (days[dayKey] || []).find((x) => x.id === it.id);
        if (t) t.done = !it.done;
        store.set('sih_cal_days', days);
      }
      renderDay(); renderCal();
    }, () => {
      if (it.weekly) {
        store.set('sih_cal_weekly', calWeekly().filter((w) => 'w' + w.id !== it.id));
        toast('已删除该每周重复事项');
      } else {
        const days = calDays();
        days[dayKey] = (days[dayKey] || []).filter((x) => x.id !== it.id);
        store.set('sih_cal_days', days);
      }
      renderDay(); renderCal();
    }));
  });
}
function addDayItem() {
  const text = $('#day-text').value.trim();
  if (!text) return;
  if ($('#day-weekly').checked) {
    const wd = (new Date(dayKey + 'T00:00:00').getDay() + 6) % 7;
    const wk = calWeekly(); wk.push({ id: uid(), wd, text }); store.set('sih_cal_weekly', wk);
    toast('已设为每周重复');
  } else {
    const days = calDays();
    (days[dayKey] = days[dayKey] || []).push({ id: uid(), text, done: false });
    store.set('sih_cal_days', days);
  }
  $('#day-text').value = '';
  renderDay(); renderCal();
}
$('#day-add').onclick = addDayItem;
$('#day-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDayItem(); });
$('#day-close').onclick = () => $('#day-modal').classList.add('hidden');

/* ================= 待办模式 + 烟花 ================= */
let mode = 'ai';
const todos = () => store.get('sih_todos', []);
function renderTodos() {
  const list = $('#todo-list'); list.innerHTML = '';
  const all = todos();
  const pending = all.filter((t) => !t.done), done = all.filter((t) => t.done);
  if (!all.length) list.innerHTML = '<div class="empty">还没有待办，在下方输入添加</div>';
  const bind = (t) => itemRow(t, () => {
    const arr = todos(); const x = arr.find((a) => a.id === t.id);
    if (x) { x.done = !x.done; store.set('sih_todos', arr); }
    renderTodos();
    if (x && x.done) { fireworks(); toast('恭喜，今天又完成了一个代办'); }
  }, () => {
    store.set('sih_todos', todos().filter((a) => a.id !== t.id));
    renderTodos();
  });
  pending.forEach((t) => list.appendChild(bind(t)));
  if (done.length) {
    const dv = document.createElement('div'); dv.className = 'divider'; dv.textContent = '已完成';
    list.appendChild(dv);
    done.forEach((t) => list.appendChild(bind(t)));
  }
}
function addTodo(text) {
  const arr = todos(); arr.push({ id: uid(), text, done: false, ts: Date.now() });
  store.set('sih_todos', arr); renderTodos();
}

const fx = $('#fx'), fctx = fx.getContext('2d');
let parts = [], fxRunning = false;
function sizeFx() { fx.width = fx.offsetWidth; fx.height = fx.offsetHeight; }
window.addEventListener('resize', sizeFx);
function fireworks() {
  sizeFx();
  const cx = fx.width / 2, cy = 90;
  const colors = [theme.accent, '#ffd166', '#ef476f', '#06d6a0', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4;
    parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 50 + Math.random() * 40, c: colors[i % colors.length] });
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
}
function fxLoop() {
  fctx.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter((p) => p.life > 0);
  parts.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += .06; p.life--;
    fctx.globalAlpha = Math.max(0, p.life / 70);
    fctx.fillStyle = p.c;
    fctx.fillRect(p.x, p.y, 3, 3);
  });
  fctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(fxLoop);
  else { fxRunning = false; fctx.clearRect(0, 0, fx.width, fx.height); }
}

/* ================= 模式切换 ================= */
function setMode(m) {
  mode = m;
  $('#mode-pop').classList.add('hidden');
  $('#chat-box').classList.toggle('hidden', m !== 'ai');
  $('#todo-pane').classList.toggle('hidden', m !== 'todo');
  $('#msg').placeholder = m === 'ai' ? '问点什么…' : '输入待办事项，回车添加';
  $$('.mode-opt').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'todo') renderTodos();
}
$('#plus-btn').onclick = (e) => { e.stopPropagation(); $('#mode-pop').classList.toggle('hidden'); };
$$('.mode-opt').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
document.addEventListener('pointerdown', (e) => {
  if (!$('#mode-pop').classList.contains('hidden') && !$('#mode-pop').contains(e.target) && e.target !== $('#plus-btn'))
    $('#mode-pop').classList.add('hidden');
});

/* ================= 聊天 ================= */
let convId = null, sending = false, netOn = true;
$('#net-btn').classList.add('on');
$('#net-btn').onclick = () => { netOn = !netOn; $('#net-btn').classList.toggle('on', netOn); toast(netOn ? '联网搜索：开' : '联网搜索：关'); };

async function loadHealth() {
  try {
    const h = await api('/api/health');
    const b = $('#model-badge');
    b.textContent = h.model_ready ? '模型就绪' : '演示模式';
    b.className = 'badge' + (h.model_ready ? '' : ' mock');
    b.title = h.model_ready ? h.model : '未配置 Key';
  } catch (e) { $('#model-badge').textContent = '服务异常'; }
}
async function loadConvs() {
  const list = await api('/api/conversations');
  $('#convs').innerHTML = '';
  if (!list.length) $('#convs').innerHTML = '<div class="day-empty">暂无历史对话</div>';
  list.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'conv' + (c.id === convId ? ' active' : '');
    d.textContent = c.title;
    d.onclick = async () => {
      convId = c.id;
      const msgs = await api('/api/conversations/' + c.id);
      $('#chat-box').innerHTML = '';
      msgs.forEach((m) => addBubble(m.role === 'user' ? 'user' : 'bot', m.content));
      $('#page-hist').classList.remove('open');
      setMode('ai');
    };
    $('#convs').appendChild(d);
  });
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
async function sendChat(text) {
  sending = true; $('#send').disabled = true;
  addBubble('user', text);
  const bot = addBubble('bot', '…');
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token': token() },
      body: JSON.stringify({ conversation_id: convId, message: text, search: netOn }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 2);
        if (!line.startsWith('data:')) continue;
        const ev = JSON.parse(line.slice(5));
        if (ev.type === 'delta') { acc += ev.text; bot.textContent = acc; }
        if (ev.type === 'done') convId = ev.conversation_id;
      }
      $('#chat-box').scrollTop = $('#chat-box').scrollHeight;
    }
  } catch (e) { bot.textContent = '【发送失败】' + e.message; }
  sending = false; $('#send').disabled = false;
}
function send() {
  const text = $('#msg').value.trim();
  if (!text) return;
  $('#msg').value = '';
  if (mode === 'todo') addTodo(text);
  else if (!sending) sendChat(text);
}
$('#send').onclick = send;
$('#msg').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
$('#new-conv').onclick = () => { convId = null; $('#chat-box').innerHTML = '<div class="empty">新对话，输入问题开始</div>'; setMode('ai'); };
$('#hist-btn').onclick = () => openPage('hist');

/* ================= 钉钉消息 ================= */
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
  $('#msg-list').innerHTML = messages.length ? '' : '<div class="day-empty">暂无消息</div>';
  messages.forEach((m) => {
    const d = document.createElement('div');
    d.className = 'msg-row';
    d.innerHTML = `<div class="meta">${fmtTime(m.ts)} · ${esc(m.group_name)} · ${esc(m.sender || '-')}</div>`;
    const c = document.createElement('div'); c.textContent = m.content; d.appendChild(c);
    $('#msg-list').appendChild(d);
  });
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

/* ================= 汇总文档 ================= */
async function loadDocs() {
  const docs = await api('/api/documents');
  const t = token() ? '?token=' + encodeURIComponent(token()) : '';
  const td = token() ? '&token=' + encodeURIComponent(token()) : '';
  $('#doc-list').innerHTML = docs.length ? '' : '<div class="day-empty">暂无文档</div>';
  docs.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'msg-row';
    row.innerHTML = `<div class="meta">${fmtTime(d.created_at)} · ${d.used_model ? '模型摘要' : '原始整理'}</div>` +
      `<div>${esc(d.title)}</div>` +
      `<div><a href="/api/documents/${d.id}/download${t}">Markdown</a><a href="/api/documents/${d.id}/download?fmt=docx${td}">Word</a></div>`;
    $('#doc-list').appendChild(row);
  });
}
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

/* ================= 模型设置 ================= */
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
  const newTok = $('#set-token').value.trim(), oldTok = token();
  try {
    if (newTok !== oldTok) patch.server = { access_token: newTok };
    await api('/api/settings', { method: 'POST', body: JSON.stringify(patch) });
    store.set('sih_token', newTok);
    $('#set-result').textContent = '已保存，立即生效';
    loadHealth();
  } catch (e) { $('#set-result').textContent = '保存失败：' + e.message; }
};

/* ================= 初始化 ================= */
applyTheme();
setMode('ai');
renderTodos();
loadHealth();
$('#chat-box').innerHTML = '<div class="empty">你好，' + esc(store.get('sih_name', '同学')) + '！问点什么，或点左下「＋」切换待办模式</div>';