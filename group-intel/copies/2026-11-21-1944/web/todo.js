/* ================= 状态 ================= */
const TODAY = new Date();
const TODAY_KEY = fmt(TODAY);
let state = {
  tab:'cal',
  viewMonth: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  picked: TODAY_KEY,
  tasks: [],
  tplSel: null,
  remind: '1h',
  aiStarted: false
};

function fmt(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function resetTasks(){
  const t = new Date();
  const k1 = fmt(t);
  const d2 = new Date(t); d2.setDate(d2.getDate()+2);
  const d3 = new Date(t); d3.setDate(d3.getDate()+4);
  state.tasks = [
    {id:1, title:'提交 AIGC 赛题材料', date:k1, ddl:'DDL 今晚 24:00', source:'竞赛通知群 · 10:20 提取', urgent:true, done:false},
    {id:2, title:'四级报名信息确认', date:fmt(d2), ddl:'DDL 11/23', source:'教务通知群 · 09:40 提取', urgent:false, done:false},
    {id:3, title:'图书馆借的书到期', date:k1, ddl:'', source:'图书馆公众号 · 08:15 提取', urgent:false, done:false},
    {id:4, title:'交实验报告', date:k1, ddl:'', source:'课程群 · 昨天提取', urgent:false, done:true},
    {id:5, title:'社团结项材料', date:fmt(d3), ddl:'DDL 11/27', source:'社团群 · 昨天提取', urgent:false, done:false},
    {id:6, title:'确认宿舍检查时间', date:'', ddl:'', source:'班级群 · 昨天提取', urgent:false, done:false},
    {id:7, title:'填教学反馈问卷', date:'', ddl:'', source:'教务通知群 · 昨天提取', urgent:false, done:false}
  ];
}
resetTasks();

/* ================= 通用 ================= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove('on'), 1900);
}

/* 顶栏切换 */
$$('.tab').forEach(t=>{
  t.onclick = ()=>{
    const tab = t.dataset.tab;
    $$('.tab').forEach(x=>x.classList.toggle('on', x===t));
    $$('.view').forEach(v=>v.classList.remove('on'));
    $('#view-'+tab).classList.add('on');
    state.tab = tab;
    // 底部条显隐
    const map = {cal:'calBottom', ai: state.aiStarted?'aiBottom':'', tpl:'tplBottom', set:''};
    $$('.device .bottom').forEach(b=> b.style.display='none');
    const target = map[tab];
    if(target) $('#'+target).style.display='flex';
    if(tab==='cal') renderCal();
    if(tab==='ai'){
      const wrap = $('#aiChatWrap');
      $('#aiEmpty').style.display = state.aiStarted ? 'none':'flex';
      wrap.style.display = state.aiStarted ? 'flex':'none';
    }
  };
});
$$('[data-go]').forEach(b=> b.onclick = ()=>{
  document.querySelector('.tab[data-tab="'+b.dataset.go+'"]').click();
});

/* ================= 日历 ================= */
function monthMatrix(base){
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1);
  const startIdx = (first.getDay() + 6) % 7; // 周一为 0
  const days = new Date(y, m+1, 0).getDate();
  const cells = [];
  for(let i=0;i<startIdx;i++) cells.push(null);
  for(let d=1; d<=days; d++) cells.push(new Date(y,m,d));
  while(cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function marksFor(key){
  const list = state.tasks.filter(t=>t.date===key);
  if(!list.length) return null;
  const undoneUrgent = list.filter(t=>!t.done && t.urgent).length;
  const undone = list.filter(t=>!t.done && !t.urgent).length;
  const allDone = list.every(t=>t.done);
  if(allDone) return [{color:'d-gry', n:0}];
  const marks = [];
  if(undoneUrgent) marks.push({color:'d-red', n:undoneUrgent});
  if(undone) marks.push({color:'d-yel', n:undone});
  return marks;
}

function renderCal(){
  const base = state.viewMonth;
  $('#monthLabel').textContent = base.getFullYear() + ' 年 ' + (base.getMonth()+1) + ' 月';
  const cells = monthMatrix(base);
  const grid = $('#grid');
  grid.innerHTML = '';
  cells.forEach(d=>{
    const el = document.createElement('div');
    if(!d){ el.className='cell mute'; el.textContent=''; grid.appendChild(el); return; }
    const key = fmt(d);
    el.className = 'cell';
    if(key === TODAY_KEY) el.classList.add('today');
    if(key === state.picked) el.classList.add('pick');
    let html = '<span>' + d.getDate() + '</span>';
    const mk = marksFor(key);
    if(mk){
      html += '<div class="marks">';
      mk.forEach(m=>{
        html += '<div class="mk"><i class="dot '+m.color+'"></i>' + (m.n>1 ? m.n : '') + '</div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
    el.onclick = ()=>{ state.picked = key; renderCal(); };
    grid.appendChild(el);
  });
  renderList();
}

function renderList(){
  const key = state.picked;
  const d = new Date(key.replace(/-/g,'/'));
  const isToday = key === TODAY_KEY;
  const label = (isToday ? '今天 · ' : '') + (d.getMonth()+1) + '月' + d.getDate() + '日';
  $('#dayLabel').textContent = label;

  const all = state.tasks.filter(t=>t.date===key);
  const open = all.filter(t=>!t.done);
  const done = all.filter(t=>t.done);
  $('#dayCount').textContent = open.length ? open.length + ' 项待办' : '';

  const box = $('#taskList');
  box.innerHTML = '';

  if(!all.length){
    box.innerHTML = '<div class="empty"><p>这一天还没有待办<br>粘贴一段群通知，我帮你拆成待办</p>' +
      '<button onclick="openSheet()">＋ 添加待办</button></div>';
    return;
  }

  open.forEach(t=> box.appendChild(taskEl(t)));

  if(done.length){
    const fold = document.createElement('div');
    fold.className='fold';
    fold.textContent = '已完成 ' + done.length + ' 项 ▾';
    fold.onclick = ()=>{
      let hidden = box.querySelectorAll('.task.doneItem');
      if(hidden.length){ hidden.forEach(h=>h.remove()); fold.textContent='已完成 '+done.length+' 项 ▾'; return; }
      done.forEach(t=>{
        const el = taskEl(t); el.classList.add('doneItem'); box.appendChild(el);
      });
      fold.textContent = '收起已完成 ▴';
    };
    box.appendChild(fold);
  }

  // 未安排日期
  const inbox = state.tasks.filter(t=>!t.date && !t.done);
  if(inbox.length){
    const el = document.createElement('div');
    el.className='inbox';
    el.innerHTML = '<span><b>'+inbox.length+' 条未安排日期</b> → 去排期</span><span style="color:#c9ced8">›</span>';
    el.onclick = ()=>{ toast('原型中：这里会打开展开排期页'); };
    box.appendChild(el);
  }
}

function taskEl(t){
  const el = document.createElement('div');
  el.className = 'task';
  el.innerHTML =
    '<div class="cb '+(t.done?'on':'')+'">'+(t.done?'✓':'')+'</div>' +
    '<div class="t-main">' +
      '<div class="t-title '+(t.done?'done':'')+'">'+t.title+'</div>' +
      '<div class="t-meta">'+(t.ddl?'<span class="warn">⚠ '+t.ddl+'</span> · ':'')+t.source+'</div>' +
    '</div>';
  el.querySelector('.cb').onclick = ()=>{
    t.done = !t.done;
    renderCal();
    toast(t.done ? '已完成：' + t.title : '已恢复：' + t.title);
  };
  return el;
}

$('#prevM').onclick = ()=>{
  state.viewMonth = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth()-1, 1);
  renderCal();
};
$('#nextM').onclick = ()=>{
  state.viewMonth = new Date(state.viewMonth.getFullYear(), state.viewMonth.getMonth()+1, 1);
  renderCal();
};

/* 添加待办 */
function openSheet(){
  $('#sheet').classList.add('on');
  $('#newTitle').value=''; $('#newDdl').value='';
  setTimeout(()=>$('#newTitle').focus(), 200);
}
$('#addTaskBtn').onclick = openSheet;
$('#sheetCancel').onclick = ()=> $('#sheet').classList.remove('on');
$('#sheet').onclick = e=>{ if(e.target.id==='sheet') $('#sheet').classList.remove('on'); };
$('#sheetSave').onclick = ()=>{
  const title = $('#newTitle').value.trim();
  if(!title){ toast('先写一句要做什么'); return; }
  state.tasks.push({
    id: Date.now(), title, date: state.picked, ddl: $('#newDdl').value.trim(),
    source: '手动添加', urgent: !!$('#newDdl').value.trim(), done:false
  });
  $('#sheet').classList.remove('on');
  renderCal();
  toast('已添加到 ' + $('#dayLabel').textContent);
};

/* ================= 智能体 ================= */
const QA = {
  q: '帮我查一下这学期 AIGC 竞赛的提交要求',
  a: '这学期 AIGC 竞赛的提交要求共 3 条：<br>1. 提交完整项目代码仓库链接<br>2. 附 5 页以内的设计说明文档<br>3. 截止时间为 <b>11 月 21 日 24:00</b>',
  src: '竞赛通知群 + 教务处官网',
  date: '2026-11-20'
};

function startChat(text){
  state.aiStarted = true;
  $('#aiEmpty').style.display='none';
  const wrap = $('#aiChatWrap');
  wrap.style.display='flex';
  $('#aiBottom').style.display='flex';
  $('#chat').innerHTML='';
  addMe(text);
  addTyping();
  setTimeout(()=>{
    removeTyping();
    addAnswer();
  }, 1500);
}

function addMe(text){
  const el = document.createElement('div');
  el.className='msg me';
  el.innerHTML = '<div class="bub">'+text+'</div>';
  $('#chat').appendChild(el);
  $('#chat').scrollTop = $('#chat').scrollHeight;
}
function addTyping(){
  const el = document.createElement('div');
  el.className='msg ai';
  el.id='typingMsg';
  el.innerHTML = '<div class="bub"><span class="typing"><i></i><i></i><i></i></span></div>';
  $('#chat').appendChild(el);
  const h = document.createElement('div');
  h.className='hintline'; h.id='typingHint';
  h.textContent = '正在检索：竞赛通知群 · 教务处官网 · 已读取 2 个文件…';
  $('#chat').appendChild(h);
  $('#chat').scrollTop = $('#chat').scrollHeight;
}
function removeTyping(){
  const t = $('#typingMsg'); if(t) t.remove();
  const h = $('#typingHint'); if(h) h.remove();
}
function addAnswer(){
  const el = document.createElement('div');
  el.className='msg ai';
  el.style.maxWidth='88%';
  el.innerHTML =
    '<div class="bub">'+QA.a+'</div>' +
    '<div class="srcbox"><b>来源：'+QA.src+'</b><br>更新于 '+QA.date+' · 共 2 处 ▾</div>' +
    '<div class="acts"><button class="mini" data-copy>复制</button><button class="mini" data-again>再问一次</button></div>' +
    '<button class="addcal" data-addcal>＋ 把「提交材料」加入日历</button>';
  $('#chat').appendChild(el);
  $('#chat').scrollTop = $('#chat').scrollHeight;

  el.querySelector('[data-copy]').onclick = ()=> toast('已复制');
  el.querySelector('[data-again]').onclick = ()=> startChat(QA.q);
  el.querySelector('[data-addcal]').onclick = ()=>{
    if(state.tasks.some(t=>t.title==='提交 AIGC 赛题材料' && t.date===TODAY_KEY)){
      toast('已经在日历里了'); return;
    }
    state.tasks.push({
      id: Date.now(), title:'提交 AIGC 赛题材料', date:TODAY_KEY,
      ddl:'DDL 今晚 24:00', source:'智能体 · 刚刚加入', urgent:true, done:false
    });
    toast('已加入今天的日历');
    renderCal();
    setTimeout(()=> document.querySelector('.tab[data-tab="cal"]').click(), 700);
  };
}

$('#aiSend0').onclick = ()=>{
  const v = $('#aiInput0').value.trim() || '帮我查一下这学期 AIGC 竞赛的提交要求';
  startChat(v);
};
$('#aiInput0').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#aiSend0').click(); });
$('#aiSend').onclick = ()=>{
  const v = $('#aiInput').value.trim();
  if(!v){ toast('说点什么吧'); return; }
  $('#aiInput').value='';
  addMe(v); addTyping();
  setTimeout(()=>{ removeTyping(); addAnswer(); }, 1500);
};
$('#aiInput').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#aiSend').click(); });

$$('.chip').forEach(c=>{
  c.onclick = ()=>{ $('#aiInput0').value = c.dataset.fill; $('#aiInput0').focus(); };
});

/* ================= 模板 ================= */
$$('.tpl').forEach(t=>{
  t.onclick = ()=>{
    $$('.tpl').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    state.tplSel = t.dataset.tpl;
    $('#tplGen').textContent = '用「' + state.tplSel + '」生成';
  };
});
$('#tplGen').onclick = ()=>{
  if(!state.tplSel){ toast('先选一个模板'); return; }
  toast('已生成：' + state.tplSel + '（原型示意）');
};
$('#tplSearch').addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    $('#tplSearch').value = $('#tplSearch').value.trim();
    state.tplSel = '答辩PPT';
    $$('.tpl').forEach(x=> x.classList.toggle('on', x.dataset.tpl==='答辩PPT'));
    $('#tplGen').textContent = '用「答辩PPT」生成';
    toast('按需求推荐：答辩 PPT 大纲');
  }
});

/* ================= 设置 ================= */
$$('[data-sync]').forEach(b=>{
  b.onclick = ()=>{
    b.textContent = '已同步';
    b.disabled = true;
    b.style.opacity = .55;
    const sub = b.parentElement.querySelector('.sub');
    sub.textContent = '已同步 · 刚刚';
    sub.style.color='';
    toast('同步完成');
  };
});
$$('#radioGroup div').forEach(r=>{
  r.onclick = ()=>{
    $$('#radioGroup div').forEach(x=>x.classList.remove('on'));
    r.classList.add('on');
    state.remind = r.dataset.r;
    toast('提醒：' + r.textContent);
  };
});
$('#clearBtn').onclick = ()=>{
  if(confirm('清空所有待办？演示数据会恢复初始状态')){
    resetTasks();
    state.picked = TODAY_KEY;
    renderCal();
    toast('已重置');
  }
};

/* ================= 初始化 ================= */
renderCal();
$('#calBottom').style.display='flex';
//（注：内容由AI生成）
