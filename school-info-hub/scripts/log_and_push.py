#!/usr/bin/env python3
"""school-info-hub 每次执行后：存一份代码副本 + 写一篇日志 + 推送到小组仓库 aigc_5。

沿用 group-intel/scripts/log_and_push.py 的约定，仅作用于本目录（不影响 group-intel）。

用法（在本机 Git Bash 里，任意目录均可）：
  python aigc_5/school-info-hub/scripts/log_and_push.py --action 部署 --note "说明这次做了什么"
  python aigc_5/school-info-hub/scripts/log_and_push.py --action 修改 --note "..." --files 额外归档文件
"""

import argparse
import datetime
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SNAPSHOT_DIRS = ["app"]
ROOT_FILES = ["config.yaml", "requirements.txt", "deploy.sh", "run.sh",
              "school-info-hub.service", "README.md"]
IGNORE = {"__pycache__", ".env", ".git", "data", "venv"}
SECRET_KEYS = ("api_key", "app_secret", "access_token")


def git(*args, check=True):
    return subprocess.run(
        ["git", "-c", "core.quotepath=false", *args], cwd=str(ROOT),
        check=check, capture_output=True, text=True, encoding="utf-8", errors="replace",
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


def sanitize_config(path: pathlib.Path):
    """副本里的 config.yaml 抹掉任何已填写的密钥，避免凭证进仓库。"""
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    for key in SECRET_KEYS:
        text = re.sub(rf"({key}:\s*)['\"]?[^'\"\s#]+['\"]?", r"\1'******'", text)
    path.write_text(text, encoding="utf-8")


def snapshot(stamp_dir: pathlib.Path):
    for name in SNAPSHOT_DIRS:
        d = ROOT / name
        if d.is_dir():
            copy_tree(d, stamp_dir / name)
    for name in ROOT_FILES:
        f = ROOT / name
        if f.is_file():
            shutil.copy2(f, stamp_dir / name)
    sanitize_config(stamp_dir / "config.yaml")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default="修改", help="修改 / 下载 / 部署 / 调研 / 配置")
    ap.add_argument("--note", default="", help="这次做了什么（写进日志）")
    ap.add_argument("--files", nargs="*", default=[], help="额外要归档的文件")
    ap.add_argument("--operator", default="Qoder AI 助手（代组员执行）")
    ap.add_argument("--skip-push", action="store_true")
    args = ap.parse_args()

    if git("rev-parse", "--is-inside-work-tree", check=False).returncode != 0:
        print("不在 git 仓库内，请先克隆 aigc_5", file=sys.stderr)
        sys.exit(1)

    status = git("status", "--porcelain", "--", ".").stdout
    changed = [line[3:] for line in status.splitlines() if line.strip()] or ["（无文件变更）"]

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

    diff = git("diff", "--stat", "--", ".").stdout.strip()
    log_path = ROOT / "logs" / f"{stamp}-{args.action}.md"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        f"# {stamp} {args.action}\n\n"
        f"- 时间：{now.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"- 操作人：{args.operator}\n"
        f"- 说明：{args.note or '（未填写）'}\n\n"
        f"## 涉及文件\n\n" + "\n".join(f"- {c}" for c in changed) + "\n"
        + (f"\n## 改动规模\n\n```\n{diff}\n```\n" if diff else "\n## 改动规模\n\n- 首次提交或无历史 diff\n")
        + f"\n## 代码副本\n\n本次快照目录：`copies/{stamp}/`（后端与前端全量副本，密钥已脱敏）\n",
        encoding="utf-8",
    )

    git("add", "-A", "--", ".")
    git("commit", "-m", f"{args.action}: {args.note or stamp}", check=False)
    if args.skip_push:
        print("已提交本地，按 --skip-push 未推送。")
        return

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "main"
    push = git("push", "origin", branch, check=False)
    if push.returncode != 0:
        print("本地已提交，但推送失败：\n" + (push.stderr or push.stdout)[-800:])
        sys.exit(1)
    print(f"已推送 {branch} → aigc_5；日志：school-info-hub/logs/{log_path.name}；副本：copies/{stamp}/")


if __name__ == "__main__":
    main()