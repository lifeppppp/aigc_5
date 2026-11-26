/* 云端情报：读 web-sentinel(:8020) 的截图识别结果，一键写进星木日历。
   页签按钮和面板都由本文件运行时注入，index.html 只需要多一行 <script src="sentinel.js">。 */
(() => {
  /* 从 ECS 同源打开时用当前主机名；本机预览和 file:// 直开时退回团队 ECS 地址 */
  const ECS = '8.136.148.250';
  const host = location.hostname;
  const API = `http://${!host || host === '127.0.0.1' || host === 'localhost' ? ECS : host}:8020`;
  /* 每人一把专属令牌，键与 8000 群情报的 gi_token 分开：
     回落到 gi_token 会让所有人都以管理员身份看到别人的成绩，隔离就白做了 */
  const TK = 'sentinel_token';
  const TS = 'sentinel_login_ts';
  const SESSION_MS = 30 * 86400000;
  /* 登录页也带版本号：旧版 login.html 不写 sentinel_login_ts，
     被缓存住就会让人一登录就被判成未登录 */
  const LOGIN = 'login.html?v=8';
  /* 一次登录 30 天有效，起点是登录那一刻，中途常用不续期 */
  function clearLocal() {
    localStorage.removeItem(TK);
    localStorage.removeItem(TS);
    localStorage.removeItem('sentinel_account');
  }
  function stamp() { localStorage.setItem(TS, String(Date.now())); }
  function token() {
    const t = localStorage.getItem(TK) || '';
    if (!t) return '';
    const born = Number(localStorage.getItem(TS) || 0);
    /* 时间戳缺失＝年龄未知（老登录页或缓存的登录页写下的令牌），不能直接踢人：
       保持有效，由 needsLogin 的 401 判定，判过再补起点 */
    if (born && Date.now() - born > SESSION_MS) { clearLocal(); return ''; }
    return t;
  }
  const TYPES = ['作业', '考试', '学习', '计划'];
  const $ = s => document.querySelector(s);
  let loaded = false;
  let lastAuth = [];

  /* auto=1：授权页一打开就自己申请云端桌面。查询串是给授权页用的缓存版本号——
     星木这边升 sentinel.js 时，grant 页也要跟着换，否则浏览器还在跑旧版授权页。 */
  function openGrant(site) {
    if (!token()) { location.href = LOGIN; return; }
    window.open(`${API}/grant?v=2#t=${encodeURIComponent(token())}`
      + `&site=${encodeURIComponent(site)}&auto=1`, '_blank');
  }

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function req(path) {
    return fetch(API + path, { headers: { 'X-Client-Token': token() } })
      .then(r => {
        if (r.status === 401) throw new Error('令牌无效：请到「情报」页顶部粘贴管理员发给你自己的那把');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* 原图走带令牌的 fetch 再转 blob：img 标签发不出自定义头，拼在查询串里会漏进浏览器历史 */
  function imageUrl(name) {
    return fetch(API + '/api/shot/' + encodeURIComponent(name), { headers: { 'X-Client-Token': token() } })
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      })
      .then(b => URL.createObjectURL(b));
  }

  function shotStrip(item) {
    const names = (item.shots || []).slice(0, 4);
    if (!names.length) return null;
    const box = el('div', 'intel-shots');
    const btn = el('button', 'intel-btn ghost small', '看原图');
    btn.type = 'button';
    let opened = false;
    btn.onclick = () => {
      if (opened) {
        box.querySelectorAll('img').forEach(n => n.remove());
        opened = false;
        btn.textContent = '看原图';
        return;
      }
      btn.textContent = '载入中…';
      Promise.all(names.map(imageUrl))
        .then(urls => {
          urls.forEach(u => {
            const img = el('img', 'intel-shot');
            img.src = u;
            img.alt = '页面截图';
            img.onclick = () => window.open(u, '_blank', 'noopener');
            box.append(img);
          });
          btn.textContent = '收起原图';
          opened = true;
        })
        .catch(e => { btn.textContent = '原图读取失败：' + e.message; });
    };
    const row = el('div', 'intel-shotrow');
    row.append(btn, box);
    return row;
  }
  /* 模型读外部网页截图得到的一切文字都按不可信内容处理：只用 textContent，不拼 innerHTML */
  function safeLink(url) {
    try {
      const u = new URL(url);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
    } catch { return null; }
  }

  function buildPanel() {
    if ($('#intelPanel')) return;
    const nav = $('.rail');
    const btn = el('button', 'rail-btn');
    btn.type = 'button';
    btn.dataset.panel = 'intel';
    btn.append(el('span', '', '◎'), document.createTextNode('情报'));
    nav.insertBefore(btn, $('.rail-line') || null);

    const panel = el('section', 'intel-panel');
    panel.id = 'intelPanel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '云端截图情报');

    const head = el('div', 'intel-head');
    const title = el('div');
    title.append(el('span', 'eyebrow', 'CLOUD SCREENSHOT INTEL'), el('h2', '', '云端替你看过的页面'));
    const tools = el('div', 'intel-tools');
    const refresh = el('button', 'intel-btn', '重新拉取');
    refresh.type = 'button';
    refresh.onclick = () => load(true);
    const state = el('span', 'intel-state', '');
    state.id = 'intelState';
    tools.append(state, refresh);
    head.append(title, tools);

    const ident = el('div', 'intel-id');
    ident.id = 'intelId';
    const warn = el('div', 'intel-warn');
    warn.id = 'intelWarn';
    warn.hidden = true;
    const list = el('div', 'intel-list');
    list.id = 'intelList';

    panel.append(head, ident, warn, list,
      el('p', 'intel-foot', '内容取自云端页面正文，由大模型整理。涉及截止日期时请点原图核对。'));
    $('.workarea').insertBefore(panel, $('.desk-footer') || null);
  }

  /* 身份栏：没令牌就给令牌输入框，有身份就显示「你是谁 + 今日额度」 */
  function setIdent(info) {
    const bar = $('#intelId');
    if (!bar) return;
    bar.replaceChildren();
    if (!info) {
      /* 用户端：有账号的人走登录页，令牌由账号换出来，不用手抄 */
      if (location.pathname.startsWith('/starwood/')) {
        const go = el('a', 'intel-btn small', '登录 / 注册');
        go.href = LOGIN;
        bar.append(el('span', 'intel-idtip', '用你自己的账号登录，情报、授权、日历就都是你一个人的。'), go);
      }
      const tip = el('span', 'intel-idtip',
        '或者把管理员发给你本人的令牌粘进来（开发者方式）。之后这里只显示你自己的作业和成绩，组员之间互不可见。');
      const inp = el('input', 'intel-token');
      inp.type = 'password';
      inp.placeholder = '你的专属令牌';
      inp.autocomplete = 'off';
      const save = el('button', 'intel-btn small', '保存并加载');
      save.type = 'button';
      save.onclick = () => {
        const v = inp.value.trim();
        if (!v) { setState('令牌是空的'); return; }
        localStorage.setItem(TK, v);
        stamp();
        load(true);
      };
      inp.onkeydown = e => { if (e.key === 'Enter') save.click(); };
      const row = el('div', 'intel-tokenrow');
      row.append(inp, save);
      bar.append(tip, row);
      return;
    }
    bar.append(el('span', 'intel-who', `身份 ${info.label || info.member}`));
    if (info.username) bar.append(el('span', 'intel-acct', `账号 ${info.username}`));
    const st = info.stats || {};
    const used = (st.usage || {}).tokens || 0;
    const cap = st.member_cap || 0;
    bar.append(el('span', 'intel-quota', `今日 ${used}/${cap} tokens`));
    if (cap && used >= cap) {
      bar.append(el('span', 'intel-quota bad', '你的额度已用完，等明天或请管理员放宽 SENTINEL_MEMBER_DAILY_TOKENS'));
    }
    const total = (st.total_usage || {}).tokens || 0;
    if (st.cap && total >= st.cap) {
      bar.append(el('span', 'intel-quota bad', `全站预算已熔断（${total}/${st.cap}），需要充值`));
    }
    const clear = el('button', 'intel-btn small', '退出登录');
    clear.type = 'button';
    clear.onclick = () => {
      clearLocal();
      setIdent(null);
      load(true);
    };
    bar.append(clear);
  }

  /* app.js:16 用 b.onclick= 只认它自己那五个面板，这里用 addEventListener 叠加，互不覆盖 */
  function bindRail() {
    document.querySelectorAll('[data-panel]').forEach(b => {
      b.addEventListener('click', () => {
        const intel = $('#intelPanel');
        if (!intel) return;
        /* learning-hub.js 开机也会刷一次卡片，读的是 8010 那份恒空的 connections，
           谁后跑谁说了算——点页签这一刻再按 8020 的授权态补一次才不会被打回「尚未连接」 */
        if (b.dataset.panel === 'sources') syncCards();
        const mine = b.dataset.panel === 'intel';
        intel.hidden = !mine;
        if (mine && !loaded) load(true);
      });
    });
    const injected = document.querySelector('[data-panel="intel"]');
    if (injected && !injected.onclick) {
      injected.onclick = () => {
        document.querySelectorAll('[data-panel]').forEach(x => x.classList.toggle('active', x === injected));
        /* 「连接」「导入」两个面板由 learning-hub.js 运行时才创建，点名收不全，只能按 *Panel 通配 */
        document.querySelectorAll('[id$="Panel"]').forEach(p => { p.hidden = p.id !== 'intelPanel'; });
        document.body.dataset.activePanel = 'intel';
        const eng = $('.engraving');
        if (eng) eng.textContent = '云端情报站';
        const hint = document.querySelector('.outside-footer span:last-child');
        if (hint) hint.textContent = '读取云端截图 / 一键写入日历 / 云端浏览器授权';
      };
    }
  }

  function setState(msg) { $('#intelState').textContent = msg || ''; }

  function setWarn(rows, member) {
    const warn = $('#intelWarn');
    warn.replaceChildren();
    const bad = rows.filter(a => a.enabled && (a.status === 'expired' || a.status === 'error' || (a.needs_auth && !a.encrypted)));
    if (!bad.length) { warn.hidden = true; return; }
    bad.forEach(a => {
      const row = el('div', 'intel-warn-row',
        `${a.label}：${a.encrypted ? '登录态已失效' : '还没有授权'}，点右边「去授权」在云端浏览器里登录一次就行，不用装 Python 也不需要服务器权限`);
      const btn = el('button', 'intel-grant-btn', '去授权');
      Object.assign(btn.style, { marginLeft: '8px', padding: '2px 10px', cursor: 'pointer' });
      /* 令牌放 fragment：# 后面的内容不会发给服务器，也不会进访问日志 */
      btn.onclick = () => openGrant(a.site);
      row.append(btn);
      warn.append(row);
    });
    warn.hidden = false;
  }

  function writeToCalendar(todo, label) {
    if (typeof tasks === 'undefined') { setState('日历还没准备好'); return; }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(todo.date || '') ? todo.date : dayKey(new Date());
    const title = String(todo.title || '').trim().slice(0, 80);
    if (!title) return;
    tasks[date] = tasks[date] || [];
    if (tasks[date].some(x => x.title === title)) { setState('这条日历里已经有了'); return; }
    tasks[date].push({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(),
      title,
      details: String(todo.details || '').slice(0, 2000),
      time: /^\d{2}:\d{2}$/.test(todo.time || '') ? todo.time : '',
      type: TYPES.includes(todo.type) ? todo.type : '计划',
      done: false,
      source: '云端截图·' + label,
    });
    persist();
    render();
    setState(`已写入 ${date}`);
  }

  function card(item) {
    const box = el('article', 'intel-item' + (item.important ? ' important' : ''));
    const top = el('div', 'intel-top');
    top.append(el('span', 'intel-label', item.label || item.site),
               el('span', 'intel-time', item.time || ''));
    if (item.important) top.append(el('span', 'intel-flag', '要紧'));
    box.append(top);

    if (item.summary) box.append(el('p', 'intel-summary', item.summary));

    (item.todos || []).forEach(t => {
      const row = el('div', 'intel-todo');
      const when = [t.date, t.time].filter(Boolean).join(' ') || '未标时间';
      const info = el('div', 'intel-todo-main');
      info.append(el('strong', '', t.title),
                  el('span', 'intel-todo-meta', `${when} · ${TYPES.includes(t.type) ? t.type : '计划'}`));
      if (t.details) info.append(el('p', 'intel-todo-detail', t.details));
      const add = el('button', 'intel-btn small', '写入日历');
      add.type = 'button';
      add.onclick = () => writeToCalendar(t, item.label || item.site);
      row.append(info, add);
      box.append(row);
    });

    if ((item.todos || []).length > 1) {
      const all = el('button', 'intel-btn ghost', '把这几条全部写入日历');
      all.type = 'button';
      all.onclick = () => item.todos.forEach(t => writeToCalendar(t, item.label || item.site));
      box.append(all);
    }

    const shots = shotStrip(item);
    if (shots) box.append(shots);

    if (item.url) {
      const u = safeLink(item.url);
      if (u) {
        const a = el('a', 'intel-link', u.hostname);
        a.href = u.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        box.append(a);
      }
    }
    return box;
  }

  function load(force) {
    const list = $('#intelList');
    setState('读取中…');
    if (force) loaded = false;
    if (!token()) { fail(new Error('把管理员发给你自己的那把专属令牌粘到上面的输入框，只需一次')); return; }
    req('/api/health').then(info => {
      setIdent(info);
      return Promise.all([
        req('/api/feed?limit=20').catch(() => ({ items: [] })),
        req('/api/auth/status').catch(() => ({ auth: [] })),
      ]).then(([feed, auth]) => {
        setWarn(auth.auth || [], info.member);
        syncCards(auth.auth || []);
        list.replaceChildren();
        const items = feed.items || [];
        loaded = true;
        if (!items.length) {
          list.append(el('p', 'intel-empty',
            '你还没有情报。点上方黄色条里的「去授权」，在云端浏览器里登录一次校内账号就行，'
            + '不用装 Python 也不需要服务器权限；之后每分钟的正文轮询会自己把新通知放进来。'));
          setState('');
          return;
        }
        items.forEach(i => list.append(card(i)));
        setState(`${items.length} 条`);
      });
    }).catch(fail);
  }

  function fail(e) {
    const list = $('#intelList');
    setIdent(null);
    setState('');
    list.replaceChildren();
    list.append(el('p', 'intel-empty', (token() ? '情报服务连不上：' : '还没配令牌：')
      + e.message + `（${API}）`));
  }

  function mountStyles() {
    const tag = document.currentScript || document.querySelector('script[src*="sentinel.js"]');
    if (!tag || document.querySelector('link[data-intel-style]')) return;
    const link = el('link');
    link.rel = 'stylesheet';
    link.href = tag.src.replace(/sentinel\.js(\?.*)?$/, 'intel-panel.css$1');
    link.dataset.intelStyle = '1';
    document.head.append(link);
  }

  /* 「连接」页的卡片原来只把人送去官网登录页（8010 的授权接口是 501 占位、
     /connections 恒空），自家浏览器里扫完码服务器永远看不见。这里把能被云端
     授权接管的站点改成走 8020：桌面登录一次，登录态落到自己的账号上。 */
  const BRIDGE = [['chaoxing', 'chaoxing']];
  function bridgeChaoxing() {
    BRIDGE.forEach(([provider, site]) => {
      const card = document.querySelector(`.provider-card[data-provider="${provider}"]`);
      const btn = card && card.querySelector('button');
      if (!btn || btn.dataset.sentinel) return;
      btn.dataset.sentinel = '1';
      btn.textContent = '云端授权 ↗';
      btn.onclick = () => openGrant(site);
      const box = card.querySelector('div') || card;
      /* learning-hub.js 的 refresh() 绑在 window focus 上，读的是 8010 那份恒空的
         connections——和它抢同一个节点永远抢不完，所以藏掉它，另起一行自己写 */
      const dead = box.querySelector('small');
      if (dead) dead.style.display = 'none';
      box.append(el('span', 'intel-provider-state', '正在读取云端授权状态…'));
    });
  }

  /* 卡片状态读 8020 的授权态；「检查连接状态」是 learning-hub.js 绑的，
     它刷完我们再补一次，保证看到的一直是真实的那一份 */
  function syncCards(rows) {
    lastAuth = rows && rows.length ? rows : lastAuth;
    BRIDGE.forEach(([provider, site]) => {
      const card = document.querySelector(`.provider-card[data-provider="${provider}"]`);
      const line = card && card.querySelector('.intel-provider-state');
      const a = lastAuth.find(x => x.site === site);
      if (!line || !a || !a.enabled) return;
      const live = a.encrypted && a.status === 'ok';
      line.textContent = live ? '已连接 · 云端已记住登录态，每 3 分钟自动读一次'
        : (a.status === 'expired' || a.status === 'error') ? '登录态已失效 · 点「云端授权」重新登录一次'
        : '未授权 · 点「云端授权」在云端浏览器里登录一次';
      line.classList.toggle('ok', live);
      card.classList.toggle('is-connected', live);
    });
    const chk = $('#checkConnections');
    if (chk && chk.onclick && !chk.dataset.sentinel) {
      chk.dataset.sentinel = '1';
      const orig = chk.onclick;
      chk.onclick = async (e) => { await orig(e); syncCards(); };
    }
  }

  /* 进门闸：打开星木就得先有账号令牌，没有就去登录页，登录完回到原来那一页。
     令牌已存在但被 8020 判成无效也照样送回；服务连不上（网络抖、8020 重启中）不拦人，
     免得情报服务一抖，全组连日历都打不开。 */
  function toLogin() {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(LOGIN + '&next=' + next);
  }

  function needsLogin() {
    if (!/^\/starwood\//.test(location.pathname)) return false;
    if (!token()) { toLogin(); return true; }
    fetch(API + '/api/health', { headers: { 'X-Client-Token': token() } })
      .then(r => {
        if (r.status === 401) { clearLocal(); toLogin(); return; }
        stamp();
      })
      .catch(() => { /* 连不上不算没登录 */ });
    return false;
  }

  /* 功能闸：智能体对话与「连接」页的动作都要有会话才能用。
     进门闸已经拦掉未登录访问，这里补的是会话中途失效那一路：30 天到期、
     或在另一个页签点了退出登录，而这一页还开着。捕获阶段先拦，
     有会话时一行都不碰，companion-chat.js / learning-hub.js 的原有行为不变。 */
  const LOCKED = '#openOrbitChat,#sprite,.chat-send,#tokenShortcut,#campusTokenBind,'
    + '#checkConnections,.provider-card button';

  function guardFeatures() {
    document.addEventListener('click', e => {
      if (token()) return;
      const hit = e.target.closest && e.target.closest(LOCKED);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      toLogin();
    }, true);
    document.addEventListener('submit', e => {
      if (token() || !e.target.closest('.chat-dialog')) return;
      e.preventDefault();
      toLogin();
    }, true);
  }

  function start() {
    if (needsLogin()) return;
    mountStyles();
    buildPanel();
    bindRail();
    bridgeChaoxing();
    guardFeatures();
    /* 卡片状态在情报页里才会拉到，只逛「连接」页的人得自己取一次 */
    req('/api/auth/status').then(a => syncCards(a.auth || [])).catch(() => {});
    /* 云端授权是在别的页签里做完的，切回来顺手刷一次，别让人以为页面没反应。
       20 秒节流：这是补一次刷新，不是改成轮询。 */
    let lastBack = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !token() || document.body.dataset.activePanel !== 'intel') return;
      if (Date.now() - lastBack < 20000) return;
      lastBack = Date.now();
      load(true);
    });
    if (location.hash === '#intel') {
      const btn = document.querySelector('[data-panel="intel"]');
      if (btn) {
        btn.click();
        history.replaceState(null, '', location.pathname + location.search);
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
