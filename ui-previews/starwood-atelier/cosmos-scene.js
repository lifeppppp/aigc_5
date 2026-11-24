/* Shared procedural cosmos: textures are generated once, then gently transformed. */
(() => {
  function createGalaxy(seed) {
    const texture = document.createElement('canvas');
    texture.width = texture.height = 600;
    const ctx = texture.getContext('2d');
    let value = seed;
    const random = () => {value=value*16807%2147483647;return value/2147483647;};
    const haze = ctx.createRadialGradient(300,300,2,300,300,265);
    haze.addColorStop(0,'rgba(244,223,185,.35)');
    haze.addColorStop(.16,'rgba(172,176,214,.12)');
    haze.addColorStop(.6,'rgba(102,148,205,.06)');
    haze.addColorStop(1,'rgba(60,91,135,0)');
    ctx.fillStyle=haze;ctx.fillRect(0,0,600,600);
    for(let i=0;i<6200;i++) {
      const radius=Math.pow(random(),.67)*260;
      const arm=(i%4)*Math.PI/2;
      const spread=(random()-.5)*(.28+radius/360);
      const angle=arm+radius*.022+spread;
      const x=300+Math.cos(angle)*radius,y=300+Math.sin(angle)*radius;
      const size=.25+random()*.85;
      const alpha=(.1+random()*.42)*(1-radius/340);
      ctx.fillStyle=radius<65?'rgba(249,225,183,'+alpha+')':'rgba(158,191,229,'+alpha+')';
      ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();
    }
    const core=ctx.createRadialGradient(300,300,0,300,300,48);
    core.addColorStop(0,'rgba(255,248,220,.95)');
    core.addColorStop(.08,'rgba(255,235,181,.68)');
    core.addColorStop(.35,'rgba(241,213,172,.19)');
    core.addColorStop(1,'rgba(196,202,232,0)');
    ctx.fillStyle=core;ctx.fillRect(240,240,120,120);
    return texture;
  }
  const galaxy = createGalaxy(442);
  function create(canvas, variant) {
    const ctx=canvas.getContext('2d');
    let width=0,height=0,stars=[],dust=[],sparks=[];
    const companion=variant==='companion';
    let animationTime=0,previousTime=null;
    function resize() {
      const rect=canvas.getBoundingClientRect();
      width=rect.width;height=rect.height;
      const ratio=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.max(1,Math.round(width*ratio));
      canvas.height=Math.max(1,Math.round(height*ratio));
      ctx.setTransform(ratio,0,0,ratio,0,0);
      let seed=companion?718:818;
      const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
      stars=Array.from({length:companion?85:Math.min(540,Math.round(width*height/2100))},()=>({
        x:random()*width,y:random()*height,r:.2+random()*1.1,
        phase:random()*6.28,depth:.2+random()*.8
      }));
      dust=Array.from({length:companion?150:70},()=>({
        angle:random()*Math.PI*2,radius:.45+random()*.55,
        size:.3+random()*.8,speed:.3+random()*.7,phase:random()*6.28
      }));
    }
    function galaxyAt(x,y,size,rotation,tilt,opacity) {
      ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(1,tilt);
      ctx.globalAlpha=opacity;ctx.drawImage(galaxy,-size/2,-size/2,size,size);ctx.restore();
    }
    function orbit(cx,cy,rx,ry,rotation,time,color) {
      ctx.save();ctx.translate(cx,cy);ctx.rotate(rotation);
      ctx.strokeStyle=color;ctx.lineWidth=.65;
      ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([1,12]);ctx.strokeStyle='rgba(187,207,224,.15)';
      ctx.beginPath();ctx.ellipse(0,0,rx+7,ry+4,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      const angle=time*.0001+rotation*4;
      const x=Math.cos(angle)*rx,y=Math.sin(angle)*ry;
      const glow=ctx.createRadialGradient(x,y,0,x,y,8);
      glow.addColorStop(0,'rgba(251,231,183,.8)');glow.addColorStop(.2,'rgba(234,218,181,.4)');glow.addColorStop(1,'rgba(210,214,226,0)');
      ctx.fillStyle=glow;ctx.fillRect(x-8,y-8,16,16);
      ctx.restore();
    }
    function burst(x,y,small=false) {
      const birth=performance.now();
      for(let i=0;i<(small?2:16);i++) {
        const angle=Math.random()*Math.PI*2;
        const speed=(small?6:16)+Math.random()*22;
        sparks.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          birth,life:small?650:1100,size:.4+Math.random()*.9});
      }
      sparks=sparks.slice(-60);
    }
    function draw(time, options={}) {
      const still=options.still || false;
      if(!still && previousTime!==null) animationTime+=Math.max(0,Math.min(time-previousTime,80));
      previousTime=time;
      const t=animationTime;
      ctx.clearRect(0,0,width,height);
      if(!width||!height)return;
      if(companion) {
        galaxyAt(width*.91,height*.16,Math.min(width*.64,350),-.35+t*.000008,.47,.45);
      } else {
        galaxyAt(width*.87,height*.22,Math.max(340,Math.min(width*.68,850)),-.38+t*.000006,.47,.8);
        galaxyAt(width*.12,height*.72,Math.min(width*.48,480),.65-t*.000009,.66,.38);

        orbit(width*.86,height*.73,width*.36,height*.17,-.5,t,'rgba(200,199,172,.10)');
      }
      for(const star of stars) {
        const alpha = still ? .5 : .23 + .3*Math.sin(t*.0007+star.phase);
        const drift=t*.005*star.depth;
        const x=((star.x+drift+(options.x||0)*star.depth*12)%width+width)%width;
        const y=((star.y-drift*.27+(options.y||0)*star.depth*8)%height+height)%height;
        ctx.fillStyle='rgba(216,231,244,'+Math.max(.08,alpha)+')';
        ctx.beginPath();ctx.arc(x,y,star.r,0,Math.PI*2);ctx.fill();
        if(star.r>1.15) {
          ctx.strokeStyle='rgba(232,220,184,'+alpha*.45+')';ctx.lineWidth=.6;
          ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();
        }
      }
      if(companion) {
        const cx=width*.5,cy=height*.49;
        const rx=Math.min(width*.45,260),ry=rx*.41;
        orbit(cx,cy,rx,ry,-.35,t,'rgba(218,202,154,.33)');
        orbit(cx,cy,rx*.86,ry*1.15,.65,-t*.6,'rgba(143,194,216,.20)');
        orbit(cx,cy,rx*.82,ry*.7,-1.15,t*.4,'rgba(186,168,216,.16)');
        for(const point of dust) {
          const angle=point.angle+t*.00009*point.speed;
          const radius=rx*point.radius;
          const x=cx+Math.cos(angle)*radius;
          const y=cy+Math.sin(angle)*radius*.66;
          const alpha=.16+.22*Math.sin(t*.001+point.phase);
          ctx.fillStyle='rgba(219,214,181,'+Math.max(.03,alpha)+')';
          ctx.beginPath();ctx.arc(x,y,point.size,0,Math.PI*2);ctx.fill();
        }
        sparks=sparks.filter(spark=>time-spark.birth<spark.life);
        if(!still) for(const spark of sparks) {
          const age=Math.max(0,time-spark.birth);
          const seconds=age/1000;
          const alpha=1-age/spark.life;
          const x=spark.x+spark.vx*seconds,y=spark.y+spark.vy*seconds;
          ctx.fillStyle='rgba(245,224,175,'+Math.max(0,alpha*.7)+')';
          ctx.beginPath();ctx.arc(x,y,spark.size,0,Math.PI*2);ctx.fill();
        }
      } else {
        for(const point of dust) {
          const x=(point.angle/6.28*width+t*.003*point.speed)%width;
          const y=(point.radius*height+Math.sin(t*.0002+point.phase)*9)%height;
          ctx.fillStyle='rgba(212,206,182,.18)';
          ctx.beginPath();ctx.arc(x,y,point.size*.65,0,Math.PI*2);ctx.fill();
        }
      }
    }
    return {resize,draw,burst};
  }
  window.StarwoodCosmos={create};
  const canvas=document.querySelector('#orbitParticles');
  const scene=create(canvas,'companion');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const panel=document.querySelector('#orbitPanel');
  let last=0,lastTouch=0;
  const stage=canvas.parentElement;
  function emit(event,small) {
    if(reduced.matches||document.body.classList.contains('paused'))return;
    const rect=canvas.getBoundingClientRect();
    scene.burst(event.clientX-rect.left,event.clientY-rect.top,small);
  }
  stage.addEventListener('pointerdown',event=>emit(event,false));
  stage.addEventListener('pointermove',event=>{
    if(event.pointerType==='mouse'&&performance.now()-lastTouch>90) {
      lastTouch=performance.now();emit(event,true);
    }
  });
  new ResizeObserver(()=>{scene.resize();scene.draw(0,{still:true});}).observe(canvas);
  function animate(time) {
    if(time-last>40 && !document.hidden && !panel.hidden && !reduced.matches && !document.body.classList.contains('paused') && !document.body.classList.contains('arrival-open')) {
      scene.draw(time);last=time;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  document.querySelector('#openOrbitChat').onclick=()=>window.StarwoodChat?.open();
})();
