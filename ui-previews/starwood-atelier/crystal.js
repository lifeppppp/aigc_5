/* Shuo is drawn locally so its gaze, breathing and reactions remain interactive. */
(() => {
  const dock = document.createElement('div');
  dock.className = 'companion-dock';
  dock.innerHTML = '<div class="companion-bubble" role="status"></div><button class="companion-mini" aria-label="和星伴烁打个招呼"><canvas width="360" height="360" aria-hidden="true"></canvas></button>';
  document.body.append(dock);
  const large = document.querySelector('#crystal');
  const mini = dock.querySelector('canvas');
  const bubble = dock.querySelector('.companion-bubble');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer = {x:0, y:0};
  let reaction = 0;
  let bubbleTimer;
  let previousTime = 0;
  let nextBlink = 4200;
  let blinkStart = -1000;
  function speak(message) {
    bubble.textContent = message;
    bubble.classList.add('visible');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), 4800);
    reaction = 1;
  }
  addEventListener('pointermove', event => {
    pointer.x = (event.clientX / innerWidth - .5) * 2;
    pointer.y = (event.clientY / innerHeight - .5) * 2;
  }, {passive:true});
  dock.querySelector('button').onclick = () => {
    const first = (tasks[selected] || []).find(task => !task.done);
    speak(first ? '先从这件小事开始吧：'+first.title : '今天的节奏，由你决定。随时可以写下一个新目标。');
  };
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    const words = {calendar:'一起把今天安排得轻松一点。',notes:'想法不用一次写完，先记下一句。',orbit:'我叫烁。你的每一点进步，我都记得。'};
    speak(words[button.dataset.panel]);
  }));
  document.querySelector('#grid').addEventListener('click', event => {
    if (event.target.closest('.day')) reaction = .5;
  });
  document.querySelector('#tasks').addEventListener('change', event => {
    if (event.target.matches('input[type=checkbox]') && event.target.checked) speak('又完成了一件事。给认真努力的你一点星光。');
  });
  document.querySelector('#taskForm').addEventListener('submit', () => {
    if (document.querySelector('#taskTitle').value.trim()) speak('记下了。一步一步，事情就会变简单。');
  }, true);
  document.querySelector('#sprite').addEventListener('click', () => speak('我在。轻触「展开今日计划」，一起看看下一步。'));
  function pathBody(ctx) {
    ctx.beginPath();
    ctx.moveTo(180,89);
    ctx.bezierCurveTo(224,89,255,116,257,162);
    ctx.bezierCurveTo(260,206,237,246,193,249);
    ctx.bezierCurveTo(152,255,106,232,104,188);
    ctx.bezierCurveTo(99,150,124,98,166,91);
    ctx.bezierCurveTo(172,89,176,89,180,89);
    ctx.closePath();
  }
  function draw(canvas, time, compact) {
    const ctx = canvas.getContext('2d');
    const ratio = canvas.width / 360;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,360,360);
    const moving = !reduce.matches && !document.body.classList.contains('paused');
    const phase = moving ? time * .0013 : 0;
    const bob = moving ? Math.sin(phase)*5 - reaction*10 : 0;
    const tilt = moving ? pointer.x*.035 + Math.sin(phase*.65)*.025 : 0;
    // Soft contact shadow grounds the floating form.
    ctx.save();
    ctx.translate(181,284);
    ctx.scale(1,.20);
    const shadow=ctx.createRadialGradient(0,0,4,0,0,compact?65:80);
    shadow.addColorStop(0,'rgba(75,98,77,.16)');
    shadow.addColorStop(1,'rgba(75,98,77,0)');
    ctx.fillStyle=shadow;ctx.fillRect(-100,-100,200,200);
    ctx.restore();
    ctx.save();ctx.translate(180,180+bob);ctx.rotate(tilt);ctx.translate(-180,-180);
    // Two little leaf-like fins, brushed champagne on their upper edge.
    let fin=ctx.createLinearGradient(120,80,165,124);
    fin.addColorStop(0,'#fffbed');fin.addColorStop(.45,'#e8d9ac');fin.addColorStop(1,'#b8b7a2');
    ctx.fillStyle=fin;ctx.beginPath();ctx.moveTo(157,106);ctx.bezierCurveTo(118,103,121,67,128,57);ctx.bezierCurveTo(148,61,173,79,157,106);ctx.fill();
    ctx.strokeStyle='#fff9df';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(129,64);ctx.quadraticCurveTo(140,82,155,99);ctx.stroke();
    fin=ctx.createLinearGradient(196,75,241,112);fin.addColorStop(0,'#fffced');fin.addColorStop(.5,'#d5dfc5');fin.addColorStop(1,'#a3baa9');
    ctx.fillStyle=fin;ctx.beginPath();ctx.moveTo(195,98);ctx.bezierCurveTo(195,70,225,66,242,76);ctx.bezierCurveTo(237,94,221,111,195,98);ctx.fill();
    ctx.strokeStyle='#ffffe9';ctx.beginPath();ctx.moveTo(205,94);ctx.quadraticCurveTo(221,81,236,78);ctx.stroke();
    // Pearl body with cool reflected light and a warm softbox reflection.
    const body=ctx.createRadialGradient(149,123,8,194,173,117);
    body.addColorStop(0,'#fffffa');body.addColorStop(.3,'#fffdf3');body.addColorStop(.61,'#eceee3');body.addColorStop(.82,'#ced8d4');body.addColorStop(1,'#9faeb2');
    pathBody(ctx);ctx.fillStyle=body;ctx.fill();
    ctx.save();pathBody(ctx);ctx.clip();
    let reflected=ctx.createRadialGradient(229,194,0,229,194,87);
    reflected.addColorStop(0,'rgba(191,183,231,.3)');reflected.addColorStop(1,'rgba(218,210,249,0)');
    ctx.fillStyle=reflected;ctx.fillRect(90,85,180,180);
    reflected=ctx.createRadialGradient(137,195,0,137,195,72);
    reflected.addColorStop(0,'rgba(237,209,161,.24)');reflected.addColorStop(1,'rgba(237,209,161,0)');
    ctx.fillStyle=reflected;ctx.fillRect(90,85,180,180);
    ctx.restore();
    pathBody(ctx);ctx.strokeStyle='rgba(255,255,251,.75)';ctx.lineWidth=1;ctx.stroke();
    // A fine curved gold seam is Shuo's identifying detail.
    ctx.beginPath();ctx.moveTo(115,190);ctx.bezierCurveTo(128,226,172,241,211,231);
    ctx.strokeStyle='rgba(174,155,110,.48)';ctx.lineWidth=.8;ctx.stroke();
    const blinkAge=time-blinkStart;
    const blink = moving && blinkAge>=0 && blinkAge<160 ? Math.max(.08,Math.abs(blinkAge-80)/80) : 1;
    const gazeX=moving?pointer.x*4:0, gazeY=moving?pointer.y*2:0;
    ctx.fillStyle='#53625b';
    for(const x of [164,195]){
      ctx.beginPath();ctx.ellipse(x+gazeX,166+gazeY,3.3,5.2*blink,0,0,Math.PI*2);ctx.fill();
      if(blink>.7){ctx.fillStyle='#fffef4';ctx.beginPath();ctx.arc(x+gazeX-.6,164.7+gazeY,.8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#53625b';}
    }
    ctx.beginPath();ctx.moveTo(175+gazeX,184);ctx.quadraticCurveTo(180+gazeX,187+reaction*3,185+gazeX,183.8);
    ctx.strokeStyle='#9ca58e';ctx.lineWidth=1.2;ctx.lineCap='round';ctx.stroke();
    ctx.restore();
    // Brief, quiet star accents respond to completed tasks.
    if(reaction>.1 && moving){
      ctx.strokeStyle='rgba(188,161,94,'+reaction*.7+')';ctx.lineWidth=1;
      for(let i=0;i<3;i++){
        const x=90+i*93, y=115+(i%2)*75-(1-reaction)*25;
        const r=3+reaction*3;
        ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();
      }
    }
  }
  function frame(time) {
    if(time-previousTime>38 && !document.hidden){
      if(time>nextBlink){blinkStart=time;nextBlink=time+3600+Math.random()*2600;}
      draw(mini,time,true);
      if(!document.querySelector('#orbitPanel').hidden) draw(large,time,false);
      reaction*=.94;
      previousTime=time;
    }
    requestAnimationFrame(frame);
  }
  draw(mini,0,true);draw(large,0,false);requestAnimationFrame(frame);
})();
