import json
import time
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db, summarize
from .bailian import stream_chat

app = FastAPI(title='校园信息助手')
db.init()

CHAT_SYSTEM = (
    '你是校园信息助手，面向高校学生。用简体中文回答。'
    '当用户需要搜集资料时，利用联网搜索获取最新信息，整理成条理清晰的要点，并尽量给出来源链接。'
)


@app.middleware('http')
async def auth(request: Request, call_next):
    tok = (config.get().get('server') or {}).get('access_token')
    if tok and request.url.path.startswith('/api') and not request.url.path.startswith('/api/starwood'):
        if request.headers.get('x-token') != tok and request.query_params.get('token') != tok:
            return JSONResponse({'error': 'unauthorized'}, status_code=401)
    return await call_next(request)


@app.get('/api/health')
def health():
    b = config.get().get('bailian', {})
    return {'ok': True, 'model_ready': bool(b.get('api_key')), 'model': b.get('model')}


@app.get('/api/settings')
def get_settings():
    cfg = config.get()
    b = dict(cfg.get('bailian', {}))
    b['api_key'] = '******' if b.get('api_key') else ''
    return {'bailian': b,
            'dingtalk': cfg.get('dingtalk', {}),
            'server': {'access_token_set': bool((cfg.get('server') or {}).get('access_token'))}}


class SettingsPatch(BaseModel):
    bailian: Optional[dict] = None
    dingtalk: Optional[dict] = None
    server: Optional[dict] = None


@app.post('/api/settings')
def post_settings(patch: SettingsPatch):
    data = patch.dict(exclude_none=True)
    b = data.get('bailian')
    if b and b.get('api_key') == '******':
        b.pop('api_key')
    config.save(data)
    return {'ok': True}


class ChatIn(BaseModel):
    conversation_id: Optional[int] = None
    message: str
    search: Optional[bool] = None


@app.post('/api/chat')
async def chat(body: ChatIn):
    msg = body.message.strip()
    if not msg:
        return JSONResponse({'error': 'empty message'}, status_code=400)
    conv = body.conversation_id or db.new_conversation(msg[:24])
    db.add_chat_message(conv, 'user', msg)
    history = [{'role': 'system', 'content': CHAT_SYSTEM}] + db.chat_history(conv)
    cfg = config.get()
    if body.search is not None:
        cfg = {**cfg, 'bailian': {**cfg.get('bailian', {}), 'enable_search': body.search}}

    async def gen():
        full = ''
        async for chunk in stream_chat(history, cfg):
            full += chunk
            yield f"data: {json.dumps({'type': 'delta', 'text': chunk}, ensure_ascii=False)}\n\n"
        db.add_chat_message(conv, 'assistant', full)
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv})}\n\n"

    return StreamingResponse(gen(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.get('/api/conversations')
def conversations():
    return db.list_conversations()


@app.get('/api/conversations/{conv_id}')
def conversation(conv_id: int):
    return db.chat_history(conv_id, limit=200)


@app.get('/api/dingtalk/status')
def dingtalk_status():
    d = config.get().get('dingtalk', {})
    return {
        'connected': False,
        'enabled': bool(d.get('enabled')),
        'mode': 'manual',
        'message': '机器人对接为预留功能：待确认能否在钉钉开放平台创建机器人后接入。'
                   '当前可在「钉钉消息」页手动粘贴导入群消息，汇总功能照常可用。',
    }


@app.get('/api/messages')
def messages(group: Optional[str] = None, limit: int = 200):
    return {'groups': db.list_groups(), 'messages': db.list_messages(group, limit)}


class ImportIn(BaseModel):
    group_name: str
    text: str


@app.post('/api/messages/import')
def import_messages(body: ImportIn):
    group = body.group_name.strip()
    if not group or not body.text.strip():
        return JSONResponse({'error': 'group_name 和 text 不能为空'}, status_code=400)
    count = 0
    for line in body.text.splitlines():
        line = line.strip()
        if not line:
            continue
        sender, content = '', line
        for sep in ('：', ':'):
            if sep in line:
                sender, content = line.split(sep, 1)
                sender, content = sender.strip(), content.strip()
                break
        db.add_message(group, sender, content, source='manual')
        count += 1
    return {'ok': True, 'imported': count}


class SummaryIn(BaseModel):
    group: Optional[str] = None
    hours: Optional[float] = None


@app.post('/api/summary')
async def summary(body: SummaryIn):
    since = time.time() - body.hours * 3600 if body.hours else None
    ms = db.list_messages(body.group, limit=1000, since=since)
    if not ms:
        return JSONResponse({'error': '没有可汇总的消息，请先导入或接入钉钉'}, status_code=400)
    scope = body.group or '全部群'
    title = f'校园重要信息汇总 · {scope} · {time.strftime("%Y-%m-%d %H:%M")}'
    doc_id, used = await summarize.generate(ms, config.get(), title)
    return {'ok': True, 'document_id': doc_id, 'used_model': used, 'message_count': len(ms)}


@app.get('/api/documents')
def documents():
    return db.list_documents()


@app.get('/api/documents/{doc_id}/download')
def download(doc_id: int, fmt: str = 'md'):
    doc = db.get_document(doc_id)
    if not doc:
        return JSONResponse({'error': 'not found'}, status_code=404)
    ext = 'docx' if fmt == 'docx' else 'md'
    path = db.DATA / 'documents' / f'{doc_id}.{ext}'
    if not path.exists():
        return JSONResponse({'error': f'{ext} 文件不存在'}, status_code=404)
    media = ('application/vnd.openxmlformats-officedocument.wordprocessingml.document'
             if ext == 'docx' else 'text/markdown; charset=utf-8')
    return FileResponse(path, media_type=media, filename=f'{doc["title"]}.{ext}')


from .starwood_api import install as install_starwood
install_starwood(app)

app.mount('/', StaticFiles(directory=Path(__file__).resolve().parent / 'static', html=True), name='static')