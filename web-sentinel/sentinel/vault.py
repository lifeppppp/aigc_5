"""登录态加解密。明文只短暂存在于 0600 临时文件，用完立即删除。

按「站点 + 成员」存：5 个组员各有一份教务登录态，且每人一把 Fernet key，
这样一个人的密钥泄露只会塌掉他自己的那份，不会连带全组。
"""

import os
import pathlib
import re
import tempfile

import config
from cryptography.fernet import Fernet, InvalidToken


class VaultError(RuntimeError):
    pass


def slug(part):
    """成员名/站点名会拼进文件名，只保留安全字符，堵住 ../ 这类穿越。"""
    return re.sub(r"[^a-z0-9_-]", "", str(part or "").lower())


def _safe(part):
    cleaned = slug(part)
    if not cleaned:
        raise VaultError(f"非法的站点/成员名：{part!r}")
    return cleaned


def _fernet(member):
    secret = config.secret_for(member)
    if not secret:
        raise VaultError(f"{member} 没有可用的 Fernet 密钥，请在 {config.MEMBERS} 里填 secret")
    try:
        return Fernet(secret.encode())
    except Exception:
        raise VaultError(f"{member} 的密钥不是合法的 Fernet key")


def path_for(site, member):
    return config.AUTH / f"{_safe(site)}--{_safe(member)}.enc"


def exists(site, member):
    return path_for(site, member).exists()


def save(site, member, plain_path):
    data = pathlib.Path(plain_path).read_bytes()
    token = _fernet(member).encrypt(data)
    target = path_for(site, member)
    config.AUTH.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(token)
    os.chmod(tmp, 0o600)
    tmp.replace(target)
    return target


def decrypt_to_temp(site, member):
    if not exists(site, member):
        return None
    token = path_for(site, member).read_bytes()
    try:
        plain = _fernet(member).decrypt(token)
    except InvalidToken:
        raise VaultError(f"{member} 在 {site} 的登录态解密失败，密钥可能换过，需要重新授权")
    fd, name = tempfile.mkstemp(prefix=f"st-{_safe(site)}-{_safe(member)}-", suffix=".json",
                                dir=str(config.RUN))
    with os.fdopen(fd, "wb") as fh:
        fh.write(plain)
    os.chmod(name, 0o600)
    return name


def discard(path):
    if not path:
        return
    try:
        os.unlink(path)
    except OSError:
        pass


def remove(site, member):
    if exists(site, member):
        path_for(site, member).unlink()


def fingerprint(site, member):
    return path_for(site, member).stat().st_mtime if exists(site, member) else 0
