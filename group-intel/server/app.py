"""ECS 大模型中转站：客户端只连这一台服务器，百炼 Key 与钉钉凭据都留在服务端。"""

import os
import time
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

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


def verify_bearer(authorization: str = Header(default=""), x_client_token: str = Header(default="")):
    """兼容模式客户端把凭据放在 Authorization: Bearer 里，这里校验的是组内令牌。"""
    expected = os.getenv("CLIENT_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="服务器未配置 CLIENT_TOKEN，转发接口已关闭")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    else:
        token = x_client_token.strip()
    if token != expected:
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


class ActivateIn(BaseModel):
    code: str


@app.get("/api/health")
def health():
    _, _, model = llm.config()
    return {
        "ok": True,
        "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model": model,
        "bailian_key_configured": llm.key_configured(),
        "dingtalk_robot_configured": dingtalk_push.configured(),
        "invite_code_configured": bool(os.getenv("INVITE_CODE", "").strip()),
    }


@app.post("/api/activate")
def api_activate(body: ActivateIn):
    """邀请码换令牌：输对这一次，之后客户端只带令牌访问，不再需要邀请码。"""
    invite = os.getenv("INVITE_CODE", "").strip()
    token = os.getenv("CLIENT_TOKEN", "").strip()
    if not invite:
        raise HTTPException(status_code=503, detail="服务器未配置 INVITE_CODE，邀请码通道已关闭")
    if not token:
        raise HTTPException(status_code=503, detail="服务器未配置 CLIENT_TOKEN，请联系管理员")
    if body.code.strip() != invite:
        time.sleep(1)  # 抬高公网爆破的代价
        raise HTTPException(status_code=403, detail="邀请码不正确")
    return {"ok": True, "token": token}


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


@app.post("/compatible-mode/v1/chat/completions", dependencies=[Depends(verify_bearer)])
async def api_completions(request: Request):
    """让别的应用不改一行代码就能用上大模型：它们发 OpenAI 格式，我们只换掉 Key。"""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="请求体必须是 JSON")
    if not isinstance(body, dict) or not body.get("messages"):
        raise HTTPException(status_code=400, detail="messages 不能为空")

    try:
        if body.get("stream"):
            resp = await run_in_threadpool(lambda: llm.proxy_request(body, stream=True))
            if resp.status_code != 200:
                detail = await run_in_threadpool(lambda: resp.text[:500])
                resp.close()
                return JSONResponse(status_code=resp.status_code, content={"error": {"message": detail}})
            return StreamingResponse(
                llm.iter_raw(resp),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        resp = await run_in_threadpool(lambda: llm.proxy_request(body))
        try:
            if resp.status_code != 200:
                return JSONResponse(status_code=resp.status_code, content={"error": {"message": resp.text[:500]}})
            return JSONResponse(status_code=200, content=resp.json())
        finally:
            resp.close()
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/")
def index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.get("/todo.html")
def todo_page():
    """校园待办草模的短地址，等价于 /static/todo.html"""
    return FileResponse(os.path.join(WEB_DIR, "todo.html"))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"服务器内部错误: {exc}"})


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
