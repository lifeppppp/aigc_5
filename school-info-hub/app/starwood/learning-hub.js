/* Public UI connects only to verified server-side authorization and extraction. */
(() => {
  const work = document.querySelector('.workarea');
  const config = window.STARWOOD_LEARNING || {};
  const providers = [
    ['dingtalk','钉钉','群通知 · 共享文件','https://www.dingtalk.com/'],
    ['chaoxing','学习通','课程通知 · 作业资料','https://passport2.chaoxing.com/login'],
    ['mooc','中国大学 MOOC','课程学习 · 截止提醒','https://www.icourse163.org/?forcelogin=true'],
    ['hdu','杭电官网','校园公告 · 教学信息','https://sso.hdu.edu.cn/'],
    ['hdu-student','杭电学生','微信小程序 · 校园事务','']
  ];
  const section = (id, html) => {
    const panel = document.createElement('section');
    panel.id=id+'Panel';panel.className='learning-panel';panel.hidden=true;panel.innerHTML=html;
    work.insertBefore(panel,work.querySelector('.desk-footer'));
    return panel;
  };
  section('sources', '<div class="hub-heading"><span class="eyebrow">让消息，循着星轨而来</span><h2>把学习的来处，连在一起。</h2><p>由烁整理新消息与资料，把值得记住的事带回日历。</p></div><div class="connection-orbit" aria-hidden="true"><i></i><i></i><span class="seed-face">·ᴗ·</span><b>✦</b><em>✧</em></div><div id="providerCards" class="provider-grid"></div><div class="token-card" id="campusTokenCard"><div class="token-card-head"><div><span class="eyebrow">CAMPUS DATA</span><h3>校园数据令牌</h3></div><span class="token-badge" id="campusTokenState">未连接</span></div><p>烁通过你的杭电助手个人访问令牌读取课表、校园卡、电费等校园数据。令牌只保存在本浏览器，提问时交给团队后端向杭电助手查询。</p><div class="token-card-actions"><a href="https://neo.hduhelp.com/account/tokens/new" target="_blank" rel="noopener noreferrer">去获取令牌 ↗</a><button type="button" id="campusTokenBind">填写令牌</button></div></div><div class="sync-paper"><strong>学习信息同步</strong><label><input id="syncEnabled" type="checkbox" disabled> 每分钟检查一次已授权来源</label><p id="syncStatus" role="status">等待连接服务。当前尚未读取任何账号消息或文件。</p><button id="checkConnections" type="button">检查连接状态</button></div>');
  section('import','<div class="hub-heading"><span class="eyebrow">给散落的资料，一个落点</span><h2>交给烁，理出下一步。</h2><p>导入通知或笔记，核对提取出的事项，再放进你的日历。</p></div><label class="file-portal" id="filePortal"><span class="paper-creature" aria-hidden="true"><i>·ᴗ·</i><b>✦</b></span><strong>将文件拖入这片星光</strong><span id="fileFormats"></span><input id="learningFiles" type="file" multiple accept=".txt,.md,.csv"><span class="file-select">选择文件 ↗</span></label><div class="import-note" id="importMode"></div><p id="importStatus" role="status"></p><div id="fileResults"></div><button class="hub-primary" id="saveImported" disabled>将选中事项加入日历</button>');
  const cards = document.querySelector('#providerCards');
  const notice = document.querySelector('#syncStatus');
  let connected = [], busy=false;
  
  const endpoint = config.endpoint ? new URL(config.endpoint,location.href) : null;
  if(endpoint && endpoint.origin!==location.origin) throw Error('学习服务需要同源部署');
  async function request(path, body) {
    const response=await fetch(endpoint.href.replace(/\/$/,'')+path,{credentials:'same-origin',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.detail||'服务暂时不可用，请稍后重试')}
    return response.json();
  }
  providers.forEach(([id,name,desc,url],index)=>{
    const card=document.createElement('article');card.className='provider-card';
    card.innerHTML='<span class="provider-sigil" aria-hidden="true">✦</span><div><h3></h3><p></p><small>尚未连接</small></div><button type="button">连接 ↗</button>';
    card.style.setProperty('--turn',index*59+'deg');
    card.querySelector('h3').textContent=name;card.querySelector('p').textContent=desc;
    card.dataset.provider=id;
    card.querySelector('button').onclick=async()=>{
      const dialog=document.createElement('dialog');
      dialog.className='connection-dialog';
      const heading=document.createElement('h2');heading.textContent='连接'+name;
      const message=document.createElement('p');message.setAttribute('role','status');
      message.textContent=endpoint?'正在检查授权入口……':'账号授权服务尚未接入。';
      const link=document.createElement('a');link.textContent='打开'+name+'官方登录入口 ↗';
      link.target='_blank';link.rel='noopener noreferrer';
      if(url)link.href=url;
      link.hidden=true;
      const close=document.createElement('button');close.type='button';close.textContent='返回连接页';
      close.onclick=()=>dialog.close();
      dialog.append(heading,message,link,close);document.body.append(dialog);
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});
      dialog.showModal();
      function unavailable(reason) {
        message.textContent=reason+'。'+(url?'你可以前往官方入口登录。登录完成后，本应用仍需平台授权接口才能读取消息和文件。':'请在微信搜索“杭电学生”。自动跳转与账号授权需要该小程序的正式入口。');
        link.hidden=!url;
        card.querySelector('small').textContent='授权待接入';
        notice.textContent=name+'的账号授权接口尚未接入。';
      }
      if(!endpoint){unavailable('账号授权服务尚未接入');return}
      try {
        const result=await request('/authorize',{provider:id});
        const target=new URL(result.url);
        if(target.protocol!=='https:')throw Error('授权链接需要 HTTPS');
        if(dialog.open)location.assign(target.href);
      } catch(error){if(dialog.open)unavailable(error.message)}
    };
    cards.append(card);
  });
  async function refresh() {
    if(!endpoint){notice.textContent='连接服务尚未配置。请由后端接入授权回调、账号会话保存与平台数据接口。';return}
    try {
      const state=await request('/connections');
      if(!Array.isArray(state.connections))throw Error('连接服务返回格式有误');
      connected=state.connections.filter(x=>x.status==='connected' && providers.some(p=>p[0]===x.provider));
      for(const card of cards.children) {
        const item=connected.find(x=>x.provider===card.dataset.provider);
        card.classList.toggle('is-connected',!!item);
        card.querySelector('small').textContent=item?'已连接 · '+(item.accountLabel||'授权成功'):'尚未连接';
      }
      document.querySelector('#syncEnabled').disabled=!connected.length;
      notice.textContent=connected.length?'已验证 '+connected.length+' 个来源，可开启分钟同步。':'尚未授权来源。';
    }catch(e){notice.textContent=e.message}
  }
  document.querySelector('#checkConnections').onclick=refresh;
  const tokenState=document.querySelector('#campusTokenState');
  const tokenBind=document.querySelector('#campusTokenBind');
  function paintToken(){
    let saved='';
    try{saved=localStorage.getItem('starwood.hduhelp.token')||''}catch(e){}
    tokenState.textContent=saved?'已绑定':'未连接';
    tokenState.dataset.bound=saved?'1':'0';
    tokenBind.textContent=saved?'更换令牌':'填写令牌';
  }
  tokenBind.onclick=()=>{ if(window.StarwoodTokenUI) window.StarwoodTokenUI.open(); };
  addEventListener('starwood:token-changed',paintToken);
  paintToken();
  document.querySelector('#syncEnabled').onchange=async e=>{
    try {
      await request('/sync/settings',{enabled:e.target.checked,intervalSeconds:60});
      notice.textContent=e.target.checked?'服务端已启用每分钟同步，结果将更新到日历。':'同步已暂停';
    }catch(error){e.target.checked=!e.target.checked;notice.textContent=error.message}
  };
  // Background collection belongs to the server, including while this page is closed.
  addEventListener('focus',()=>{if(endpoint)refresh()});
  if(endpoint)refresh();
  const portal=document.querySelector('#filePortal');
  const input=document.querySelector('#learningFiles');
  const status=document.querySelector('#importStatus');
  const results=document.querySelector('#fileResults');
  const save=document.querySelector('#saveImported');
  const drafts=[];
  document.querySelector('#fileFormats').textContent=endpoint?'TXT · Markdown · CSV · PDF · DOCX，每个最多 10 MB':'TXT · Markdown · CSV，每个文件最多 2 MB';
  if(endpoint)input.accept='.txt,.md,.csv,.pdf,.docx';
  document.querySelector('#importMode').textContent=endpoint?'文件将交由已配置的学习服务识别，请先核对结果。':'本地提取模式 · 从文本中匹配日期和任务关键词，AI 识别服务待接入。日期未明确的事项，请手动补全。';
  for(const event of ['dragenter','dragover'])portal.addEventListener(event,e=>{e.preventDefault();portal.classList.add('receiving')});
  portal.addEventListener('dragleave',()=>portal.classList.remove('receiving'));
  portal.addEventListener('drop',e=>{e.preventDefault();portal.classList.remove('receiving');readFiles(e.dataTransfer.files)});
  input.onchange=()=>{readFiles(input.files);input.value=''};
  function addDraft(item,source) {
    const row=document.createElement('article');row.className='draft-paper';
    const pick=document.createElement('input');pick.type='checkbox';pick.checked=true;pick.setAttribute('aria-label','选择事项');
    const title=document.createElement('input');title.value=String(item.title||'').slice(0,180);title.maxLength=180;title.setAttribute('aria-label','事项内容');
    const date=document.createElement('input');date.type='date';date.value=item.date||'';date.setAttribute('aria-label','截止日期');
    const details=document.createElement('textarea');details.value=String(item.details||'').slice(0,4000);details.setAttribute('aria-label','详细要求');
    const label=document.createElement('small');label.textContent='来源 · '+source;
    row.append(pick,title,date,details,label);results.append(row);
    drafts.push({row,pick,title,date,details,source});
  }
  async function readFiles(files) {
    if(busy)return;
    busy=true;portal.classList.add('reading');input.disabled=true;save.disabled=true;
    let added=0;
    try {
      for(const file of Array.from(files).slice(0,10)) {
        status.textContent='烁正在接收 '+file.name;
        if(file.size>(endpoint?10:2)*1024*1024){status.textContent=file.name+' 超出文件大小限制';continue}
        try {
          let items;
          if(endpoint) {
            
            const response=await fetch(endpoint.href.replace(/\/$/,'')+'/extract?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,credentials:'same-origin',signal:AbortSignal.timeout(90000)});
            if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.detail||'文件识别服务请求失败')}
            items=(await response.json()).items;
            if(!Array.isArray(items))throw Error('识别结果格式有误');
          } else {
            if(!/\.(txt|md|csv)$/i.test(file.name))throw Error('此格式需要 AI 文件识别服务，目前请导入 TXT、Markdown 或 CSV');
            const data=await file.arrayBuffer();
            let text;
            try{text=new TextDecoder('utf-8',{fatal:true}).decode(data)}catch{text=new TextDecoder('gb18030').decode(data)}
            items=text.split(/[\r\n]+/).filter(l=>/提交|作业|考试|复习|截止|完成|报告|报名/.test(l)).slice(0,40).map(line=>{
              const match=line.match(/(?:(20\d{2})[-年/.])?(\d{1,2})[-月/.](\d{1,2})日?/);
              let date='';
              if(match){const y=Number(match[1]||new Date().getFullYear()),m=+match[2],d=+match[3],dt=new Date(y,m-1,d);if(dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d)date=key(dt)}
              return {title:line.trim(),date,details:line.trim()};
            });
          }
          items.slice(0,40).forEach(item=>{addDraft(item,file.name);added++});
        }catch(error){const warning=document.createElement('p');warning.className='import-error';warning.textContent=file.name+' · '+error.message;results.append(warning)}
      }
      status.textContent=added?'烁拾起了 '+added+' 条候选事项，请核对内容和日期。':'本次未找到候选事项，可尝试包含提交、作业或截止日期的通知文本。';
    }finally{busy=false;input.disabled=false;portal.classList.remove('reading');save.disabled=!drafts.length}
  }
  save.onclick=()=>{
    const chosen=drafts.filter(x=>x.pick.checked);
    if(!chosen.length)return status.textContent='请先选择事项';
    if(chosen.some(x=>!x.title.value.trim()||!x.date.value||!x.date.checkValidity()))return status.textContent='请补全选中事项的内容和日期';
    const next=JSON.parse(JSON.stringify(tasks));
    let count=0;
    for(const draft of chosen) {
      const date=draft.date.value,title=draft.title.value.trim();
      next[date]??=[];
      if(!next[date].some(t=>t.title===title&&t.source===draft.source)){
        next[date].push({id:crypto.randomUUID ? crypto.randomUUID() : "import-"+Date.now()+"-"+Math.random().toString(36).slice(2),title,details:draft.details.value,source:draft.source,type:'学习',done:false});count++;
      }
    }
    try{localStorage.setItem('starwood.tasks.v1',JSON.stringify(next))}catch{return status.textContent='保存失败，浏览器存储空间不足，请导出计划后再试'}
    tasks=next;chosen.forEach(d=>d.row.remove());for(let i=drafts.length-1;i>=0;i--)if(chosen.includes(drafts[i]))drafts.splice(i,1);
    render();status.textContent='已将 '+count+' 条新事项写入日历，重复事项已略过';save.disabled=!drafts.length;
    dispatchEvent(new Event('starwood:celebrate'));
  };
})();
