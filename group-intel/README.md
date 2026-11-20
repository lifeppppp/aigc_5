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

# 4. 每次改动/下载后记一笔（仓库是组内共享的 lifeppppp/aigc_5，本项目在 group-intel/ 子目录）
python scripts/log_and_push.py --action 部署 --note "ECS 中转站首次上线"
# 脚本只暂存 group-intel/ 目录内的变更，不会动组员在仓库其它目录的文件
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

## 五、组员怎么连上服务器改文件

全员共用一把 `.pem` 登 root，所以**不需要任何权限配置**——root 天然能改服务器上所有文件。只剩三件事。

### 1. 安全组放行（阿里云控制台 → ECS → 安全组 → 入方向规则）

| 端口 | 用途 |
|---|---|
| `22/TCP` | 组员从自己电脑 SSH/FinalShell 连进来 |
| `8000/TCP` | 组员和评委用浏览器打开你们的软件（`deploy.sh` 里 uvicorn 已监听 `0.0.0.0`） |

ECS 有公网 IP 就天生对外可达，卡点只在安全组，来源填 `0.0.0.0/0` 图省事可以，但必须配合第 3 条把密码登录关掉。

### 2. 分发私钥 + 组员侧连接

- 把 `.pem` 给每人一份（是 `.pem`，**不是 `.pub`**）。别丢进微信/QQ 群——那等于把服务器钥匙放进公网聊天记录；用当面拷贝、U 盘，或加密压缩包 + 口头给解压密码。
- 组员 FinalShell 新建连接：主机=公网IP、端口 `22`、用户名 `root`、认证方式选「公钥」→ 导入他拿到的 `.pem` → 连接。命令行等价：`ssh -i xxx.pem root@你的IP`。
- 谁手里是 PuTTY 的 `.ppk`，FinalShell 不认，先用 PuTTYgen 转成 OpenSSH 格式。
- 核对大家拿到的是不是同一把：本地 `ssh-keygen -lf xxx.pem` 打印指纹比对；或在服务器上 `cat /root/.ssh/authorized_keys` 看有几把钥匙。

### 3. 协作约定（共用 root 真正的风险是互相覆盖，不是权限）

- **动手前先 `git pull`，改完当天跑一次** `python scripts/log_and_push.py --action 修改 --note "谁 + 改了什么"`。note 里写名字，这是共享一把钥匙下唯一的追责与恢复手段——`/opt/groupintel` 被谁误删也能 clone 回来。
- 改完代码重启服务：`systemctl restart groupintel`（你就是 root，不用 sudo）。
- 钥匙都试通之后关掉密码登录：
  ```bash
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl reload sshd
  ```
  **改之前另开一个终端用钥匙再登一次**，确认能进再改，否则会把自己也锁在外面。
- 想撤销某个人：共用一把做不到单独撤销，只能换钥匙全员重发（控制台新建密钥对 → 绑定实例 → 重新分发）。以后要能单独撤销，就得回到"每人一把公钥"的路子。

## 六、下一步

- 打真安装包：`pyinstaller` 出 Windows exe；手机端用 PWABuilder 把站点封成 apk（需要 https）
- 整理结果落库（sqlite）+ 按周聚合，给最后总结用
- 组员分工：1 人管钉钉应用配置、1 人管提示词效果、1 人管演示脚本与 ppt、1 人管文档
