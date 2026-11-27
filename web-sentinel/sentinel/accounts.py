"""一人一个账号。账号只解决「谁是谁」：用户名 + 密码 → 成员名；
密码只存 scrypt 派生值，成员令牌与登录态密钥仍然只存在 members.json（600）。

注册会真的往 members.json 追加一条成员，所以新账号立刻能用情报与授权，
不需要重启服务——config.read_members() 每次请求都重读文件。
"""

import contextlib
import fcntl
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time

import config
from cryptography.fernet import Fernet

ACCOUNTS = config.HOME / "accounts.json"
LOCK = config.HOME / ".accounts.lock"
USERNAME = re.compile(r"^[a-z][a-z0-9_-]{2,23}$")
PW_MIN = 8
SCRYPT_N = 2 ** 14
FAIL_LIMIT = 5
LOCK_SEC = 60
MAX_ACCOUNTS = int(os.getenv("SENTINEL_MAX_ACCOUNTS", "8"))


class AccountError(RuntimeError):
    pass


def _read():
    if not ACCOUNTS.exists():
        return {"version": 1, "accounts": {}}
    try:
        raw = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    except ValueError:
        raise AccountError("accounts.json 损坏，请管理员检查")
    raw.setdefault("accounts", {})
    return raw


def _write(data):
    ACCOUNTS.parent.mkdir(parents=True, exist_ok=True)
    tmp = ACCOUNTS.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(ACCOUNTS)


@contextlib.contextmanager
def _locked():
    config.HOME.mkdir(parents=True, exist_ok=True)
    fh = open(LOCK, "a+")
    try:
        fcntl.flock(fh, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fh, fcntl.LOCK_UN)
        fh.close()


def _hash(password, salt_hex, n=SCRYPT_N):
    return hashlib.scrypt((password or "").encode("utf-8"), salt=bytes.fromhex(salt_hex),
                          n=n, r=8, p=1, dklen=32).hex()


def _norm(username):
    return (username or "").strip().lower()


def _append_member(name, label):
    """往 members.json 追加一条成员，返回新条目。原子替换，保留原有条目与其他顶层键。"""
    raw = {}
    if config.MEMBERS.exists():
        try:
            raw = json.loads(config.MEMBERS.read_text(encoding="utf-8"))
        except ValueError:
            raise AccountError("members.json 损坏，拒绝写入")
    lst = raw.get("members", raw if isinstance(raw, list) else [])
    if not isinstance(lst, list):
        raise AccountError("members.json 结构异常，拒绝写入")
    entry = {
        "name": name,
        "label": label or name,
        "token": secrets.token_urlsafe(16),
        "secret": Fernet.generate_key().decode(),
        "sites": [],
        "enabled": True,
    }
    lst.append(entry)
    out = raw if isinstance(raw, dict) else {}
    out["members"] = lst
    tmp = config.MEMBERS.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(config.MEMBERS)
    return entry


def register(username, password, label=""):
    name = _norm(username)
    if not USERNAME.match(name):
        raise AccountError("用户名要 3-24 位，小写字母开头，只能用小写字母、数字、下划线和短横线")
    if len(password or "") < PW_MIN:
        raise AccountError(f"密码至少 {PW_MIN} 位")
    with _locked():
        data = _read()
        if name in data["accounts"]:
            raise AccountError("这个用户名已经被注册了")
        if len(data["accounts"]) >= MAX_ACCOUNTS:
            raise AccountError(f"账号数已满（上限 {MAX_ACCOUNTS} 个），请联系管理员")
        if any(m.get("name") == name for m in config.read_members()):
            raise AccountError("这个用户名已在成员表里，请换一个或让管理员为它建账号")
        salt = secrets.token_hex(16)
        member = _append_member(name, (label or "").strip())
        data["accounts"][name] = {
            "member": name,
            "salt": salt,
            "hash": _hash(password, salt),
            "n": SCRYPT_N,
            "created": int(time.time()),
            "last": 0,
            "failed": 0,
            "locked_until": 0,
        }
        _write(data)
    return {"username": name, "member": name, "label": member["label"], "token": member["token"]}


def login(username, password):
    name = _norm(username)
    now = time.time()
    with _locked():
        data = _read()
        acc = data["accounts"].get(name)
        if not acc:
            # 用户名不存在也做一次等价耗时的派生，别让响应时间泄露谁是真人
            _hash(password, "00" * 16)
            raise AccountError("用户名或密码不对")
        if acc.get("locked_until", 0) > now:
            raise AccountError(f"试错次数太多，{int(acc['locked_until'] - now) + 1} 秒后再试")
        if not hmac.compare_digest(_hash(password, acc["salt"]), acc.get("hash", "")):
            acc["failed"] = acc.get("failed", 0) + 1
            if acc["failed"] >= FAIL_LIMIT:
                acc["locked_until"] = now + LOCK_SEC
                acc["failed"] = 0
            _write(data)
            raise AccountError("用户名或密码不对")
        token = config.token_for(acc["member"])
        if not token:
            raise AccountError("这个账号的成员令牌丢了，请联系管理员")
        acc["failed"] = 0
        acc["locked_until"] = 0
        acc["last"] = int(now)
        _write(data)
    return {"username": name, "member": acc["member"],
            "label": config.label_for(acc["member"]), "token": token}


def by_member(member):
    for name, acc in _read()["accounts"].items():
        if acc.get("member") == member:
            return name
    return ""


def _remove_member(name):
    if not config.MEMBERS.exists():
        return
    raw = json.loads(config.MEMBERS.read_text(encoding="utf-8"))
    lst = raw.get("members", raw if isinstance(raw, list) else [])
    out = raw if isinstance(raw, dict) else {}
    out["members"] = [m for m in lst if m.get("name") != name]
    tmp = config.MEMBERS.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    os.chmod(tmp, 0o600)
    tmp.replace(config.MEMBERS)


def create(username, password, label="", member=""):
    """管理员在服务器上用：为已有成员（如 OWNER）建账号，或新开一个成员。"""
    name = _norm(username)
    if not USERNAME.match(name):
        raise AccountError("用户名要 3-24 位，小写字母开头，只能用小写字母、数字、下划线和短横线")
    if len(password or "") < PW_MIN:
        raise AccountError(f"密码至少 {PW_MIN} 位")
    with _locked():
        data = _read()
        target = (member or name).strip().lower()
        if not USERNAME.match(target):
            raise AccountError("成员名不合法")
        exists = any(m.get("name") == target for m in config.read_members())
        if name in data["accounts"]:
            raise AccountError("这个用户名已经有账号了")
        if not exists:
            _append_member(target, (label or "").strip())
        salt = secrets.token_hex(16)
        data["accounts"][name] = {
            "member": target,
            "salt": salt,
            "hash": _hash(password, salt),
            "n": SCRYPT_N,
            "created": int(time.time()),
            "last": 0,
            "failed": 0,
            "locked_until": 0,
        }
        _write(data)
    return {"username": name, "member": target}


def change(username, password):
    """改密码：换新盐重算派生值，顺带清掉失败计数和锁定。"""
    name = _norm(username)
    if len(password or "") < PW_MIN:
        raise AccountError(f"密码至少 {PW_MIN} 位")
    with _locked():
        data = _read()
        acc = data["accounts"].get(name)
        if not acc:
            raise AccountError("没有这个账号")
        salt = secrets.token_hex(16)
        acc["salt"] = salt
        acc["hash"] = _hash(password, salt)
        acc["n"] = SCRYPT_N
        acc["failed"] = 0
        acc["locked_until"] = 0
        _write(data)
    return {"username": name, "member": acc["member"]}


def delete(username):
    name = _norm(username)
    with _locked():
        data = _read()
        acc = data["accounts"].pop(name, None)
        if not acc:
            raise AccountError("没有这个账号")
        _write(data)
    return acc


def _cli(argv):
    import getpass
    if not argv or argv[0] in ("list", "ls"):
        data = _read()
        if not data["accounts"]:
            print("还没有账号")
        for name, acc in sorted(data["accounts"].items()):
            last = acc.get("last") or 0
            when = time.strftime("%Y-%m-%d %H:%M", time.localtime(last)) if last else "从未登录"
            print(f"{name:<20} → 成员 {acc['member']:<20} {when}")
        return 0
    if argv[0] == "add":
        if len(argv) < 2:
            print("用法：accounts.py add <用户名> [--label 显示名] [--member 已有成员]")
            return 2
        label = ""
        member = ""
        rest = argv[2:]
        for i, a in enumerate(rest):
            if a == "--label" and i + 1 < len(rest):
                label = rest[i + 1]
            if a == "--member" and i + 1 < len(rest):
                member = rest[i + 1]
        pw = getpass.getpass("密码（输入时不回显）：")
        if pw != getpass.getpass("再输一遍："):
            print("两次输入不一致")
            return 2
        info = create(argv[1], pw, label, member)
        print(f"已建账号 {info['username']} → 成员 {info['member']}")
        return 0
    if argv[0] == "passwd":
        if len(argv) < 2:
            print("用法：accounts.py passwd <用户名>")
            return 2
        pw = getpass.getpass("新密码（输入时不回显）：")
        if pw != getpass.getpass("再输一遍："):
            print("两次输入不一致")
            return 2
        info = change(argv[1], pw)
        print(f"已改密码 {info['username']} → 成员 {info['member']}")
        return 0
    if argv[0] == "delete":
        if len(argv) < 2:
            print("用法：accounts.py delete <用户名>")
            return 2
        acc = delete(argv[1])
        print(f"已删除账号 {argv[1]}（成员 {acc['member']} 仍保留在 members.json，如要一并删除请用 install.sh 的成员管理或手改）")
        return 0
    print("用法：accounts.py [list | add <用户名> [--label 名] [--member 成员] | passwd <用户名> | delete <用户名>]")
    return 2


if __name__ == "__main__":
    sys.path.insert(0, str(config.HOME / "sentinel"))
    sys.exit(_cli(sys.argv[1:]))
def update_label(member, label):
    label = (label or "").strip()
    if not label or len(label) > 40:
        raise AccountError("显示名称需要 1-40 个字符")
    with _locked():
        raw = json.loads(config.MEMBERS.read_text(encoding="utf8"))
        rows = raw.get("members", []) if isinstance(raw, dict) else raw
        target = next((row for row in rows if row.get("name") == member), None)
        if target is None:
            raise AccountError("账号不存在，请重新登录")
        target["label"] = label
        tmp = config.MEMBERS.with_suffix(".tmp")
        tmp.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf8")
        os.chmod(tmp, 0o600)
        tmp.replace(config.MEMBERS)
    return {"label": label, "username": by_member(member)}


def update_credentials(member, current_password, username=None, new_password=None):
    """Keep the stable member ID while updating the login name or password."""
    name = by_member(member)
    if not name:
        raise AccountError("当前成员没有登录账号，请联系管理员")
    login(name, current_password)  # Reuse failed-attempt throttling and password verification.
    with _locked():
        data = _read()
        acc = data["accounts"].get(name)
        if not acc or not hmac.compare_digest(_hash(current_password, acc["salt"]), acc["hash"]):
            raise AccountError("账号信息已变化，请重新登录")
        new_name = name
        if username is not None:
            new_name = _norm(username)
            if not USERNAME.match(new_name):
                raise AccountError("账号名需 3-24 位，小写字母开头，可含数字、下划线和短横线")
            if new_name != name and new_name in data["accounts"]:
                raise AccountError("这个账号名已被使用")
        if new_password is not None:
            if not PW_MIN <= len(new_password) <= 128:
                raise AccountError("新密码需要 8-128 位")
            salt = secrets.token_hex(16)
            acc.update(salt=salt, hash=_hash(new_password, salt), n=SCRYPT_N,
                       failed=0, locked_until=0)
        if new_name != name:
            del data["accounts"][name]
            data["accounts"][new_name] = acc
        _write(data)
    return {"username": new_name, "member": member, "label": config.label_for(member)}
