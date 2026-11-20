# 群情报助手（钉钉工作群 → ECS 中转 → 阿里百炼 → 电脑/手机客户端）

5 人小组的三段式链路，本仓库是可运行的完整骨架。

```
钉钉工作群
   │  ① Stream 模式收消息（@机器人）／或客户端粘贴聊天记录
   ▼
本地客户端  launcher.py / 浏览器  ──►  ② 阿里云 ECS:8000 中转站 (FastAPI)
   ▲                                        │ ③ API Key 只留在服务器
   │                                        ▼
   └──── 整理结果（摘要/待办/决策/风险） ◄── 阿里百炼 qwen-plus
                     │
                     └── 每次改动 → logs/ + copies/ → 推 GitHub（组员可回溯）
```

## 目录

| 目录 | 作用 |
|---|---|
| `server/` | 部署在 ECS 上的中转站：`app.py`（HTTP 接口）、`llm.py`（百炼调用）、`summarize.py`（整理提示词与结构化解析）、`dingtalk_push.py`（回写群机器人）、`dingtalk_bot.py`（Stream 收群消息）、`groupintel.service` |
| `web/` | 电脑和手机共用的界面，由服务器直接托管，打开即用；带 manifest 可安装成应用 |
| `local/` | 本地客户端启动器 `launcher.py` + 双击入口 `GroupIntel.bat`，独立窗口打开软件 |
| `scripts/log_and_push.py` | 每次服务器改动/下载后：写日志 + 存全量代码副本 + 推 GitHub |
| `logs/` `copies/` | 日志与副本的历史归档，最后总结的素材 |

## 一、上手（服务器拥有者）

```bash
# 1. 部署（Git Bash 里执行，密钥路径用 /c/... 写法）
ECS_IP=47.xx.xx.xx ECS_KEY=/c/Users/潘辰嘉/keys/xxx.pem ./deploy.sh

# 2. 填密钥并重启
ssh -i /c/Users/潘辰嘉/keys/xxx.pem root@47.xx.xx.xx
nano /opt/groupintel/.env        # DASHSCOPE_API_KEY / CLIENT_TOKEN
systemctl restart groupintel
curl http://127.0.0.1:8000/api/health

# 3. 阿里云控制台 → ECS → 安全组 → 入方向放行 8000/TCP（0.0.0.0/0 便于演示，赛后可收紧）

# 4. 绑定 GitHub 仓库并推第一篇日志
python scripts/log_and_push.py --remote git@github.com:lifeppppp/group-intel.git \
  --action 部署 --note "ECS 中转站首次上线"
```

## 二、其他人怎么用

- **电脑**：`python local/launcher.py --server 47.xx.xx.xx` → 独立应用窗口；或直接双击 `local/GroupIntel.bat 47.xx.xx.xx 8000`
- **手机**：浏览器打开 `http://47.xx.xx.xx:8000`，菜单里「添加到主屏幕」就有图标了（同一套页面，已做移动端适配）
- 第一次使用点右上「设置」，填入 `CLIENT_TOKEN`，防止别人白嫖你们的算力
- 粘贴群聊 → 点「整理」→ 得到主题/摘要/待办(带负责人和时间)/决策/风险/关键词

## 三、钉钉侧需要组员配合的两件事

1. **群机器人 webhook**（回写整理结果用）：群设置 → 智能群助手 → 添加自定义机器人 → 安全设置选「加签」，把 Webhook 和 Secret 填进服务器 `.env`。
2. **企业内部应用 + Stream 模式**（群里 @机器人 直接整理）：[open-dev.dingtalk.com](https://open-dev.dingtalk.com) 建应用 → 加机器人能力 → 消息接收模式选 **Stream** → 权限里勾上机器人收发消息 → 拿到 AppKey/AppSecret 填 `.env`，服务器上跑：
   ```bash
   python /opt/groupintel/server/dingtalk_bot.py   # 建议也做成 systemd 服务
   ```

## 四、已知限制（不是 bug，是平台规则）

- 钉钉**不允许**第三方程序静默拉取群里的全部历史消息。合规路线只有两条：① 群成员 **@机器人** 时把内容交给它（本仓库已实现）；② 客户端手动粘贴/上传记录（演示最稳）。要全量群消息只能买「会话存档」，需要企业资质，小组实验不建议。
- 用 IP + 8000 端口直连是 HTTP，浏览器不会弹出「安装应用」按钮。要真正的安装包（apk / exe）见下一步计划。
- 大陆 ECS 的 80/443 端口对外提供网页需要 ICP 备案，所以这里用非标端口，别纠结。

## 五、下一步

- 打真安装包：`pyinstaller` 出 Windows exe；手机端用 PWABuilder 把站点封成 apk（需要 https）
- 整理结果落库（sqlite）+ 按周聚合，给最后总结用
- 组员分工：1 人管钉钉应用配置、1 人管提示词效果、1 人管演示脚本与 ppt、1 人管文档
