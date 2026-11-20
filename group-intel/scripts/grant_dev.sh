#!/usr/bin/env bash
# 给组员开服务器权限。在你自己电脑上跑（组员只负责把公钥发给你）。
#
# 【模式一：各自公钥登 root】配合你们现在 FinalShell + root 的用法，只把"共用一把 .pem"换成"人人一把自己的钥匙"
#   ECS_IP=47.xx.xx.xx ECS_KEY=/c/Users/潘辰嘉/keys/xxx.pem ./scripts/grant_dev.sh addroot liming "ssh-ed25519 AAAA... 李明"
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh listroot     # 看登记了谁
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh delroot liming  # 撤销，只删他那一行
#
# 【模式二：独立账号 + sudo】想分清谁做了什么、要能单独掉权限时用这个
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh add liming "ssh-ed25519 AAAA... 李明"
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh del liming
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh list
#
# 公钥一律通过临时文件/stdin 传输，不拼进远程命令；账号名和公钥格式都先做白名单校验。
set -euo pipefail

: "${ECS_IP:?缺少 ECS_IP}"
: "${ECS_KEY:?缺少 ECS_KEY（你手里那把 .pem 的路径，用 /c/... 写法）}"
ECS_USER=${ECS_USER:-root}
PROJECT_DIR=${PROJECT_DIR:-/opt/groupintel}
SSH="ssh -i $ECS_KEY -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o ConnectTimeout=25"
TARGET="$ECS_USER@$ECS_IP"

MODE=${1:-}
NAME=${2:-}

# 账号名必须是合法 Linux 用户名，避免把任意字符串拼进远程命令
if [ -n "$NAME" ] && ! printf '%s' "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{1,31}$'; then
  echo "账号名不合法：要用小写字母开头的 2-32 位 [a-z0-9_-]，例：liming / wang-fang" >&2
  exit 2
fi

check_pubkey() {
  printf '%s' "$1" | grep -Eq '^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519@openssh\.com|ecdsa-sha2-nistp256@openssh\.com))[[:space:]]+[A-Za-z0-9/+=]+([[:space:]].*)?$'
}

sshd_status() {
  $SSH "$TARGET" "bash -s" <<'CHECK'
echo "--- sshd 现状 ---"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|pubkeyauthentication|passwordauthentication)' \
  || grep -Ei 'PermitRootLogin|PubkeyAuthentication|PasswordAuthentication' /etc/ssh/sshd_config
CHECK
}

case "$MODE" in
  addroot)
    PUB=${3:-}
    check_pubkey "$PUB" || { echo "公钥格式不对。让组员执行 cat ~/.ssh/id_ed25519.pub，把整行原样发给你。" >&2; exit 2; }
    echo "==> 登记 $NAME 的公钥到 root（一人一行，注释标 dev:$NAME，便于以后单独撤销）"
    HERE=$(cd "$(dirname "$0")" && pwd)
    printf '%s\n' "$PUB" | $SSH "$TARGET" "cat > /tmp/gi_pub.$NAME.tmp"
    $SSH "$TARGET" "bash -s -- '$NAME' '/tmp/gi_pub.$NAME.tmp'" < "$HERE/remote/grant_root_key.sh"
    $SSH "$TARGET" "rm -f '/tmp/gi_pub.$NAME.tmp'"
    $SSH "$TARGET" "bash -s" < "$HERE/remote/list_root_keys.sh"
    cat <<EOF

告诉 $NAME 在 FinalShell 里这样连（不同版本入口名称略有差异，找不到就用命令行，效果一样）：
    1) 先在自己电脑上生成密钥对：ssh-keygen -t ed25519 -C "$NAME"
    2) FinalShell → 连接设置（编辑该主机）→ 认证方式选「公钥」→ 选择/导入他的私钥文件
       （私钥是 ~/.ssh/id_ed25519 那个没有 .pub 的文件；FinalShell 的密钥管理里也能直接生成）
    3) 用户名 root，主机 $ECS_IP，端口 22
   命令行等价写法：ssh -i ~/.ssh/id_ed25519 root@$ECS_IP
EOF
    echo "记一笔：python scripts/log_and_push.py --action 修改 --note '开通组员 $NAME 的 root 公钥登录'"
    ;;

  delroot)
    echo "==> 从 root 移除 $NAME 的公钥（其他人不受影响）"
    $SSH "$TARGET" "bash -s -- '$NAME'" < "$(cd "$(dirname "$0")" && pwd)/remote/revoke_root_key.sh"
    ;;

  listroot)
    $SSH "$TARGET" "bash -s" < "$(cd "$(dirname "$0")" && pwd)/remote/list_root_keys.sh"
    ;;

  add)
    PUB=${3:-}
    check_pubkey "$PUB" || { echo "公钥格式不对。让组员执行 cat ~/.ssh/id_ed25519.pub，把输出的一整行原样发给你。" >&2; exit 2; }

    echo "==> 1/3 在服务器上建账号 $NAME（独立账号 + sudo，权限和你平行，但能分清谁做了什么、能单独撤销）"
    $SSH "$TARGET" "bash -s -- '$NAME' '$PROJECT_DIR'" <<'REMOTE'
set -e
NAME=$1; DIR=$2
id "$NAME" >/dev/null 2>&1 || useradd -m -s /bin/bash "$NAME"
install -d -m 700 -o "$NAME" -g "$NAME" "/home/$NAME/.ssh"
touch "/home/$NAME/.ssh/authorized_keys"; chmod 600 "/home/$NAME/.ssh/authorized_keys"
chown "$NAME:$NAME" "/home/$NAME/.ssh/authorized_keys"

getent group dev >/dev/null || groupadd dev
usermod -aG dev "$NAME"

# 让项目目录全组可写，新建文件自动继承 dev 组（setgid）
[ -d "$DIR" ] && { chgrp -R dev "$DIR" 2>/dev/null || true; chmod -R g+rwX "$DIR"; find "$DIR" -type d -exec chmod g+s {} + 2>/dev/null || true; }

# sudo 组名：Ubuntu/Debian 用 sudo，Alibaba Cloud Linux/CentOS 用 wheel
if getent group sudo >/dev/null 2>&1; then usermod -aG sudo "$NAME"
elif getent group wheel >/dev/null 2>&1; then usermod -aG wheel "$NAME"
else echo "警告：没找到 sudo/wheel 组，需要手动给 $NAME 授权"; fi

grep -Eq '^%sudo[[:space:]+].*NOPASSWD|^%wheel[[:space:]+].*NOPASSWD' /etc/sudoers 2>/dev/null \
  || echo "提示：$NAME 首次 sudo 要输密码（需你先 passwd $NAME 或配 NOPASSWD）"
echo "账号就绪：$NAME"
REMOTE

    echo "==> 2/3 写入公钥（已存在则不重复）"
    printf '%s\n' "$PUB" | $SSH "$TARGET" \
      "cat >> '/home/$NAME/.ssh/authorized_keys' && sort -u -o '/home/$NAME/.ssh/authorized_keys' '/home/$NAME/.ssh/authorized_keys' && chmod 600 '/home/$NAME/.ssh/authorized_keys' && chown -R '$NAME:$NAME' '/home/$NAME/.ssh' && wc -l < '/home/$NAME/.ssh/authorized_keys'" \
      | sed 's/^/   该账号下授权公钥数: /'

    echo "==> 3/3 自检 sshd 是否允许公钥登录"
    sshd_status
    cat <<EOF

告诉 $NAME 在自己电脑上执行（Windows 用 Git Bash）：
    ssh $NAME@$ECS_IP
进去之后：
    cd $PROJECT_DIR/server && python3 -m uvicorn app:app --host 0.0.0.0 --port 8000   # 调试用
    sudo systemctl restart groupintel                                                  # 重启正式服务
EOF
    echo "记一笔：python scripts/log_and_push.py --action 修改 --note '开通组员 $NAME 的服务器开发权限'"
    ;;

  del)
    echo "==> 撤销 $NAME（只动他一个人，其他人不受影响）"
    $SSH "$TARGET" "bash -s -- '$NAME'" <<'REMOTE'
set -e
NAME=$1
usermod -L "$NAME" 2>/dev/null || true
rm -f "/home/$NAME/.ssh/authorized_keys"
getent group dev >/dev/null && gpasswd -d "$NAME" dev >/dev/null 2>&1 || true
echo "已禁用并清空公钥：$NAME（账号目录保留，确认无用了再 userdel -r）"
REMOTE
    ;;

  list)
    echo "==> 服务器上现有账号与 dev 组成员"
    $SSH "$TARGET" "bash -s" <<'REMOTE'
echo '--- 可登录的账号 ---'
awk -F: '$3>=1000 && $7!~/nologin|false/ {print "  " $1 "  " $6}' /etc/passwd
echo '--- dev 组 ---'
getent group dev || echo '  (还没有)'
echo '--- 各账号公钥条数 ---'
for f in /home/*/.ssh/authorized_keys; do [ -f "$f" ] && echo "  $f: $(wc -l < "$f") 条"; done
REMOTE
    ;;

  *)
    sed -n '2,18p' "$0"
    exit 2
    ;;
esac
