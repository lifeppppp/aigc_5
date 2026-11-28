(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'chat-dialog';
  dialog.id = 'starCompanionConversation';
  dialog.setAttribute('aria-labelledby','chatTitle');
  dialog.innerHTML = '<header class="chat-head"><div><span class="chat-mark">✧</span><div><h2 id="chatTitle">烁 · 学习伙伴</h2><span id="chatMode"></span></div></div><button type="button" class="chat-close" aria-label="关闭对话">×</button></header><div class="chat-messages" role="log" aria-label="与烁的对话" aria-live="polite"></div><div class="chat-quick"><button type="button">今天先做什么？</button><button type="button">帮我拆解任务</button><button type="button">讲解曲率</button></div><form class="chat-form"><label class="sr-only" for="chatInput">输入学习问题</label><textarea id="chatInput" rows="2" maxlength="2000" placeholder="问一个知识点，或说说你遇到的学习难题……"></textarea><div class="chat-form-foot"><button type="button" class="chat-reset">清空对话</button><button type="submit" class="chat-send">发送 ↑</button></div><p class="chat-feedback" role="status"></p></form>';
  const orbit = document.querySelector('#orbitPanel');
  const intro = orbit.querySelector('.companion-copy');
  const layout = intro.parentElement;
  const opener = orbit.querySelector('#openOrbitChat');
  const mascot = orbit.querySelector('#sprite');
  document.body.append(dialog);

  function setInline(active) {
    layout.classList.toggle('in-conversation', active);
    intro.inert = active;
    for (const button of [opener, mascot]) {
      button.setAttribute('aria-expanded', String(active));
      button.setAttribute('aria-controls', dialog.id);
    }
  }

  // Navigating away releases the shared chat for task-specific entry points.
  new MutationObserver(() => {
    if (orbit.hidden && dialog.open && layout.contains(dialog)) dialog.close();
  }).observe(orbit, {attributes:true, attributeFilter:['hidden']});

  const log = dialog.querySelector('.chat-messages');
  const input = dialog.querySelector('textarea');
  const form = dialog.querySelector('form');
  const send = dialog.querySelector('.chat-send');
  const feedback = dialog.querySelector('.chat-feedback');
  const endpoint = window.STARWOOD_CHAT?.endpoint?.trim() || '';
  const campusToken = () => { try { return localStorage.getItem('starwood.hduhelp.token') || ''; } catch (e) { return ''; } };
  const history = [];
  let activeRequest = null;
  let focusedTask = null;
  let requestVersion = 0;
  let returnFocus;
  function paintMode() {
    dialog.querySelector('#chatMode').textContent = endpoint
      ? '百炼在线 · 学习辅助' + (campusToken() ? ' · 校园数据已连接' : ' · 校园数据未连接')
      : '本地演示 · 百炼待接入';
  }
  paintMode();
  window.addEventListener('starwood:token-changed', paintMode);
  function message(role, text) {
    const row = document.createElement('div');
    row.className = 'chat-message '+role;
    const label = document.createElement('small');
    label.textContent = role === 'user' ? '你' : endpoint ? '烁' : '烁 · 本地演示';
    const body = document.createElement('p');
    body.textContent = text;
    row.append(label,body);log.append(row);
    log.scrollTop = log.scrollHeight;
  }
  function greeting() {
    const base = endpoint ? '我在。你想讨论哪个知识点，或一起拆解哪件学习任务？' : '我在。现在可以演示查看当日计划、拆解学习任务和讲解曲率。自由问答将在接入百炼后提供。';
    message('assistant', endpoint && !campusToken()
      ? base + '\n\n还没有绑定校园令牌，目前我读不到你的课表与校园卡。点右上角「校园令牌」绑定后，可以直接问我今天有什么课、卡里还有多少钱。'
      : base);
  }
  function context() {
    const simplify = task => ({
      id:task.id,title:task.title,type:task.type,done:task.done,
      time:task.time || '',requirements:taskRequirements(task)
    });
    return {
      date:selected,
      tasks:(tasks[selected] || []).map(simplify),
      focusedTask:focusedTask ? simplify(focusedTask) : null
    };
  }
  function demoAnswer(question, data) {
    const pending = data.tasks.filter(task => !task.done);
    if (/曲率/.test(question) && !/拆解/.test(question)) {
      return '曲率描述曲线在某一点弯曲得有多快，记作 κ。\n\n圆的曲率 κ = 1/R，R 是半径。半径越小，弯曲越明显。\n\n对 y = f(x)，曲率公式为\nκ = |y″| / (1 + (y′)²)^(3/2)\n\n例如 y = x²，在 x = 0 处，y′ = 0、y″ = 2，所以 κ = 2。\n\n练习时先求一阶、二阶导数，再代入指定位置，最后检查绝对值。';
    }
    if (/拆解|怎么做|分步/.test(question)) {
      const task = data.focusedTask || pending[0];
      if (!task) return '先在月历里添加一件具体的学习任务，再点卡片中的“请烁帮我拆解这件事”。你可以写清课程、要完成的内容和截止时间。';
      return '围绕“'+task.title+'”，可以先这样开始。\n\n1. 明确产出：'+(task.requirements || '写下最终需要提交或掌握的内容。')+'\n\n2. 先做准备：打开课程笔记，标出已掌握和不确定的部分。\n\n3. 分段推进：先用 20 分钟完成最小的一部分，再集中处理卡住的地方。\n\n4. 检查结果：对照要求复核，并在完成后勾选待办。'+(task.time?'\n\n这件事的截止时间是 '+task.time+'。':'\n\n当前没有填写截止时间，可以先安排一个开始时间。')+'\n\n这是基于当前任务的本地步骤模板，接入模型后可生成更有针对性的方案。';
    }
    if (/今天|待办|安排|先做|计划/.test(question)) {
      if (!pending.length) return data.tasks.length ? '所选日期 '+data.date+' 的待办已经完成。可以用几分钟回顾今天学会的内容，记下一件明天想继续探索的事。' : '所选日期 '+data.date+' 还没有待办。先写下一个能在今天完成的小目标，再告诉我你准备从哪里开始。';
      return '所选日期 '+data.date+' 有 '+pending.length+' 件待完成事项。\n\n'+pending.map((task,i)=>(i+1)+'. '+task.title+(task.time?'（截止 '+task.time+'）':'')).join('\n')+'\n\n可以先从“'+pending[0].title+'”开始。以上按当前列表顺序展示，你也可以根据真实截止时间调整。';
    }
    return '已收到你的问题：“'+question+'”。\n\n当前处于本地演示模式，尚未接入模型。你可以试试“讲解曲率”“今天先做什么”，或在具体待办里选择“请烁帮我拆解这件事”。\n\n接入百炼后，这里会使用当前对话与所选日期的任务内容，提供学习问答。';
  }
  async function submit(question) {
    if (activeRequest || !question.trim()) return;
    question = question.trim();
    const data = context();
    const priorHistory = history.slice(-12);
    message('user',question);
    history.push({role:'user',content:question});
    input.value = '';
    send.disabled = true;
    feedback.textContent = endpoint ? '正在思考……' : '正在整理演示回复……';
    const controller = new AbortController();
    activeRequest = controller;
    const version = ++requestVersion;
    let timeout;
    try {
      let reply;
      if (endpoint) {
        timeout = setTimeout(() => controller.abort(),80000);
        const response = await fetch(endpoint,{
          method:'POST',headers:{'Content-Type':'application/json'},
          credentials:'same-origin',signal:controller.signal,
          body:JSON.stringify({message:question,history:priorHistory,context:data,token:campusToken() || undefined})
        });
        if(!response.ok) {
          const detail = await response.json().catch(()=>({}));
          if(response.status===401) throw new Error(detail.detail || '校园令牌已失效，请点右上角「校园令牌」重新绑定。');
          throw new Error('服务暂时不可用（'+response.status+'），请稍后重试。');
        }
        const result = await response.json();
        if(typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('服务返回的回复格式不正确，请联系项目维护者。');
        reply = result.reply;
      } else {
        await new Promise(resolve => setTimeout(resolve,350));
        reply = demoAnswer(question,data);
      }
      if(version !== requestVersion) return;
      message('assistant',reply);
      history.push({role:'assistant',content:reply});
      if(history.length>40) history.splice(0,history.length-40);
      feedback.textContent = '';
      window.dispatchEvent(new CustomEvent('starwood:chat-reply'));
    } catch(error) {
      if(version !== requestVersion) return;
      history.pop();
      input.value = question;
      feedback.textContent = error.name === 'AbortError' ? '等待超时了，问题已保留，可以再试一次。' : error instanceof TypeError ? '暂时无法连接问答服务，问题已保留，请稍后重试。' : error instanceof SyntaxError ? '问答服务返回异常，请稍后重试。' : error.message;
    } finally {
      clearTimeout(timeout);
      if(version === requestVersion) {activeRequest=null;send.disabled=false;}
    }
  }
  window.StarwoodChat = {
    open(prefill = '', task = null) {
      focusedTask = task;
      if(!dialog.open) {
        returnFocus=document.activeElement;
                if (!orbit.hidden) {
          layout.append(dialog);
          setInline(true);
          dialog.show();
        } else {
          document.body.append(dialog);
          dialog.showModal();
          document.body.classList.add('chat-open');
        }
      }
      if(!log.children.length) greeting();
      if(prefill) input.value = prefill;
      input.focus({preventScroll:true});
    }
  };
  form.onsubmit = event => {event.preventDefault();submit(input.value);};
  input.addEventListener('keydown', event => {
    if(event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();form.requestSubmit();
    }
  });
  dialog.querySelectorAll('.chat-quick button').forEach(button => {
    button.onclick = () => submit(button.textContent);
  });
  dialog.querySelector('.chat-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    setInline(false);
    document.body.classList.remove('chat-open');
    if (orbit.hidden && orbit.contains(returnFocus)) return;
    returnFocus?.focus({preventScroll:true});
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open && layout.contains(dialog) && !document.querySelector('dialog:modal')) {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.querySelector('.chat-reset').onclick = () => {
    ++requestVersion;activeRequest?.abort();activeRequest=null;send.disabled=false;
    history.length=0;log.replaceChildren();feedback.textContent='';focusedTask=null;input.value='';
    greeting();input.focus();
  };
})();
