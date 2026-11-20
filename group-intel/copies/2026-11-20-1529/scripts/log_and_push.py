#!/usr/bin/env python3
"""服务器端每次修改/下载后：存一份代码副本 + 写一篇日志 + 推送到 GitHub。

用法（在本机 Git Bash 或 cmd 里）：
  python scripts/log_and_push.py --action 修改 --note "给中转服务加了钉钉推送接口"
  python scripts/log_and_push.py --action 下载 --note "从ECS拉回运行日志" --files /tmp/a.log
  python scripts/log_and_push.py --remote git@github.com:lifeppppp/group-intel.git   # 首次绑定仓库
"""

import argparse
import datetime
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SNAPSHOT_DIRS = ["server", "web", "local", "scripts"]
IGNORE = {"__pycache__", ".env", ".git"}


def git(*args, check=True):
    env = os.environ.copy()
    key = os.path.expanduser("~/.ssh/id_rsa")
    if os.path.exists(key):
        env["GIT_SSH_COMMAND"] = f'ssh -i "{key}" -o IdentitiesOnly=yes'
    return subprocess.run(
        ["git", *args], cwd=str(ROOT), env=env, check=check,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def copy_tree(src: pathlib.Path, dst: pathlib.Path):
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name in IGNORE or item.suffix == ".pyc":
            continue
        if item.is_dir():
            copy_tree(item, dst / item.name)
        else:
            shutil.copy2(item, dst / item.name)


def snapshot(stamp_dir: pathlib.Path):
    for name in SNAPSHOT_DIRS:
        d = ROOT / name
        if d.is_dir():
            copy_tree(d, stamp_dir / name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default="修改", help="修改 / 下载 / 部署 / 调研")
    ap.add_argument("--note", default="", help="这次做了什么（写进日志）")
    ap.add_argument("--files", nargs="*", default=[], help="额外要归档的文件（如从服务器下载的东西）")
    ap.add_argument("--remote", default="", help="首次绑定 GitHub 仓库地址")
    ap.add_argument("--skip-push", action="store_true")
    args = ap.parse_args()

    if git("rev-parse", "--is-inside-work-tree", check=False).returncode != 0:
        git("init", "-b", "main")
    if args.remote:
        git("remote", "remove", "origin", check=False)
        git("remote", "add", "origin", args.remote)

    status = git("status", "--porcelain", "--", ".").stdout.strip()
    changed = [line[3:] for line in status.splitlines() if line] if status else ["（无文件变更）"]

    for f in args.files:
        p = pathlib.Path(f)
        if not p.exists():
            print(f"跳过不存在的文件: {f}", file=sys.stderr)
            continue
        dest = ROOT / "copies" / "downloads" / p.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
        changed.append(f"下载归档: copies/downloads/{p.name}")

    now = datetime.datetime.now()
    stamp = now.strftime("%Y-%m-%d-%H%M")
    snap_dir = ROOT / "copies" / stamp
    snapshot(snap_dir)

    diff = git("diff", "--stat").stdout.strip()
    log_path = ROOT / "logs" / f"{stamp}-{args.action}.md"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        f"# {stamp} {args.action}\n\n"
        f"- 时间：{now.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"- 操作人：服务器拥有者（潘辰嘉）\n"
        f"- 说明：{args.note or '（未填写）'}\n\n"
        f"## 涉及文件\n\n" + "\n".join(f"- {c}" for c in changed) + "\n"
        + (f"\n## 改动规模\n\n```\n{diff}\n```\n" if diff else "\n## 改动规模\n\n- 首次提交或无历史 diff\n")
        + f"\n## 代码副本\n\n本次快照目录：`copies/{stamp}/`（服务器端与前端全量副本）\n",
        encoding="utf-8",
    )

    git("add", "-A", "--", ".")
    git("commit", "-m", f"{args.action}: {args.note or stamp}", check=False)
    if args.skip_push:
        print("已提交本地，按 --skip-push 未推送。")
        return

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "main"
    push = git("push", "-u", "origin", branch, check=False)
    if push.returncode != 0:
        print("本地已提交，但推送失败：\n" + (push.stderr or push.stdout)[-800:])
        print("如果是仓库还不存在，先在 GitHub 建一个空仓库，再执行：")
        print("  python scripts/log_and_push.py --remote git@github.com:你的账号/仓库名.git --action 修改 --note 补推")
        sys.exit(1)
    print(f"已推送 {branch} → GitHub；日志：logs/{log_path.name}；副本：copies/{stamp}/")


if __name__ == "__main__":
    main()
