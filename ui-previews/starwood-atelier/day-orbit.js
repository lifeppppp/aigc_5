'use strict';
let dayStage = 0;
let expandedTaskId = null;
let previousCards = [];
let previousTrayHeight = 0;
let animateCards = false;
const demoRequirements = {
  demo1: '写出曲率公式和各符号的含义。选一条圆和一条抛物线，各完成一道计算题，保留求导过程。',
  demo2: '按课程归档笔记，每门课提炼三个要点，列出一个待解决的问题。'
};
function taskRequirements(task) {
  return task.details ?? demoRequirements[task.id] ?? '';
}
function rememberCards() {
  previousTrayHeight = document.querySelector('#dayTray')?.getBoundingClientRect().height || 0;
  previousCards = Array.from(document.querySelectorAll('.day-card'), card => ({
    id: card.dataset.taskId, rect: card.getBoundingClientRect()
  }));
}
function setDayStage(stage) {
  rememberCards();
  expandedTaskId = null;
  animateCards = stage > 0;
  dayStage = stage ? 1 : 0;
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function toggleTask(taskId) {
  rememberCards();
  expandedTaskId = expandedTaskId === taskId ? null : taskId;
  animateCards = true;
  render();
  const card = Array.from(document.querySelectorAll('.day-card')).find(card => card.dataset.taskId === taskId);
  card?.querySelector('.card-toggle')?.focus({preventScroll:true});
}
function renderDayCards() {
  if (!dayStage) return;
  const grid = $('#grid');
  const buttons = Array.from(grid.children);
  const index = buttons.findIndex(button => button.dataset.date === selected);
  if (index < 0) return;
  const anchor = buttons[index];
  anchor.setAttribute('aria-expanded','true');
  anchor.setAttribute('aria-controls','dayTray');
  const tray = element('section','','day-tray');
  tray.id = 'dayTray';
  const bar = element('header','','tray-head');
  bar.append(element('strong',selected.slice(5).replace('-',' / ') + ' · 当日待办'));
  const close = element('button','收起');
  close.type = 'button';
  close.onclick = () => {setDayStage(0); render(); $('#grid .selected').focus({preventScroll:true});};
  bar.append(close);
  tray.append(bar);
  const cards = element('div','','day-cards');
  const list = tasks[selected] || [];
  list.forEach((task, taskIndex) => {
    const expanded = expandedTaskId === task.id;
    const card = element('article','','day-card'+(expanded?' expanded':''));
    card.dataset.taskId = task.id;
    const toggle = element('button','','card-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded',String(expanded));
    toggle.setAttribute('aria-controls','task-detail-'+taskIndex);
    toggle.append(element('small',task.type + (task.done?' · 已完成':' · 待完成')),
      element('strong',task.title),
      element('span',expanded?'收起详情 ↑':'查看详情 ↗','card-hint'));
    toggle.onclick = () => toggleTask(task.id);
    card.append(toggle);
    const detail = element('div','','card-detail');
    detail.id = 'task-detail-'+taskIndex;
    detail.hidden = !expanded;
    detail.append(element('span','详细要求','detail-label'),
      element('p',taskRequirements(task) || '尚未填写详细要求，可先明确需要完成的内容与提交形式。'),
      element('span',task.time?'截止时间 · '+task.time:'截止时间 · 未指定','detail-deadline'));
    const actions = element('div','','detail-actions');
    const complete = element('button',task.done?'标记为待完成':'标记完成','detail-complete');
    complete.type = 'button';
    complete.onclick = () => {
      task.done = !task.done; persist(); render();
      if(task.done) window.dispatchEvent(new CustomEvent('starwood:celebrate'));
    };
    const ask = element('button','请烁帮我拆解这件事 ↗','detail-ask');
    ask.type = 'button';
    ask.onclick = () => window.StarwoodChat?.open('请帮我拆解这件学习任务：'+task.title, task);
    actions.append(complete,ask);
    detail.append(actions);
    card.append(detail);
    cards.append(card);
  });
  if (!list.length) {
    const add = element('button','今天还没有待办，写一件小事 ＋','empty-add');
    add.type = 'button';
    add.onclick = () => $('#add').click();
    cards.append(add);
  }
  tray.append(cards);
  grid.insertBefore(tray, buttons[(Math.floor(index/7)+1)*7] || null);
  if (animateCards && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const height = tray.getBoundingClientRect().height;
    tray.animate([{height:previousTrayHeight+'px'},{height:height+'px'}],
      {duration:460,easing:'cubic-bezier(.22,1,.36,1)'});
    const origin = anchor.getBoundingClientRect();
    Array.from(cards.children).forEach((card,i) => {
      const from = previousCards.find(previous => previous.id === card.dataset.taskId)?.rect || origin;
      const to = card.getBoundingClientRect();
      const transform = 'translate('+(from.x-to.x)+'px,'+(from.y-to.y)+'px) scale('+Math.min(1,from.width/to.width)+','+Math.min(1,from.height/to.height)+')';
      card.animate([{transform,opacity:.65},{transform:'none',opacity:1}],
        {duration:380,delay:Math.min(i,4)*25,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
    });
  }
  animateCards = false;
}
function updateOrbit() {
  const list = tasks[selected] || [];
  const open = list.filter(task => !task.done).length;
  $('#orbitPending').textContent = String(open).padStart(2,'0');
  $('#orbitDone').textContent = String(list.length-open).padStart(2,'0');
  $('#orbitDate').textContent = selected.replaceAll('-',' / ');
  $('#spriteMood').textContent = open?'陪你专注 · 还有 '+open+' 件待办':list.length?'今日计划已完成，休息一下吧。':'歇着，等你写下新的计划。';
}
document.querySelector('#sprite').onclick = () => window.StarwoodChat?.open();
document.querySelector('#seeDay').onclick = () => {
  document.querySelector('[data-panel=calendar]').click();
  setDayStage(1); render(); $('#grid .selected').focus();
};
