#!/usr/bin/env python3
"""本地客户端启动器：连到 ECS 中转站，用独立窗口打开（看起来就是一个软件，不是网页标签）。

用法：
  python launcher.py                      # 首次会让你填服务器地址
  python launcher.py --server 47.xx.xx.xx --port 8000
  python launcher.py --check              # 只测连通性，不开窗口
"""

import argparse
import json
import pathlib
import platform
import subprocess
import sys
import urllib.request

CONFIG = pathlib.Path(__file__).resolve().parent / "config.json"
APP_NAME = "GroupIntel"


def load():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return {}


def save(cfg):
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def base_url(cfg):
    host = cfg.get("host", "").strip()
    port = cfg.get("port", "8000")
    scheme = cfg.get("scheme", "http")
    if host and not host.startswith(("http://", "https://")):
        host = f"{scheme}://{host}"
    if not host:
        host = f"http://{input('请输入服务器公网IP（例 47.xx.xx.xx）: ').strip()}:{port}"
        cfg["host"] = host
        save(cfg)
    return host.rstrip("/")


def health(url, timeout=6):
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"连接失败: {e}")
        return None


def find_browser():
    candidates = {
        "Windows": [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ],
        "Darwin": [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ],
        "Linux": ["/usr/bin/microsoft-edge", "/usr/bin/google-chrome", "/usr/bin/chromium"],
    }[platform.system()]
    for p in candidates:
        if pathlib.Path(p).exists():
            return p
    exe = {"Windows": "cmd", "Darwin": "open", "Linux": "xdg-open"}[platform.system()]
    fallback = {"Windows": r"C:\Windows\System32\cmd.exe", "Darwin": "/usr/bin/open", "Linux": "/usr/bin/xdg-open"}[platform.system()]
    return fallback if pathlib.Path(fallback).exists() else exe


def open_app_window(url):
    browser = find_browser()
    name = pathlib.Path(browser).name.lower()
    profile = pathlib.Path.home() / ".groupintel-profile"
    profile.mkdir(exist_ok=True)
    if "msedge" in name or "chrome" in name or "chromium" in name:
        # --app 模式：独立窗口、无地址栏，配合独立 user-data-dir 可单独收藏/固定任务栏
        subprocess.Popen([browser, f"--app={url}", f"--user-data-dir={profile}", "--window-size=1180,820"])
        print(f"已用独立窗口打开 {url}")
    else:
        import webbrowser
        webbrowser.open(url)
        print(f"没找到 Edge/Chrome，已用默认浏览器打开 {url}")
        print("提示：在浏览器地址栏右侧点「安装应用」可把它变成真正的桌面软件。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", help="服务器公网IP或域名")
    ap.add_argument("--port", default="8000")
    ap.add_argument("--token", default="", help="访问令牌，需与服务器 .env 的 CLIENT_TOKEN 一致")
    ap.add_argument("--check", action="store_true", help="只检测连通性")
    args = ap.parse_args()

    cfg = load()
    if args.server:
        cfg["host"] = args.server if args.server.startswith("http") else f"http://{args.server}:{args.port}"
    if args.token:
        cfg["token"] = args.token
    url = base_url(cfg)
    save(cfg)

    info = health(url)
    if not info:
        print("\n排查顺序：① 安全组是否放行端口 ② 服务是否在跑 systemctl status groupintel "
              "③ IP 是否写错。确认后再运行本程序。")
        sys.exit(1)
    print(f"服务器在线：模型 {info['model']}，百炼 Key 已配 {info['bailian_key_configured']}，"
          f"钉钉推送已配 {info['dingtalk_robot_configured']}")
    if info.get("bailian_key_configured") is False:
        print("注意：服务器还没填 DASHSCOPE_API_KEY，整理功能会报错。")
    if args.check:
        return
    open_app_window(url)
    if cfg.get("token"):
        print(f"记得在软件右上「设置」里填令牌（{cfg['token'][:4]}…）以通过鉴权。")


if __name__ == "__main__":
    main()
