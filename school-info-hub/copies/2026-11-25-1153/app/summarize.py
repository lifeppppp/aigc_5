import time
from pathlib import Path

from . import db
from .bailian import complete

SYSTEM_PROMPT = (
    '你是校园信息整理助手。下面是从学校/社团钉钉群收集到的消息。'
    '请提炼其中的重要信息：通知、活动、截止时间、任务要求、变更等，忽略闲聊。'
    '输出 Markdown：先给一段「要点速览」（不超过 5 条），再按群分组列出重要条目，'
    '每条注明发送人和时间，最后单列「近期待办/截止时间」表格。不要编造消息中没有的内容。'
)


def _fmt_ts(ts):
    return time.strftime('%m-%d %H:%M', time.localtime(ts))


def _raw_digest(messages, title):
    lines = [f'# {title}', '', '> 未配置百炼 API Key，以下为原始消息按群整理（配置后自动生成智能摘要）。', '']
    groups = {}
    for m in messages:
        groups.setdefault(m['group_name'], []).append(m)
    for g, ms in groups.items():
        lines.append(f'## {g}')
        for m in sorted(ms, key=lambda x: x['ts']):
            who = f"{m['sender']}：" if m['sender'] else ''
            lines.append(f"- [{_fmt_ts(m['ts'])}] {who}{m['content']}")
        lines.append('')
    return '\n'.join(lines)


def _to_docx(md_text, path):
    from docx import Document
    doc = Document()
    for line in md_text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith('# '):
            doc.add_heading(s[2:], level=0)
        elif s.startswith('## '):
            doc.add_heading(s[3:], level=1)
        elif s.startswith('### '):
            doc.add_heading(s[4:], level=2)
        elif s.startswith(('- ', '* ')):
            doc.add_paragraph(s[2:], style='List Bullet')
        elif s.startswith('> '):
            doc.add_paragraph(s[2:], style='Intense Quote')
        else:
            doc.add_paragraph(s.replace('**', '').replace('|', ' '))
    doc.save(path)


async def generate(messages, cfg, title):
    used_model = False
    md = None
    if messages:
        transcript = '\n'.join(
            f"[{m['group_name']}] {_fmt_ts(m['ts'])} {m['sender'] or '未知'}: {m['content']}"
            for m in sorted(messages, key=lambda x: x['ts']))
        reply = await complete(
            [{'role': 'system', 'content': SYSTEM_PROMPT},
             {'role': 'user', 'content': f'标题：{title}\n\n消息记录：\n{transcript}'}], cfg)
        if reply:
            md = reply if reply.lstrip().startswith('#') else f'# {title}\n\n{reply}'
            used_model = True
    if md is None:
        md = _raw_digest(messages, title)

    doc_id = db.add_document(title, used_model)
    folder = db.DATA / 'documents'
    md_path = folder / f'{doc_id}.md'
    md_path.write_text(md, encoding='utf-8')
    try:
        _to_docx(md, folder / f'{doc_id}.docx')
    except Exception:
        pass
    return doc_id, used_model