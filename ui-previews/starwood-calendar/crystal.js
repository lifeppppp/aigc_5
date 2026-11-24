/* A lit, slowly turning smoke-quartz study object, drawn locally. */
(() => {
  const canvas = document.querySelector('#crystal');
  const ctx = canvas.getContext('2d');
  const vertices = [[0,-1.3,0]];
  for (let i=0;i<6;i++) {
    const angle=i*Math.PI/3;
    vertices.push([Math.cos(angle)*.64,-.36,Math.sin(angle)*.64]);
  }
  for (let i=0;i<6;i++) {
    const angle=i*Math.PI/3;
    vertices.push([Math.cos(angle)*.50,.65,Math.sin(angle)*.50]);
  }
  vertices.push([0,1.18,0]);
  const faces=[];
  for(let i=0;i<6;i++){
    const next=(i+1)%6;
    faces.push([0,i+1,next+1],[i+1,i+7,next+7],[i+1,next+7,next+1],[13,next+7,i+7]);
  }
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let pulse=0,last=0;
  document.querySelector('#sprite').addEventListener('click',()=>{pulse=1});
  function draw(time){
    const angle=reduce.matches? .55 : .55+time*.000035;
    const transformed=vertices.map(([x,y,z])=>{
      let rx=x*Math.cos(angle)-z*Math.sin(angle);
      let rz=x*Math.sin(angle)+z*Math.cos(angle);
      return [rx+y*.16,y-rx*.1,rz];
    });
    const project=([x,y,z])=>[360+x*163,342+y*163,z];
    const projected=transformed.map(project);
    ctx.clearRect(0,0,720,720);
    const shadow=ctx.createRadialGradient(370,593,4,370,593,148);
    shadow.addColorStop(0,'#0009');shadow.addColorStop(1,'#0000');
    ctx.save();ctx.translate(0,420);ctx.scale(1,.3);ctx.fillStyle=shadow;ctx.fillRect(0,0,720,720);ctx.restore();
    const sorted=faces.map((f,index)=>({f,index,z:f.reduce((s,i)=>s+transformed[i][2],0)/3})).sort((a,b)=>a.z-b.z);
    for(const {f,index,z} of sorted){
      const points=f.map(i=>projected[i]);
      const [a,b,c]=f.map(i=>transformed[i]);
      const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const length=Math.hypot(...normal);
      const light=Math.abs((normal[0]*-.7+normal[1]*-.6+normal[2]*.3)/length);
      const shine=Math.pow(light,9);
      const base=24+light*38+shine*76+pulse*12;
      const gradient=ctx.createLinearGradient(points[0][0],points[0][1],points[2][0]+1,points[2][1]);
      gradient.addColorStop(0,'rgb('+(base+10)+','+(base+9)+','+(base+6)+')');
      gradient.addColorStop(.52,'rgb('+(base+2)+','+(base+3)+','+(base+4)+')');
      gradient.addColorStop(1,'rgb('+(base*.62)+','+(base*.65)+','+(base*.7)+')');
      ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));ctx.closePath();
      ctx.fillStyle=gradient;ctx.fill();
      ctx.strokeStyle='rgba(226,218,201,'+(.025+shine*.19)+')';ctx.lineWidth=.75;ctx.stroke();
    }
    pulse*=.95;
  }
  function frame(time){
    if(time-last>45 && !document.querySelector('#orbitPanel').hidden){
      draw(reduce.matches || document.body.classList.contains('paused') ? 0 : time);last=time;
    }
    requestAnimationFrame(frame);
  }
  draw(0);requestAnimationFrame(frame);
})();
