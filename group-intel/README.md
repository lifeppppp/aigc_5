# 群情报助手（钉钉工作群 → ECS 中转 → 阿里百炼 → 电脑/手机客户端）

5 人小组的三段式链路，本仓库是可运行的完整骨架。

```
钉钉工作群
   │  ① Stream 模式收消息（@机器人）／或客户端粘贴聊天记录
   ▼
本地客户端  launcher.py / 浏览器  ──►  ② 阿里云 ECS:8000 中转站 (FastAPI)
   ▲                                        │ ③ API Key 只留在服务器
   │                                        ▼
   └──── 整理结果（摘要/待办/决策/风险） ◄── 阿里百炼 qwen3.7-plus
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
| `架构问题与解决方法.md` | 汇报素材：每个架构问题的原因、解决方式和对应代码位置，末尾单列「还没验证的」 |

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

### 只有密码、没有 .pem 的话

`deploy.sh` 走的是密钥认证。你们全员用 root + 密码登录，那就别用它，直接在 FinalShell 里做同样的事：左侧文件面板把 `server/`、`web/`、`.env.example` 拖到服务器 `/opt/groupintel/`（**不要传 `.env`**，百炼 Key 只在服务器上填），再在内置终端执行：

```bash
mkdir -p /opt/groupintel && cd /opt/groupintel
pip3 install -r server/requirements.txt --break-system-packages || pip3 install -r server/requirements.txt
[ -f .env ] || cp .env.example .env
chmod 600 .env
cp server/groupintel.service /etc/systemd/system/groupintel.service
systemctl daemon-reload && systemctl enable --now groupintel
systemctl restart groupintel && curl -s http://127.0.0.1:8000/api/health
```

### 环境要求（为什么这套代码能在老镜像上跑）

- 代码刻意保持在 **Python 3.8 可运行**：`server/app.py` 的请求模型用 `Optional[str]` / `List[dict]`，不用 `str | None`（3.10+）和 `list[dict]`（3.9+）。所以 **Ubuntu 20.04（自带 3.8）不用换镜像**也能部署。
- 3.8 上 pip 会自动解析到最后支持它的这套依赖：`fastapi 0.124.4` / `pydantic 2.10.6` / `uvicorn 0.33.0`，接口行为与新版一致，不需要手工钉版本。
- **2 GiB 内存的机器**上 `pip3 install` 如果直接打印 `Killed`，那是 OOM 被内核杀掉，不是包装错了。先试 `pip3 install --no-cache-dir -r server/requirements.txt`；反复被杀再考虑加一个 swap 文件（属于额外优化，不影响功能）。

## 二、接入百炼：组长四步（Key 只在这一步出现）

代码不用重写，`server/llm.py` 已经封装好百炼的 OpenAI 兼容接口。组员要"接入大模型"，其实是在调下面这几个接口，不需要任何人拿到 Key。

### 第 1 步 建 Key、抄模型 ID（控制台里做）

[bailian.console.aliyun.com](https://bailian.console.aliyun.com) → API-KEY → 创建，得到 `sk-` 开头的 Key；再去模型列表**复制确切的模型 ID**（`qwen-plus`、`qwen-long`、以及控制台新列出的型号），别凭印象手打。

- 本组已采用 **`qwen3.7-plus`**（`llm.py` 默认值、`.env.example`、服务器 `.env` 三处一致）。若你的业务空间没开通它而报 404，把 `.env` 里的 `BAILIAN_MODEL` 改回 `qwen-plus` 就行，不用改代码。
- Key 与域名**地域必须一致**：北京的 Key 打到新加坡域名会直接 `401 Invalid API-key provided`。
- 模型 ID 写错是 404 / `model_not_found`，跟余额和配额没关系，别往那边查。
- 免费额度页看一眼、给这个业务空间设消费告警——这是全组唯一的算力成本来源。

### 第 2 步 代码放上服务器

FinalShell 文件面板把 `server/`、`web/`、`.env.example` 拖到 `/opt/groupintel/`（**永远不要拖 `.env`**），内置终端跑第一章那六条命令。已经跑过的话这步只是确认：`systemctl is-active groupintel` 输出 `active`。

### 第 3 步 填 `.env` 三行然后重启

```bash
nano /opt/groupintel/.env
systemctl restart groupintel
```

| 变量 | 填什么 |
|---|---|
| `DASHSCOPE_API_KEY` | 第 1 步那把 `sk-...` |
| `BAILIAN_MODEL` | 第 1 步复制的模型 ID |
| `CLIENT_TOKEN` | 自己定一串长随机字符。**必须填**：留空等于接口不设口令，`http://IP:8000` 对全世界开放，谁都能烧你们的算力 |

`BAILIAN_BASE_URL` **不用动**，官方文档写明"现有域名仍可正常使用"，默认就是 `https://dashscope.aliyuncs.com/compatible-mode/v1`。想用业务空间专属域名（`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`）就整行替换，注意 Key 的地域要跟着对上。

### 第 4 步 两发 curl 定论，别看"服务启动了"就收工

```bash
curl -s http://127.0.0.1:8000/api/health
```

要看到 `"bailian_key_configured": true`。是 false 就是 `.env` 没生效——检查路径、`chmod 600`、以及有没有真的 restart。

```bash
curl -s -X POST http://127.0.0.1:8000/api/summarize \
  -H 'Content-Type: application/json' -H 'X-Client-Token: 你的token' \
  -d '{"text":"张三:明天上午10点交PPT初稿\n李四:我负责数据部分,周五前给\n张三:好,那周五下午一起评审","focus":"待办"}'
```

返回带 `topic / summary / todos / decisions / risks / keywords` 的 JSON，**服务器→百炼这一跳就算通了**。

排错分界线：`127.0.0.1:8000` 通而 `http://公网IP:8000` 不通，是安全组没放行（第六章），跟 Key 和百炼一点关系，别去查 Key。

### 交接给组员的就是这三样

1. 地址 `http://你的IP:8000`
2. `CLIENT_TOKEN` 的值（组员在自己软件的「设置」里填一次）
3. 接口清单，全部要带 header `X-Client-Token`：

| 接口 | 请求体 | 用途 |
|---|---|---|
| `POST /api/summarize` | `{"text":"群记录", "focus":"可选侧重", "model":"可选覆盖"}` | 群消息 → 结构化整理（演示主功能） |
| `POST /api/chat` | `{"messages":[{"role":"user","content":"..."}], "model":"可选"}` | 裸对话，做问答/追问用 |
| `POST /api/push-dingtalk` | `{"title":"标题", "text":"markdown"}` | 把结果回写到群机器人 |

组员的活是钉钉应用配置（第四章）、提示词效果、前端和演示脚本，**不是**碰 Key。

一句实话：组员登进来是 root，`cat /opt/groupintel/.env` 就能看到 Key。所以"Key 只留服务器"约束的是**发给外人的客户端**，在组内它是流程约定而不是技术隔离。真泄露了的处理办法：控制台重置 Key → 改掉 `.env` → `systemctl restart groupintel`，老 Key 立刻失效。

改完记得记一笔：`python scripts/log_and_push.py --action 部署 --note "谁 + 接入百炼，模型用 xxx"`

## 三、其他人怎么用

- **电脑**：`python local/launcher.py --server 47.xx.xx.xx` → 独立应用窗口；或直接双击 `local/GroupIntel.bat 47.xx.xx.xx 8000`
- **手机**：浏览器打开 `http://47.xx.xx.xx:8000`，菜单里「添加到主屏幕」就有图标了（同一套页面，已做移动端适配）
- 第一次使用点右上「设置」，填入 `CLIENT_TOKEN`，防止别人白嫖你们的算力
- 粘贴群聊 → 点「整理」→ 得到主题/摘要/待办(带负责人和时间)/决策/风险/关键词

## 四、钉钉侧需要组员配合的两件事

1. **群机器人 webhook**（回写整理结果用）：群设置 → 智能群助手 → 添加自定义机器人 → 安全设置选「加签」，把 Webhook 和 Secret 填进服务器 `.env`。
2. **企业内部应用 + Stream 模式**（群里 @机器人 直接整理）：[open-dev.dingtalk.com](https://open-dev.dingtalk.com) 建应用 → 加机器人能力 → 消息接收模式选 **Stream** → 权限里勾上机器人收发消息 → 拿到 AppKey/AppSecret 填 `.env`，服务器上跑：
   ```bash
   python /opt/groupintel/server/dingtalk_bot.py   # 建议也做成 systemd 服务
   ```

## 五、已知限制（不是 bug，是平台规则）

- 钉钉**不允许**第三方程序静默拉取群里的全部历史消息。合规路线只有两条：① 群成员 **@机器人** 时把内容交给它（本仓库已实现）；② 客户端手动粘贴/上传记录（演示最稳）。要全量群消息只能买「会话存档」，需要企业资质，小组实验不建议。
- 用 IP + 8000 端口直连是 HTTP，浏览器不会弹出「安装应用」按钮。要真正的安装包（apk / exe）见下一步计划。
- 大陆 ECS 的 80/443 端口对外提供网页需要 ICP 备案，所以这里用非标端口，别纠结。

## 六、组员怎么连上服务器改文件

全员（包括你自己）都是 **root + 密码** 登录，FinalShell 里不选公钥、不需要任何 `.pem` / `.pub` 文件。所以没有"分发钥匙"这件事，只剩两件事：安全组放行、协作约定。

### 1. 安全组放行（阿里云控制台 → ECS → 安全组 → 入方向规则）

| 端口 | 用途 | 来源 |
|---|---|---|
| `22/TCP` | 组员从自己电脑 SSH/FinalShell 连进来 | 只填组员的出口 IP（`1.2.3.4/32`，一人一条），**默认那条 `0.0.0.0/0` 的 SSH 规则删掉** |
| `8000/TCP` | 组员和评委用浏览器打开你们的软件（`deploy.sh` 里 uvicorn 已监听 `0.0.0.0`） | `0.0.0.0/0`（要给外面演示，必须全开） |
| `80` / `443` | 用不上：网页走 8000，而且大陆 ECS 用这两个端口对外提供网页需要 ICP 备案 | 控制台默认带的建议删掉 |
| `3389`(RDP) 等其余 | Linux 机器用不到，阿里云默认模板里可能带着 | 删掉 |

一条原则：**只有"外部用户要访问的端口"才填 `0.0.0.0/0`，运维端口越窄越好，用不到的端口直接不开。** 别为了省事全开。

原因：**22 端口对全网开放 + 允许密码登录 = 扫描器几小时内就会来爆破**，这是这套连接方式唯一真正的风险。限来源 IP 是最省事的缓解，比装任何工具都有效；组员 IP 变了就改那一条规则。查询自己的出口 IP：浏览器搜 "ip" 或 `curl ip.sb`。

改完逐条实测：让组员从自己网络连一次 22；你用手机**流量（别连 WiFi）**打开一次 `http://你的IP:8000`。注意阿里云规则里**优先级数字越小越优先**，别让一条拒绝规则压在你的允许规则前面。

### 2. 组员侧连接（FinalShell）

新建连接 → 主机=公网IP、端口 `22`、用户名 `root`、认证方式选 **「密码」** → 输入密码 → 连接。命令行等价：`ssh root@你的IP`。

- 界面里那个「公钥」选项**不要选**（它要的是私钥文件，你们手上没有，也不需要）。首次连接如果弹窗问要不要生成/上传密钥，跳过即可，不影响使用。
- 密码怎么传：别在群里明文发。口头/电话说，或加密压缩包 + 另开渠道给解压密码。密码本身要够长（16 位以上混合），弱密码配上开放的 22 端口基本等于没锁门。
- 记住 root 能改服务器上任何文件、也能删掉任何东西——这是"人人平等"的代价，所以有第 3 条。
- 「API Key 只存服务器」这句承诺的范围要说清：它保证的是**发给外人的客户端里没有任何 Key**；组员自己 `cat /opt/groupintel/.env` 是能看到百炼 Key 的，因为他是 root。要连组员一起隔离就得开独立账号管文件属主，小组实验不做。真泄露了就去百炼控制台重置一把 Key、改掉 `.env` 再 `systemctl restart groupintel`，老 Key 立刻失效。

### 3. 协作约定（真正的风险是互相覆盖和查不到人，不是权限）

- **动手前先 `git pull`，改完当天跑一次** `python scripts/log_and_push.py --action 修改 --note "谁 + 改了什么"`。note 里写名字，这是共用密码下唯一的追责与恢复手段——`/opt/groupintel` 被谁误删也能 clone 回来。
- 改完代码重启服务：`systemctl restart groupintel`（你就是 root，不用 sudo）。
- 想撤销某个人的访问：共用密码做不到单独撤销，只能改密码然后重新通知全员。以后要能单独踢人、或者把密码登录关掉，就得换成"每人一把自己的公钥登记到 `/root/.ssh/authorized_keys`"的路子，那时再来找我。

## 七、下一步

- 打真安装包：`pyinstaller` 出 Windows exe；手机端用 PWABuilder 把站点封成 apk（需要 https）
- 整理结果落库（sqlite）+ 按周聚合，给最后总结用
- 组员分工：1 人管钉钉应用配置、1 人管提示词效果、1 人管演示脚本与 ppt、1 人管文档
