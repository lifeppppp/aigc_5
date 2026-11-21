"""ECS 大模型中转站：客户端只连这一台服务器，百炼 Key 与钉钉凭据都留在服务端。"""

import os
import time
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import llm
import summarize as sz
import dingtalk_push

app = FastAPI(title="GroupIntel Relay", version="0.1.0")

WEB_DIR = os.getenv("WEB_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))


def verify_token(x_client_token: str = Header(default="")):
    expected = os.getenv("CLIENT_TOKEN", "").strip()
    if expected and x_client_token != expected:
        raise HTTPException(status_code=401, detail="客户端令牌无效")
    return True


class SummarizeIn(BaseModel):
    text: str
    focus: str = ""
    model: Optional[str] = None


class ChatIn(BaseModel):
    messages: List[dict]
    model: Optional[str] = None


class PushIn(BaseModel):
    title: str = "群信息整理"
    text: str


@app.get("/api/health")
def health():
    _, _, model = llm.config()
    return {
        "ok": True,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": model,
        "bailian_key_configured": llm.key_configured(),
        "dingtalk_robot_configured": dingtalk_push.configured(),
    }


@app.post("/api/summarize", dependencies=[Depends(verify_token)])
def api_summarize(body: SummarizeIn):
    try:
        return sz.summarize(body.text, body.focus, body.model)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/chat", dependencies=[Depends(verify_token)])
def api_chat(body: ChatIn):
    try:
        content, usage = llm.chat(body.messages, model=body.model)
        return {"content": content, "usage": usage}
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/push-dingtalk", dependencies=[Depends(verify_token)])
def api_push(body: PushIn):
    ok, detail = dingtalk_push.send_markdown(body.title, body.text)
    if not ok:
        raise HTTPException(status_code=502, detail=detail)
    return {"ok": True, "detail": detail}


@app.get("/")
def index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"服务器内部错误: {exc}"})


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
