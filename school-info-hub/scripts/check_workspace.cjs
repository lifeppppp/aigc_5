const {chromium}=require('playwright'),{pathToFileURL}=require('url'),path=require('path');
(async()=>{const browser=await chromium.launch({channel:'msedge'});try{
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('starwood.intro.v1','seen');localStorage.setItem('sentinel_token','test');localStorage.setItem('sentinel_login_ts',String(Date.now()))});
 let label='测试同学',username='testuser',password='sample-password';
 await page.route('**:8020/**',async route=>{
  const req=route.request(),u=new URL(req.url());let result={};
  if(u.pathname==='/api/health')result={member:'testuser',label,username,stats:{}};
  if(u.pathname==='/api/session')result={label,username,member:'testuser'};
  if(u.pathname==='/api/auth/status')result={auth:[{site:'chaoxing',label:'学习通',enabled:true,needs_auth:true,encrypted:false,status:'unknown'}]};
  if(u.pathname==='/api/feed')result={items:[{label:'课程通知',summary:'请完成实验报告',todos:[{title:'提交实验报告',date:'2026-11-30',details:'两道例题'}]}]};
  if(u.pathname.startsWith('/api/account/')){
   const body=req.postDataJSON();
   if(body.current_password&&body.current_password!==password)return route.fulfill({status:400,json:{detail:'用户名或密码不对'}});
   if(u.pathname.endsWith('profile'))label=body.label;
   if(u.pathname.endsWith('name'))username=body.username;
   if(u.pathname.endsWith('password'))password=body.new_password;
   result={label,username};
  }
  await route.fulfill({json:result});
 });
 await page.goto(pathToFileURL(path.resolve(__dirname,'../app/starwood/index.html')).href);
 if(await page.locator('.rail [data-panel]').count()!==5)throw Error('navigation count');
 const header=await page.locator('.compact-welcome').boundingBox();if(header.height>150)throw Error('oversized header');
 await page.locator('[data-panel=intel]').click();await page.locator('#intelPanel').waitFor({state:'visible'});
 await page.locator('[data-center=sources]').click();await page.locator('#sourcesPanel').waitFor({state:'visible'});
 await page.locator('[data-center=files]').click();await page.locator('#importPanel').waitFor({state:'visible'});
 await page.locator('[data-panel=settings]').click();await page.locator('#settingsPanel').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#profileForm input').value==='测试同学');
 await page.locator('#profileForm input').fill('星木同学');await page.locator('#profileForm button').click();await page.waitForFunction(()=>document.querySelector('#profileForm output').textContent.includes('已保存'));
 await page.locator('#nameForm input[name=username]').fill('newuser');
 await page.locator('#nameForm input[type=password]').fill('wrong');
 await page.locator('#nameForm button').click();await page.waitForFunction(()=>document.querySelector('#nameForm output').textContent.includes('不对'));
 await page.locator('#nameForm input[type=password]').fill(password);await page.locator('#nameForm button').click();await page.waitForFunction(()=>document.querySelector('#nameForm output').textContent.includes('已保存'));
 await page.locator('#passwordForm input[name=current_password]').fill(password);
 await page.locator('#passwordForm input[name=new_password]').fill('new-sample-password');
 await page.locator('#passwordForm input[name=confirmation]').fill('new-sample-password');await page.locator('#passwordForm button').click();await page.waitForFunction(()=>document.querySelector('#passwordForm output').textContent.includes('已更新'));
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-switching'));
 await page.screenshot({path:require('os').tmpdir()+'/starwood-settings-'+width+'.png',fullPage:true});
 await page.locator('[data-panel=calendar]').click();await page.locator('#calendarPanel').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-switching'));
 await page.screenshot({path:require('os').tmpdir()+'/starwood-calendar-'+width+'.png',fullPage:true});
 if(await page.locator('#settingsPanel').isVisible())throw Error('settings visibility');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow');
 if(errors.length)throw Error(errors.join());
 await page.close();
}
console.log('PASS five-section navigation, smooth transitions, compact mascot header, merged center, settings success/error flows and mobile layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
