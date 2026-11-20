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

## 五、给组员开服务器开发权限

**不要把你手里那把 `.pem` 发给任何人**——它是 root 私钥，发出去等于人人都是最高权限，而且想收回只能换钥匙、全员重发。正确做法是各人一把公钥，你只登记公钥，撤销时删他一个人。

### 模式一：各自公钥登 root（推荐给你们现状，FinalShell 习惯不变）

1. 组员在自己电脑上生成密钥对，把**公钥那一行**发给你（公钥可以随便发，私钥不出他电脑）：
   ```bash
   ssh-keygen -t ed25519 -C "liming"    # Windows 打开 Git Bash，一路回车
   cat ~/.ssh/id_ed25519.pub            # 整行复制发给你
   ```
2. 你在本机一条命令登记（公钥走临时文件传输，不拼进远程命令；账号名和公钥格式都做白名单校验）：
   ```bash
   ECS_IP=47.xx.xx.xx ECS_KEY=/c/Users/潘辰嘉/keys/xxx.pem \
     ./scripts/grant_dev.sh addroot liming "ssh-ed25519 AAAA... liming"
   ./scripts/grant_dev.sh listroot          # 看登记了谁（只显示指纹，不打印完整公钥）
   ./scripts/grant_dev.sh delroot liming    # 撤销：只删他那一行，其他人不受影响
   ```
   重复执行同一个人会自动换新钥匙，不会堆出多行。
3. 组员在 FinalShell 里：编辑该主机 → 认证方式选「公钥」→ 选择/导入**他自己的私钥**（`~/.ssh/id_ed25519`，没有 `.pub` 那个文件），用户名仍填 `root`。不同版本入口名称略有差异，找不到就用命令行 `ssh -i ~/.ssh/id_ed25519 root@你的IP`，效果一样。

钥匙都登记完了，就把 `/etc/ssh/sshd_config` 里的 `PasswordAuthentication` 改成 `no` 再 `systemctl reload sshd`——22 端口对全网开放还留着密码登录，等于给人留后门。**改之前务必确认至少有一把公钥能用**，否则会把自己也锁在外面。

### 模式二：独立账号 + sudo（想审计谁做了什么时用）

```bash
./scripts/grant_dev.sh add liming "ssh-ed25519 AAAA... liming"   # 建账号+dev组可写项目目录+sudo
./scripts/grant_dev.sh list / del liming
```
组员登录 `ssh liming@IP`，改完 `sudo systemctl restart groupintel`。好处是出事故能查到具体账号、能单独禁用，`/opt/groupintel` 靠 dev 组共享可写而不必人人 root。

## 六、下一步

- 打真安装包：`pyinstaller` 出 Windows exe；手机端用 PWABuilder 把站点封成 apk（需要 https）
- 整理结果落库（sqlite）+ 按周聚合，给最后总结用
- 组员分工：1 人管钉钉应用配置、1 人管提示词效果、1 人管演示脚本与 ppt、1 人管文档
