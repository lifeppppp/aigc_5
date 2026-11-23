const $ = (id) => document.getElementById(id);
const store = {
  get base() { return localStorage.getItem("gi_base") || location.origin; },
  get token() { return localStorage.getItem("gi_token") || ""; },
  set base(v) { localStorage.setItem("gi_base", v); },
  set token(v) { localStorage.setItem("gi_token", v); },
};

const SAMPLE = `[10:02] 潘辰嘉：服务器到了，阿里云 ECS，2核2G，Ubuntu 22.04，密钥在我这
[10:05] 李明：百炼那边我申请到 API Key 了，免费额度够用
[10:07] 王芳：那我先把手头的需求文档整理一下，晚上发群里
[10:12] 李明：@潘辰嘉 服务器什么时候能开放端口，我要本地连过去测试
[10:13] 潘辰嘉：今天 20 点前搞定，我把 8000 端口在安全组放行，你们用浏览器直接访问
[10:15] 赵磊：我这边的前端页面周三前要一个 demo，能演示就行
[10:16] 王芳：记得别把 key 写到前端里，会被抓到
[10:20] 潘辰嘉：明白，key 只放服务器，每次改完我往 github 推一份日志和代码副本
[10:21] 李明：好，那我等你通知再联调
[10:25] 赵磊：演示的时候手机也要能打开，我这边现场没有电脑只有手机
`;

function headers() {
  const h = { "Content-Type": "application/json" };
  if (store.token) h["X-Client-Token"] = store.token;
  return h;
}

async function checkHealth() {
  const dot = $("statusDot"), txt = $("statusText");
  dot.className = "dot";
  try {
    const r = await fetch(store.base + "/api/health");
    const d = await r.json();
    dot.className = "dot on";
    txt.textContent = d.bailian_key_configured
      ? `中转站在线 · 模型 ${d.model}`
      : `中转站在线 · 但未配置百炼 API Key`;
    $("pushBtn").disabled = !d.dingtalk_robot_configured || !lastResult;
  } catch (e) {
    dot.className = "dot off";
    txt.textContent = "连不上服务器，点右上「设置」检查地址";
  }
}

let lastResult = null;

function renderResult(res) {
  lastResult = res;
  $("resultCard").hidden = false;
  $("rTopic").textContent = res.topic || "整理结果";
  $("rSummary").textContent = res.summary || "";
  $("resultBadge").textContent = res.degraded ? "模型未按结构化格式返回" : "";

  const todos = $("rTodos");
  todos.textContent = "";
  if ((res.todos || []).length) {
    const box = document.createElement("div");
    box.className = "block";
    const h = document.createElement("h4");
    h.textContent = `待办 (${res.todos.length})`;
    box.appendChild(h);
    res.todos.forEach((t) => {
      const row = document.createElement("div");
      row.className = "todo";
      const task = document.createElement("span");
      task.textContent = t.task || "";
      row.appendChild(task);
      if (t.owner) {
        const who = document.createElement("span");
        who.className = "who";
        who.textContent = t.owner;
        row.appendChild(who);
      }
      if (t.due) {
        const due = document.createElement("span");
        due.className = "due";
        due.textContent = t.due;
        row.appendChild(due);
      }
      box.appendChild(row);
    });
    todos.appendChild(box);
  }

  fillList($("rDecisions"), "已确定的结论", res.decisions);
  fillList($("rRisks"), "风险 / 未决", res.risks);

  const tags = $("rKeywords");
  tags.textContent = "";
  (res.keywords || []).forEach((k) => {
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = k;
    tags.appendChild(s);
  });
  $("copyBtn").disabled = false;
  $("pushBtn").disabled = false;
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillList(host, title, items) {
  host.textContent = "";
  if (!(items || []).length) return;
  const box = document.createElement("div");
  box.className = "block";
  const h = document.createElement("h4");
  h.textContent = title;
  const ul = document.createElement("ul");
  items.forEach((i) => {
    const li = document.createElement("li");
    li.textContent = i;
    ul.appendChild(li);
  });
  box.append(h, ul);
  host.appendChild(box);
}

function toMarkdown(res) {
  let md = `### ${res.topic || "群信息整理"}\n\n${res.summary || ""}\n`;
  if ((res.todos || []).length) {
    md += "\n#### 待办\n";
    res.todos.forEach((t) => {
      md += `- ${t.task}${t.owner ? "（" + t.owner + "）" : ""}${t.due ? " " + t.due : ""}\n`;
    });
  }
  if ((res.decisions || []).length) md += "\n#### 已确定\n" + res.decisions.map((d) => `- ${d}`).join("\n") + "\n";
  if ((res.risks || []).length) md += "\n#### 风险\n" + res.risks.map((d) => `- ${d}`).join("\n") + "\n";
  return md;
}

function fail(msg) {
  const card = $("resultCard");
  card.hidden = false;
  let e = $("errBox");
  if (!e) {
    e = document.createElement("div");
    e.id = "errBox";
    e.className = "err";
    card.appendChild(e);
  }
  e.textContent = msg;
}

async function run() {
  const text = $("chatInput").value.trim();
  if (!text) return fail("请先粘贴群聊内容，或点「填入示例」。");
  document.body.classList.add("busy");
  $("meta").textContent = "整理中…";
  const t0 = Date.now();
  try {
    const r = await fetch(store.base + "/api/summarize", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text, focus: $("focusInput").value.trim() }),
    });
    const d = await r.json();
    if (!r.ok) return fail(d.detail || `请求失败 (${r.status})`);
    $("errBox")?.remove();
    $("meta").textContent = `耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · ${(d.usage?.total_tokens || 0)} tokens`;
    renderResult(d);
  } catch (e) {
    $("meta").textContent = "";
    fail("无法连接服务器：" + e.message);
  } finally {
    document.body.classList.remove("busy");
  }
}

async function push() {
  if (!lastResult) return;
  $("meta").textContent = "推送中…";
  try {
    const r = await fetch(store.base + "/api/push-dingtalk", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: lastResult.topic || "群信息整理", text: toMarkdown(lastResult) }),
    });
    const d = await r.json();
    $("meta").textContent = r.ok ? d.detail || "已推送" : "推送失败：" + (d.detail || r.status);
  } catch (e) {
    $("meta").textContent = "推送失败：" + e.message;
  }
}

function isUnlocked() {
  return !!store.token;
}

function refreshGate() {
  $("gate").hidden = isUnlocked();
  if (!isUnlocked()) $("codeInput").focus();
}

async function activate(code) {
  $("gateBtn").disabled = true;
  $("gateMsg").textContent = "校验中…";
  try {
    const r = await fetch(store.base + "/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (!r.ok) {
      $("gateMsg").textContent = d.detail || `激活失败 (${r.status})`;
      return;
    }
    store.token = d.token;
    refreshGate();
    checkHealth();
  } catch (e) {
    $("gateMsg").textContent = "连不上服务器，点右上「设置」检查地址";
  } finally {
    $("gateBtn").disabled = false;
  }
}

$("gateForm").onsubmit = (ev) => {
  ev.preventDefault();
  const code = $("codeInput").value.trim();
  if (code) activate(code);
};

$("runBtn").onclick = run;
$("pushBtn").onclick = push;
$("sampleBtn").onclick = () => { $("chatInput").value = SAMPLE; $("meta").textContent = "已填入示例，可直接点「整理」"; };
$("clearBtn").onclick = () => { $("chatInput").value = ""; $("focusInput").value = ""; lastResult = null; $("resultCard").hidden = true; };
$("copyBtn").onclick = async () => {
  const md = toMarkdown(lastResult);
  try { await navigator.clipboard.writeText(md); $("meta").textContent = "结果已复制"; }
  catch { $("meta").textContent = "浏览器不允许复制，请长按选中文字"; }
};
$("fileInput").onchange = (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => { $("chatInput").value = reader.result; $("meta").textContent = `已读取 ${f.name}`; };
  reader.readAsText(f, "utf-8");
};
$("settingsBtn").onclick = () => {
  if (!isUnlocked()) return;
  $("cfgBase").value = localStorage.getItem("gi_base") || "";
  $("cfgToken").value = store.token;
  $("settings").showModal();
};
$("settings").onclose = () => {
  if ($("settings").returnValue === "ok") {
    store.base = $("cfgBase").value.trim().replace(/\/$/, "");
    store.token = $("cfgToken").value.trim();
    refreshGate();
    checkHealth();
  }
};

refreshGate();
if (isUnlocked()) checkHealth();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("/static/sw.js").catch(() => {});
}
