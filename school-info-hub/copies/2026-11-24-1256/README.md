# 校园信息助手（School Info Hub）

小组项目：统计学校/社团重要信息 + 百炼模型对话。部署在阿里云 ECS，浏览器访问，组员可用 REST API 调试。

## 功能

1. **钉钉对接（界面已就位，机器人接入预留）**：确认能在钉钉开放平台建机器人后，把 AppKey/AppSecret 填入配置并启用，即可收群消息入库。当前可在「钉钉消息」页手动粘贴导入群消息。
2. **重要信息汇总**：把收集到的消息交给百炼模型提炼（通知/活动/截止时间/任务），生成 Markdown 与 Word 文档下载。未配置 Key 时输出原始消息整理。
3. **百炼聊天**：流式对话，支持联网搜索（`enable_search`）让模型搜集网上资料并整理。**API Key 在网页「设置」里粘贴保存即生效，无需重启。** 未配置时为演示模式，接口与界面均可正常调试。

## 部署（FinalShell）

1. 用 FinalShell 把整个 `school-info-hub` 文件夹上传到服务器，例如 `/opt/school-info-hub`。
2. 终端执行：
   ```bash
   cd /opt/school-info-hub
   bash deploy.sh
   ```
   脚本会建虚拟环境、装依赖（阿里云 pip 镜像）、注册 systemd 服务并启动。
3. 阿里云控制台 → ECS → 安全组，放行 **TCP 8010** 入方向。
4. 浏览器打开 `http://<服务器公网IP>:8010/`。

前台调试（代替 systemd）：`bash run.sh`
查看日志：`journalctl -u school-info-hub -f`
重启：`systemctl restart school-info-hub`

## 配置

`config.yaml`（也可全部在网页「设置」里改）：

| 项 | 说明 |
| --- | --- |
| `bailian.api_key` | 百炼 Key，拿到后填入；为空 = 演示模式 |
| `bailian.base_url` | 默认 DashScope OpenAI 兼容地址；组员若提供自建网关可改 |
| `bailian.model` | 默认 `qwen-plus`，可换 `qwen-max` 等 |
| `bailian.enable_search` | 联网搜索开关 |
| `server.access_token` | 可选访问令牌，设置后接口需带 `X-Token` 头或 `?token=` |
| `dingtalk.*` | 预留，机器人接入后启用 |

数据在 `data/`（SQLite + 生成的文档），备份该目录即可。

## API（组员调试用）

Base：`http://<IP>:8010`。若设置了访问令牌，所有请求加头 `X-Token: <令牌>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，`model_ready` 表示 Key 是否已配置 |
| GET/POST | `/api/settings` | 读取/更新配置（Key 返回时打码） |
| POST | `/api/chat` | 聊天，SSE 流式。Body：`{"conversation_id":可空,"message":"...","search":true}` |
| GET | `/api/conversations` | 会话列表 |
| GET | `/api/conversations/{id}` | 会话历史 |
| GET | `/api/dingtalk/status` | 钉钉对接状态 |
| GET | `/api/messages?group=&limit=` | 已收集消息 |
| POST | `/api/messages/import` | 手动导入。Body：`{"group_name":"群名","text":"每行一条"}` |
| POST | `/api/summary` | 生成汇总。Body：`{"group":可空,"hours":可空}` → `document_id` |
| GET | `/api/documents` | 文档列表 |
| GET | `/api/documents/{id}/download?fmt=md\|docx` | 下载文档 |

curl 示例：

```bash
curl -X POST http://127.0.0.1:8010/api/messages/import \
  -H 'Content-Type: application/json' \
  -d '{"group_name":"学生会通知群","text":"张三：周五18点前交年检材料"}'

curl -N -X POST http://127.0.0.1:8010/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"帮我搜集最近的大学生竞赛信息并整理"}'
```

## 后续接入钉钉机器人（待确认权限）

钉钉普通群机器人默认只接收 **@它** 的消息；要收全量群消息需要「会话内容存档」类高级权限。
确认可建机器人后：在开放平台创建企业内部应用 → 开通机器人（Stream 模式）→ 凭证填入配置 → 由后端增加 Stream 客户端把消息写入 `messages` 表，其余汇总/界面流程不变。