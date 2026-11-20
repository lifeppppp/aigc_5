#!/usr/bin/env bash
# 把本地代码部署到阿里云 ECS。在 Git Bash 里运行：
#   ECS_IP=47.xx.xx.xx ECS_KEY=/c/Users/潘辰嘉/keys/xxx.pem ./deploy.sh
# 可选：ECS_USER（默认 root）、REMOTE_DIR（默认 /opt/groupintel）、PORT（默认 8000）
set -euo pipefail
cd "$(dirname "$0")"

: "${ECS_IP:?缺少 ECS_IP，例：ECS_IP=47.xx.xx.xx ./deploy.sh}"
: "${ECS_KEY:?缺少 ECS_KEY，填密钥文件的绝对路径（用 /c/... 这种写法）}"
ECS_USER=${ECS_USER:-root}
REMOTE_DIR=${REMOTE_DIR:-/opt/groupintel}
PORT=${PORT:-8000}

SSH="ssh -i $ECS_KEY -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"
TARGET="$ECS_USER@$ECS_IP"

echo "==> 1/4 连通性检查"
$SSH "$TARGET" "echo ok: \$(uname -srm)"

echo "==> 2/4 上传 server/ 与 web/"
$SSH "$TARGET" "mkdir -p $REMOTE_DIR/server $REMOTE_DIR/web"
tar -cf - server web .env.example | $SSH "$TARGET" "tar -xf - -C $REMOTE_DIR"

echo "==> 3/4 装依赖 + 首次生成 .env"
$SSH "$TARGET" "bash -s" <<REMOTE
set -e
export DEBIAN_FRONTEND=noninteractive
command -v pip3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3-pip > /dev/null; }
pip3 install -q --break-system-packages -r $REMOTE_DIR/server/requirements.txt 2>/dev/null \
  || pip3 install -q -r $REMOTE_DIR/server/requirements.txt
cp -f $REMOTE_DIR/.env.example $REMOTE_DIR/.env 2>/dev/null || true
[ -f $REMOTE_DIR/.env ] || echo 'DASHSCOPE_API_KEY=' > $REMOTE_DIR/.env
chmod 600 $REMOTE_DIR/.env
cp -f $REMOTE_DIR/server/groupintel.service /etc/systemd/system/groupintel.service
systemctl daemon-reload
systemctl enable --now groupintel >/dev/null 2>&1 || true
REMOTE

echo "==> 4/4 重启服务并自检"
$SSH "$TARGET" "systemctl restart groupintel && sleep 2 && systemctl is-active groupintel && curl -s http://127.0.0.1:$PORT/api/health"
echo
echo "如果 .env 里还没填百炼 Key，现在补上："
echo "  $SSH -t $TARGET 'nano $REMOTE_DIR/.env'   # 填 DASHSCOPE_API_KEY / CLIENT_TOKEN，然后 systemctl restart groupintel"
echo "别忘了在 ECS 安全组放行 $PORT/TCP，否则手机和组员访问不到。"
echo "部署完成后记一笔： python scripts/log_and_push.py --action 部署 --note '上传并重启中转服务'"
