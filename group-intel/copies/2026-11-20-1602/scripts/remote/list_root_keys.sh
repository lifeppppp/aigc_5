#!/usr/bin/env bash
# 在服务器上执行：列出已登记的组员公钥（只显示指纹前缀，不打印完整公钥）+ sshd 关键配置现状。
AK=${AK:-/root/.ssh/authorized_keys}

echo "--- root 已登记的组员 ---"
if [ -f "$AK" ]; then
  awk 'NF>=3 && $3 ~ /^dev:/ {print "  " substr($3,5) "  (" $1 " " substr($2,1,10) "…" substr($2, length($2)-7, 8) ")"}' "$AK"
  echo "  文件共 $(wc -l < "$AK") 行（可能含你自己的历史条目）"
else
  echo "  (还没有 $AK)"
fi

echo "--- sshd 现状 ---"
sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|pubkeyauthentication|passwordauthentication)' \
  || grep -Ei '^\s*(PermitRootLogin|PubkeyAuthentication|PasswordAuthentication)' /etc/ssh/sshd_config 2>/dev/null \
  || echo "  (读不到 sshd 配置，需 root 权限)"
