# 微信 Claude Bridge

`wechat-claude-bridge` 是一个本地桥接项目，用来把微信消息转发给 `Claude Code CLI`，再把结果回复回微信。

## 原创说明

本项目表明为：`关镇江原创`。

这个项目的目标是：

1. 代码结构清晰，适合继续开发
2. 路径和运行参数全部配置化，适合上传到 Git
3. 同时支持本地调试模式和真实微信模式
4. 支持文本、图片、文件问答

当前仓库已经包含：

1. `Claude Code CLI` 调用链
2. 文本、图片、文件三类消息路由
3. 缓存、会话、日志、文件预处理
4. 本地开发适配器 `local-dev`
5. 真实微信适配器 `wx-clawbot`

## 快速开始

如果你是第一次接触这个项目，建议按下面顺序操作：

1. 安装 `Node.js 20+`
2. 安装并登录 `Claude Code CLI`
3. 克隆仓库到本地
4. 执行 `npm install`
5. 复制 `.env.example` 为 `.env`
6. 先用 `local-dev` 模式验证
7. 再切到 `wx-clawbot` 模式并打开 `http://127.0.0.1:3100` 扫码登录

## 技术参考

本项目实现主要参考以下资料：

1. Claude Code CLI 文档：[https://code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference)
2. Claude Code 常见工作流：[https://code.claude.com/docs/en/common-workflows](https://code.claude.com/docs/en/common-workflows)
3. Node.js 子进程文档：[https://nodejs.org/api/child_process.html](https://nodejs.org/api/child_process.html)
4. 腾讯微信 OpenClaw 通道包：[https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin)
5. `wx-clawbot` 项目页：[https://github.com/ikrong/wx-clawbot](https://github.com/ikrong/wx-clawbot)

## 项目结构

```text
wechat-claude-bridge/
  src/
    adapter/      # 微信适配层
    bridge/       # 路由、prompt、回复格式化
    runner/       # Claude CLI 调用
    services/     # 配置、缓存、会话、预处理
    types/        # 类型定义
  config/         # 默认配置
  scripts/        # 启动、检查、清理脚本
  docs/           # 架构文档
  data/           # 运行期数据目录（不提交真实数据）
```

## 环境要求

运行前请确保：

1. 已安装 Node.js 20+
2. 已安装并登录 `Claude Code CLI`
3. 使用 Windows PowerShell

可以先本机验证：

```powershell
node -v
claude --version
claude auth status
```

## 安装步骤

### 1. 克隆仓库

```powershell
git clone https://github.com/<your-github-name>/wechat-claude-bridge.git
cd wechat-claude-bridge
```

### 2. 安装依赖

```powershell
npm install
```

### 3. 复制环境变量模板

```powershell
Copy-Item .env.example .env
```

### 4. 检查运行环境

```powershell
npm run doctor
npm run build
```

如果这里失败，优先检查：

1. `node` 是否已安装
2. `claude` 命令是否可用
3. `claude auth status` 是否已登录

## 配置说明

主要配置都在 `.env` 中。

常用配置项：

1. `CLAUDE_COMMAND`
   默认是 `claude`
2. `DATA_DIR`
   项目运行时数据目录
3. `CACHE_DIR`
   图片、文件、临时预处理文件缓存目录
4. `LOG_DIR`
   日志目录
5. `DB_PATH`
   会话数据文件路径
6. `WORKSPACE_ROOT`
   允许 Claude 使用的工作目录
7. `WECHAT_ADAPTER_MODE`
   适配器模式，可选：
   `local-dev`
   `wx-clawbot`
8. `WECHAT_SESSION_FILE`
   真实微信模式下的登录态保存文件
9. `REQUEST_TIMEOUT_MS`
   Claude 单次请求超时时间，默认已调到 `180000` 毫秒
10. `WECHAT_RECEIPT_MESSAGE`
   收到微信消息后，先立即回复给用户的回执文本，默认是 `已收到，正在处理...`

建议初次安装先保留默认值，只确认下面三项：

```env
CLAUDE_COMMAND=claude
WECHAT_ADAPTER_MODE=local-dev
WORKSPACE_ROOT=./workspace
```

等本地调试模式跑通后，再把：

```env
WECHAT_ADAPTER_MODE=wx-clawbot
```

切到真实微信模式。

## 使用手册

下面分为两种模式。

### 1. 本地调试模式

这个模式不需要真实扫码微信，适合先验证桥接逻辑。

#### 第一步：设置模式

在 `.env` 中确认：

```env
WECHAT_ADAPTER_MODE=local-dev
```

#### 第二步：启动项目

```powershell
npm run dev
```

保持这个终端窗口不要关闭。

#### 第三步：投递测试消息

往 `data/dev-inbox/` 放一个 JSON 文件，例如：

```json
{
  "messageId": "msg-001",
  "wechatAccountId": "wx-bot-1",
  "peerId": "alice",
  "chatType": "direct",
  "messageType": "text",
  "text": "请用一句话介绍这个项目。",
  "attachments": [],
  "timestamp": 1770000000000
}
```

#### 第四步：查看回复

处理完成后，回复会写入：

```text
data/dev-outbox/
```

已处理的输入文件会移动到：

```text
data/dev-processed/
```

如果这一模式可以正常产出回复，就说明：

1. `Claude Code CLI` 能正常被项目调用
2. 路由、缓存和会话存储工作正常
3. 你的本机环境已经具备切到真实微信模式的基础

### 2. 真实微信模式

这个模式会调用 `wx-clawbot`，通过扫码把你的本机服务接入微信。

#### 第一步：切换模式

在 `.env` 中设置：

```env
WECHAT_ADAPTER_MODE=wx-clawbot
```

#### 第二步：启动项目

```powershell
npm run dev
```

保持这个终端窗口不要关闭。

#### 第三步：打开本地登录页

启动后，程序会同时启动一个本地登录页：

```text
http://127.0.0.1:3100
```

登录页会展示：

1. 当前微信连接状态
2. 登录二维码
3. 会话文件位置
4. 最近一次连接和错误信息

#### 第四步：扫码登录

用手机微信扫描登录页中的二维码，并在微信里确认登录。

登录态会保存在：

```text
WECHAT_SESSION_FILE
```

默认示例路径是：

```text
./data/wechat/session.json
```

#### 第五步：开始测试

用你的手机微信给这个机器人账号发消息：

1. 文本消息
2. 图片消息
3. 文件消息

桥接服务会把消息转给本机 `Claude Code CLI`，再把结果回复回微信。

当前默认体验是：

1. 先立即回复：`已收到，正在处理...`
2. 等 Claude 处理完成后，再回复最终结果
3. 如果 Claude 超时、权限不足或附件读取失败，也会回复一条更易懂的失败提示，而不是直接暴露技术报错

建议第一次联调按下面顺序测试：

1. 文本消息：`你好，你是谁`
2. 文件消息：发送一个 `txt` 或 `md`
3. 图片消息：发送一张截图或普通图片

#### 当前限制

目前真实微信模式的实现重点是：

1. 私聊场景
2. 文本回复
3. 图片和文件可下载并送入 Claude 分析

暂时不保证：

1. 群聊场景
2. 多账号同时在线
3. 所有媒体类型都稳定

#### 附加说明

如果终端里的字符二维码显示不完整，也不影响使用。正式扫码入口以本地登录页为准，不依赖 `cmd.exe` 或 PowerShell 的字符二维码显示效果。

## 文件问答说明

当前处理策略如下：

1. `txt`、`md`、`pdf`
   优先直接交给 Claude
2. `csv`
   先抽取前 80 行预处理，再交给 Claude
3. `docx`
   先提取正文为文本，再交给 Claude
4. `xlsx`、`xls`
   先提取前 3 个 sheet 的前 40 行，再交给 Claude

这样做的目的是提高文件问答的稳定性，避免把复杂 Office 文件原样直接丢给 CLI。

## 图片问答说明

图片消息会先保存到缓存目录，再作为本地文件路径交给 Claude。

默认支持重点场景：

1. 截图报错分析
2. 普通图片内容理解
3. 图片中的文字说明

说明：

当前这套本机桥接在“文本文件、Markdown、CSV、DOCX、XLSX 预处理后问答”上更稳定；图片问答已经接入，但在不同 Claude Code CLI 版本或不同本机环境下，图片视觉识别能力可能不如文本/文件稳定。

## 常用命令

开发启动：

```powershell
npm run dev
```

编译检查：

```powershell
npm run build
```

环境检查：

```powershell
npm run doctor
```

清理缓存：

```powershell
npm run clean:cache
```

## 常见问题

### 1. 本地登录页打不开

先确认项目已经启动：

```powershell
npm run dev
```

然后手动打开：

```text
http://127.0.0.1:3100
```

### 2. 终端二维码显示不完整

不用依赖终端二维码，正式扫码入口以本地登录页为准。

### 3. 微信发消息没有回复

建议按下面顺序排查：

1. `npm run dev` 是否还在运行
2. `claude auth status` 是否显示已登录
3. `.env` 中的 `WECHAT_ADAPTER_MODE` 是否设置正确
4. `data/logs/` 中是否有错误日志

### 4. 图片问答不稳定

当前版本对文本和文件问答更稳定；图片能力已经接入，但受本机环境和 `Claude Code CLI` 行为影响，视觉理解结果可能不如文本/文件稳定。

## 缓存清理说明

如果图片和文件缓存占用太多空间，可以在停止服务后清理。

常见可清理目录：

1. `data/cache/images/`
2. `data/cache/files/`
3. `data/cache/temp/`
4. `data/logs/`
5. `data/wechat/`
   如果想清掉微信登录态并重新扫码，也可以删这个目录

直接执行项目内置脚本：

```powershell
npm run clean:cache
```

如果你只想释放缓存空间，但保留会话记录：

1. 删除 `data/cache/`
2. 保留 `data/sqlite/`

如果你想完全重置：

1. 删除 `data/cache/`
2. 删除 `data/sqlite/`
3. 删除 `data/wechat/`

## Git 发布建议

这个项目已经按“可上传 Git”的思路组织：

1. 路径不写死
2. 数据目录不提交真实内容
3. 运行依赖通过 `.env` 配置

首次发布可参考：

```powershell
git init
git add .
git commit -m "Initial bridge skeleton"
git remote add origin https://github.com/UF-gzj/wechat-claude-bridge.git
git push -u origin main
```

## 当前进度

目前已经完成：

1. 基础桥接架构
2. Claude CLI 调用
3. 本地开发模式验证
4. 真实微信模式代码接入

其中：

1. `local-dev` 模式已做过本机 smoke test
2. `wx-clawbot` 模式代码已接入，但最终效果仍需要你在本机扫码后完成实测

## 后续建议

下一步建议优先做这几件事：

1. 真实微信扫码联调
2. 图片和文件消息的端到端验证
3. 群聊支持评估
4. 首次 Git 提交和推送
