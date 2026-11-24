'use strict';
let dayStage = 0;
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
function setDayStage(stage) {
  previousTrayHeight = document.querySelector("#dayTray")?.getBoundingClientRect().height || 0;
  previousCards = stage === 2 && dayStage === 1
    ? Array.from(document.querySelectorAll('.day-card'), card => card.getBoundingClientRect()) : [];
  animateCards = stage > 0;
  dayStage = stage;
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
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
  tray.classList.toggle('detailed',dayStage === 2);
  const bar = element('header','','tray-head');
  bar.append(element('strong',selected.slice(5).replace('-',' / ') + (dayStage === 2 ? ' · 待办详情' : ' · 待办摘要')));
  const close = element('button','收起');
  close.onclick = () => {setDayStage(0); render(); $('#grid .selected').focus({preventScroll:true});};
  bar.append(close);
  tray.append(bar);
  const cards = element('div','','day-cards');
  const list = tasks[selected] || [];
  for (const task of list) {
    const card = element('article','','day-card');
    card.append(element('small',task.type + (task.done ? ' · 已完成' : ' · 待完成')), element('strong',task.title));
    if (dayStage === 2) {
      card.append(element('p',taskRequirements(task) || '尚未填写详细要求。'),element('small',task.time ? '截止 '+task.time : '未指定截止时间'));
    }
    cards.append(card);
  }
  if (!list.length) {
    const add = element('button','今天还没有待办，写一件小事 ＋','empty-add');
    add.onclick = () => $('#add').click();
    cards.append(add);
  }
  tray.append(cards);
  grid.insertBefore(tray, buttons[(Math.floor(index/7)+1)*7] || null);
  if (animateCards && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const height = tray.getBoundingClientRect().height;
    tray.animate([{height:previousTrayHeight+'px'},{height:height+'px'}], {duration:460,easing:'cubic-bezier(.22,1,.36,1)'});
    const origin = anchor.getBoundingClientRect();
    Array.from(cards.children).forEach((card,i) => {
      const from = previousCards[i] || origin, to = card.getBoundingClientRect();
      const transform = 'translate('+ (from.x-to.x)+'px,'+(from.y-to.y)+'px) scale('+Math.min(1,from.width/to.width)+','+Math.min(1,from.height/to.height)+')';
      card.animate([{transform,opacity:previousCards[i]?0.85:0},{transform:'none',opacity:1}],{duration:380,delay:Math.min(i,5)*38,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'});
    });
  }
  animateCards = false;
}
function updateOrbit() {
  const list = tasks[selected] || [];
  const open = list.filter(task => !task.done).length;
  $('#orbitDate').textContent = selected.replaceAll('-',' / ');
  $('#spriteMood').textContent = open ? '陪你专注 · 还有 '+open+' 件待办' : list.length ? '今日计划已完成，休息一下吧。' : '歇着，等你写下新的计划。';
}
document.querySelector('#sprite').onclick = () => {
  const sprite = document.querySelector('#sprite');
  sprite.classList.remove('awake');
  requestAnimationFrame(() => sprite.classList.add('awake'));
  const first = (tasks[selected] || []).find(task => !task.done);
  $('#spriteMood').textContent = first ? '下一件事 · '+first.title : '我在。今天的节奏由你决定。';
};
document.querySelector('#seeDay').onclick = () => {
  document.querySelector('[data-panel=calendar]').click();
  setDayStage(1); render(); $('#grid .selected').focus();
};
