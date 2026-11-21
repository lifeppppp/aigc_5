"""钉钉 Stream 模式机器人：群里 @机器人 发一段聊天记录，服务器整理后回帖。

Stream 模式不需要公网回调地址、不需要域名备案，只要 AppKey/AppSecret。
在 ECS 上跑：python dingtalk_bot.py（凭据从 /opt/groupintel/.env 读）
"""

import asyncio
import logging
import os

import dingtalk_stream
from dingtalk_stream import AckMessage

import llm
import summarize as sz


def render(result):
    lines = [f"## {result.get('topic') or '群信息整理'}", "", result.get("summary", "")]
    todos = result.get("todos") or []
    if todos:
        lines += ["", "**待办**"]
        for t in todos:
            owner = t.get("owner") or "待认领"
            due = f"（{t['due']}）" if t.get("due") else ""
            lines.append(f"- [ ] {t.get('task')} — {owner}{due}")
    if result.get("decisions"):
        lines += ["", "**已确定**"] + [f"- {d}" for d in result["decisions"]]
    if result.get("risks"):
        lines += ["", "**风险**"] + [f"- {r}" for r in result["risks"]]
    return "\n".join(lines)


class GroupIntelHandler(dingtalk_stream.ChatbotHandler):
    async def process(self, callback: dingtalk_stream.CallbackMessage):
        incoming = dingtalk_stream.ChatbotMessage.from_dict(callback.data)
        text = (incoming.text.content or "").strip()
        if not text:
            self.reply_text("请把要整理的群聊记录贴给我（@我 + 粘贴内容）。", incoming)
            return AckMessage.STATUS_OK, "OK"

        self.reply_text("收到，正在调用大模型整理…", incoming)
        try:
            result = sz.summarize(text)
            self.reply_markdown(result.get("topic") or "整理结果", render(result), incoming)
        except (llm.LLMError, ValueError) as e:
            self.reply_text(f"整理失败：{e}", incoming)
        return AckMessage.STATUS_OK, "OK"


def main():
    logging.basicConfig(level=logging.INFO)
    app_key = os.getenv("DINGTALK_APP_KEY", "").strip()
    app_secret = os.getenv("DINGTALK_APP_SECRET", "").strip()
    if not (app_key and app_secret):
        raise SystemExit("缺少 DINGTALK_APP_KEY / DINGTALK_APP_SECRET（钉钉开放平台-企业内部应用）")

    client = dingtalk_stream.DingTalkStreamClient(dingtalk_stream.Credential(app_key, app_secret))
    client.register_callback_handler(dingtalk_stream.chatbot.ChatbotMessage.TOPIC, GroupIntelHandler())
    client.start_forever()


if __name__ == "__main__":
    main()
