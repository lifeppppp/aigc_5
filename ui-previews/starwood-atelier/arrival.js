(() => {
  const storageKey = 'starwood.intro.v1';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = document.createElement('dialog');
  dialog.className = 'arrival-dialog';
  dialog.setAttribute('aria-labelledby','arrivalTitle');
  dialog.innerHTML = '<div class="deep-space" aria-hidden="true"><div class="cloud-bank"></div></div><canvas class="arrival-sky" aria-hidden="true"></canvas><div class="arrival-nebula" aria-hidden="true"></div><header class="arrival-header"><span>✦ 星木</span><button type="button" class="arrival-skip">跳过开场 ↗</button></header><div class="arrival-copy"><p class="arrival-overline">每一次出发，都始于一点微光</p><h2 id="arrivalTitle">有一束光，正为你而来。</h2></div><button type="button" class="arrival-start" aria-label="点亮星光，开始开场动画"><span class="arrival-seed"></span><span class="arrival-seed-orbit"></span></button><div class="arrival-meteor" aria-hidden="true"></div><div class="arrival-bloom" aria-hidden="true"></div><button type="button" class="arrival-friend" disabled aria-label="轻触烁，进入星木"><canvas width="900" height="900" aria-hidden="true"></canvas></button><p class="arrival-hint" role="status">轻触星光，让故事开始</p><div class="arrival-white" aria-hidden="true"></div>';
  document.body.append(dialog);
  const sky = dialog.querySelector('.arrival-sky');
  const ctx = sky.getContext('2d');
  const cosmos = window.StarwoodCosmos.create(sky,'arrival');
  const friendCanvas = dialog.querySelector('.arrival-friend canvas');
  const start = dialog.querySelector('.arrival-start');
  const friend = dialog.querySelector('.arrival-friend');
  const title = dialog.querySelector('h2');
  const hint = dialog.querySelector('.arrival-hint');
  let state = 'closed';
  let phaseStart = 0;
  let width = 0, height = 0;
  let timers = [];
  let frameId = 0;
  let lastFrame = 0;
  let returnFocus;
  let pointer = {x:0,y:0};
  let gaze = {x:0,y:0};
  function later(callback, delay) {
    timers.push(setTimeout(callback,delay));
  }
  function setState(next) {
    state = next;
    phaseStart = performance.now();
    dialog.dataset.state = next;
  }
  function resize() {
    width = innerWidth;
    height = innerHeight;
    cosmos.resize();
  }

  function draw(time) {
    if(!dialog.open) return;
    if(time-lastFrame>32) {
      lastFrame=time;
      const still = reduced.matches || document.body.classList.contains('paused');
      gaze.x += (pointer.x-gaze.x)*.035;
      gaze.y += (pointer.y-gaze.y)*.035;
      cosmos.draw(time,{still,x:gaze.x,y:gaze.y});
      if(!still && (state==='forming'||state==='friend')) {
        const progress=Math.min((time-phaseStart)/1800,1);
        const cx=width*.5,cy=height*.47;
        for(let i=0;i<26;i++) {
          const angle=i*2.399+progress*.8;
          const radius=(1-progress)*Math.min(width*.48,320)+50+Math.sin(i)*15;
          const fade=state==='forming' ? Math.sin(progress*Math.PI) : .12+.12*Math.sin(time*.001+i);
          ctx.fillStyle='rgba(238,222,171,'+Math.max(0,fade*.7)+')';
          ctx.beginPath();ctx.arc(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius*.7,1,0,Math.PI*2);ctx.fill();
        }
      }
      if(state==='forming'||state==='friend'||state==='flash') {
        window.StarwoodMascot?.draw(friendCanvas,still?0:time,false);
      }
    }
    frameId=requestAnimationFrame(draw);
  }
  function finish() {
    timers.forEach(clearTimeout);timers=[];
    cancelAnimationFrame(frameId);
    setState('closed');
    dialog.close();
    document.documentElement.classList.remove('intro-pending');
    document.body.classList.remove('arrival-open');
    try {localStorage.setItem(storageKey,'seen');}
    catch {window.setTimeout(()=>toast('此浏览器未能保存开场偏好，刷新时可能再次播放'),300);}
    const focusTarget = returnFocus?.isConnected && returnFocus!==document.body ? returnFocus : document.querySelector('main');
    focusTarget?.focus({preventScroll:true});
  }
  function enter() {
    if(state!=='friend') return;
    friend.disabled=true;
    hint.textContent='新的旅程，从今天开始。';
    setState('flash');
    later(()=>{
      document.documentElement.classList.remove('intro-pending');
      dialog.classList.add('revealing');
    },reduced.matches?100:650);
    later(finish,reduced.matches?320:1550);
  }
  function begin() {
    if(state!=='idle') return;
    start.disabled=true;
    title.textContent='穿过星河，与你相遇。';
    hint.textContent='循着那道光……';
    setState('travel');
    later(()=>{
      setState('forming');
      title.textContent='原来，微光也有名字。';
    },reduced.matches?120:1850);
    later(()=>{
      setState('friend');
      title.textContent='你好，我是烁。';
      hint.textContent='轻触烁，一起点亮今天';
      friend.disabled=false;
      friend.focus({preventScroll:true});
    },reduced.matches?350:3300);
  }
  function open() {
    if(dialog.open) return;
    returnFocus=document.activeElement;
    dialog.classList.remove('revealing');
    title.textContent='有一束光，正为你而来。';
    hint.textContent='轻触星光，让故事开始';
    start.disabled=false;friend.disabled=true;
    pointer={x:0,y:0};gaze={x:0,y:0};
    setState('idle');
    document.body.classList.add('arrival-open');
    dialog.showModal();
    resize();
    start.focus({preventScroll:true});
    frameId=requestAnimationFrame(draw);
  }
  dialog.addEventListener('pointermove',event=>{
    pointer={x:(event.clientX/innerWidth-.5)*2,y:(event.clientY/innerHeight-.5)*2};
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  dialog.querySelector('.arrival-skip').onclick=finish;
  start.onclick=begin;friend.onclick=enter;
  document.querySelector('#replayIntro').onclick=open;
  addEventListener('resize',()=>{if(dialog.open)resize();});
  window.StarwoodIntro={open};
  if(document.documentElement.classList.contains('intro-pending')) open();
})();
