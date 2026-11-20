#!/usr/bin/env bash
# 在服务器上执行：只移除指定组员那一行公钥，其他人不受影响。
#   bash revoke_root_key.sh <账号名>
set -e
NAME=${1:?缺少账号名}
AK=${AK:-/root/.ssh/authorized_keys}

printf '%s' "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{1,31}$' || { echo "账号名不合法: $NAME" >&2; exit 2; }

[ -f "$AK" ] || { echo "root 还没有 authorized_keys，无需撤销"; exit 0; }

before=$(grep -c " dev:$NAME\$" "$AK" || true)
grep -Ev " dev:$NAME\$" "$AK" > "$AK.new" || true
mv "$AK.new" "$AK"
chmod 600 "$AK"

if [ "$before" = "0" ]; then
  echo "$NAME 本来就没有登记过公钥，未做任何改动；当前组员：$(grep -c ' dev:' "$AK" || true) 人"
else
  echo "已移除 $NAME（原本 $before 行）；剩余组员：$(grep -c ' dev:' "$AK" || true) 人"
fi
