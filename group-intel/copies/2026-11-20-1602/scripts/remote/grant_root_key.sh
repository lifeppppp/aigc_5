#!/usr/bin/env bash
# 在服务器上执行：把一名组员的公钥登记进 root，一人一行（注释 dev:<名字>），重复执行不会产生重复行。
#   bash grant_root_key.sh <账号名> <公钥临时文件>
# 测试用可覆盖目标文件：AK=/tmp/fake_ak bash grant_root_key.sh ...
set -e
NAME=${1:?缺少账号名}
PUBFILE=${2:?缺少公钥文件}
AK=${AK:-/root/.ssh/authorized_keys}
DIR=$(dirname "$AK")

printf '%s' "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{1,31}$' || { echo "账号名不合法: $NAME" >&2; exit 2; }

umask 077
mkdir -p "$DIR"
touch "$AK"

# 先剔除该组员已有的旧公钥，再写入新公钥（规范化注释，丢弃组员自己乱填的 comment）
grep -Ev " dev:$NAME\$" "$AK" > "$AK.new" || true
read -r K1 K2 _ < "$PUBFILE"
[ -n "$K1" ] && [ -n "$K2" ] || { echo "公钥内容不完整: $PUBFILE" >&2; rm -f "$AK.new"; exit 2; }
printf '%s %s dev:%s\n' "$K1" "$K2" "$NAME" >> "$AK.new"
mv "$AK.new" "$AK"
chmod 700 "$DIR"; chmod 600 "$AK"

FP=$(printf '%s' "$K2" | awk '{print substr($0,1,10) "…" substr($0, length($0)-7, 8)}')
echo "已登记：$NAME -> $K1 $FP"
echo "root 下组员公钥数：$(grep -c ' dev:' "$AK" || true)"
