"""把整理结果回写到钉钉群（自定义机器人 webhook，加签方式）。"""

import base64
import hashlib
import hmac
import os
import time
import urllib.parse

import requests


def configured():
    return bool(os.getenv("DINGTALK_ROBOT_WEBHOOK", "").strip())


def _signed_url():
    webhook = os.getenv("DINGTALK_ROBOT_WEBHOOK", "").strip()
    secret = os.getenv("DINGTALK_ROBOT_SECRET", "").strip()
    if not secret:
        return webhook
    ts = str(round(time.time() * 1000))
    digest = hmac.new(secret.encode(), f"{ts}\n{secret}".encode(), hashlib.sha256).digest()
    sign = urllib.parse.quote_plus(base64.b64encode(digest))
    sep = "&" if "?" in webhook else "?"
    return f"{webhook}{sep}timestamp={ts}&sign={sign}"


def send_markdown(title, text):
    if not configured():
        return False, "服务器未配置 DINGTALK_ROBOT_WEBHOOK"
    resp = requests.post(
        _signed_url(),
        json={"msgtype": "markdown", "markdown": {"title": title, "text": text}},
        timeout=15,
    )
    data = resp.json() if resp.content else {}
    if data.get("errcode") == 0:
        return True, "已推送到钉钉群"
    return False, f"钉钉返回: {str(data)[:200]}"
