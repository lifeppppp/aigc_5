"""一次云端授权会话：Xvfb 虚拟屏 + x11vnc + noVNC，有头 Chrome 给你远程登录。

只在授权期间运行，noVNC 绑 127.0.0.1，靠本地 SSH 隧道访问，不对外开端口。
多人版按「站点--成员」实例化，虚拟屏与端口走槽位，登录态加密到各自的文件。
"""

import argparse
import os
import pathlib
import secrets
import signal
import socket
import string
import subprocess
import sys
import time

import browser
import config
import store
import vault

NOVNC_WEB = "/usr/share/novnc"
SCREEN = "1300x1080x24"
SLOTS = 4
procs = []
logfile = None
site = ""
member = ""
dnum = ""


def log(msg):
    print(f"[grant] {msg}", flush=True)


def spawn(name, cmd, **kw):
    p = subprocess.Popen(cmd, stdout=logfile, stderr=subprocess.STDOUT, **kw)
    procs.append((name, p))
    return p


def alive(display_sock):
    """不能只看 /tmp/.X11-unix/X{n} 在不在：Xvfb 被 SIGKILL 后套接字和锁文件都留着，
    把僵尸显示当成「有人在用」会让 pick_slot 一路往后偏，还会去复用起不来的显示。"""
    if not pathlib.Path(f"/tmp/.X11-unix/X{display_sock}").exists():
        return False
    for entry in pathlib.Path("/proc").glob("[0-9]*/cmdline"):
        try:
            argv = entry.read_bytes().decode("utf-8", "replace").split("\x00")
        except OSError:
            continue
        if argv and argv[0].endswith("Xvfb") and f":{display_sock}" in argv:
            return True
    return False


def slot_ports(slot):
    """槽位 n → 显示 :1n、RFB 5900+10n、noVNC 6080+n。
    x11vnc 不像 Xvnc 那样按显示号加偏移，不给 -rfbport 它就一律监听 5900，
    两个槽位就会撞在同一个端口上，第二个会话永远等不到 → 只能显式传。"""
    n = max(0, min(int(slot or 0), SLOTS - 1))
    return f":1{n}", 5900 + n * 10, 6080 + n


def taken(host, port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def pick_slot():
    for n in range(SLOTS):
        display, vnc, novnc = slot_ports(n)
        if not alive(display[1:]) and not taken("127.0.0.1", vnc) and not taken("127.0.0.1", novnc):
            return n
    return None


def cleanup():
    for name, p in reversed(procs):
        try:
            if p.poll() is None:
                p.terminate()
        except Exception:
            pass
    for _ in range(10):
        if all(p.poll() is not None for _, p in procs):
            break
        time.sleep(0.4)
    for name, p in procs:
        try:
            if p.poll() is None:
                p.kill()
        except Exception:
            pass
    # VNC 口令留在盘上就是现成的入侵入口，退出时必须删干净
    key = f"{site}--{member}"
    for f in (config.RUN / f"x11vnc-{dnum}.pw", config.RUN / f"vnc-{key}.txt",
              config.RUN / f"grant-done-{key}"):
        f.unlink(missing_ok=True)


def make_password():
    # VNC 的 DES 认证只校验前 8 位，长度就取 8，避免「密码看起来对却连不上」。
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def wait_port(host, port, seconds=20):
    end = time.time() + seconds
    while time.time() < end:
        if taken(host, port):
            return True
        time.sleep(0.5)
    return False


def main():
    global site, member, dnum, logfile
    ap = argparse.ArgumentParser()
    ap.add_argument("--grant-id", default="", help="systemd 实例名，形如 hdu-i--chenjia")
    ap.add_argument("--site", default="")
    ap.add_argument("--member", default="")
    ap.add_argument("--url", default="")
    ap.add_argument("--minutes", type=int, default=15)
    ap.add_argument("--slot", type=int, default=-1, help="-1 表示自动挑空闲槽位")
    args = ap.parse_args()

    if args.grant_id:
        site, _, member = args.grant_id.partition("--")
    site = args.site or site
    member = args.member or member or config.OWNER
    if not site:
        print("用法：grantd.py --grant-id 站点--成员  或  --site 站点 --member 成员")
        return 1

    key = f"{site}--{member}"
    store.init()
    config.ensure_dirs()
    logfile = open(config.RUN / f"vnc-{key}.log", "a", buffering=1,
                   encoding="utf-8", errors="replace")
    found = [s for s in config.read_sites() if s.get("name") == site]
    url = args.url or (found[0].get("url") if found else "")
    if not url:
        log(f"站点 {site} 没有可用网址，请用 --url 指定")
        return 1

    slot = args.slot if args.slot >= 0 else pick_slot()
    if slot is None:
        log(f"{SLOTS} 个槽位都被占了，先清理残留：systemctl list-units 'web-sentinel-grant@*'")
        return 1
    display, rfb, novnc = slot_ports(slot)
    dnum = display[1:].split(".")[0]
    log(f"{key} 使用槽位 {slot}：{display} / {rfb} / {novnc}")

    if not alive(dnum):
        log(f"启动 Xvfb {display}")
        spawn("Xvfb", ["Xvfb", display, "-screen", "0", SCREEN, "-ac"],
              env={**os.environ, "DISPLAY": display})
        for _ in range(20):
            if alive(dnum):
                break
            time.sleep(0.5)
        if not alive(dnum):
            log("Xvfb 未能启动")
            return 1
    else:
        log(f"复用已有虚拟屏 {display}")

    os.environ["DISPLAY"] = display

    passfile = config.RUN / f"x11vnc-{dnum}.pw"
    password = make_password()
    passfile.write_text(password + "\n", encoding="utf-8")
    passfile.chmod(0o600)

    log(f"启动 x11vnc（仅监听 127.0.0.1:{rfb}）")
    spawn("x11vnc", ["x11vnc", "-display", display, "-rfbport", str(rfb),
                     "-passwdfile", str(passfile),
                     "-localhost", "-forever", "-shared", "-quiet", "-noxdamage"],
          env={**os.environ, "DISPLAY": display})
    if not wait_port("127.0.0.1", rfb, 20):
        log(f"x11vnc 未能监听 {rfb}")
        return 1

    log(f"启动 noVNC http://127.0.0.1:{novnc}")
    spawn("websockify", ["websockify", "--web=" + NOVNC_WEB,
                         f"127.0.0.1:{novnc}", f"127.0.0.1:{rfb}"])
    if not wait_port("127.0.0.1", novnc, 20):
        log("websockify 未能启动")
        return 1

    info = config.RUN / f"vnc-{key}.txt"
    # 第二行给 SSH CLI 建隧道用；第三行是 x11vnc 的 TCP 端口，8020 上的网页授权自带
    # WebSocket↔TCP 代理，直连 RFB 比再套一层 websockify 少一跳。槽位是动态挑的，客户端不能猜。
    info.write_text(f"{password}\n{novnc}\n{rfb}\n", encoding="utf-8")
    info.chmod(0o600)
    log("虚拟桌面已就绪，正在打开云端 Chrome，请在远程窗口里登录")

    try:
        if not browser.grant_session(site, url, minutes=args.minutes, member=member):
            log("用户未在时限内确认登录，登录态未保存")
            store.set_auth(site, "expired", "授权超时未确认", member=member)
            return 1
    except Exception as e:
        log(f"授权会话异常: {e}")
        store.set_auth(site, "error", str(e)[:200], member=member)
        return 1

    target = found[0] if found else {"url": url}
    auth_site = target.get("auth_site") or site
    label = target.get("label") or site
    try:
        state = browser.open_state(target.get("url") or url, auth_site, member=member)
        log(f"登录态校验：{state['url'][:120]} | {state['title'][:60]} | {state['text_len']} 字")
        if not browser.login_complete(state, target.get("url") or url):
            # 存下的是登录页的 cookie，拿它去扫描只会得到空正文；干脆删掉免得误导
            vault.remove(auth_site, member)
            browser.write_note(key, f"没确认到登录态：保存后回验又落回登录页 {state['url'][:80]}。"
                                    "请重新申请桌面，登录到站内页面后再点确认。")
            store.set_auth(auth_site, "expired",
                           "登录态没存住：回验时仍在登录页", member=member)
            return 1
        browser.write_note(key, f"登录态已确认，{label} 已加入扫描。")
        store.set_auth(auth_site, "ok", f"校验于 {store.now()}", member=member)
    except Exception as e:
        log(f"登录态校验失败: {e}")
        store.set_auth(auth_site, "error", f"登录态已保存但校验失败：{str(e)[:160]}", member=member)
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        sys.exit(main())
    finally:
        cleanup()
