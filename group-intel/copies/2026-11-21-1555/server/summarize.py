"""把杂乱的群聊记录整理成结构化情报：摘要 / 待办 / 决策 / 风险。"""

import json
import re

from llm import chat

SYSTEM_PROMPT = """你是小组的工作群信息整理助手。
输入是一段钉钉工作群的聊天记录，可能口语化、碎片化、含表情和图片占位符。
请只输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块，结构如下：
{
  "topic": "本次讨论的主题（15字内）",
  "summary": "3-5句中文摘要，说清楚发生了什么、结论是什么",
  "todos": [{"task": "要做的事", "owner": "负责人，未知填待认领", "due": "时间，未知填空"}],
  "decisions": ["已确定的结论"],
  "risks": ["风险或未解决的争议，没有则空数组"],
  "keywords": ["3-6个关键词"]
}
硬性要求：不得编造记录里没有的信息；无关闲聊直接忽略；owner 用群里出现的真实称呼。"""


def _extract_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def summarize(raw_text, focus="", model=None):
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("群聊内容为空")
    if len(text) > 20000:
        text = text[:20000] + "\n（过长，已截断）"

    user_prompt = f"请整理以下群聊记录：\n\n{text}"
    if focus:
        user_prompt += f"\n\n额外关注：{focus}"

    content, usage = chat(
        [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
        model=model,
        temperature=0.2,
    )
    parsed = _extract_json(content)
    if parsed is None:
        return {
            "topic": "整理结果（模型未按 JSON 返回）",
            "summary": content.strip(),
            "todos": [],
            "decisions": [],
            "risks": [],
            "keywords": [],
            "usage": usage,
            "degraded": True,
        }
    parsed["usage"] = usage
    parsed["degraded"] = False
    return parsed
