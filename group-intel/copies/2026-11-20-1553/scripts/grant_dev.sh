#!/usr/bin/env bash
# 给组员开服务器开发权限。在你自己电脑上跑（组员只负责把公钥发给你）。
#
#   ECS_IP=47.xx.xx.xx ECS_KEY=/c/Users/潘辰嘉/keys/xxx.pem ./scripts/grant_dev.sh add liming "ssh-ed25519 AAAA... 李明"
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh del liming        # 撤销：只动他一个人
#   ECS_IP=... ECS_KEY=... ./scripts/grant_dev.sh list
#
# 做的事：建独立账号 + 装他的公钥 + 加入 dev 组可编辑 /opt/groupintel + 给 sudo（权限与你平行）
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

case "$MODE" in
  add)
    PUB=${3:-}
    # 公钥格式严格校验；正文只走 stdin，绝不拼进远程命令，杜绝注入
    if ! printf '%s' "$PUB" | grep -Eq '^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519@openssh\.com|ecdsa-sha2-nistp256@openssh\.com))[[:space:]]+[A-Za-z0-9/+=]+([[:space:]].*)?$'; then
      echo "公钥格式不对。让组员执行 cat ~/.ssh/id_ed25519.pub，把输出的一整行原样发给你。" >&2
      exit 2
    fi

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
  || echo "提示：$NAME 首次 sudo 要输密码（密码默认无，需你先 passwd $NAME 或配 NOPASSWD）"
echo "账号就绪：$NAME"
REMOTE

    echo "==> 2/3 写入公钥（已存在则不重复）"
    printf '%s\n' "$PUB" | $SSH "$TARGET" \
      "cat >> '/home/$NAME/.ssh/authorized_keys' && sort -u -o '/home/$NAME/.ssh/authorized_keys' '/home/$NAME/.ssh/authorized_keys' && chmod 600 '/home/$NAME/.ssh/authorized_keys' && chown -R '$NAME:$NAME' '/home/$NAME/.ssh' && wc -l < '/home/$NAME/.ssh/authorized_keys'" \
      | sed 's/^/   该账号下授权公钥数: /'

    echo "==> 3/3 自检 sshd 是否允许公钥登录"
    $SSH "$TARGET" "sshd -T 2>/dev/null | grep -Ei '^(pubkeyauthentication|passwordauthentication|permitrootlogin|usepam)' || grep -Ei 'PubkeyAuthentication|PasswordAuthentication' /etc/ssh/sshd_config"
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
    $SSH "$TARGET" "echo '--- 可登录的账号 ---'; awk -F: '\$3>=1000 && \$7!~/nologin|false/ {print \$1\"  \"\$6}' /etc/passwd; echo '--- dev 组 ---'; getent group dev || echo '(还没有)'; echo '--- 各账号公钥条数 ---'; for f in /home/*/.ssh/authorized_keys; do [ -f \"\$f\" ] && echo \"\$f: \$(wc -l < \"\$f\") 条\"; done"
    ;;

  *)
    sed -n '2,12p' "$0"
    exit 2
    ;;
esac
