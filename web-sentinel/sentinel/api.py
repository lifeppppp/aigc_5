"""web-sentinel 的 HTTP 接口，监听 8020。每人一把独立 token，verify 反查出是谁，
所有读接口都按这个人过滤——5 个组员的作业和成绩互不可见靠的是这里，不是前端。
"""

import asyncio
import pathlib
import re
import secrets
import subprocess
import sys
import time

import accounts
import browser
import config
import store
import vault
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Web Sentinel", version="0.1.0")
store.init()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify(x_client_token: str = Header(default=""), token: str = ""):
    """返回调用者对应的成员名。共享 ACCESS_TOKEN 仍然有效，代表 OWNER，
    这样现网前端不必先升级才能继续用。"""
    given = (x_client_token or "").strip() or (token or "").strip()
    members = config.read_members()
    if not config.ACCESS_TOKEN and not any((m.get("token") or "").strip() for m in members):
        raise HTTPException(status_code=503, detail="服务器未配置 SENTINEL_ACCESS_TOKEN / CLIENT_TOKEN")
    member = config.member_for_token(given)
    if not member and given and given == config.ACCESS_TOKEN:
        member = config.OWNER
    if not member:
        raise HTTPException(status_code=401, detail="令牌无效")
    return member


def _own_sites(sites, member):
    allow = config.sites_for(member)
    return [s for s in sites if not allow or s.get("name") in allow]


def _retired(feature: str, instead: str):
    """这一代接口还在路由表里，只是不再实现：给组员一个能照着走的说明，而不是裸 404。"""
    raise HTTPException(status_code=410, detail=f"{feature}已停用，请改用 {instead}")


class RunIn(BaseModel):
    site: str = ""
    force: bool = False
    mode: str = "full"


@app.get("/api/health")
def health(member: str = Depends(verify)):
    out = {
        "ok": True,
        "member": member,
        "label": config.label_for(member),
        "username": accounts.by_member(member),
        "time": store.now(),
        "model": config.VL_MODEL,
        "relay_configured": bool(config.CLIENT_TOKEN),
        "secret_configured": bool(config.SECRET) or bool(config.secret_for(member)),
        "sites": len(_own_sites(config.read_sites(), member)),
        "stats": store.stats(member=member),
    }
    if member == config.OWNER:
        # 每个人的 token 数只有管理员看得到，组员之间互相估算用量没必要
        out["usage_by_member"] = store.usage_by_member()
        out["members"] = config.members()
    return out


class RegisterIn(BaseModel):
    username: str
    password: str
    label: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/register")
def register(body: RegisterIn):
    """用户端注册：一人一个账号，同时生成这个人的成员令牌与登录态密钥。
    公开接口，靠账号总数上限与每人的每日额度兜住预算，不靠邀请码。"""
    try:
        return accounts.register(body.username, body.password, body.label)
    except accounts.AccountError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/login")
def login(body: LoginIn):
    try:
        return accounts.login(body.username, body.password)
    except accounts.AccountError as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.get("/api/session")
def session(member: str = Depends(verify)):
    """登录页回来时用令牌换一次身份，顺便告诉前端这个人是不是管理员。"""
    return {"member": member, "label": config.label_for(member),
            "username": accounts.by_member(member), "owner": member == config.OWNER}


@app.get("/api/feed")
def feed(site: str = "", limit: int = 40, unseen: int = 0, member: str = Depends(verify)):
    return {"items": store.feed(site, limit, include_seen=not unseen, member=member)}


@app.get("/api/shot/{name}")
def shot(name: str, member: str = Depends(verify)):
    p = (config.SHOTS / name).resolve()
    if p.parent != config.SHOTS.resolve() or not p.exists():
        raise HTTPException(status_code=404, detail="截图不存在")
    if not store.owns_shot(p.name, member=member):
        raise HTTPException(status_code=404, detail="截图不存在")
    return FileResponse(p)


@app.post("/api/feed/seen")
def seen():
    _retired("标记已读", "「情报」页签按未读过滤（/api/feed?unseen=1）")


@app.post("/api/snap")
def snap():
    _retired("手工上传截图", "云端抓取：/api/scan/run，或先在「连接」页授权")


@app.post("/api/sites")
def add_site():
    _retired("接口改站点清单", "管理员直接编辑服务器上的 sites.json（读时生效，不必重启）")


@app.post("/api/sites/remove")
def remove_site():
    _retired("接口删站点", "管理员直接编辑服务器上的 sites.json（读时生效，不必重启）")


@app.get("/api/sites")
def sites(member: str = Depends(verify)):
    return {"sites": _own_sites(config.read_sites(), member)}


@app.get("/api/auth/status")
def auth_status(member: str = Depends(verify)):
    db = store.auth_map(member=member)
    out = []
    for s in _own_sites(config.read_sites(), member):
        site = s.get("auth_site") or s.get("name")
        row = db.get(site, {})
        out.append({
            "site": s.get("name"),
            "label": s.get("label") or s.get("name"),
            "enabled": bool(s.get("enabled", True)),
            "auth_site": site,
            "needs_auth": bool(s.get("needs_auth", True)),
            "encrypted": vault.exists(site, member),
            "status": row.get("status", "unknown"),
            "note": row.get("note", ""),
            "updated": row.get("updated_at") or vault.fingerprint(site, member),
        })
    return {"auth": out, "member": member}


# ── 网页授权：组员在自己的浏览器里登录云端 Chrome，不需要 SSH，也不需要本机装 Python ──────
UNIT_SAFE = re.compile(r"^[A-Za-z0-9_.@-]{1,96}$")
TICKETS: dict = {}
TICKET_TTL = 180


class GrantIn(BaseModel):
    site: str


def _grant_site(name, member):
    """站点必须在这个人的清单里、确实需要登录态。成员名一律由 token 反查，绝不接收
    调用方传的成员名——否则任何人都能替别人起授权会话、把别人的桌面当成自己的看。"""
    hit = next((s for s in _own_sites(config.read_sites(), member)
                if s.get("name") == name and s.get("enabled", True)), None)
    if not hit:
        raise HTTPException(status_code=404, detail="站点不存在或不在你的清单里")
    if not hit.get("needs_auth", True):
        raise HTTPException(status_code=400, detail="这个站不需要登录态，无需授权")
    if not config.secret_for(member) and not config.SECRET:
        raise HTTPException(status_code=503,
                            detail="服务器还没给你配 Fernet 密钥，存不了登录态，请联系管理员")
    return hit["name"]


def _systemd(unit, *args, timeout=25):
    if not UNIT_SAFE.match(unit):
        raise HTTPException(status_code=400, detail="单元名不合法")
    return subprocess.run(["systemctl", *args, unit], capture_output=True,
                          text=True, timeout=timeout)


def _grant_state(name, member):
    """把「单元在不在跑 / ready 文件有没有口令和端口 / 登录态存下来没有」揉成一个状态，
    前端只认这个，不需要自己能读服务器文件。"""
    key = f"{name}--{member}"
    unit = f"web-sentinel-grant@{key}"
    lines: list = []
    try:
        lines = [x.strip() for x in (config.RUN / f"vnc-{key}.txt").read_text(
            encoding="utf-8").splitlines()]
    except OSError:
        pass
    try:
        active = _systemd(unit, "is-active", timeout=10).stdout.strip() == "active"
    except Exception:
        # 站名带空格/中文时单元名过不了校验，或 systemctl 根本不可用：
        # 只说明「桌面没在跑」，不该让整个状态接口报错
        active = False
    password = lines[0] if lines and lines[0] else ""
    novnc = int(lines[1]) if len(lines) > 1 and lines[1].isdigit() else 0
    rfb = int(lines[2]) if len(lines) > 2 and lines[2].isdigit() else 0
    try:
        log_tail = "\n".join((config.RUN / f"vnc-{key}.log").read_text(
            encoding="utf-8", errors="replace").splitlines()[-4:])
    except OSError:
        log_tail = ""
    row = store.auth_map(member=member).get(name, {})
    encrypted = vault.exists(name, member)
    if active and password and rfb:
        state = "ready"
    elif active:
        state = "queued"
    elif encrypted and row.get("status") == "ok":
        state = "saved"
    elif row.get("status") in ("expired", "error"):
        state = row["status"]
    else:
        state = "idle"
    # 授权会话里确认失败/成功的原因由 grantd/browser 写进 note 文件，比 store 里的状态更具体
    note = browser.note_of(key) or row.get("note", "")
    return {"state": state, "key": key, "unit": unit, "password": password, "rfb": rfb,
            "novnc": novnc, "encrypted": encrypted, "note": note, "log": log_tail}


@app.post("/api/grant/start")
def grant_start(body: GrantIn, member: str = Depends(verify)):
    name = _grant_site(body.site, member)
    # 上一轮的说明（没登录成功/已确认）从这一轮重新算，免得旧提示误导
    browser.clear_note(f"{name}--{member}")
    r = _systemd(f"web-sentinel-grant@{name}--{member}", "restart", "--no-block", timeout=20)
    if r.returncode:
        raise HTTPException(status_code=502,
                            detail=f"授权会话启动失败：{(r.stderr or r.stdout).strip()[:300]}")
    return {"ok": True, "site": name,
            "detail": "云端正在准备远程桌面；同时只有一个浏览器，前面有人授权时会排队"}


@app.get("/api/grant/status")
def grant_status(site: str, member: str = Depends(verify)):
    return _grant_state(_grant_site(site, member), member)


@app.post("/api/grant/ticket")
def grant_ticket(body: GrantIn, member: str = Depends(verify)):
    """浏览器建 WebSocket 带不了自定义头，而长令牌不能塞进 URL（会进访问日志和历史记录），
    所以换一枚只用一次、几分钟就失效的凭据，并把它绑死在这个人的槽位端口上。"""
    st = _grant_state(_grant_site(body.site, member), member)
    if st["state"] != "ready":
        raise HTTPException(status_code=409, detail=f"云端桌面还没就绪（当前 {st['state']}）")
    now = time.time()
    for dead in [k for k, v in TICKETS.items() if v["exp"] < now]:
        TICKETS.pop(dead, None)
    ticket = secrets.token_urlsafe(24)
    TICKETS[ticket] = {"member": member, "site": body.site, "rfb": st["rfb"], "exp": now + TICKET_TTL}
    return {"ticket": ticket, "password": st["password"], "ws": "/api/grant/ws", "ttl": TICKET_TTL}


@app.websocket("/api/grant/ws")
async def grant_ws(ws: WebSocket):
    """8020 的 WebSocket 直连 127.0.0.1 上这个人自己槽位的 RFB 端口。x11vnc 只听回环，
    对外仍然只有 8020 一个口，鉴权靠上面那枚 ticket，所以不用为远程桌面再开端口。"""
    rec = TICKETS.pop((ws.query_params.get("ticket") or "").strip(), None)
    if not rec or rec["exp"] < time.time():
        await ws.close(code=4403)
        return
    # noVNC 连接时带 Sec-WebSocket-Protocol: binary，按 RFC 6455 必须原样回一个，
    # 不回浏览器就直接掐断（1006）——裸 Python 客户端不带这个头，所以只有真页面会踩到
    offered = (ws.headers.get("sec-websocket-protocol") or "").split(",")[0].strip()
    await ws.accept(subprotocol=offered or None)
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", int(rec["rfb"]))
    except OSError as e:
        try:
            await ws.send_text(f"连云端桌面失败: {e}")
        except RuntimeError:
            pass
        await ws.close(code=4502)
        return

    async def to_desktop():
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            data = msg.get("bytes")
            if data is None and msg.get("text") is not None:
                data = msg["text"].encode()
            if data:
                writer.write(data)
                await writer.drain()

    async def to_browser():
        while True:
            data = await reader.read(65536)
            if not data:
                return
            await ws.send_bytes(data)

    tasks = [asyncio.ensure_future(to_desktop()), asyncio.ensure_future(to_browser())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            t.exception()
    finally:
        for t in tasks:
            t.cancel()
        writer.close()
        try:
            await ws.close()
        except RuntimeError:
            pass


@app.post("/api/grant/done")
def grant_done(body: GrantIn, member: str = Depends(verify)):
    name = _grant_site(body.site, member)
    st = _grant_state(name, member)
    if st["state"] not in ("ready", "queued"):
        raise HTTPException(status_code=409, detail=f"没有进行中的授权会话（当前 {st['state']}）")
    marker = config.RUN / f"grant-done-{st['key']}"
    marker.touch()
    marker.chmod(0o600)
    return {"ok": True, "detail": "已通知云端导出登录态，正在加密保存并回验"}


@app.post("/api/grant/stop")
def grant_stop(body: GrantIn, member: str = Depends(verify)):
    name = _grant_site(body.site, member)
    st = _grant_state(name, member)
    (config.RUN / f"grant-done-{st['key']}").unlink(missing_ok=True)
    browser.clear_note(st["key"])
    r = _systemd(st["unit"], "stop", timeout=40)
    return {"ok": r.returncode == 0,
            "detail": "已停止授权会话" if r.returncode == 0 else (r.stderr or "")[:200]}


@app.get("/grant")
def grant_page():
    page = config.WEB / "grant.html"
    if not page.exists():
        raise HTTPException(status_code=404, detail="授权页缺失：sentinel/web/grant.html")
    return FileResponse(page, media_type="text/html")


if pathlib.Path(config.NOVNC).is_dir():
    app.mount("/grant/novnc", StaticFiles(directory=config.NOVNC), name="novnc")


@app.post("/api/scan/run")
def run_now(body: RunIn, member: str = Depends(verify)):
    mode = body.mode if body.mode in ("fast", "full") else "full"
    # member 不接收调用方传入：谁点按钮就只跑谁自己的单元，否则等于任何人可以替别人刷登录态
    cmd = [sys.executable, str(pathlib.Path(__file__).parent / "scan.py"),
           "--mode", mode, "--member", member]
    if body.site:
        cmd += ["--site", body.site]
    if body.force:
        cmd.append("--force")
    log_path = config.DATA / ("poll.log" if mode == "fast" else "scan.log")
    log = open(log_path, "ab")
    cmd = ["/usr/bin/flock", "-w", "900", str(config.RUN / "scan.lock")] + cmd
    subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                     cwd=str(pathlib.Path(__file__).parent))
    label = "拍图看图" if mode == "full" else "只读正文"
    return {"ok": True, "detail": f"已在后台以 {member} 身份开始 {mode}（{label}）扫描，进度看 {log_path}"}


@app.exception_handler(Exception)
async def unhandled(request, exc):
    return JSONResponse(status_code=500, content={"detail": f"web-sentinel 内部错误: {exc}"})

class ProfileUpdate(BaseModel):
    label: str


class NameUpdate(BaseModel):
    username: str
    current_password: str


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


@app.post("/api/account/profile")
def account_profile(body: ProfileUpdate, member: str = Depends(verify)):
    try:
        return accounts.update_label(member, body.label)
    except accounts.AccountError as error:
        raise HTTPException(400, str(error))


@app.post("/api/account/name")
def account_name(body: NameUpdate, member: str = Depends(verify)):
    if len(body.current_password) > 4096:
        raise HTTPException(400, "当前密码过长")
    try:
        return accounts.update_credentials(member, body.current_password, username=body.username)
    except accounts.AccountError as error:
        raise HTTPException(400, str(error))


@app.post("/api/account/password")
def account_password(body: PasswordUpdate, member: str = Depends(verify)):
    if len(body.current_password) > 4096:
        raise HTTPException(400, "当前密码过长")
    try:
        return accounts.update_credentials(member, body.current_password, new_password=body.new_password)
    except accounts.AccountError as error:
        raise HTTPException(400, str(error))

class ConnectRefreshIn(BaseModel):
    force: bool = False


@app.post("/api/connect/refresh")
def connect_refresh(body: ConnectRefreshIn, member: str = Depends(verify)):
    """Confirm only this member's pending sessions, then schedule their first read."""
    import fcntl
    import json
    rows = []
    pending = False
    for item in _own_sites(config.read_sites(), member):
        if not item.get("enabled", True):
            continue
        site = item["name"]
        if not item.get("needs_auth", True):
            rows.append({"site": site, "label": item.get("label", site), "status": "connected", "fingerprint": 0})
            continue
        state = _grant_state(site, member)
        if state["state"] == "ready":
            marker = config.RUN / ("grant-done-" + state["key"])
            marker.touch(mode=0o600, exist_ok=True)
        waiting = state["state"] in ("ready", "queued")
        pending = pending or waiting
        connected = state["state"] == "saved"
        rows.append({"site": site, "label": item.get("label", site),
                     "status": "connected" if connected else "checking" if waiting else "disconnected",
                     "note": state.get("note", ""),
                     "fingerprint": vault.fingerprint(site, member) if connected else 0})
    connected = [row for row in rows if row["status"] == "connected"]
    started = False
    if connected and not pending:
        signature = json.dumps({row["site"]: row["fingerprint"] for row in connected}, sort_keys=True)
        lockpath = config.RUN / ("connect-refresh-" + vault.slug(member) + ".lock")
        record = config.RUN / ("connect-scan-" + vault.slug(member) + ".json")
        with open(lockpath, "a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                last = json.loads(record.read_text()) if record.exists() else {}
            except (ValueError, OSError):
                last = {}
            changed = last.get("signature") != signature
            if changed or (body.force and time.time() - last.get("time", 0) >= 15):
                run_now(RunIn(mode="fast"), member=member)
                tmp = record.with_suffix(".tmp")
                tmp.write_text(json.dumps({"signature": signature, "time": time.time()}))
                tmp.chmod(0o600)
                tmp.replace(record)
                started = True
    return {"connections": rows, "pending": pending, "scan_started": started}
