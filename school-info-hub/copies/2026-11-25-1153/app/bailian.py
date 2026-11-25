import json
import httpx

MOCK_REPLY = (
    '【演示模式】当前尚未配置百炼 API Key，这是一条占位回复。\n\n'
    '拿到 Key 后：打开右上角「设置」→ 粘贴 API Key → 保存，即可真实对话，无需重启服务。\n'
    '接口地址默认使用 DashScope 的 OpenAI 兼容模式，模型可在设置中更换（如 qwen-plus / qwen-max）。'
)


def _payload(messages, b, stream):
    p = {'model': b.get('model') or 'qwen-plus', 'messages': messages, 'stream': stream}
    if b.get('enable_search'):
        p['enable_search'] = True
    return p


async def stream_chat(messages, cfg):
    b = cfg.get('bailian', {})
    if not b.get('api_key'):
        yield MOCK_REPLY
        return
    url = (b.get('base_url') or '').rstrip('/') + '/chat/completions'
    headers = {'Authorization': f"Bearer {b['api_key']}"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15)) as client:
            async with client.stream('POST', url, json=_payload(messages, b, True), headers=headers) as r:
                if r.status_code != 200:
                    body = (await r.aread()).decode('utf-8', 'ignore')
                    yield f'【调用失败 HTTP {r.status_code}】{body[:400]}'
                    return
                async for line in r.aiter_lines():
                    if not line.startswith('data:'):
                        continue
                    data = line[5:].strip()
                    if data == '[DONE]':
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get('choices') or [{}]
                    delta = (choices[0].get('delta') or {}).get('content')
                    if delta:
                        yield delta
    except Exception as e:
        yield f'【请求异常】{type(e).__name__}: {e}'


async def complete(messages, cfg):
    """非流式调用，用于汇总。未配置 Key 或失败时返回 None。"""
    b = cfg.get('bailian', {})
    if not b.get('api_key'):
        return None
    url = (b.get('base_url') or '').rstrip('/') + '/chat/completions'
    headers = {'Authorization': f"Bearer {b['api_key']}"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15)) as client:
            r = await client.post(url, json=_payload(messages, b, False), headers=headers)
            if r.status_code != 200:
                return None
            return r.json()['choices'][0]['message']['content']
    except Exception:
        return None