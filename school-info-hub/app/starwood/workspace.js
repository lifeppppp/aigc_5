/* One navigation controller layers transitions over the existing page handlers. */
(() => {
  function start() {
    const work=document.querySelector('.workarea');
    const rail=document.querySelector('.rail');
    const centerButton=document.querySelector('[data-panel=intel]');
    if(!centerButton)return;
    centerButton.lastChild.textContent='学习中心';
    for(const id of ['sources','import'])document.querySelector('[data-panel='+id+']')?.remove();
    const panel=document.createElement('section');
    panel.id='settingsPanel';panel.className='settings-panel';panel.hidden=true;
    panel.innerHTML='<header class="settings-heading"><span class="eyebrow">属于你的学习空间</span><h2>把星木，调成你的样子。</h2><p id="accountIdentity" role="status">正在读取账号资料…</p></header><div class="settings-grid"><form id="profileForm" class="setting-card"><h3>显示名称</h3><p>烁和学习中心会用这个名字称呼你。</p><label>显示名称<input name="label" maxlength="40" required autocomplete="nickname"></label><button type="submit">保存名称</button><output aria-live="polite"></output></form><form id="nameForm" class="setting-card"><h3>登录账号</h3><p>修改登录账号名，保留已有来源和数据。</p><label>新账号名<input name="username" required minlength="3" maxlength="24" pattern="[a-z][a-z0-9_-]{2,23}" autocomplete="username"></label><small>小写字母开头，可用数字、下划线和短横线。</small><label>当前密码<input name="current_password" type="password" required autocomplete="current-password"></label><button type="submit">修改账号名</button><output aria-live="polite"></output></form><form id="passwordForm" class="setting-card"><h3>登录密码</h3><label>当前密码<input name="current_password" type="password" required autocomplete="current-password"></label><label>新密码<input name="new_password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><label>确认新密码<input name="confirmation" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><button type="submit">更新密码</button><output aria-live="polite"></output></form><section class="setting-card"><h3>阅读与互动</h3><label class="setting-toggle"><span>星空与烁的动态</span><input type="checkbox" id="settingMotion"></label><label class="setting-toggle"><span>紧凑页面间距</span><input type="checkbox" id="settingCompact"></label><p>外观偏好保存在当前浏览器。</p><button type="button" id="settingCampus">管理校园令牌 ↗</button><button type="button" class="setting-logout" id="settingLogout">退出登录</button><p id="preferenceStatus" role="status"></p></section></div>';
    work.insertBefore(panel,work.querySelector('.desk-footer'));
    const settingsButton=document.createElement('button');
    settingsButton.className='rail-btn';settingsButton.dataset.panel='settings';
    settingsButton.innerHTML='<span aria-hidden="true">⚙</span>设置';
    rail.insertBefore(settingsButton,rail.querySelector('.rail-line'));
    settingsButton.onclick=()=>{
      document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('active',b===settingsButton));
      for(const child of work.children)if(child.id.endsWith('Panel'))child.hidden=child!==panel;
      document.body.dataset.activePanel='settings';
      document.querySelector('.engraving').textContent='个人设置';
      loadAccount(true);
    };

    const intel=document.querySelector('#intelPanel');
    const source=document.querySelector('#sourcesPanel');
    const imports=document.querySelector('#importPanel');
    const feed=document.createElement('div');feed.className='center-content';feed.id='centerFeed';
    while(intel.firstChild)feed.append(intel.firstChild);
    const tabs=document.createElement('nav');tabs.className='center-tabs';tabs.setAttribute('aria-label','学习中心内容');
    const centerHeader=document.createElement('header');centerHeader.className='center-heading';
    centerHeader.innerHTML='<span class="eyebrow">让信息，汇成下一步</span><h2>学习中心</h2>';
    intel.append(centerHeader,tabs,feed,source,imports);
    let centerView='feed';
    const views={feed,sources:source,files:imports};
    const tabButtons=[];
    function selectCenter(id){
      centerView=id;
      Object.entries(views).forEach(([key,node])=>node.hidden=key!==id);
      tabButtons.forEach(b=>{const active=b.dataset.center===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    }
    for(const [id,text] of [['feed','学习动态'],['sources','管理来源'],['files','导入资料']]){
      const b=document.createElement('button');b.type='button';b.dataset.center=id;b.textContent=text;b.onclick=()=>changeView(()=>selectCenter(id));tabs.append(b);tabButtons.push(b);
    }
    centerButton.addEventListener('click',()=>{selectCenter(centerView);document.querySelector('.engraving').textContent='学习中心';});
    selectCenter('feed');

    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let switching=false,pending=null;
    async function changeView(change) {
      if(switching){pending=change;return;}
      switching=true;
      document.documentElement.classList.add("is-switching");
      try{
        if(reduced.matches){change();return;}
        if(document.startViewTransition){
          const transition=document.startViewTransition(change);
          await transition.finished;
        }else{
          await work.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:110,easing:'ease-in',fill:'forwards'}).finished;
          change();
          for(const animation of work.getAnimations())animation.cancel();
          await work.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:210,easing:'ease-out'}).finished;
        }
      }catch(error){if(error.name!=='AbortError')console.warn('Page transition interrupted',error)}
      finally{
        switching=false;
        document.documentElement.classList.remove("is-switching");
        if(pending){const next=pending;pending=null;changeView(next);}
      }
    }
    // Re-dispatch once inside the update callback so the original app and sentinel handlers still run.
    let replaying=false;
    rail.addEventListener('click',event=>{
      const button=event.target.closest('[data-panel]');
      if(!button||replaying)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(button.classList.contains('active'))return;
      changeView(()=>{
        replaying=true;
        try{
          button.click();
          panel.hidden=button!==settingsButton;
          for(const child of work.children)if(child.id.endsWith('Panel')&&child!==panel&&button===settingsButton)child.hidden=true;
          if(button===centerButton)selectCenter(centerView);
        }finally{replaying=false}
      });
    },true);

    const dock=document.querySelector('.companion-dock');
    if(dock){dock.hidden=true;const bubble=dock.querySelector('.companion-bubble');new MutationObserver(()=>{if(bubble.textContent)document.querySelector('#welcomeHint').textContent=bubble.textContent;}).observe(bubble,{childList:true,subtree:true,characterData:true});}
    const peek=document.querySelector('.welcome-shuo');
    peek.classList.add('desk-peek');
    document.querySelector('.desk').prepend(peek);
    peek.onclick=()=>window.StarwoodChat?.open();
    let last=0;
    function drawWelcome(time){
      if(!document.hidden&&!document.body.classList.contains('arrival-open')&&window.StarwoodMascot){
        const still=reduced.matches||document.body.classList.contains('paused');
        if(!still||!last){window.StarwoodMascot.draw(document.querySelector('#welcomeMascot'),still?0:time,false);last=time;}
      }
      requestAnimationFrame(drawWelcome);
    }
    requestAnimationFrame(drawWelcome);

    const API=location.protocol==='file:'?'http://8.136.148.250:8020':location.protocol+'//'+location.hostname+':8020';
    async function accountRequest(path,data){
      const token=localStorage.getItem('sentinel_token')||'';
      if(!token)throw Error('请先登录账号后再修改资料。');
      const response=await fetch(API+path,{method:data?'POST':'GET',headers:{'X-Client-Token':token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'修改失败，请稍后再试');
      return result;
    }
    async function loadAccount(fill=false){
      const target=document.querySelector('#accountIdentity');
      try{
        const info=await accountRequest('/api/session');
        target.textContent=(info.label||info.username)+' · '+info.username;
        if(fill)for(const [form,field] of [['profileForm','label'],['nameForm','username']])document.querySelector('#'+form).elements[field].value=info[field]||'';
      }catch(error){target.textContent=error.message}
    }
    function bindForm(id,path){
      const form=document.querySelector('#'+id);
      form.onsubmit=async event=>{
        event.preventDefault();
        const out=form.querySelector('output'),button=form.querySelector('button[type=submit]');
        const data=Object.fromEntries(new FormData(form));
        if(id==='passwordForm'&&data.new_password!==data.confirmation){out.textContent='两次新密码不一致';return;}
        delete data.confirmation;button.disabled=true;out.textContent='正在保存…';
        try{
          const info=await accountRequest(path,data);
          if(id==='passwordForm')form.reset();
          else{
            form.querySelectorAll('input[type=password]').forEach(n=>n.value='');
            let account={};try{account=JSON.parse(localStorage.getItem('sentinel_account')||'{}')}catch{}
            localStorage.setItem('sentinel_account',JSON.stringify({...account,...info}));
          }
          await loadAccount();
          out.textContent=id==='passwordForm'?'密码已更新，下次登录请使用新密码。':'修改已保存。';
        }catch(error){out.textContent=error.name==='TimeoutError'?'请求超时，请重新登录确认修改结果。':error.message}
        finally{button.disabled=false;}
      };
    }
    bindForm('profileForm','/api/account/profile');bindForm('nameForm','/api/account/name');bindForm('passwordForm','/api/account/password');
    const motion=document.querySelector('#settingMotion'),compact=document.querySelector('#settingCompact');
    function savePreference(name,value){try{localStorage.setItem(name,String(value))}catch{document.querySelector('#preferenceStatus').textContent='浏览器无法保存偏好。'}}
    try{
      if(localStorage.getItem('starwood.motion')==='false'&&!document.body.classList.contains('paused'))document.querySelector('#motion').click();
      document.body.classList.toggle('compact-layout',localStorage.getItem('starwood.compact')==='true');
    }catch{}
    function syncMotion(){motion.checked=!document.body.classList.contains('paused');}
    syncMotion();compact.checked=document.body.classList.contains('compact-layout');
    motion.onchange=()=>{if(motion.checked===document.body.classList.contains('paused'))document.querySelector('#motion').click();savePreference('starwood.motion',motion.checked)};
    document.querySelector('#motion').addEventListener('click',()=>{syncMotion();savePreference('starwood.motion',motion.checked)});
    compact.onchange=()=>{document.body.classList.toggle('compact-layout',compact.checked);savePreference('starwood.compact',compact.checked)};
    document.querySelector('#settingCampus').onclick=()=>window.StarwoodTokenUI?.open();
    document.querySelector('#settingLogout').onclick=()=>{
      for(const key of ['sentinel_token','sentinel_login_ts','sentinel_account'])localStorage.removeItem(key);
      location.assign('login.html?v=workspace');
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
