"""阿里百炼（Model Studio）调用封装。API Key 只留在服务器，永不下发到客户端。"""

import os

import requests


class LLMError(RuntimeError):
    pass


def config():
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    base_url = os.getenv(
        "BAILIAN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).rstrip("/")
    model = os.getenv("BAILIAN_MODEL", "qwen3.7-plus").strip()
    return api_key, base_url, model


def key_configured():
    return bool(config()[0])


def chat(messages, model=None, temperature=0.3, max_tokens=3000, timeout=120):
    """走 OpenAI 兼容接口，返回 (content, usage)。"""
    api_key, base_url, default_model = config()
    if not api_key:
        raise LLMError("服务器未配置 DASHSCOPE_API_KEY，请检查 /opt/groupintel/.env")

    body = {
        "model": model or default_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise LLMError(f"百炼返回 HTTP {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise LLMError(f"百炼响应结构异常: {str(data)[:300]}")
    return content, data.get("usage", {})


def proxy_request(body, stream=False):
    """原样转发 OpenAI 兼容请求，真实 Key 在这里注入，客户端永远拿不到。"""
    api_key, base_url, default_model = config()
    if not api_key:
        raise LLMError("服务器未配置 DASHSCOPE_API_KEY，请检查 /opt/groupintel/.env")
    payload = dict(body or {})
    payload["model"] = payload.get("model") or default_model
    return requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        stream=stream,
        timeout=(15, 300),
    )


def iter_raw(resp):
    """上游 SSE 字节原样透传，客户端的解析逻辑一行都不用改。"""
    try:
        for chunk in resp.iter_content(chunk_size=None):
            if chunk:
                yield chunk
    finally:
        resp.close()
