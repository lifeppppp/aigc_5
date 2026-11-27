"""Playwright 驱动服务器上已装的 Google Chrome：拍图（无头）与授权（有头 + 虚拟屏）。"""

import pathlib
import json
import os
import tempfile
import time
from urllib.parse import urlparse

import config
import vault

LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--hide-scrollbars",
]

# 登录页的地址特征：学习通停在 passport2.chaoxing.com/login，校内站停在 sso.hdu.edu.cn。
# 只看地址前缀/路径词，不用「登录」二字——正常页面里也会出现这两个字。
LOGIN_HOSTS = ("login", "passport", "sso", "cas")
LOGIN_PATHS = ("/login", "/signin", "/passport", "/sso", "/cas", "/auth")


def looks_like_login(url, title="", text_len=0):
    """确认登录时的保守判据：地址像登录页，且正文不是成篇的内容。

    判不准时一律按「已登录」处理——宁可少拦一次，也不要把真登录的人挡在门外。"""
    p = urlparse(url or "")
    if p.scheme not in ("http", "https"):
        return False
    host = (p.hostname or "").lower()
    path = (p.path or "").lower()
    hit = (any(h in host for h in LOGIN_HOSTS)
           or any(w in path for w in LOGIN_PATHS))
    return bool(hit) and text_len < 600


def _note_path(key):
    return config.RUN / f"grant-note-{key}.txt"


def write_note(key, text):
    """授权页能看到的说明（只在授权会话期间用，权限 600）。"""
    path = _note_path(key)
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)


def note_of(key):
    try:
        return _note_path(key).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def clear_note(key):
    _note_path(key).unlink(missing_ok=True)


def _launch(pw, headless):
    return pw.chromium.launch(
        channel="chrome",
        headless=headless,
        executable_path=config.CHROME if pathlib.Path(config.CHROME).exists() else None,
        args=LAUNCH_ARGS,
    )


def _new_context(browser, auth_site, viewport, member=config.OWNER):
    kwargs = {"viewport": {"width": viewport[0], "height": viewport[1]}, "locale": "zh-CN"}
    temp = vault.decrypt_to_temp(auth_site, member) if auth_site else None
    if temp:
        kwargs["storage_state"] = temp
    try:
        return browser.new_context(**kwargs)
    finally:
        if temp:
            vault.discard(temp)


def _settle(page, wait_ms, idle_ms=6000):
    page.wait_for_timeout(wait_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=idle_ms)
    except Exception:
        pass


def _block_fonts(page):
    """拦掉 Web 字体请求。截图前 Playwright 会等 document.fonts.ready，
    而校内页面常引用无超时的 CDN 字体，会把 ready 卡成永久挂起。
    中文正文走系统字体栈（服务器已装 fonts-noto-cjk），拦掉不影响可读。"""

    def handle(route):
        try:
            if route.request.resource_type == "font":
                route.abort()
            else:
                route.continue_()
        except Exception:
            pass

    page.route("**/*", handle)


def _visible_text(page):
    """逐帧取 innerText：教务门户常把正文装在 iframe 里，只读主文档会得到空串，
    而我们已经取消了定时拍图兜底，跨帧取字是这类站唯一的出路。"""
    chunks = []
    for frame in page.frames:
        try:
            text = frame.evaluate("() => document.body ? document.body.innerText : ''") or ""
        except Exception:
            continue
        if text.strip():
            chunks.append(text.strip())
    return "\n".join(chunks)


def _settle_text(page, budget_ms=6000, quiet_ms=1200):
    """轮询只等正文不再变化，不等网络安静：公告页有长轮询、倒计时和常驻埋点，
    networkidle 在这类页面上永远不触发，等它只会白烧几秒钟。"""
    started = time.time()
    prev, changed = None, started
    while True:
        text = _visible_text(page)
        if text != prev:
            prev, changed = text, time.time()
        now = time.time()
        if prev and (now - changed) * 1000 >= quiet_ms:
            return prev
        if (now - started) * 1000 >= budget_ms or (not prev and (now - started) > 3):
            return prev or ""
        page.wait_for_timeout(400)


def capture(url, auth_site="", shots=2, tag="site", wait_ms=2500, member=config.OWNER):
    """打开页面按顺序拍 shots 张，返回 (图片路径列表, 最终URL, 页面标题, 可见正文)。"""
    from playwright.sync_api import sync_playwright

    config.ensure_dirs()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    paths = []
    with sync_playwright() as pw:
        browser = _launch(pw, True)
        context = _new_context(browser, auth_site, config.VIEWPORT, member)
        page = context.new_page()
        _block_fonts(page)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            _settle(page, wait_ms)
            for i in range(max(1, int(shots))):
                out = config.SHOTS / f"{tag}-{stamp}-{i}.jpg"
                page.screenshot(path=str(out), type="jpeg", quality=78, timeout=20000)
                paths.append(out)
                if i + 1 < int(shots):
                    page.mouse.wheel(0, int(config.VIEWPORT[1] * 0.85))
                    page.wait_for_timeout(900)
            return paths, page.url, (page.title() or "")[:200], _visible_text(page)[:40000]
        finally:
            context.close()
            browser.close()


def read(url, auth_site="", budget_ms=6000, member=config.OWNER):
    """实时轮询用的最轻路径：只取正文/URL/标题，一张图都不拍。"""
    from playwright.sync_api import sync_playwright

    config.ensure_dirs()
    with sync_playwright() as pw:
        browser = _launch(pw, True)
        context = _new_context(browser, auth_site, config.VIEWPORT, member)
        page = context.new_page()
        _block_fonts(page)
        try:
            # 等 domcontentloaded 在教务门户上是自找麻烦：www.hdu.edu.cn 实测 20 秒不返回直接抛错，
            # 换成 commit 后 5.2 秒拿到 5866 字。后面 _settle_text 本来就在轮询正文稳不稳，
            # DOM 就没就绪无所谓，goto 只负责把导航发起。
            page.goto(url, wait_until="commit", timeout=20000)
            return _settle_text(page, budget_ms)[:40000], page.url, (page.title() or "")[:200]
        finally:
            context.close()
            browser.close()


def shot_evidence(url, auth_site="", tag="site", wait_ms=1500, member=config.OWNER):
    """补拍一张首屏原图作证据。失败返回 None，不拖垮识别。"""
    from playwright.sync_api import sync_playwright

    config.ensure_dirs()
    out = config.SHOTS / f"{tag}-{time.strftime('%Y%m%d-%H%M%S')}-0.jpg"
    try:
        with sync_playwright() as pw:
            browser = _launch(pw, True)
            context = _new_context(browser, auth_site, config.VIEWPORT, member)
            page = context.new_page()
            _block_fonts(page)
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                _settle(page, wait_ms)
                page.screenshot(path=str(out), type="jpeg", quality=78, timeout=15000)
            finally:
                context.close()
                browser.close()
    except Exception:
        return None
    return out if out.exists() else None


def open_state(url, auth_site="", member=config.OWNER):
    """只判断能不能拿到登录后的页面，不保存图片。正文长度也给出来，好判断是不是停在登录页。"""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = _launch(pw, True)
        context = _new_context(browser, auth_site, config.VIEWPORT, member)
        page = context.new_page()
        _block_fonts(page)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=40000)
            _settle(page, 2000)
            text_len = len(_visible_text(page).strip())
            return {"url": page.url, "title": (page.title() or "")[:200], "text_len": text_len,
                    "login_form": page.locator('input[type="password"]:visible').count() > 0}
        finally:
            context.close()
            browser.close()



def login_complete(state, target_url):
    """Require the actual protected host, readable content and no visible login form."""
    target = urlparse(target_url)
    current = urlparse(state.get("url", ""))
    if current.scheme not in ("https", "http") or current.hostname != target.hostname:
        return False
    if any(word in (current.path or "").lower() for word in LOGIN_PATHS):
        return False
    return (not state.get("login_form", True) and state.get("text_len", 0) >= 80)


def _read_credentials(site, member):
    temp = vault.decrypt_to_temp(site + "-credentials", member)
    try:
        if not temp:
            return {}
        data = json.loads(pathlib.Path(temp).read_text(encoding="utf8"))
        return data if isinstance(data, dict) else {}
    except (ValueError, OSError):
        return {}
    finally:
        vault.discard(temp)


def _encrypted_json(site, member, data):
    fd, name = tempfile.mkstemp(prefix="connect-", suffix=".json", dir=str(config.RUN))
    try:
        with os.fdopen(fd, "w", encoding="utf8") as stream:
            json.dump(data, stream, ensure_ascii=False)
        return vault.save(site, member, name)
    finally:
        vault.discard(name)


def _remember_login(context, site, member):
    saved = _read_credentials(site, member)
    remembered = {}
    domains = ["chaoxing.com"] if site == "chaoxing" else ["hdu.edu.cn"] if site in ("hdu-i", "hdu-erke") else []
    def receive(source, data):
        host = (urlparse(source["frame"].url).hostname or "").lower()
        if not any(host == domain or host.endswith("." + domain) for domain in domains):
            return
        if not isinstance(data, dict):
            return
        username, password = data.get("username"), data.get("password")
        if isinstance(username, str) and isinstance(password, str) and 0 < len(username) <= 256 and 0 < len(password) <= 4096:
            remembered.update(username=username, password=password)
    context.expose_binding("__starwoodRememberLogin", receive)
    script = """
(() => {
 const domains = DOMAINS;
 if(!domains.some(d=>location.hostname===d||location.hostname.endsWith('.'+d)))return;
 const saved = SAVED;
 const filled = new WeakSet();
 function username(root){
  return root.querySelector('input[autocomplete="username"],#username,#unameId,#phone,#account,input[name="username"],input[name="uname"],input[type="email"],input[type="tel"]')
    || Array.from(root.querySelectorAll('input[type="text"],input:not([type])')).find(n=>n.offsetParent!==null);
 }
 function record(){
  const password=Array.from(document.querySelectorAll('input[type="password"]')).find(n=>n.offsetParent!==null);
  if(!password)return;
  const account=username(password.form||document);
  if(account?.value&&password.value)window.__starwoodRememberLogin({username:account.value,password:password.value});
 }
 function fill(){
  if(!saved.username||!saved.password)return;
  for(const password of document.querySelectorAll('input[type="password"]')){
   if(filled.has(password)||password.offsetParent===null)continue;
   const account=username(password.form||document);
   if(!account||account.value||password.value)continue;
   filled.add(password);
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
   for(const [field,value] of [[account,saved.username],[password,saved.password]]){
    setter.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
   }
  }
 }
 document.addEventListener('input',record,true);
 document.addEventListener('change',record,true);
 document.addEventListener('submit',record,true);
 addEventListener('DOMContentLoaded',()=>{fill();new MutationObserver(fill).observe(document.documentElement,{subtree:true,childList:true})});
})();
""".replace("DOMAINS", json.dumps(domains)).replace("SAVED", json.dumps(saved, ensure_ascii=False))
    context.add_init_script(script)
    return remembered

def grant_session(site, url, minutes=15, *, member=config.OWNER):
    """有头 Chrome 跑在 Xvfb 上给用户远程登录。用户点「我已登录」时先当场看一眼页面：
    还停在登录页就写一句说明、继续等，真进了站内才导出登录态。"""
    from playwright.sync_api import sync_playwright

    config.ensure_dirs()
    key = f"{site}--{member}"
    marker = config.RUN / f"grant-done-{key}"
    marker.unlink(missing_ok=True)
    clear_note(key)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            channel="chrome",
            headless=False,
            executable_path=config.CHROME if pathlib.Path(config.CHROME).exists() else None,
            args=LAUNCH_ARGS + [f"--window-size={config.VIEWPORT[0]},1000"],
        )
        context = _new_context(browser, site, (config.VIEWPORT[0], 950), member)
        remembered = _remember_login(context, site, member)
        page = context.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print(f"[grant] 首屏打开失败（不影响你手动导航）: {e}")

        deadline = time.time() + minutes * 60
        stable_since = None
        while time.time() < deadline:
            requested = marker.exists()
            if requested:
                marker.unlink(missing_ok=True)
            try:
                for candidate in reversed(context.pages):
                    if urlparse(candidate.url).hostname == urlparse(url).hostname:
                        page = candidate
                        break
                state = {"url": page.url, "text_len": len(_visible_text(page).strip()),
                         "login_form": page.locator('input[type="password"]:visible').count() > 0}
                ready = login_complete(state, url) and bool(context.cookies(url))
            except Exception:
                ready = False
            if ready:
                stable_since = stable_since or time.time()
                if time.time() - stable_since >= 5:
                    clear_note(key)
                    break
            else:
                stable_since = None
                if requested:
                    write_note(key, "登录还未完成，请在连接页面输入账号密码或扫码，成功后会自动保存。")
            page.wait_for_timeout(1000)
        else:
            write_note(key, f"授权会话超时（{minutes} 分钟），登录态没有保存。需要重新点「申请云端桌面」。")
            print("[grant] 超时未确认，本次授权作废，不保存登录态")
            marker.unlink(missing_ok=True)
            context.close()
            browser.close()
            return False

        try:
            _encrypted_json(site, member, context.storage_state())
            if remembered:
                _encrypted_json(site + "-credentials", member, remembered)
            print("[grant] 连接已加密保存")
            return True
        finally:
            marker.unlink(missing_ok=True)
            context.close()
            browser.close()
