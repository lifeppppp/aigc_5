#!/usr/bin/env bash
# 一键部署：在服务器上项目根目录执行 bash deploy.sh
set -e
cd "$(dirname "$0")"

PY=python3
command -v $PY >/dev/null || { echo "缺少 python3，请先安装（如 yum install -y python3 / apt install -y python3 python3-venv）"; exit 1; }

if [ ! -d venv ]; then
  $PY -m venv venv
fi
venv/bin/pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/
venv/bin/pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/

UNIT=/etc/systemd/system/school-info-hub.service
DIR=$(pwd)
sed "s|__DIR__|$DIR|g" school-info-hub.service > /tmp/school-info-hub.service
if command -v sudo >/dev/null; then SUDO=sudo; else SUDO=; fi
$SUDO cp /tmp/school-info-hub.service "$UNIT"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now school-info-hub
$SUDO systemctl restart school-info-hub

sleep 2
$SUDO systemctl --no-pager status school-info-hub | head -8
echo
echo "部署完成。浏览器访问 http://<服务器公网IP>:8010/"
echo "请确认阿里云安全组已放行 TCP 8010 端口（8000 已被 groupintel 服务占用）。"